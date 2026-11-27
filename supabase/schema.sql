-- =============================================================
-- TenisTuc — Esquema completo de Supabase (proyecto qodajlsxihukgfdvntjy)
-- Pegar y ejecutar completo en: Supabase → SQL Editor → New query
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- 1) EXTENSIONES
-- ──────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ──────────────────────────────────────────────────────────────
-- 2) FUNCIÓN: crear perfil automáticamente al registrarse
--    (el registro manda username, full_name, role, level y age_category en user_metadata)
-- ──────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
    base_username text;
    candidate text;
    n int := 0;
begin
    -- El registro local manda un username; los logins OAuth (Google/Apple) no,
    -- así que usamos el prefijo del email y, si colisiona, le agregamos sufijo.
    base_username := coalesce(
        nullif(new.raw_user_meta_data ->> 'username', ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'jugador'
    );

    candidate := base_username;
    loop
        begin
            insert into public.profiles (id, username, full_name, role, level, age_category)
            values (
                new.id,
                candidate,
                coalesce(
                    nullif(new.raw_user_meta_data ->> 'full_name', ''),
                    nullif(new.raw_user_meta_data ->> 'name', ''),
                    ''
                ),
                case
                    when new.raw_user_meta_data ->> 'role' = 'organizer' then 'organizer'
                    else 'athlete'
                end,
                coalesce(new.raw_user_meta_data ->> 'level', '6ta'),
                coalesce(nullif(new.raw_user_meta_data ->> 'age_category', ''), 'libre')
            )
            on conflict (id) do nothing;
            return new;
        exception when unique_violation then
            n := n + 1;
            candidate := case
                when n <= 1000 then base_username || n::text
                else base_username || '_' || floor(random() * 1000000)::text
            end;
        end;
    end loop;
end;
$$;

-- ──────────────────────────────────────────────────────────────
-- 3) PROFILES
-- ──────────────────────────────────────────────────────────────
create table if not exists public.profiles (
    id                uuid primary key references auth.users (id) on delete cascade,
    username          text not null unique,
    full_name         text not null default '',
    avatar_url        text,
    role              text not null default 'athlete' check (role in ('athlete', 'organizer', 'admin')),
    city              text,
    club              text,
    elo               integer not null default 1000,
    globalRank        integer,
    level             text not null default '6ta'
                      check (level in (
                          '1era', '2da', '3era', '4ta', '5ta', '6ta'
                      )),
    age_category      text not null default 'libre'
                      check (age_category in (
                          'libre', '+30', '+40', '+50', '+60', '+70', '+80'
                      )),
    gender            text check (gender in ('femenino', 'masculino', 'otro')),
    wins              integer not null default 0,
    losses            integer not null default 0,
    play_style        text[] not null default '{}',
    bio               text,
    is_online         boolean not null default false,
    last_seen         timestamptz,
    expo_push_token   text,
    privacy_consented_at timestamptz,
    privacy_policy_version text,
    has_seen_tutorial boolean not null default false,
    created_at        timestamptz not null default now()
);

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();

-- ──────────────────────────────────────────────────────────────
-- 4) CONVERSATIONS
-- ──────────────────────────────────────────────────────────────
create table if not exists public.conversations (
    id               uuid primary key default gen_random_uuid(),
    participant1_id  uuid not null references public.profiles (id) on delete cascade,
    participant2_id  uuid not null references public.profiles (id) on delete cascade,
    last_message     text,
    last_message_at  timestamptz not null default now(),
    created_at       timestamptz not null default now(),
    -- evita conversación duplicada entre los mismos dos usuarios
    constraint conversations_unique_pair unique (participant1_id, participant2_id),
    constraint conversations_participants_distinct check (participant1_id <> participant2_id)
);

create index if not exists idx_conversations_p1 on public.conversations (participant1_id);
create index if not exists idx_conversations_p2 on public.conversations (participant2_id);

-- ──────────────────────────────────────────────────────────────
-- 5) MESSAGES
-- ──────────────────────────────────────────────────────────────
create table if not exists public.messages (
    id              uuid primary key default gen_random_uuid(),
    conversation_id uuid not null references public.conversations (id) on delete cascade,
    sender_id       uuid not null references public.profiles (id) on delete cascade,
    content         text not null,
    message_type    text,
    metadata        jsonb,
    created_at      timestamptz not null default now()
);

create index if not exists idx_messages_conversation on public.messages (conversation_id, created_at);

-- ──────────────────────────────────────────────────────────────
-- 6) MATCHES
--    Se usa tanto para partidos normales como para el fixture del torneo
-- ──────────────────────────────────────────────────────────────
create table if not exists public.matches (
    id               uuid primary key default gen_random_uuid(),
    type             text not null default 'friendly'
                     check (type in ('friendly', 'competitive', 'training', 'tournament', 'challenge')),
    status           text not null default 'pending'
                     check (status in ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled')),
    scheduled_at     timestamptz,
    location         text,
    notes            text,
    score            jsonb,
    created_at       timestamptz not null default now(),
    player1_id       uuid references public.profiles (id) on delete cascade,
    player2_id       uuid references public.profiles (id) on delete cascade,
    created_by       uuid references public.profiles (id) on delete cascade,
    submitted_by     uuid references public.profiles (id) on delete cascade,
    played_at        timestamptz,
    confirmed_by     uuid references public.profiles (id) on delete cascade,
    confirmed_at     timestamptz,
    disputed_by      uuid references public.profiles (id) on delete cascade,
    dispute_reason   text,
    elo_delta_p1     integer,
    elo_delta_p2     integer,
    -- Campos de fixture (torneo)
    tournament_id    uuid,
    round            integer,
    bracket_position integer,
    next_match_id    uuid references public.matches (id) on delete set null,
    next_match_slot  integer,
    is_bye           boolean not null default false
);

create index if not exists idx_matches_player1 on public.matches (player1_id);
create index if not exists idx_matches_player2 on public.matches (player2_id);
create index if not exists idx_matches_tournament on public.matches (tournament_id);
create index if not exists idx_matches_status on public.matches (status);

alter table public.matches drop constraint if exists matches_type_check;

do $$
declare
    v_types  text[];
    v_values text;
begin
    select array_agg(distinct type)
      into v_types
      from public.matches
     where type is not null;

    v_types := coalesce(v_types, array[]::text[]) || array[
        'friendly',
        'competitive',
        'training',
        'tournament',
        'challenge'
    ]::text[];

    select string_agg(quote_literal(t), ', ' order by t)
      into v_values
      from (select distinct unnest(v_types) as t) s;

    execute format(
        'alter table public.matches add constraint matches_type_check check (type in (%s))',
        v_values
    );
end $$;

-- ──────────────────────────────────────────────────────────────
-- 7) CHALLENGES (retos)
-- ──────────────────────────────────────────────────────────────
create table if not exists public.challenges (
    id             uuid primary key default gen_random_uuid(),
    challenger_id  uuid not null references public.profiles (id) on delete cascade,
    challenged_id  uuid not null references public.profiles (id) on delete cascade,
    status         text not null default 'pending'
                   check (status in ('pending', 'accepted', 'rejected', 'cancelled', 'expired')),
    match_type     text not null default 'friendly'
                   check (match_type in ('friendly', 'competitive', 'training', 'tournament', 'challenge')),
    proposed_date  timestamptz,
    proposed_venue text,
    proposed_by    uuid references public.profiles (id) on delete cascade,
    message        text,
    match_id       uuid references public.matches (id) on delete set null,
    created_at     timestamptz not null default now()
);

create index if not exists idx_challenges_challenger on public.challenges (challenger_id);
create index if not exists idx_challenges_challenged on public.challenges (challenged_id);
create index if not exists idx_challenges_status on public.challenges (status);

-- ──────────────────────────────────────────────────────────────
-- 8) TOURNAMENTS
-- ──────────────────────────────────────────────────────────────
create table if not exists public.tournaments (
    id              uuid primary key default gen_random_uuid(),
    name            text not null,
    description     text,
    status          text not null default 'upcoming'
                    check (status in ('upcoming', 'open', 'closed', 'in_progress', 'completed')),
    category        text,
    format          text check (format in ('elimination', 'round_robin', 'swiss')),
    image_url       text,
    prize_money     integer not null default 0,
    elo_points      integer not null default 0,
    champion_id      uuid references public.profiles (id) on delete set null,
    champion_match_id uuid references public.matches (id) on delete set null,
    champion_elo     integer not null default 0,
    champion_elo_applied boolean not null default false,
    entry_fee       integer not null default 0,
    max_players     integer,
    location        text,
    starts_at       timestamptz,
    tournament_type text not null default 'relampago'
                    check (tournament_type in ('relampago', 'por_fechas')),
    -- para quién está diseñado el torneo (restricciones de inscripción)
    allowed_gender text not null default 'todos'
                    check (allowed_gender in ('todos', 'femenino', 'masculino')),
    allowed_level  text not null default 'todas'
                    check (allowed_level in ('todas', '1era', '2da', '3era', '4ta', '5ta', '6ta')),
    organizer_id    uuid not null references public.profiles (id) on delete cascade,
    created_at      timestamptz not null default now()
);

create index if not exists idx_tournaments_organizer on public.tournaments (organizer_id);
create index if not exists idx_tournaments_status on public.tournaments (status);

-- --- 8b) FK de matches → tournaments (se define después por orden de creación)
alter table public.matches
    drop constraint if exists matches_tournament_id_fkey;
alter table public.matches
    add constraint matches_tournament_id_fkey
    foreign key (tournament_id) references public.tournaments (id) on delete cascade;

-- ──────────────────────────────────────────────────────────────
-- 9) TOURNAMENT_DATES (circuito por fechas, vie-dom)
-- ──────────────────────────────────────────────────────────────
create table if not exists public.tournament_dates (
    id            uuid primary key default gen_random_uuid(),
    tournament_id uuid not null references public.tournaments (id) on delete cascade,
    numero        integer not null,
    starts_at     timestamptz not null,
    ends_at       timestamptz not null,
    location      text,
    status        text not null default 'pending'
                  check (status in ('pending', 'in_progress', 'completed')),
    created_at    timestamptz not null default now(),
    constraint tournament_dates_numero_unique unique (tournament_id, numero)
);

-- ──────────────────────────────────────────────────────────────
-- 10) TOURNAMENT_REGISTRATIONS (inscripción + pago)
-- ──────────────────────────────────────────────────────────────
create table if not exists public.tournament_registrations (
    id             uuid primary key default gen_random_uuid(),
    tournament_id  uuid not null references public.tournaments (id) on delete cascade,
    player_id      uuid not null references public.profiles (id) on delete cascade,
    payment_status text not null default 'pending'
                   check (payment_status in ('pending', 'paid', 'refunded')),
    registered_at  timestamptz not null default now(),
    -- MercadoPago (pago de la inscripción)
    mp_preference_id   text,
    mp_payment_id      text,
    mp_status          text check (mp_status in ('pending', 'approved', 'rejected', 'cancelled', 'in_process', 'expired')),
    paid_amount        numeric(10, 2),
    commission_amount  numeric(10, 2),
    paid_at            timestamptz,
    constraint tournament_registrations_unique unique (tournament_id, player_id)
);

create index if not exists idx_tournament_regs_tournament on public.tournament_registrations (tournament_id);
create index if not exists idx_tournament_regs_player on public.tournament_registrations (player_id);

-- ──────────────────────────────────────────────────────────────
-- 11) COURTS (canchas / sedes)
-- ──────────────────────────────────────────────────────────────
create table if not exists public.courts (
    id           uuid primary key default gen_random_uuid(),
    organizer_id uuid not null references public.profiles (id) on delete cascade,
    name         text not null,
    address      text,
    surface      text not null default 'clay' check (surface in ('clay', 'hard', 'grass', 'carpet')),
    indoor       boolean not null default false,
    notes        text,
    created_at   timestamptz not null default now()
);

create index if not exists idx_courts_organizer on public.courts (organizer_id);

