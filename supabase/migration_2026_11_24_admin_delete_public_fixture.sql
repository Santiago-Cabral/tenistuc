-- =============================================================
-- 2026-11-24 — Borrado de usuarios en admin + fixture público
--              + estados del torneo visibles para inscriptos
--
-- Aplicar en Supabase → SQL Editor (o con supabase db push).
-- =============================================================

-- -------------------------------------------------------------
-- 1) Eliminar usuarios desde el panel de administración
--    La versión anterior fallaba cuando el usuario tenía datos
--    dependientes o cuando el perfil quedaba sin auth.user.
--    Limpiamos en orden y dejamos que las FKs con ON DELETE
--    CASCADE terminen el trabajo; por último se borra auth.users.
-- -------------------------------------------------------------
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

    -- Dobles (puede no estar aplicada en todas las DB)
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

-- -------------------------------------------------------------
-- 2) Fixture público: cualquier persona puede ver los partidos
--    de torneo (cuadro, fecha y cancha). Los partidos privados
--    siguen con la política "Players can view matches".
-- -------------------------------------------------------------
drop policy if exists "Public tournament fixtures are viewable" on public.matches;
create policy "Public tournament fixtures are viewable" on public.matches
    for select to anon, authenticated
    using (type = 'tournament' and tournament_id is not null);

-- -------------------------------------------------------------
-- 3) Estado inicial del torneo: próximo hasta que el organizador
--    abra la inscripción. El check ya acepta los 5 estados.
-- -------------------------------------------------------------
alter table public.tournaments drop constraint if exists tournaments_status_check;
alter table public.tournaments
    add constraint tournaments_status_check
    check (status in ('upcoming', 'open', 'closed', 'in_progress', 'completed'));
alter table public.tournaments alter column status set default 'upcoming';
