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
--    (el registro manda username, full_name, role y level en user_metadata)
-- ──────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.profiles (id, username, full_name, role, level)
    values (
        new.id,
        coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)),
        coalesce(new.raw_user_meta_data ->> 'full_name', ''),
        coalesce(new.raw_user_meta_data ->> 'role', 'athlete'),
        coalesce(new.raw_user_meta_data ->> 'level', 'Amateur I')
    )
    on conflict (id) do nothing;
    return new;
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
    level             text not null default 'Amateur I'
                      check (level in (
                          'Amateur I', 'Amateur II', 'Intermedio', 'Avanzado',
                          'Competitivo', 'Semi-Pro I', 'Semi-Pro II',
                          'Pro I', 'Pro II', 'Elite', 'Legendary'
                      )),
    wins              integer not null default 0,
    losses            integer not null default 0,
    play_style        text[] not null default '{}',
    bio               text,
    is_online         boolean not null default false,
    last_seen         timestamptz,
    expo_push_token   text,
    created_at        timestamptz not null default now()
);

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
                    check (status in ('upcoming', 'open', 'in_progress', 'completed')),
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
    organizer_id    uuid not null references public.profiles (id) on delete cascade,
    created_at      timestamptz not null default now()
);

create index if not exists idx_tournaments_organizer on public.tournaments (organizer_id);
create index if not exists idx_tournaments_status on public.tournaments (status);

-- --- 8b) FK de matches → tournaments (se define después por orden de creación)
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
    for insert to authenticated with check (bucket_id = 'avatars');

drop policy if exists "Users can update their avatars" on storage.objects;
create policy "Users can update their avatars" on storage.objects
    for update to authenticated using (bucket_id = 'avatars');

drop policy if exists "Users can delete their avatars" on storage.objects;
create policy "Users can delete their avatars" on storage.objects
    for delete to authenticated using (bucket_id = 'avatars');

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

-- PROFILES
drop policy if exists "Profiles are publicly viewable" on public.profiles;
create policy "Profiles are publicly viewable" on public.profiles
    for select using (true);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles
    for update using (auth.uid() = id);

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

-- ──────────────────────────────────────────────────────────────
-- 15) REALTIME: habilitar broadcast en tablas que la app escucha
--     (se puede verificar/marcar también en Dashboard → Database → Replication)
-- ──────────────────────────────────────────────────────────────
-- Realtime para los canales que usa supabase-js (postgres_changes):
--   messages, conversations, notifications
-- Si usás el portal de Supabase, activá esas tablas en:
--   Database → Replication → supabase_realtime → tabla toggle

-- ──────────────────────────────────────────────────────────────
-- LISTO ✅
-- ──────────────────────────────────────────────────────────────