-- ──────────────────────────────────────────────────────────────
-- 12) NOTIFICATIONS
--    - `read`        lo usa el hook useNotifications (badge)
--    - `read_at`     lo usa notificationService (marcar leídas)
--    - `data`        payload del push (type, ids) insertado por la edge function
-- ──────────────────────────────────────────────────────────────
create table if not exists public.notifications (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references public.profiles (id) on delete cascade,
    type       text not null,
    title      text not null,
    body       text not null,
    data       jsonb,
    related_id uuid,
    read       boolean not null default false,
    read_at    timestamptz,
    created_at timestamptz not null default now()
);

create index if not exists idx_notifications_user on public.notifications (user_id, created_at desc);

alter table public.notifications drop constraint if exists notifications_type_check;

do $$
declare
    v_types  text[];
    v_values text;
begin
    select array_agg(distinct type)
      into v_types
      from public.notifications
     where type is not null;

    v_types := coalesce(v_types, array[]::text[]) || array[
        'message',
        'challenge',
        'challenge_received',
        'challenge_accepted',
        'challenge_rejected',
        'tournament',
        'tournament_new',
        'tournament_start',
        'tournament_update',
        'tournament_registration',
        'fixture_ready',
        'match_scheduled',
        'match_result',
        'match_confirmed',
        'payment',
        'system',
        'test',
        'doubles_chat_ready',
        'doubles_chat_closed'
    ]::text[];

    select string_agg(quote_literal(t), ', ' order by t)
      into v_values
      from (select distinct unnest(v_types) as t) s;

    execute format(
        'alter table public.notifications add constraint notifications_type_check check (type in (%s))',
        v_values
    );
end $$;

-- ──────────────────────────────────────────────────────────────
-- 12b) CUENTAS MERCADOPAGO DE ORGANIZADORES (modo marketplace)
--    Conexión OAuth: la edge function `mp-oauth-callback` intercambia
--    el code por tokens y guarda acá con service_role.
--    SIN RLS policies: el cliente NUNCA ve los tokens. El estado
--    (si está conectado) se consulta vía la RPC get_my_mp_status.
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

do $$
declare
    r record;
begin
    for r in
        select c.conrelid, c.conname
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any(c.conkey)
        where c.contype = 'f'
          and a.attname = 'organizer_id'
          and c.conrelid in (
              to_regclass('public.tournaments'),
              to_regclass('public.courts'),
              to_regclass('public.organizer_mp_accounts'),
              to_regclass('public.mp_oauth_states')
          )
          and c.confdeltype <> 'c'
    loop
        execute format('alter table %s drop constraint %I', r.conrelid::regclass, r.conname);
    end loop;

    if to_regclass('public.tournaments') is not null
       and not exists (
           select 1 from pg_constraint
           where conrelid = 'public.tournaments'::regclass
             and conname = 'tournaments_organizer_id_fkey'
       ) then
        alter table public.tournaments
            add constraint tournaments_organizer_id_fkey
            foreign key (organizer_id) references public.profiles (id) on delete cascade;
    end if;
    if to_regclass('public.courts') is not null
       and not exists (
           select 1 from pg_constraint
           where conrelid = 'public.courts'::regclass
             and conname = 'courts_organizer_id_fkey'
       ) then
        alter table public.courts
            add constraint courts_organizer_id_fkey
            foreign key (organizer_id) references public.profiles (id) on delete cascade;
    end if;
    if to_regclass('public.organizer_mp_accounts') is not null
       and not exists (
           select 1 from pg_constraint
           where conrelid = 'public.organizer_mp_accounts'::regclass
             and conname = 'organizer_mp_accounts_organizer_id_fkey'
       ) then
        alter table public.organizer_mp_accounts
            add constraint organizer_mp_accounts_organizer_id_fkey
            foreign key (organizer_id) references public.profiles (id) on delete cascade;
    end if;
    if to_regclass('public.mp_oauth_states') is not null
       and not exists (
           select 1 from pg_constraint
           where conrelid = 'public.mp_oauth_states'::regclass
             and conname = 'mp_oauth_states_organizer_id_fkey'
       ) then
        alter table public.mp_oauth_states
            add constraint mp_oauth_states_organizer_id_fkey
            foreign key (organizer_id) references public.profiles (id) on delete cascade;
    end if;
end $$;

-- ──────────────────────────────────────────────────────────────
-- 12c) RPC notify_user: inserta una notificación in-app PARA OTRO USUARIO.
--    El push expo best-effort lo manda el cliente (notificationService)
--    igual que hacía notifyUser() antes.
--    Restricciones de seguridad:
--      - solo usuarios autenticados
--      - si el destino es otro usuario, el emisor debe ser organizer
--        y (si hay related_id = torneo) dueño de ese torneo
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
-- 12d) RPCs para que el organizer vea/desconecte su cuenta MP
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
-- 12e) RPC delete_account: ELIMINA DEFINITIVAMENTE la cuenta, el
-- perfil y todos sus datos (cascada via FK de public.profiles).
-- Irreversible.
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
-- 12f) TRIGGER: bloquear inscripción si la lista está cerrada o con cupo lleno
-- ──────────────────────────────────────────────────────────────
create or replace function public.enforce_registration_open()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
    t public.tournaments%rowtype;
    v_count integer;
    v_gender text;
    v_level text;
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

    -- Torneos exclusivos por género (ej: solo mujeres)
    if t.allowed_gender is not null and t.allowed_gender <> 'todos' then
        select p.gender into v_gender
        from public.profiles p
        where p.id = new.player_id;
        if v_gender is null or v_gender <> t.allowed_gender then
            raise exception 'Este torneo es solo para %',
                case t.allowed_gender
                    when 'femenino' then 'mujeres'
                    when 'masculino' then 'hombres'
                    else t.allowed_gender
                end;
        end if;
    end if;

    -- Torneos exclusivos por categoría (ej: solo 6ta)
    if t.allowed_level is not null and t.allowed_level <> 'todas' then
        select p.level into v_level
        from public.profiles p
        where p.id = new.player_id;
        if v_level is null or v_level <> t.allowed_level then
            raise exception 'Este torneo es solo para la categoría %', t.allowed_level;
        end if;
    end if;

    return new;
end;
$$;

drop trigger if exists trg_enforce_registration_open on public.tournament_registrations;
create trigger trg_enforce_registration_open
    before insert on public.tournament_registrations
    for each row execute procedure public.enforce_registration_open();

-- ──────────────────────────────────────────────────────────────
-- 13) STORAGE: bucket público "avatars"
-- ──────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "Public avatars read" on storage.objects;
create policy "Public avatars read" on storage.objects
    for select using (bucket_id = 'avatars');

drop policy if exists "Users can upload avatars" on storage.objects;
create policy "Users can upload avatars" on storage.objects
    for insert to authenticated with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "Users can update their avatars" on storage.objects;
create policy "Users can update their avatars" on storage.objects
    for update to authenticated using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "Users can delete their avatars" on storage.objects;
create policy "Users can delete their avatars" on storage.objects
    for delete to authenticated using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

-- 13a) STORAGE: bucket público "tournament-images" (foto de portada de torneos)
insert into storage.buckets (id, name, public)
values ('tournament-images', 'tournament-images', true)
on conflict (id) do nothing;

drop policy if exists "Public tournament images read" on storage.objects;
create policy "Public tournament images read" on storage.objects
    for select using (bucket_id = 'tournament-images');

