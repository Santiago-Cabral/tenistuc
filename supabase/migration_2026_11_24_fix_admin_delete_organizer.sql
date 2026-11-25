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
