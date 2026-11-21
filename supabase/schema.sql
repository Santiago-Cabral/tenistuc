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
                coalesce(new.raw_user_meta_data ->> 'role', 'athlete'),
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
    role              text not null default 'athlete' check (role in ('athlete', 'organizer')),
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
    status          text not null default 'open'
                    check (status in ('upcoming', 'open', 'closed', 'in_progress', 'completed')),
    category        text,
    format          text check (format in ('elimination', 'round_robin', 'swiss')),
    image_url       text,
    prize_money     integer not null default 0,
    elo_points      integer not null default 0,
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

alter table public.notifications add constraint notifications_type_check
check (type in (
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
    'test'
));

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
        -- jugadores inscriptos al torneo: ven el fixture completo
        -- (cuadro, fechas y canchas asignadas) en la app
        or exists (
            select 1 from public.tournament_registrations tr
            where tr.tournament_id = matches.tournament_id
              and tr.player_id = auth.uid()
        )
    );

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

-- ──────────────────────────────────────────────────────────────
-- LISTO ✅
-- ──────────────────────────────────────────────────────────────