drop policy if exists "Users can upload tournament images" on storage.objects;
create policy "Users can upload tournament images" on storage.objects
    for insert to authenticated with check (
        bucket_id = 'tournament-images'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "Users can update their tournament images" on storage.objects;
create policy "Users can update their tournament images" on storage.objects
    for update to authenticated using (
        bucket_id = 'tournament-images'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "Users can delete their tournament images" on storage.objects;
create policy "Users can delete their tournament images" on storage.objects
    for delete to authenticated using (
        bucket_id = 'tournament-images'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

-- ──────────────────────────────────────────────────────────────
-- 13b) BETA FEEDBACK (comentarios de la beta, votos y reportes)
--      Estilo Product Hunt: el más votado arriba (votes_count desc).
-- ──────────────────────────────────────────────────────────────
create table if not exists public.beta_feedback (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references public.profiles (id) on delete cascade,
    content     text not null check (char_length(content) between 1 and 500),
    votes_count integer not null default 0,
    created_at  timestamptz not null default now()
);

-- Un voto por usuario y comentario (PK compuesta)
create table if not exists public.beta_feedback_votes (
    feedback_id uuid not null references public.beta_feedback (id) on delete cascade,
    user_id     uuid not null references public.profiles (id) on delete cascade,
    created_at  timestamptz not null default now(),
    primary key (feedback_id, user_id)
);

-- Un reporte por usuario y comentario (PK compuesta)
create table if not exists public.beta_feedback_reports (
    feedback_id uuid not null references public.beta_feedback (id) on delete cascade,
    reporter_id uuid not null references public.profiles (id) on delete cascade,
    reason      text not null check (reason in ('spam', 'ofensivo', 'acoso', 'otro')),
    created_at  timestamptz not null default now(),
    primary key (feedback_id, reporter_id)
);

create index if not exists idx_beta_feedback_rank
    on public.beta_feedback (votes_count desc, created_at desc);
create index if not exists idx_beta_feedback_votes_user
    on public.beta_feedback_votes (user_id);
create index if not exists idx_beta_feedback_reports_reporter
    on public.beta_feedback_reports (reporter_id);

-- Contador de votos mantenido por trigger (security definer: actualiza
-- beta_feedback sin depender de la RLS de quien vota).
create or replace function public.sync_beta_feedback_votes_count()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    if (tg_op = 'INSERT') then
        update public.beta_feedback
        set votes_count = votes_count + 1
        where id = new.feedback_id;
    elsif (tg_op = 'DELETE') then
        update public.beta_feedback
        set votes_count = votes_count - 1
        where id = old.feedback_id;
    end if;
    return null;
end;
$$;

drop trigger if exists on_beta_feedback_votes_changed on public.beta_feedback_votes;
create trigger on_beta_feedback_votes_changed
    after insert or delete on public.beta_feedback_votes
    for each row execute function public.sync_beta_feedback_votes_count();

-- ──────────────────────────────────────────────────────────────
-- 14) ROW LEVEL SECURITY
--    El cliente usa la anon key (rol autenticado). El edge function
--    usa la service_role key que bypasea RLS.
-- ──────────────────────────────────────────────────────────────

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.matches enable row level security;
alter table public.challenges enable row level security;
alter table public.tournaments enable row level security;
alter table public.tournament_dates enable row level security;
alter table public.tournament_registrations enable row level security;
alter table public.courts enable row level security;
alter table public.notifications enable row level security;
alter table public.beta_feedback enable row level security;
alter table public.beta_feedback_votes enable row level security;
alter table public.beta_feedback_reports enable row level security;

-- PROFILES
drop policy if exists "Profiles are publicly viewable" on public.profiles;
create policy "Profiles are publicly viewable" on public.profiles
    for select using (true);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles
    for update using (auth.uid() = id);

-- El token push solo lo lee el servidor (edge functions con service_role).
-- Se revoca la lectura de la columna para clientes anon/authenticated: el
-- cliente ya no hace select sobre expo_push_token (ver PROFILE_COLUMNS en
-- src/stores/authStore.ts y send-push en src/supabase/functions/).
revoke select (expo_push_token) on public.profiles from anon, authenticated;

-- CONVERSATIONS
drop policy if exists "Participants can view conversations" on public.conversations;
create policy "Participants can view conversations" on public.conversations
    for select using (auth.uid() = participant1_id or auth.uid() = participant2_id);

drop policy if exists "Participants can create conversations" on public.conversations;
create policy "Participants can create conversations" on public.conversations
    for insert with check (auth.uid() = participant1_id or auth.uid() = participant2_id);

drop policy if exists "Participants can update conversations" on public.conversations;
create policy "Participants can update conversations" on public.conversations
    for update using (auth.uid() = participant1_id or auth.uid() = participant2_id);

-- MESSAGES
drop policy if exists "Participants can view messages" on public.messages;
create policy "Participants can view messages" on public.messages
    for select using (
        exists (
            select 1 from public.conversations c
            where c.id = conversation_id
              and (c.participant1_id = auth.uid() or c.participant2_id = auth.uid())
        )
    );

drop policy if exists "Participants can send messages" on public.messages;
create policy "Participants can send messages" on public.messages
    for insert with check (
        sender_id = auth.uid()
        and exists (
            select 1 from public.conversations c
            where c.id = conversation_id
              and (c.participant1_id = auth.uid() or c.participant2_id = auth.uid())
        )
    );

-- MATCHES
drop policy if exists "Players can view matches" on public.matches;
create policy "Players can view matches" on public.matches
    for select using (
        player1_id = auth.uid() or player2_id = auth.uid() or created_by = auth.uid()
        or exists (
            select 1 from public.tournament_registrations tr
            where tr.tournament_id = matches.tournament_id
              and tr.player_id = auth.uid()
        )
    );

-- Fixture público: cualquiera ve el cuadro, horarios y canchas de torneo.
drop policy if exists "Public tournament fixtures are viewable" on public.matches;
create policy "Public tournament fixtures are viewable" on public.matches
    for select to anon, authenticated
    using (type = 'tournament' and tournament_id is not null);

drop policy if exists "Players can create matches" on public.matches;
create policy "Players can create matches" on public.matches
    for insert with check (
        player1_id = auth.uid() or player2_id = auth.uid() or created_by = auth.uid()
    );

drop policy if exists "Players can update matches" on public.matches;
create policy "Players can update matches" on public.matches
    for update using (
        player1_id = auth.uid() or player2_id = auth.uid() or created_by = auth.uid()
    );

-- CHALLENGES
drop policy if exists "Players can view challenges" on public.challenges;
create policy "Players can view challenges" on public.challenges
    for select using (
        challenger_id = auth.uid() or challenged_id = auth.uid() or proposed_by = auth.uid()
    );

drop policy if exists "Players can create challenges" on public.challenges;
create policy "Players can create challenges" on public.challenges
    for insert with check (
        challenger_id = auth.uid() or proposed_by = auth.uid()
    );

drop policy if exists "Players can update challenges" on public.challenges;
create policy "Players can update challenges" on public.challenges
    for update using (
        challenger_id = auth.uid() or challenged_id = auth.uid() or proposed_by = auth.uid()
    );

-- TOURNAMENTS
drop policy if exists "Tournaments are publicly viewable" on public.tournaments;
create policy "Tournaments are publicly viewable" on public.tournaments
    for select using (true);

drop policy if exists "Organizers can create tournaments" on public.tournaments;
create policy "Organizers can create tournaments" on public.tournaments
    for insert with check (organizer_id = auth.uid());

drop policy if exists "Organizers can update tournaments" on public.tournaments;
create policy "Organizers can update tournaments" on public.tournaments
    for update using (organizer_id = auth.uid());

drop policy if exists "Organizers can delete tournaments" on public.tournaments;
create policy "Organizers can delete tournaments" on public.tournaments
    for delete using (organizer_id = auth.uid());

-- TOURNAMENT_DATES
drop policy if exists "Tournament dates are publicly viewable" on public.tournament_dates;
create policy "Tournament dates are publicly viewable" on public.tournament_dates
    for select using (true);

drop policy if exists "Organizers can manage tournament dates" on public.tournament_dates;
create policy "Organizers can manage tournament dates" on public.tournament_dates
    for all using (
        exists (
            select 1 from public.tournaments t
            where t.id = tournament_id and t.organizer_id = auth.uid()
        )
    );

-- TOURNAMENT_REGISTRATIONS
drop policy if exists "Registrations are publicly viewable" on public.tournament_registrations;
create policy "Registrations are publicly viewable" on public.tournament_registrations
    for select using (true);

drop policy if exists "Players can register" on public.tournament_registrations;
create policy "Players can register" on public.tournament_registrations
    for insert with check (player_id = auth.uid());

drop policy if exists "Players and organizers can update registrations" on public.tournament_registrations;
create policy "Players and organizers can update registrations" on public.tournament_registrations
    for update using (
        player_id = auth.uid()
        or exists (
            select 1 from public.tournaments t
            where t.id = tournament_id and t.organizer_id = auth.uid()
        )
    );

drop policy if exists "Players can unregister" on public.tournament_registrations;
create policy "Players can unregister" on public.tournament_registrations
    for delete using (player_id = auth.uid());

drop policy if exists "Organizers can remove participants" on public.tournament_registrations;
create policy "Organizers can remove participants" on public.tournament_registrations
    for delete using (
        exists (
            select 1 from public.tournaments t
            where t.id = tournament_id and t.organizer_id = auth.uid()
        )
    );

-- COURTS
drop policy if exists "Courts are publicly viewable" on public.courts;
create policy "Courts are publicly viewable" on public.courts
    for select using (true);

drop policy if exists "Organizers can manage courts" on public.courts;
create policy "Organizers can manage courts" on public.courts
    for all using (organizer_id = auth.uid());

-- NOTIFICATIONS
drop policy if exists "Users can view their notifications" on public.notifications;
create policy "Users can view their notifications" on public.notifications
    for select using (user_id = auth.uid());

drop policy if exists "Users can update their notifications" on public.notifications;
create policy "Users can update their notifications" on public.notifications
    for update using (user_id = auth.uid());

-- BETA FEEDBACK
drop policy if exists "Beta feedback is viewable" on public.beta_feedback;
create policy "Beta feedback is viewable" on public.beta_feedback
    for select using (true);

drop policy if exists "Users can create their own beta feedback" on public.beta_feedback;
create policy "Users can create their own beta feedback" on public.beta_feedback
    for insert with check (user_id = auth.uid());

drop policy if exists "Users can delete their own beta feedback" on public.beta_feedback;
create policy "Users can delete their own beta feedback" on public.beta_feedback
    for delete using (user_id = auth.uid());

-- BETA FEEDBACK VOTES
drop policy if exists "Beta feedback votes are viewable" on public.beta_feedback_votes;
create policy "Beta feedback votes are viewable" on public.beta_feedback_votes
    for select using (true);

drop policy if exists "Users can vote as themselves" on public.beta_feedback_votes;
create policy "Users can vote as themselves" on public.beta_feedback_votes
    for insert with check (user_id = auth.uid());

drop policy if exists "Users can remove their own vote" on public.beta_feedback_votes;
create policy "Users can remove their own vote" on public.beta_feedback_votes
    for delete using (user_id = auth.uid());

-- BETA FEEDBACK REPORTS (solo el reportante ve sus propios reportes)
drop policy if exists "Users can view their own reports" on public.beta_feedback_reports;
create policy "Users can view their own reports" on public.beta_feedback_reports
    for select using (reporter_id = auth.uid());

drop policy if exists "Users can report as themselves" on public.beta_feedback_reports;
create policy "Users can report as themselves" on public.beta_feedback_reports
    for insert with check (reporter_id = auth.uid());

-- ──────────────────────────────────────────────────────────────
-- 14b) ALTERS PARA BASES EXISTENTES (idempotentes)
--   Solo necesita correrlos quien ya tenía el esquema previo.
-- ──────────────────────────────────────────────────────────────
alter table public.tournaments
    drop constraint if exists tournaments_status_check;
alter table public.tournaments
    add constraint tournaments_status_check
    check (status in ('upcoming', 'open', 'closed', 'in_progress', 'completed'));

alter table public.tournament_registrations
    add column if not exists mp_preference_id   text,
    add column if not exists mp_payment_id      text,
    add column if not exists mp_status          text,
    add column if not exists paid_amount        numeric(10, 2),
    add column if not exists commission_amount  numeric(10, 2),
    add column if not exists paid_at            timestamptz;

-- consentimiento de políticas de privacidad (aceptado al registrarse/ingresar)
alter table public.profiles
    add column if not exists privacy_consented_at timestamptz,
    add column if not exists privacy_policy_version text;

-- horario y cancha asignados a cada partido del fixture (organizador)
alter table public.matches
    add column if not exists court_id uuid references public.courts (id) on delete set null;
create index if not exists idx_matches_court on public.matches (court_id);

-- ──────────────────────────────────────────────────────────────
-- 14c) NOTIFICACIONES EN VIVO (chat, desafíos, torneos, partidos)
--   Reemplaza los webhooks manuales del dashboard: triggers de la
--   base (pg_net) llaman directo a la edge function `notify`.
--   El NOTIFY_SECRET se guarda en `app_config` (nunca en git):
--   cargarlo una sola vez desde el SQL Editor:
--     update public.app_config set value = 'TU_NOTIFY_SECRET'
--     where key = 'notify_secret';
-- ──────────────────────────────────────────────────────────────
create extension if not exists pg_net;

create table if not exists public.app_config (
    key   text primary key,
    value text not null
);

alter table public.app_config enable row level security;

insert into public.app_config (key, value) values
    ('notify_url', 'https://qodajlsxihukgfdvntjy.supabase.co/functions/v1/notify'),
    -- placeholder vacío: el trigger no envía nada hasta cargar el secret real
    ('notify_secret', '')
on conflict (key) do nothing;

create or replace function public.send_push_direct(
    p_user_id uuid,
    p_type text,
    p_title text,
    p_body text,
    p_data jsonb,
    p_related_id uuid default null
)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
    v_token text;
begin
    insert into public.notifications (user_id, type, title, body, data, related_id)
    values (p_user_id, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb), p_related_id);

    select expo_push_token into v_token
    from public.profiles
    where id = p_user_id;

    if v_token is null or v_token not like 'ExponentPushToken%' then
        return;
    end if;

    begin
        perform net.http_post(
            'https://api.expo.dev/v2/push/send',
            jsonb_build_array(jsonb_build_object(
                'to', v_token,
                'title', p_title,
                'body', p_body,
                'data', coalesce(p_data, '{}'::jsonb),
                'sound', 'default',
                'badge', 1,
                'priority', 'high',
                'channelId', 'default'
            )),
            '{}'::jsonb,
            jsonb_build_object(
                'Content-Type', 'application/json',
                'Accept', 'application/json'
            ),
            5000
        );
    exception when others then
        raise warning 'send_push_direct failed: %', sqlerrm;
    end;
end;
$$;

revoke all on function public.send_push_direct(uuid, text, text, text, jsonb, uuid) from public;
revoke all on function public.send_push_direct(uuid, text, text, text, jsonb, uuid) from anon;
revoke all on function public.send_push_direct(uuid, text, text, text, jsonb, uuid) from authenticated;

create or replace function public.call_notify_webhook()
returns trigger
language plpgsql
security definer set search_path = public, extensions
as $$
declare
    v_rec jsonb;
    v_old jsonb;
    v_id uuid;
    v_user uuid;
    v_title text;
    v_body text;
    v_content text;
    v_when text;
    v_data jsonb;
    v_avatar text;
    v_tournament_name text;
    v_row record;
