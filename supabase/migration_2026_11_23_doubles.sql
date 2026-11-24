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
