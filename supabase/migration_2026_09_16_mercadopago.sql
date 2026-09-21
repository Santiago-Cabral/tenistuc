-- =============================================================
-- MIGRACIÓN 2026-09-16 — Lista cerrada + MercadoPago + Notificaciones
-- Proyecto qodajlsxihukgfdvntjy
--
-- CORRER EN: Supabase → SQL Editor → New query  (¡la base YA tiene
-- el esquema viejo y le faltan estas columnas → por eso la app
-- devolvía "column tournament_registrations.mp_status does not exist")
--
-- Es idempotente: se puede volver a correr sin romper nada.
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- 1) ESTADO 'closed' EN TOURNAMENTS (cerrar lista)
-- ──────────────────────────────────────────────────────────────
alter table public.tournaments
    drop constraint if exists tournaments_status_check;
alter table public.tournaments
    add constraint tournaments_status_check
    check (status in ('upcoming', 'open', 'closed', 'in_progress', 'completed'));

-- ──────────────────────────────────────────────────────────────
-- 2) COLUMNAS MERCADOPAGO EN TOURNAMENT_REGISTRATIONS
-- ──────────────────────────────────────────────────────────────
alter table public.tournament_registrations
    add column if not exists mp_preference_id   text,
    add column if not exists mp_payment_id      text,
    add column if not exists mp_status          text,
    add column if not exists paid_amount        numeric(10, 2),
    add column if not exists commission_amount  numeric(10, 2),
    add column if not exists paid_at            timestamptz;

-- ──────────────────────────────────────────────────────────────
-- 2b) CONSENTIMIENTO DE PRIVACIDAD EN PROFILES
-- ──────────────────────────────────────────────────────────────
alter table public.profiles
    add column if not exists privacy_consented_at  timestamptz,
    add column if not exists privacy_policy_version text;

-- ──────────────────────────────────────────────────────────────
-- 3) CUENTAS MERCADOPAGO DE ORGANIZADORES (modo marketplace)
--    La edge function `mp-oauth-callback` guarda tokens acá con
--    service_role. SIN RLS policies: el cliente nunca ve los tokens.
-- ──────────────────────────────────────────────────────────────
create table if not exists public.organizer_mp_accounts (
    organizer_id  uuid primary key references public.profiles (id) on delete cascade,
    mp_user_id    text not null,
    access_token  text not null,
    refresh_token text,
    public_key    text,
    connected_at  timestamptz not null default now(),
    updated_at    timestamptz not null default now()
);

alter table public.organizer_mp_accounts enable row level security;

-- estados OAuth de un solo uso (CSRF/vinculación) creados por mp-oauth-url
create table if not exists public.mp_oauth_states (
    state        uuid primary key default gen_random_uuid(),
    organizer_id uuid not null references public.profiles (id) on delete cascade,
    created_at   timestamptz not null default now()
);

alter table public.mp_oauth_states enable row level security;

-- ──────────────────────────────────────────────────────────────
-- 4) RPC notify_user: notificación in-app para OTRO usuario
--    Solo organizador, y dueño del torneo relacionado.
-- ──────────────────────────────────────────────────────────────
create or replace function public.notify_user(
    p_user_id uuid,
    p_type    text,
    p_title   text,
    p_body    text,
    p_data    jsonb default null,
    p_related_id uuid default null
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
    v_emitter uuid := auth.uid();
    v_is_organizer boolean;
    v_owns_tournament boolean;
    v_target_role text;
begin
    if v_emitter is null then
        return false;
    end if;

    select role into v_target_role from public.profiles where id = p_user_id;
    if v_target_role is null then
        return false;
    end if;

    -- si no es hacia sí mismo, requiere ser organizer
    if p_user_id <> v_emitter then
        select exists (
            select 1 from public.profiles where id = v_emitter and role = 'organizer'
        ) into v_is_organizer;

        if not v_is_organizer then
            return false;
        end if;

        -- si apunta a un torneo, debe ser el dueño
        if p_related_id is not null then
            select exists (
                select 1 from public.tournaments t
                where t.id = p_related_id and t.organizer_id = v_emitter
            ) into v_owns_tournament;
            if not v_owns_tournament then
                return false;
            end if;
        end if;
    end if;

    insert into public.notifications (user_id, type, title, body, data, related_id)
    values (p_user_id, p_type, p_title, p_body, p_data, p_related_id);

    return true;
end;
$$;

revoke execute on function public.notify_user(uuid, text, text, text, jsonb, uuid) from public;
grant execute on function public.notify_user(uuid, text, text, text, jsonb, uuid) to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 5) RPCs para que el organizer vea/desconecte su cuenta MP
-- ──────────────────────────────────────────────────────────────
create or replace function public.get_my_mp_status()
returns table (connected boolean, mp_user_id text, connected_at timestamptz)
language sql
security definer set search_path = public
as $$
    select
        exists (
            select 1 from public.organizer_mp_accounts
            where organizer_id = auth.uid()
        ) as connected,
        (
            select mp_user_id from public.organizer_mp_accounts
            where organizer_id = auth.uid()
        ) as mp_user_id,
        (
            select connected_at from public.organizer_mp_accounts
            where organizer_id = auth.uid()
        ) as connected_at;
$$;

revoke execute on function public.get_my_mp_status() from public;
grant execute on function public.get_my_mp_status() to authenticated;

create or replace function public.disconnect_mp()
returns void
language sql
security definer set search_path = public
as $$
    delete from public.organizer_mp_accounts where organizer_id = auth.uid();
$$;

revoke execute on function public.disconnect_mp() from public;
grant execute on function public.disconnect_mp() to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 5b) RPC delete_account: ELIMINA DEFINITIVAMENTE la cuenta,
--     el perfil y todos sus datos (cascada via FK de profiles).
--     Irreversible.
-- ──────────────────────────────────────────────────────────────
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if auth.uid() is null then
        raise exception 'No autenticado';
    end if;
    delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_account() from public;
grant execute on function public.delete_account() to authenticated;

-- ──────────────────────────────────────────────────────────────
-- 6) TRIGGER: bloquear inscripción si la lista está cerrada
--    o con el cupo lleno
-- ──────────────────────────────────────────────────────────────
create or replace function public.enforce_registration_open()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
    t public.tournaments%rowtype;
    v_count integer;
begin
    select * into t from public.tournaments where id = new.tournament_id;

    if t.status <> 'open' then
        raise exception 'La inscripción para este torneo está cerrada';
    end if;

    if t.max_players is not null and t.max_players > 0 then
        select count(*) into v_count
        from public.tournament_registrations
        where tournament_id = new.tournament_id;
        if v_count >= t.max_players then
            raise exception 'El torneo alcanzó su cupo máximo';
        end if;
    end if;

    return new;
end;
$$;

drop trigger if exists trg_enforce_registration_open on public.tournament_registrations;
create trigger trg_enforce_registration_open
    before insert on public.tournament_registrations
    for each row execute procedure public.enforce_registration_open();

-- =============================================================
-- LISTO ✅ (falta configurar los webhooks en Database → Webhooks,
-- ver comentarios en schema.sql sección 15)
-- =============================================================