begin
    if TG_OP = 'DELETE' then
        v_rec := to_jsonb(old);
        v_old := '{}'::jsonb;
    else
        v_rec := to_jsonb(new);
        if TG_OP = 'UPDATE' then
            v_old := to_jsonb(old);
        else
            v_old := '{}'::jsonb;
        end if;
    end if;

    if TG_TABLE_NAME = 'messages' and TG_OP = 'INSERT' then
        v_id := (v_rec->>'conversation_id')::uuid;

        select case
                   when participant1_id = (v_rec->>'sender_id')::uuid then participant2_id
                   else participant1_id
               end
        into v_user
        from public.conversations
        where id = v_id
          and (participant1_id = (v_rec->>'sender_id')::uuid
            or participant2_id = (v_rec->>'sender_id')::uuid);

        if v_user is not null then
            select coalesce(nullif(full_name, ''), 'Nuevo mensaje'), avatar_url
            into v_title, v_avatar
            from public.profiles
            where id = (v_rec->>'sender_id')::uuid;

            v_content := coalesce(nullif(v_rec->>'content', ''), 'Nuevo mensaje');
            v_body := case
                when length(v_content) > 60 then left(v_content, 60) || '...'
                else v_content
            end;
            v_data := jsonb_build_object(
                'type', 'message',
                'conversation_id', v_id,
                'avatar_url', v_avatar
            );

            perform public.send_push_direct(
                v_user,
                'message',
                coalesce(v_title, 'Nuevo mensaje'),
                v_body,
                v_data,
                v_id
            );
        end if;

    elsif TG_TABLE_NAME = 'challenges' and TG_OP = 'INSERT' then
        v_id := (v_rec->>'id')::uuid;

        select coalesce(nullif(full_name, ''), 'Alguien'), avatar_url
        into v_title, v_avatar
        from public.profiles
        where id = (v_rec->>'challenger_id')::uuid;

        v_title := coalesce(v_title, 'Alguien');
        v_body := v_title || ' te desafió a un partido';
        v_data := jsonb_build_object(
            'type', 'challenge',
            'challenge_id', v_id,
            'avatar_url', v_avatar
        );

        perform public.send_push_direct(
            (v_rec->>'challenged_id')::uuid,
            'challenge',
            'Nuevo desafío',
            v_body,
            v_data,
            v_id
        );

    elsif TG_TABLE_NAME = 'tournaments' and TG_OP = 'INSERT' then
        v_id := (v_rec->>'id')::uuid;
        v_data := jsonb_build_object('type', 'tournament_new', 'tournament_id', v_id);

        for v_row in select id from public.profiles where role = 'athlete' loop
            perform public.send_push_direct(
                v_row.id,
                'tournament_new',
                'Nuevo torneo disponible',
                'Se abrió la inscripción: ' || coalesce(v_rec->>'name', ''),
                v_data,
                v_id
            );
        end loop;

    elsif TG_TABLE_NAME = 'tournaments' and TG_OP = 'UPDATE' then
        v_id := (v_rec->>'id')::uuid;

        if v_rec->>'status' = 'in_progress'
           and v_old->>'status' is distinct from 'in_progress' then
            v_data := jsonb_build_object('type', 'tournament_start', 'tournament_id', v_id);

            for v_row in select id from public.profiles where role = 'athlete' loop
                perform public.send_push_direct(
                    v_row.id,
                    'tournament_start',
                    'Torneo iniciado',
                    'Comenzó el torneo: ' || coalesce(v_rec->>'name', ''),
                    v_data,
                    v_id
                );
            end loop;

        elsif v_rec->>'status' is distinct from v_old->>'status'
              and v_rec->>'status' in ('closed', 'open') then
            v_title := case
                when v_rec->>'status' = 'closed' then 'Lista cerrada'
                else 'Lista reabierta'
            end;
            v_body := case
                when v_rec->>'status' = 'closed'
                    then 'Se cerró la lista de inscripción para '
                else 'Se reabrió la lista de inscripción para '
            end || coalesce(v_rec->>'name', '');
            v_data := jsonb_build_object('type', 'tournament_update', 'tournament_id', v_id);

            for v_row in
                select player_id
                from public.tournament_registrations
                where tournament_id = v_id
            loop
                perform public.send_push_direct(
                    v_row.player_id,
                    'tournament_update',
                    v_title,
                    v_body,
                    v_data,
                    v_id
                );
            end loop;
        end if;

    elsif TG_TABLE_NAME = 'tournament_registrations' and TG_OP = 'INSERT' then
        v_id := (v_rec->>'tournament_id')::uuid;

        select t.organizer_id, coalesce(nullif(p.full_name, ''), 'Alguien'), t.name
        into v_user, v_title, v_tournament_name
        from public.tournaments t
        join public.profiles p on p.id = (v_rec->>'player_id')::uuid
        where t.id = v_id;

        if v_user is not null then
            v_data := jsonb_build_object('type', 'tournament_registration', 'tournament_id', v_id);
            perform public.send_push_direct(
                v_user,
                'tournament_registration',
                'Nueva inscripción',
                v_title || ' se inscribió en ' || coalesce(v_tournament_name, ''),
                v_data,
                v_id
            );
        end if;

    elsif TG_TABLE_NAME = 'matches' and TG_OP = 'UPDATE'
          and v_rec->>'scheduled_at' is not null
          and v_rec->>'scheduled_at' is distinct from v_old->>'scheduled_at' then
        v_id := (v_rec->>'id')::uuid;
        v_when := to_char(
            ((v_rec->>'scheduled_at')::timestamptz at time zone 'America/Argentina/Tucuman'),
            'DD/MM HH24:MI'
        );
        v_body := 'Tu partido se juega el ' || v_when
            || case
                   when nullif(v_rec->>'location', '') is not null
                       then ' en ' || (v_rec->>'location')
                   else ''
               end;
        v_data := jsonb_build_object('type', 'match_scheduled', 'match_id', v_id);

        for v_user in
            select x
            from unnest(array[
                (v_rec->>'player1_id')::uuid,
                (v_rec->>'player2_id')::uuid
            ]) as x
            where x is not null
        loop
            perform public.send_push_direct(
                v_user,
                'match_scheduled',
                'Partido programado',
                v_body,
                v_data,
                v_id
            );
        end loop;
    end if;

    if TG_OP = 'DELETE' then
        return old;
    end if;
    return new;
end;
$$;

-- Desafío recibido
drop trigger if exists trg_notify_challenge_created on public.challenges;
create trigger trg_notify_challenge_created
    after insert on public.challenges
    for each row execute function public.call_notify_webhook();

-- Torneo nuevo / iniciado / lista cerrada-reabierta
drop trigger if exists trg_notify_tournament_changes on public.tournaments;
create trigger trg_notify_tournament_changes
    after insert or update on public.tournaments
    for each row execute function public.call_notify_webhook();

-- Nueva inscripción (aviso al organizador)
drop trigger if exists trg_notify_registration_changes on public.tournament_registrations;
create trigger trg_notify_registration_changes
    after insert or update on public.tournament_registrations
    for each row execute function public.call_notify_webhook();

-- Partido programado (aviso a ambos jugadores)
drop trigger if exists trg_notify_match_changes on public.matches;
create trigger trg_notify_match_changes
    after update on public.matches
    for each row execute function public.call_notify_webhook();

-- Mensaje nuevo (notificación de chat)
drop trigger if exists trg_notify_message_sent on public.messages;
create trigger trg_notify_message_sent
    after insert on public.messages
    for each row execute function public.call_notify_webhook();

-- ──────────────────────────────────────────────────────────────
-- 15) EDGE FUNCTION `notify` (ya NO requiere webhooks del dashboard:
--     la llaman los triggers de la sección 14c vía pg_net)
-- ──────────────────────────────────────────────────────────────
-- 16) REALTIME: habilitar broadcast en tablas que la app escucha
--     (se puede verificar/marcar también en Dashboard → Database → Replication)
-- ──────────────────────────────────────────────────────────────
-- Realtime para los canales que usa supabase-js (postgres_changes):
--   messages, conversations, notifications, profiles
-- Si usás el portal de Supabase, activá esas tablas en:
--   Database → Replication → supabase_realtime → tabla toggle

-- CORRER ESTO ABOJO/O EN EL SQL EDITOR si profiles aún no está en
-- la publicación supabase_realtime (la presencia en vivo lo necesita):
do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'messages', 'conversations', 'notifications', 'beta_feedback', 'matches']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
    add constraint profiles_role_check
    check (role in ('athlete', 'organizer', 'admin'));

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
    select exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'admin'
    );
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "Admins can update profiles" on public.profiles;
create policy "Admins can update profiles" on public.profiles
    for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can update tournaments" on public.tournaments;
create policy "Admins can update tournaments" on public.tournaments
    for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can delete tournaments" on public.tournaments;
create policy "Admins can delete tournaments" on public.tournaments
    for delete using (public.is_admin());

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public, auth
as $$
begin
    if p_user_id is null then
        raise exception 'Falta el usuario a eliminar';
    end if;
    if not public.is_admin() then
        raise exception 'No tenés permisos de administrador';
    end if;
    if p_user_id = auth.uid() then
        raise exception 'No podés eliminar tu propia cuenta';
    end if;
    if not exists (select 1 from public.profiles where id = p_user_id)
       and not exists (select 1 from auth.users where id = p_user_id) then
        raise exception 'Usuario no encontrado';
    end if;

    -- Limpieza explícita antes de borrar el usuario de auth.
    if to_regclass('public.doubles_challenges') is not null then
        delete from public.doubles_challenges
         where created_by = p_user_id
            or challenger_team_id in (
                select id from public.doubles_teams
                where player1_id = p_user_id or player2_id = p_user_id or created_by = p_user_id
            )
            or challenged_team_id in (
                select id from public.doubles_teams
                where player1_id = p_user_id or player2_id = p_user_id or created_by = p_user_id
            );
    end if;
    if to_regclass('public.doubles_teams') is not null then
        delete from public.doubles_teams
         where player1_id = p_user_id or player2_id = p_user_id or created_by = p_user_id;
    end if;

    delete from public.beta_feedback_votes where user_id = p_user_id;
    delete from public.beta_feedback_reports where reporter_id = p_user_id;
    delete from public.beta_feedback where user_id = p_user_id;
    delete from public.notifications where user_id = p_user_id;
    delete from public.tournament_registrations where player_id = p_user_id;
    delete from public.elo_match_history where player_id = p_user_id;
    delete from public.messages where sender_id = p_user_id;
    delete from public.conversations
     where participant1_id = p_user_id or participant2_id = p_user_id;
    delete from public.challenges
     where challenger_id = p_user_id or challenged_id = p_user_id or proposed_by = p_user_id;
    delete from public.matches
     where player1_id = p_user_id or player2_id = p_user_id or created_by = p_user_id
        or submitted_by = p_user_id or confirmed_by = p_user_id or disputed_by = p_user_id;

    -- Datos del organizer: se limpian en orden para no depender de cascadas.
    if to_regclass('public.tournaments') is not null then
        delete from public.elo_match_history
         where match_id in (
            select id from public.matches
            where tournament_id in (select id from public.tournaments where organizer_id = p_user_id)
         );
        delete from public.matches
         where tournament_id in (select id from public.tournaments where organizer_id = p_user_id);
        delete from public.tournament_registrations
         where tournament_id in (select id from public.tournaments where organizer_id = p_user_id);
        delete from public.tournament_dates
         where tournament_id in (select id from public.tournaments where organizer_id = p_user_id);
        delete from public.tournaments where organizer_id = p_user_id;
    end if;

    if to_regclass('public.courts') is not null then
        update public.matches set court_id = null
         where court_id in (select id from public.courts where organizer_id = p_user_id);
        delete from public.courts where organizer_id = p_user_id;
    end if;
    if to_regclass('public.organizer_mp_accounts') is not null then
        delete from public.organizer_mp_accounts where organizer_id = p_user_id;
    end if;
    if to_regclass('public.mp_oauth_states') is not null then
        delete from public.mp_oauth_states where organizer_id = p_user_id;
    end if;

    delete from public.profiles where id = p_user_id;
    delete from auth.users where id = p_user_id;
end;
$$;

alter function public.admin_delete_user(uuid) owner to postgres;
revoke execute on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;

create or replace function public.admin_update_user(
    p_user_id uuid,
    p_username text,
    p_full_name text,
    p_role text,
    p_city text,
    p_club text,
    p_elo integer,
    p_level text,
    p_age_category text,
    p_gender text,
    p_bio text
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
    if not public.is_admin() then
        raise exception 'No tenés permisos de administrador';
    end if;
    if p_role not in ('athlete', 'organizer', 'admin') then
        raise exception 'Rol inválido';
    end if;
    if p_level not in ('1era', '2da', '3era', '4ta', '5ta', '6ta') then
        raise exception 'Nivel inválido';
    end if;
    if p_age_category not in ('libre', '+30', '+40', '+50', '+60', '+70', '+80') then
        raise exception 'Categoría de edad inválida';
    end if;
    if p_gender is not null and p_gender not in ('femenino', 'masculino', 'otro') then
        raise exception 'Género inválido';
    end if;
    if nullif(btrim(coalesce(p_username, '')), '') is null then
        raise exception 'El usuario es obligatorio';
    end if;
    if p_user_id = auth.uid() and p_role <> 'admin' then
        raise exception 'No podés quitarte el rol de administrador';
    end if;
    update public.profiles
    set username = btrim(p_username),
        full_name = coalesce(btrim(p_full_name), ''),
        role = p_role,
        city = nullif(btrim(coalesce(p_city, '')), ''),
        club = nullif(btrim(coalesce(p_club, '')), ''),
        elo = greatest(coalesce(p_elo, 1000), 0),
        level = p_level,
        age_category = p_age_category,
        gender = p_gender,
        bio = nullif(btrim(coalesce(p_bio, '')), '')
    where id = p_user_id;
    if not found then
        raise exception 'Usuario no encontrado';
    end if;
end;
$$;

revoke execute on function public.admin_update_user(uuid, text, text, text, text, text, integer, text, text, text, text) from public;
grant execute on function public.admin_update_user(uuid, text, text, text, text, text, integer, text, text, text, text) to authenticated;

create or replace function public.admin_delete_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
    if not public.is_admin() then
        raise exception 'No tenés permisos de administrador';
    end if;
    if not exists (select 1 from public.tournaments where id = p_tournament_id) then
        raise exception 'Torneo no encontrado';
    end if;
    delete from public.tournaments where id = p_tournament_id;
end;
$$;

revoke execute on function public.admin_delete_tournament(uuid) from public;
grant execute on function public.admin_delete_tournament(uuid) to authenticated;

create or replace function public.admin_update_tournament(
    p_tournament_id uuid,
    p_name text,
    p_description text,
    p_status text,
    p_max_players integer,
    p_location text,
    p_starts_at timestamptz,
    p_allowed_gender text,
    p_allowed_level text,
    p_prize_money integer,
    p_entry_fee integer
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
    if not public.is_admin() then
        raise exception 'No tenés permisos de administrador';
    end if;
    if nullif(btrim(coalesce(p_name, '')), '') is null then
        raise exception 'El nombre del torneo es obligatorio';
    end if;
    if p_status not in ('upcoming', 'open', 'closed', 'in_progress', 'completed') then
        raise exception 'Estado inválido';
    end if;
    if p_allowed_gender not in ('todos', 'femenino', 'masculino') then
        raise exception 'Género permitido inválido';
    end if;
    if p_allowed_level not in ('todas', '1era', '2da', '3era', '4ta', '5ta', '6ta') then
        raise exception 'Nivel permitido inválido';
    end if;
    update public.tournaments
    set name = btrim(p_name),
        description = nullif(btrim(coalesce(p_description, '')), ''),
        status = p_status,
        max_players = case when p_max_players is null or p_max_players <= 0 then null else p_max_players end,
        location = nullif(btrim(coalesce(p_location, '')), ''),
        starts_at = p_starts_at,
        allowed_gender = p_allowed_gender,
        allowed_level = p_allowed_level,
        prize_money = greatest(coalesce(p_prize_money, 0), 0),
        entry_fee = greatest(coalesce(p_entry_fee, 0), 0)
    where id = p_tournament_id;
    if not found then
        raise exception 'Torneo no encontrado';
    end if;
end;
$$;

revoke execute on function public.admin_update_tournament(uuid, text, text, text, integer, text, timestamptz, text, text, integer, integer) from public;
grant execute on function public.admin_update_tournament(uuid, text, text, text, integer, text, timestamptz, text, text, integer, integer) to authenticated;

-- =============================================================
-- 2026-11-23 — DOBLES: duplas, desafíos y partidos
-- =============================================================
-- Ejecutar en Supabase → SQL Editor → Run. Es idempotente.
--
-- Contrato usado por el cliente:
--   src/services/doublesService.ts  (tablas, selects y RPCs)
--   src/hooks/useDoubles.ts         (Realtime en doubles_teams/doubles_challenges)
--   app/matches.tsx / src/hooks/useMatches.ts (columnas de matches)
--
-- Las altas/bajas/cambios se hacen SOLO por RPC security definer: los
-- clientes tienen permiso de lectura (ranking y desafíos abiertos) pero no
-- de escritura directa. Las notificaciones se insertan desde las RPC con
-- send_push_direct (si existe) o con un insert directo como fallback.
-- =============================================================


-- ──────────────────────────────────────────────────────────────
-- 1) Tablas de dobles
--    OJO: los nombres de las FK se dejan sin renombrar porque
--    doublesService.ts usa los hints !doubles_teams_player1_id_fkey,
--    !doubles_teams_player2_id_fkey, etc. en sus selects.
-- ──────────────────────────────────────────────────────────────
create table if not exists public.doubles_teams (
    id           uuid primary key default gen_random_uuid(),
    player1_id   uuid not null references public.profiles (id) on delete cascade,
    player2_id   uuid not null references public.profiles (id) on delete cascade,
    created_by   uuid not null references public.profiles (id) on delete cascade,
    status       text not null default 'invited'
                 check (status in ('invited', 'ready', 'declined', 'disbanded')),
    is_permanent boolean not null default false,
    keep_p1      boolean not null default false,
    keep_p2      boolean not null default false,
    name         text,
    elo          integer not null default 1000,
    wins         integer not null default 0,
    losses       integer not null default 0,
    created_at   timestamptz not null default now(),
    constraint doubles_teams_distinct_players check (player1_id <> player2_id)
);

-- Una sola dupla activa por par (en cualquier orden); si se disuelve,
-- los mismos jugadores pueden volver a formarla.
create unique index if not exists uq_doubles_teams_active_pair
    on public.doubles_teams (least(player1_id, player2_id), greatest(player1_id, player2_id))
    where status in ('invited', 'ready');

create index if not exists idx_doubles_teams_p1 on public.doubles_teams (player1_id);
create index if not exists idx_doubles_teams_p2 on public.doubles_teams (player2_id);
create index if not exists idx_doubles_teams_status on public.doubles_teams (status, is_permanent);
create index if not exists idx_doubles_teams_elo on public.doubles_teams (elo desc);

create table if not exists public.doubles_challenges (
    id                  uuid primary key default gen_random_uuid(),
    challenger_team_id  uuid not null references public.doubles_teams (id) on delete cascade,
    challenged_team_id  uuid references public.doubles_teams (id) on delete cascade,
    status              text not null default 'pending'
                        check (status in ('pending', 'accepted', 'rejected', 'cancelled')),
    proposed_date       timestamptz,
    proposed_venue      text,
    message             text,
    match_id            uuid references public.matches (id) on delete set null,
    created_by          uuid not null references public.profiles (id) on delete cascade,
    created_at          timestamptz not null default now()
);

create index if not exists idx_doubles_challenges_challenger on public.doubles_challenges (challenger_team_id, status);
create index if not exists idx_doubles_challenges_challenged on public.doubles_challenges (challenged_team_id, status);
create index if not exists idx_doubles_challenges_status on public.doubles_challenges (status, created_at desc);


-- ──────────────────────────────────────────────────────────────
-- 2) Columnas nuevas en matches y challenges
--    (compatibles con el SELECT de app/matches.tsx y useMatches.ts)
-- ──────────────────────────────────────────────────────────────
alter table public.matches
    add column if not exists match_format text not null default 'singles'
        check (match_format in ('singles', 'doubles')),
    add column if not exists partner1_id uuid references public.profiles (id) on delete set null,
    add column if not exists partner2_id uuid references public.profiles (id) on delete set null,
    add column if not exists team1_id uuid references public.doubles_teams (id) on delete set null,
    add column if not exists team2_id uuid references public.doubles_teams (id) on delete set null,
    add column if not exists doubles_elo_applied boolean not null default false;

create index if not exists idx_matches_partner1 on public.matches (partner1_id);
create index if not exists idx_matches_partner2 on public.matches (partner2_id);
create index if not exists idx_matches_team1 on public.matches (team1_id);
create index if not exists idx_matches_team2 on public.matches (team2_id);

alter table public.conversations
    add column if not exists kind text not null default 'direct'
        check (kind in ('direct', 'doubles')),
    add column if not exists doubles_team_id uuid references public.doubles_teams (id) on delete set null;

alter table public.conversations drop constraint if exists conversations_unique_pair;

do $$
declare
    r record;
begin
    for r in
        select conname
          from pg_constraint
         where conrelid = 'public.conversations'::regclass
           and contype = 'u'
    loop
        execute format('alter table public.conversations drop constraint if exists %I', r.conname);
    end loop;
end $$;

drop index if exists public.conversations_participant1_id_participant2_id_key;
drop index if exists public.conversations_p1_p2_key;

do $$
declare
    r      record;
    v_keep uuid;
begin
    for r in
        select least(participant1_id, participant2_id) as p1,
               greatest(participant1_id, participant2_id) as p2
          from public.conversations
         where kind = 'direct'
         group by 1, 2
        having count(*) > 1
    loop
        select c.id into v_keep
          from public.conversations c
         where c.kind = 'direct'
           and least(c.participant1_id, c.participant2_id) = r.p1
           and greatest(c.participant1_id, c.participant2_id) = r.p2
         order by case when coalesce(c.last_message, '') <> '' then 0 else 1 end,
                  c.last_message_at desc,
                  c.created_at asc,
                  c.id asc
         limit 1;

        update public.messages m
           set conversation_id = v_keep
          from public.conversations c
         where c.id = m.conversation_id
           and c.id <> v_keep
           and c.kind = 'direct'
           and least(c.participant1_id, c.participant2_id) = r.p1
           and greatest(c.participant1_id, c.participant2_id) = r.p2;

        update public.notifications n
           set data = jsonb_set(coalesce(n.data, '{}'::jsonb), '{conversation_id}', to_jsonb(v_keep)),
               related_id = v_keep
          where n.type in ('message', 'doubles_chat_ready', 'doubles_chat_closed')
            and (
                n.related_id in (
                    select c.id
                      from public.conversations c
                     where c.id <> v_keep
                       and c.kind = 'direct'
                       and least(c.participant1_id, c.participant2_id) = r.p1
                       and greatest(c.participant1_id, c.participant2_id) = r.p2
                )
                or exists (
                    select 1
                      from public.conversations c
                     where c.id <> v_keep
                       and c.kind = 'direct'
                       and least(c.participant1_id, c.participant2_id) = r.p1
                       and greatest(c.participant1_id, c.participant2_id) = r.p2
                       and n.data ->> 'conversation_id' = c.id::text
                )
            );

        delete from public.conversations c
         where c.id <> v_keep
           and c.kind = 'direct'
           and least(c.participant1_id, c.participant2_id) = r.p1
           and greatest(c.participant1_id, c.participant2_id) = r.p2;
    end loop;

    for r in
        select doubles_team_id as team
          from public.conversations
         where kind = 'doubles'
           and doubles_team_id is not null
         group by 1
        having count(*) > 1
    loop
        select c.id into v_keep
          from public.conversations c
         where c.kind = 'doubles'
           and c.doubles_team_id = r.team
         order by c.last_message_at desc, c.created_at asc, c.id asc
         limit 1;

        update public.messages m
           set conversation_id = v_keep
          from public.conversations c
         where c.id = m.conversation_id
           and c.id <> v_keep
           and c.kind = 'doubles'
           and c.doubles_team_id = r.team;

        update public.notifications n
           set data = jsonb_set(coalesce(n.data, '{}'::jsonb), '{conversation_id}', to_jsonb(v_keep)),
               related_id = v_keep
          where n.type in ('message', 'doubles_chat_ready', 'doubles_chat_closed')
            and (
                n.related_id in (
                    select c.id
                      from public.conversations c
                     where c.id <> v_keep
                       and c.kind = 'doubles'
                       and c.doubles_team_id = r.team
                )
                or exists (
                    select 1
                      from public.conversations c
                     where c.id <> v_keep
                       and c.kind = 'doubles'
                       and c.doubles_team_id = r.team
                       and n.data ->> 'conversation_id' = c.id::text
                )
            );

        delete from public.conversations c
         where c.id <> v_keep
           and c.kind = 'doubles'
           and c.doubles_team_id = r.team;
    end loop;
end $$;

drop index if exists public.conversations_unique_direct_pair;
create unique index conversations_unique_direct_pair
    on public.conversations (least(participant1_id, participant2_id), greatest(participant1_id, participant2_id))
    where kind = 'direct';

create unique index if not exists conversations_unique_doubles_team
    on public.conversations (doubles_team_id)
    where doubles_team_id is not null;

drop policy if exists "Users can delete their conversations" on public.conversations;
create policy "Users can delete their conversations" on public.conversations
    for delete using (auth.uid() = participant1_id or auth.uid() = participant2_id);

drop policy if exists "Users can delete messages" on public.messages;
create policy "Users can delete messages" on public.messages
    for delete using (
        exists (
            select 1 from public.conversations c
            where c.id = conversation_id
              and (c.participant1_id = auth.uid() or c.participant2_id = auth.uid())
        )
    );

alter table public.matches drop constraint if exists matches_type_check;

do $$
declare
    v_types  text[];
    v_values text;
begin
    select array_agg(distinct type)
      into v_types
      from public.matches
     where type is not null;

    v_types := coalesce(v_types, array[]::text[]) || array[
        'friendly',
        'competitive',
        'training',
        'tournament',
        'challenge'
    ]::text[];

    select string_agg(quote_literal(t), ', ' order by t)
      into v_values
      from (select distinct unnest(v_types) as t) s;

    execute format(
        'alter table public.matches add constraint matches_type_check check (type in (%s))',
        v_values
    );
end $$;

alter table public.challenges
    add column if not exists match_format text not null default 'singles'
        check (match_format in ('singles', 'doubles')),
    add column if not exists team1_id uuid references public.doubles_teams (id) on delete set null,
    add column if not exists team2_id uuid references public.doubles_teams (id) on delete set null,
    add column if not exists partner1_id uuid references public.profiles (id) on delete set null,
    add column if not exists partner2_id uuid references public.profiles (id) on delete set null,
    add column if not exists challenger_partner_id uuid references public.profiles (id) on delete set null,
    add column if not exists challenged_partner_id uuid references public.profiles (id) on delete set null,
    add column if not exists challenger_team_id uuid references public.doubles_teams (id) on delete set null,
    add column if not exists challenged_team_id uuid references public.doubles_teams (id) on delete set null;


-- ──────────────────────────────────────────────────────────────
-- 3) Tipos de notificación de dobles (los que ya maneja el cliente
--    en notificationService.ts / typeTheme.ts / notificationNavigation.ts)
-- ──────────────────────────────────────────────────────────────
alter table public.notifications drop constraint if exists notifications_type_check;

do $$
declare
    v_types  text[];
    v_values text;
begin
    select array_agg(distinct type)
      into v_types
      from public.notifications
     where type is not null;

    v_types := coalesce(v_types, array[]::text[]) || array[
        'message',
        'challenge',
        'challenge_received',
        'challenge_accepted',
        'challenge_rejected',
        'tournament',
        'tournament_new',
        'tournament_start',
        'tournament_update',
        'tournament_registration',
        'fixture_ready',
        'match_scheduled',
        'match_result',
        'match_confirmed',
        'payment',
        'system',
        'test',
        'doubles_invite_received',
        'doubles_invite_accepted',
        'doubles_invite_rejected',
        'doubles_challenge_received',
        'doubles_challenge_accepted',
        'doubles_chat_ready',
        'doubles_chat_closed'
    ]::text[];

    select string_agg(quote_literal(t), ', ' order by t)
      into v_values
      from (select distinct unnest(v_types) as t) s;

    execute format(
        'alter table public.notifications add constraint notifications_type_check check (type in (%s))',
        v_values
    );
end $$;


-- ──────────────────────────────────────────────────────────────
-- 4) RLS: lectura pública para usuarios autenticados (para que se
--    vea el ranking de duplas y los desafíos abiertos); escrituras
--    prohibidas: todo pasa por las RPC de abajo.
-- ──────────────────────────────────────────────────────────────
alter table public.doubles_teams enable row level security;
alter table public.doubles_challenges enable row level security;

drop policy if exists "Doubles teams are viewable by authenticated users" on public.doubles_teams;
create policy "Doubles teams are viewable by authenticated users" on public.doubles_teams
    for select to authenticated using (true);

drop policy if exists "Doubles challenges are viewable by authenticated users" on public.doubles_challenges;
create policy "Doubles challenges are viewable by authenticated users" on public.doubles_challenges
    for select to authenticated using (true);

-- Los compañeros de dobles también deben ver/cargar resultado del partido.
drop policy if exists "Players can view matches" on public.matches;
create policy "Players can view matches" on public.matches
    for select using (
        player1_id = auth.uid() or player2_id = auth.uid()
        or partner1_id = auth.uid() or partner2_id = auth.uid()
        or created_by = auth.uid()
        or exists (
            select 1 from public.tournament_registrations tr
            where tr.tournament_id = matches.tournament_id
              and tr.player_id = auth.uid()
        )
    );

drop policy if exists "Players can create matches" on public.matches;
create policy "Players can create matches" on public.matches
    for insert with check (
        player1_id = auth.uid() or player2_id = auth.uid()
        or partner1_id = auth.uid() or partner2_id = auth.uid()
        or created_by = auth.uid()
    );

drop policy if exists "Players can update matches" on public.matches;
create policy "Players can update matches" on public.matches
    for update using (
        player1_id = auth.uid() or player2_id = auth.uid()
        or partner1_id = auth.uid() or partner2_id = auth.uid()
        or created_by = auth.uid()
    );

drop policy if exists "Players can view challenges" on public.challenges;
create policy "Players can view challenges" on public.challenges
    for select using (
        challenger_id = auth.uid() or challenged_id = auth.uid() or proposed_by = auth.uid()
        or partner1_id = auth.uid() or partner2_id = auth.uid()
        or challenger_partner_id = auth.uid() or challenged_partner_id = auth.uid()
    );

drop policy if exists "Players can create challenges" on public.challenges;
create policy "Players can create challenges" on public.challenges
    for insert with check (
        challenger_id = auth.uid() or proposed_by = auth.uid()
        or challenger_partner_id = auth.uid() or challenged_partner_id = auth.uid()
    );

drop policy if exists "Players can update challenges" on public.challenges;
create policy "Players can update challenges" on public.challenges
    for update using (
        challenger_id = auth.uid() or challenged_id = auth.uid() or proposed_by = auth.uid()
        or partner1_id = auth.uid() or partner2_id = auth.uid()
        or challenger_partner_id = auth.uid() or challenged_partner_id = auth.uid()
    );


-- ──────────────────────────────────────────────────────────────
-- 5) Helpers internos
-- ──────────────────────────────────────────────────────────────
create or replace function public.doubles_notify(
    p_user_id   uuid,
    p_type      text,
    p_title     text,
    p_body      text,
    p_data      jsonb,
    p_related_id uuid default null
)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
begin
    if p_user_id is null then
        return;
    end if;

    -- send_push_direct inserta la notificación y además manda el push.
    -- Se llama de forma dinámica para no romper si la BD no lo tiene.
    if to_regprocedure('public.send_push_direct(uuid,text,text,text,jsonb,uuid)') is not null then
        execute 'select public.send_push_direct($1, $2, $3, $4, $5, $6)'
            using p_user_id, p_type, p_title, p_body,
                  coalesce(p_data, '{}'::jsonb), p_related_id;
    else
        insert into public.notifications (user_id, type, title, body, data, related_id)
        values (p_user_id, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb), p_related_id);
    end if;
end $$;

revoke all on function public.doubles_notify(uuid, text, text, text, jsonb, uuid) from public;
revoke all on function public.doubles_notify(uuid, text, text, text, jsonb, uuid) from anon;
revoke all on function public.doubles_notify(uuid, text, text, text, jsonb, uuid) from authenticated;

create or replace function public.doubles_refresh_elo(p_team uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
    update public.doubles_teams t
       set elo = round(((p1.elo + p2.elo)::numeric / 2.0))::integer
      from public.profiles p1, public.profiles p2
     where t.id = p_team
       and p1.id = t.player1_id
       and p2.id = t.player2_id;
end $$;

revoke all on function public.doubles_refresh_elo(uuid) from public;
revoke all on function public.doubles_refresh_elo(uuid) from anon;
revoke all on function public.doubles_refresh_elo(uuid) from authenticated;

create or replace function public.doubles_display_name(p_user uuid)
returns text
language sql
stable
security definer set search_path = public
as $$
    select coalesce(nullif(full_name, ''), nullif(username, ''), 'Alguien')
      from public.profiles
     where id = p_user;
$$;

revoke all on function public.doubles_display_name(uuid) from public;
revoke all on function public.doubles_display_name(uuid) from anon;
revoke all on function public.doubles_display_name(uuid) from authenticated;

create or replace function public.doubles_avatar(p_user uuid)
returns text
language sql
stable
security definer set search_path = public
as $$
    select avatar_url from public.profiles where id = p_user;
$$;

revoke all on function public.doubles_avatar(uuid) from public;
revoke all on function public.doubles_avatar(uuid) from anon;
revoke all on function public.doubles_avatar(uuid) from authenticated;


-- ──────────────────────────────────────────────────────────────
-- 6) RPCs que llama doublesService.ts
-- ──────────────────────────────────────────────────────────────

-- 6.1) Invitar a formar dupla → devuelve el id de la dupla
create or replace function public.invite_to_doubles(p_partner uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
    v_me   uuid := auth.uid();
    v_team uuid;
begin
    if v_me is null then
        raise exception 'Tenés que iniciar sesión';
    end if;
    if p_partner is null or p_partner = v_me then
        raise exception 'Elegí otro jugador';
    end if;
    if not exists (select 1 from public.profiles where id = v_me and role = 'athlete') then
        raise exception 'Solo los atletas pueden formar pareja';
    end if;
    if not exists (select 1 from public.profiles where id = p_partner and role = 'athlete') then
        raise exception 'Ese jugador no puede formar pareja';
    end if;
    if exists (
        select 1 from public.doubles_teams
         where status in ('invited', 'ready')
           and (player1_id in (v_me, p_partner) or player2_id in (v_me, p_partner))
    ) then
        raise exception 'Uno de los dos ya tiene una pareja activa';
    end if;

    insert into public.doubles_teams (player1_id, player2_id, created_by, status)
    values (v_me, p_partner, v_me, 'invited')
    returning id into v_team;

    perform public.doubles_refresh_elo(v_team);

    perform public.doubles_notify(
        p_partner,
        'doubles_invite_received',
        'Invitación de dobles',
        public.doubles_display_name(v_me) || ' te invitó a formar una dupla',
        jsonb_build_object(
            'type', 'doubles_invite_received',
            'doubles_invitation_id', v_team,
            'avatar_url', public.doubles_avatar(v_me)
        ),
        v_team
    );

    return v_team;
end $$;

-- 6.2) Aceptar / rechazar invitación de dupla
create or replace function public.respond_doubles_invite(p_team uuid, p_accept boolean)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
    v_me     uuid := auth.uid();
    v_team   public.doubles_teams%rowtype;
    v_type   text;
    v_body   text;
begin
    if v_me is null then
        raise exception 'Tenés que iniciar sesión';
    end if;

    select * into v_team from public.doubles_teams where id = p_team for update;
    if not found then
        raise exception 'Invitación no encontrada';
    end if;
    if v_team.player2_id <> v_me then
        raise exception 'No tenés permisos para responder esta invitación';
    end if;
    if v_team.status <> 'invited' then
        raise exception 'La invitación ya fue respondida';
    end if;

    if coalesce(p_accept, false) then
        update public.doubles_teams set status = 'ready' where id = p_team;
        perform public.doubles_refresh_elo(p_team);
        v_type := 'doubles_invite_accepted';
        v_body := public.doubles_display_name(v_me) || ' aceptó formar la dupla. ¡A jugar!';
    else
        update public.doubles_teams set status = 'declined' where id = p_team;
        v_type := 'doubles_invite_rejected';
        v_body := public.doubles_display_name(v_me) || ' rechazó la invitación de dobles';
    end if;

    perform public.doubles_notify(
        v_team.player1_id,
        v_type,
        case when coalesce(p_accept, false) then 'Dupla confirmada' else 'Invitación rechazada' end,
        v_body,
        jsonb_build_object(
            'type', v_type,
            'doubles_invitation_id', p_team,
            'avatar_url', public.doubles_avatar(v_me)
        ),
        p_team
    );
end $$;

-- 6.3) Conservar dupla: devuelve true cuando ya es permanente
create or replace function public.keep_doubles_team(p_team uuid)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
    v_me     uuid := auth.uid();
    v_team   public.doubles_teams%rowtype;
    v_result boolean;
begin
    if v_me is null then
        raise exception 'Tenés que iniciar sesión';
    end if;

    select * into v_team from public.doubles_teams where id = p_team for update;
    if not found then
        raise exception 'Dupla no encontrada';
    end if;
    if v_me not in (v_team.player1_id, v_team.player2_id) then
        raise exception 'No pertenecés a esta dupla';
    end if;
    if v_team.status <> 'ready' then
        raise exception 'La dupla todavía no está confirmada';
    end if;

    if v_me = v_team.player2_id then
        update public.doubles_teams set keep_p2 = true where id = p_team;
    else
        update public.doubles_teams set keep_p1 = true where id = p_team;
    end if;

    update public.doubles_teams
       set is_permanent = (keep_p1 and keep_p2)
     where id = p_team
    returning is_permanent into v_result;

    return coalesce(v_result, false);
end $$;

-- 6.4) Salir de la dupla / cancelar invitación
create or replace function public.leave_doubles_team(p_team uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
    v_me    uuid := auth.uid();
    v_team  public.doubles_teams%rowtype;
    v_other uuid;
begin
    if v_me is null then
        raise exception 'Tenés que iniciar sesión';
    end if;

    select * into v_team from public.doubles_teams where id = p_team for update;
    if not found then
        raise exception 'Dupla no encontrada';
    end if;
    if v_me not in (v_team.player1_id, v_team.player2_id) then
        raise exception 'No pertenecés a esta dupla';
    end if;

    update public.doubles_teams
       set status = 'disbanded', keep_p1 = false, keep_p2 = false, is_permanent = false
     where id = p_team;

    update public.doubles_challenges
       set status = 'cancelled'
     where status = 'pending'
       and (challenger_team_id = p_team or challenged_team_id = p_team);

    v_other := case when v_me = v_team.player1_id then v_team.player2_id else v_team.player1_id end;
    perform public.doubles_notify(
        v_other,
        'doubles_invite_rejected',
        case when v_team.status = 'invited' then 'Invitación cancelada' else 'Dupla disuelta' end,
        public.doubles_display_name(v_me) ||
            case when v_team.status = 'invited' then ' canceló la invitación de dobles'
                 else ' disolvió la dupla' end,
        jsonb_build_object(
            'type', 'doubles_invite_rejected',
            'doubles_invitation_id', p_team,
            'avatar_url', public.doubles_avatar(v_me)
        ),
        p_team
    );
end $$;

-- 6.5) Publicar desafío (abierto si p_target es null) → id del desafío
create or replace function public.challenge_doubles(
    p_team    uuid,
    p_target  uuid default null,
    p_date    timestamptz default null,
    p_venue   text default null,
    p_message text default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
    v_me        uuid := auth.uid();
    v_team      public.doubles_teams%rowtype;
    v_target    public.doubles_teams%rowtype;
    v_challenge uuid;
    v_recipient uuid;
begin
    if v_me is null then
        raise exception 'Tenés que iniciar sesión';
    end if;
    if not exists (select 1 from public.profiles where id = v_me and role = 'athlete') then
        raise exception 'Solo los atletas pueden desafiar';
    end if;

    select * into v_team from public.doubles_teams where id = p_team for update;
    if not found or v_team.status <> 'ready'
       or v_me not in (v_team.player1_id, v_team.player2_id) then
        raise exception 'Necesitás una dupla lista para desafiar';
    end if;

    if p_target is not null then
        if p_target = p_team then
            raise exception 'No podés desafiar a tu propia dupla';
        end if;
        select * into v_target from public.doubles_teams where id = p_target;
        if not found or v_target.status <> 'ready' then
            raise exception 'La dupla rival no está disponible';
        end if;
        if v_team.player1_id in (v_target.player1_id, v_target.player2_id)
           or v_team.player2_id in (v_target.player1_id, v_target.player2_id) then
            raise exception 'Las duplas comparten un jugador';
        end if;
        if exists (
            select 1 from public.doubles_challenges
             where status = 'pending'
               and ((challenger_team_id = p_team and challenged_team_id = p_target)
                 or (challenger_team_id = p_target and challenged_team_id = p_team))
        ) then
            raise exception 'Ya hay un desafío pendiente entre estas duplas';
        end if;
    else
        if exists (
            select 1 from public.doubles_challenges
             where status = 'pending'
               and challenger_team_id = p_team
               and challenged_team_id is null
        ) then
            raise exception 'Ya publicaste un desafío abierto pendiente';
        end if;
    end if;

    insert into public.doubles_challenges (
        challenger_team_id, challenged_team_id, status,
        proposed_date, proposed_venue, message, created_by
    ) values (
        p_team, p_target, 'pending',
        p_date, nullif(btrim(coalesce(p_venue, '')), ''), nullif(btrim(coalesce(p_message, '')), ''), v_me
    )
    returning id into v_challenge;

    if p_target is not null then
        for v_recipient in
            select x from unnest(array[v_target.player1_id, v_target.player2_id]) as x
             where x is distinct from v_me
        loop
            perform public.doubles_notify(
                v_recipient,
                'doubles_challenge_received',
                'Desafío de dobles',
                public.doubles_display_name(v_me) || ' desafió a tu dupla a un partido',
                jsonb_build_object(
                    'type', 'doubles_challenge_received',
                    'doubles_challenge_id', v_challenge,
                    'avatar_url', public.doubles_avatar(v_me)
                ),
                v_challenge
            );
        end loop;
    else
        for v_recipient in
            select distinct x
              from public.doubles_teams t
              cross join unnest(array[t.player1_id, t.player2_id]) as x
             where t.status = 'ready'
               and t.id <> p_team
               and exists (select 1 from public.profiles p where p.id = x and p.role = 'athlete')
               and x is distinct from v_me
        loop
            perform public.doubles_notify(
                v_recipient,
                'doubles_challenge_received',
                'Nuevo desafío abierto de dobles',
                public.doubles_display_name(v_me) || ' publicó un desafío abierto',
                jsonb_build_object(
                    'type', 'doubles_challenge_received',
                    'doubles_challenge_id', v_challenge,
                    'avatar_url', public.doubles_avatar(v_me)
                ),
                v_challenge
            );
        end loop;
    end if;

    return v_challenge;
end $$;

-- 6.6) Aceptar desafío (abierto o directo) → id del partido creado
create or replace function public.accept_doubles_challenge(
    p_challenge uuid,
    p_team      uuid default null
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
    v_me         uuid := auth.uid();
    v_c          public.doubles_challenges%rowtype;
    v_challenger public.doubles_teams%rowtype;
    v_challenged public.doubles_teams%rowtype;
    v_match      uuid;
    v_recipient  uuid;
begin
    if v_me is null then
        raise exception 'Tenés que iniciar sesión';
    end if;

    select * into v_c from public.doubles_challenges where id = p_challenge for update;
    if not found then
        raise exception 'Desafío no encontrado';
    end if;
    if v_c.status <> 'pending' then
        raise exception 'El desafío ya fue respondido';
    end if;

    if v_c.challenged_team_id is null then
        if p_team is null then
            raise exception 'Elegí tu dupla para aceptar el desafío';
        end if;
        if p_team = v_c.challenger_team_id then
            raise exception 'No podés aceptar tu propio desafío';
        end if;
        select * into v_challenged from public.doubles_teams where id = p_team for update;
        if not found or v_challenged.status <> 'ready'
           or v_me not in (v_challenged.player1_id, v_challenged.player2_id) then
            raise exception 'Necesitás una dupla lista para aceptar';
        end if;
        update public.doubles_challenges set challenged_team_id = p_team where id = p_challenge;
        v_c.challenged_team_id := p_team;
    else
        select * into v_challenged from public.doubles_teams where id = v_c.challenged_team_id;
        if not found or v_me not in (v_challenged.player1_id, v_challenged.player2_id) then
            raise exception 'No tenés permisos para aceptar este desafío';
        end if;
        if p_team is not null and p_team <> v_c.challenged_team_id then
            raise exception 'La dupla no coincide con el desafío';
        end if;
    end if;

    select * into v_challenger from public.doubles_teams where id = v_c.challenger_team_id;
    if not found or v_challenger.status <> 'ready' then
        raise exception 'La dupla desafiante ya no está disponible';
    end if;
    if v_challenger.player1_id in (v_challenged.player1_id, v_challenged.player2_id)
       or v_challenger.player2_id in (v_challenged.player1_id, v_challenged.player2_id) then
        raise exception 'Las duplas comparten un jugador';
    end if;

    insert into public.matches (
        type, status, match_format, scheduled_at, location, notes,
        player1_id, player2_id, partner1_id, partner2_id,
        team1_id, team2_id, created_by
    ) values (
        'challenge', 'pending', 'doubles',
        v_c.proposed_date, nullif(btrim(coalesce(v_c.proposed_venue, '')), ''), v_c.message,
        v_challenger.player1_id, v_challenged.player1_id,
        v_challenger.player2_id, v_challenged.player2_id,
        v_challenger.id, v_challenged.id, v_me
    )
    returning id into v_match;

    update public.doubles_challenges
       set status = 'accepted', match_id = v_match
     where id = p_challenge;

    for v_recipient in
        select x from unnest(array[
            v_challenger.player1_id, v_challenger.player2_id,
            v_challenged.player1_id, v_challenged.player2_id
        ]) as x
         where x is distinct from v_me
    loop
        perform public.doubles_notify(
            v_recipient,
            'doubles_challenge_accepted',
            'Desafío de dobles aceptado',
            public.doubles_display_name(v_me) || ' aceptó el desafío. ¡A jugar!',
            jsonb_build_object(
                'type', 'doubles_challenge_accepted',
                'doubles_challenge_id', p_challenge,
                'match_id', v_match,
                'avatar_url', public.doubles_avatar(v_me)
            ),
            v_match
        );
    end loop;

    return v_match;
end $$;

-- 6.7) Rechazar desafío directo
create or replace function public.reject_doubles_challenge(p_challenge uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
    v_me     uuid := auth.uid();
    v_c      public.doubles_challenges%rowtype;
    v_target public.doubles_teams%rowtype;
    v_recipient uuid;
begin
    if v_me is null then
        raise exception 'Tenés que iniciar sesión';
    end if;

    select * into v_c from public.doubles_challenges where id = p_challenge for update;
    if not found then
        raise exception 'Desafío no encontrado';
    end if;
    if v_c.status <> 'pending' or v_c.challenged_team_id is null then
        raise exception 'El desafío no se puede rechazar';
    end if;
    select * into v_target from public.doubles_teams where id = v_c.challenged_team_id;
    if not found or v_me not in (v_target.player1_id, v_target.player2_id) then
        raise exception 'No tenés permisos para rechazar este desafío';
    end if;

    update public.doubles_challenges set status = 'rejected' where id = p_challenge;

    for v_recipient in
        select x from unnest(array[
            (select player1_id from public.doubles_teams where id = v_c.challenger_team_id),
            (select player2_id from public.doubles_teams where id = v_c.challenger_team_id)
        ]) as x
    loop
        perform public.doubles_notify(
            v_recipient,
            'doubles_invite_rejected',
            'Desafío de dobles rechazado',
            public.doubles_display_name(v_me) || ' rechazó el desafío de dobles',
            jsonb_build_object(
                'type', 'doubles_invite_rejected',
                'doubles_challenge_id', p_challenge,
                'avatar_url', public.doubles_avatar(v_me)
            ),
            p_challenge
        );
    end loop;
end $$;

-- 6.8) Cancelar desafío propio (abierto o directo)
create or replace function public.cancel_doubles_challenge(p_challenge uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
    v_me     uuid := auth.uid();
    v_c      public.doubles_challenges%rowtype;
    v_team   public.doubles_teams%rowtype;
    v_recipient uuid;
begin
    if v_me is null then
        raise exception 'Tenés que iniciar sesión';
    end if;

    select * into v_c from public.doubles_challenges where id = p_challenge for update;
    if not found then
        raise exception 'Desafío no encontrado';
    end if;
    if v_c.status <> 'pending' then
        raise exception 'El desafío ya no está pendiente';
    end if;
    select * into v_team from public.doubles_teams where id = v_c.challenger_team_id;
    if not found or v_me not in (v_team.player1_id, v_team.player2_id) then
        raise exception 'No tenés permisos para cancelar este desafío';
    end if;

    update public.doubles_challenges set status = 'cancelled' where id = p_challenge;

    if v_c.challenged_team_id is not null then
        for v_recipient in
            select x from unnest(array[
                (select player1_id from public.doubles_teams where id = v_c.challenged_team_id),
                (select player2_id from public.doubles_teams where id = v_c.challenged_team_id)
            ]) as x
             where x is distinct from v_me
        loop
            perform public.doubles_notify(
                v_recipient,
                'doubles_invite_rejected',
                'Desafío de dobles cancelado',
                public.doubles_display_name(v_me) || ' canceló el desafío de dobles',
                jsonb_build_object(
                    'type', 'doubles_invite_rejected',
                    'doubles_challenge_id', p_challenge,
                    'avatar_url', public.doubles_avatar(v_me)
                ),
                p_challenge
            );
        end loop;
    end if;
end $$;

create or replace function public.get_or_create_doubles_chat(p_team uuid)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
    v_me        uuid := auth.uid();
    v_team      public.doubles_teams%rowtype;
    v_chat      uuid;
    v_p1        uuid;
    v_p2        uuid;
    v_recipient uuid;
    v_new       boolean := false;
begin
    if v_me is null then
        raise exception 'Tenés que iniciar sesión';
    end if;

    select * into v_team from public.doubles_teams where id = p_team for update;
    if not found or v_team.status <> 'ready'
       or v_me not in (v_team.player1_id, v_team.player2_id) then
        raise exception 'Necesitás una dupla lista para abrir el chat';
    end if;

    v_p1 := least(v_team.player1_id, v_team.player2_id);
    v_p2 := greatest(v_team.player1_id, v_team.player2_id);

    select id into v_chat
      from public.conversations
     where kind = 'doubles'
       and doubles_team_id = p_team
     order by last_message_at desc
     limit 1;

    if v_chat is null then
        select id into v_chat
          from public.conversations
         where (participant1_id = v_p1 and participant2_id = v_p2)
            or (participant1_id = v_p2 and participant2_id = v_p1)
         order by last_message_at desc
         limit 1;

        if v_chat is not null then
            update public.conversations
               set kind = 'doubles', doubles_team_id = p_team
             where id = v_chat;
        else
            insert into public.conversations (
                participant1_id, participant2_id, kind, doubles_team_id,
                last_message, last_message_at
            ) values (
                v_p1, v_p2, 'doubles', p_team,
                'Chat de la dupla listo', now()
            )
            returning id into v_chat;
        end if;

        v_new := true;
    end if;

    if v_new then
        for v_recipient in
            select x from unnest(array[v_team.player1_id, v_team.player2_id]) as x
        loop
            perform public.doubles_notify(
                v_recipient,
                'doubles_chat_ready',
                'Chat de tu dupla',
                'Ya podés hablar con tu compañero antes del partido',
                jsonb_build_object(
                    'type', 'doubles_chat_ready',
                    'conversation_id', v_chat,
                    'doubles_team_id', p_team
                ),
                v_chat
            );
        end loop;
    end if;

    return v_chat;
end $$;

revoke all on function public.invite_to_doubles(uuid) from public;
revoke all on function public.respond_doubles_invite(uuid, boolean) from public;
revoke all on function public.keep_doubles_team(uuid) from public;
revoke all on function public.leave_doubles_team(uuid) from public;
revoke all on function public.challenge_doubles(uuid, uuid, timestamptz, text, text) from public;
revoke all on function public.accept_doubles_challenge(uuid, uuid) from public;
revoke all on function public.reject_doubles_challenge(uuid) from public;
revoke all on function public.cancel_doubles_challenge(uuid) from public;

grant execute on function public.invite_to_doubles(uuid) to authenticated;
grant execute on function public.respond_doubles_invite(uuid, boolean) to authenticated;
grant execute on function public.keep_doubles_team(uuid) to authenticated;
grant execute on function public.leave_doubles_team(uuid) to authenticated;
grant execute on function public.challenge_doubles(uuid, uuid, timestamptz, text, text) to authenticated;
grant execute on function public.accept_doubles_challenge(uuid, uuid) to authenticated;
grant execute on function public.reject_doubles_challenge(uuid) to authenticated;
grant execute on function public.cancel_doubles_challenge(uuid) to authenticated;
revoke all on function public.get_or_create_doubles_chat(uuid) from public;
grant execute on function public.get_or_create_doubles_chat(uuid) to authenticated;


-- ──────────────────────────────────────────────────────────────
-- 7) ELO de duplas: se aplica al confirmar el resultado, igual que
--    el ELO individual (motor de 2026-10-21), y es idempotente.
-- ──────────────────────────────────────────────────────────────
create or replace function public.apply_doubles_match_elo()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
    v_winner      uuid;
    v_winner_team uuid;
    v_loser_team  uuid;
    v_elo_w       integer;
    v_elo_l       integer;
    v_expected    numeric;
    v_delta       integer;
    v_new_w       integer;
    v_new_l       integer;
    v_loss        integer;
    v_gain        integer;
    v_k           integer := 32;
    v_min         integer := 1;
begin
    if new.match_format is distinct from 'doubles' then
        return new;
    end if;
    if new.status is distinct from 'completed' then
        return new;
    end if;
    if old.status = 'completed' or coalesce(new.doubles_elo_applied, false) then
        return new;
    end if;

    new.doubles_elo_applied := true;

    if new.team1_id is null or new.team2_id is null then
        return new;
    end if;

    v_winner := nullif(new.score ->> 'winner_id', '')::uuid;
    if v_winner is null then
        return new;
    end if;

    if exists (
        select 1 from public.doubles_teams
         where id = new.team1_id and v_winner in (player1_id, player2_id)
    ) then
        v_winner_team := new.team1_id;
        v_loser_team  := new.team2_id;
    elsif exists (
        select 1 from public.doubles_teams
         where id = new.team2_id and v_winner in (player1_id, player2_id)
    ) then
        v_winner_team := new.team2_id;
        v_loser_team  := new.team1_id;
    else
        return new;
    end if;

    select k_factor, min_delta into v_k, v_min
      from public.elo_engine_settings where id = true;
    v_k   := coalesce(v_k, 32);
    v_min := coalesce(v_min, 1);

    select elo into v_elo_w from public.doubles_teams where id = v_winner_team;
    select elo into v_elo_l from public.doubles_teams where id = v_loser_team;
    if v_elo_w is null or v_elo_l is null then
        return new;
    end if;

    v_expected := 1.0 / (1.0 + power(10.0, ((v_elo_l - v_elo_w)::numeric / 400.0)));
    v_delta    := round(v_k * (1.0 - v_expected))::integer;
    if v_delta < v_min then
        v_delta := v_min;
    end if;

    v_new_l := greatest(0, v_elo_l - v_delta);
    v_loss  := v_elo_l - v_new_l;
    v_new_w := v_elo_w + v_loss;
    v_gain  := v_new_w - v_elo_w;

    update public.doubles_teams
       set elo = v_new_w, wins = wins + 1
     where id = v_winner_team;
    update public.doubles_teams
       set elo = v_new_l, losses = losses + 1
     where id = v_loser_team;

    return new;
end $$;

drop trigger if exists trg_apply_doubles_match_elo on public.matches;
create trigger trg_apply_doubles_match_elo
    before update of status on public.matches
    for each row execute function public.apply_doubles_match_elo();

create or replace function public.cleanup_doubles_chat_on_match_complete()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
    v_chat uuid;
    v_user uuid;
begin
    if new.match_format is distinct from 'doubles' then
        return new;
    end if;
    if new.status is distinct from 'completed' then
        return new;
    end if;
    if old.status = 'completed' then
        return new;
    end if;

    for v_chat in
        select c.id
          from public.conversations c
         where c.kind = 'doubles'
           and c.doubles_team_id in (new.team1_id, new.team2_id)
    loop
        for v_user in
            select x
              from unnest(array[
                  (select participant1_id from public.conversations where id = v_chat),
                  (select participant2_id from public.conversations where id = v_chat)
              ]) as x
        loop
            perform public.doubles_notify(
                v_user,
                'doubles_chat_closed',
                'Chat de dupla cerrado',
                'El partido ya se jugó. El chat de la dupla se cerró.',
                jsonb_build_object(
                    'type', 'doubles_chat_closed',
                    'match_id', new.id
                ),
                new.id
            );
        end loop;

        delete from public.notifications
         where data ->> 'conversation_id' = v_chat::text;
        delete from public.conversations where id = v_chat;
    end loop;

    return new;
end $$;

drop trigger if exists trg_cleanup_doubles_chat on public.matches;
create trigger trg_cleanup_doubles_chat
    after update of status on public.matches
    for each row execute function public.cleanup_doubles_chat_on_match_complete();


-- ──────────────────────────────────────────────────────────────
-- 8) Realtime: el hook useDoubles escucha postgres_changes en estas
--    dos tablas; sin esto la UI no se actualiza sola.
-- ──────────────────────────────────────────────────────────────
do $$
declare
    t text;
begin
    if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
        raise warning 'No existe la publicación supabase_realtime: se omite el paso de Realtime';
        return;
    end if;

    if exists (select 1 from pg_publication
                where pubname = 'supabase_realtime' and puballtables) then
        raise notice 'supabase_realtime publica TODAS las tablas: no hace falta agregar nada';
        return;
    end if;

    foreach t in array array['doubles_teams', 'doubles_challenges', 'notifications'] loop
        if not exists (select 1 from pg_publication_tables
                        where pubname = 'supabase_realtime'
                          and schemaname = 'public'
                          and tablename = t) then
            execute format('alter publication supabase_realtime add table public.%I', t);
            raise notice 'supabase_realtime ahora publica %', t;
        end if;
    end loop;
end $$;


-- ──────────────────────────────────────────────────────────────
-- LISTO: las pantallas de app/doubles ya pueden cargar duplas,
-- invitaciones y desafíos, y los partidos de dobles aparecen en
-- Mis Partidos con sus dos parejas.
-- ──────────────────────────────────────────────────────────────

-- ──────────────────────────────────────────────────────────────
-- LISTO ✅
-- ──────────────────────────────────────────────────────────────