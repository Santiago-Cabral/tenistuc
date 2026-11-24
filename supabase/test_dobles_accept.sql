do $$
declare
    v_user            uuid := 'e7201414-091b-4d0c-b3ea-92e282c284d4'::uuid;
    v_pair_a          uuid := '22222222-2222-4222-8222-222222222222'::uuid;
    v_pair_a_p1       uuid := '913f501e-daa9-4db7-9b9f-b3e85919a8b0'::uuid;
    v_my_team         uuid;
    v_challenger_team uuid;
    v_acceptor        uuid;
    v_challenge       uuid;
    v_match           uuid;
    v_chat            uuid;
    v_seed_team       uuid := '11111111-1111-4111-8111-111111111111'::uuid;
begin
    perform set_config('request.jwt.claim.sub', v_user::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    perform set_config('request.jwt.claims',
        jsonb_build_object('sub', v_user::text, 'role', 'authenticated')::text, true);

    select id
      into v_my_team
      from public.doubles_teams
     where status = 'ready'
       and (player1_id = v_user or player2_id = v_user)
     order by created_at desc
     limit 1;

    if v_my_team is null and exists (
        select 1 from public.doubles_teams
         where id = v_seed_team
           and (player1_id = v_user or player2_id = v_user)
    ) then
        update public.doubles_teams
           set status = 'ready', keep_p1 = false, keep_p2 = false, is_permanent = false
         where id = v_seed_team;
        v_my_team := v_seed_team;
    end if;

    if v_my_team is null then
        raise exception 'No hay una dupla para %: corré primero supabase/test_dobles_seed.sql', v_user;
    end if;

    select public.get_or_create_doubles_chat(v_my_team) into v_chat;


    select id, challenger_team_id
      into v_challenge, v_challenger_team
      from public.doubles_challenges
     where status = 'pending'
       and (
            (challenger_team_id = v_my_team and challenged_team_id = v_pair_a)
         or (challenger_team_id = v_pair_a and challenged_team_id = v_my_team)
       )
     order by created_at desc
     limit 1;

    if v_challenge is null then
        update public.doubles_challenges
           set status = 'cancelled'
         where status = 'pending'
           and challenger_team_id = v_my_team
           and challenged_team_id is null;

        select public.challenge_doubles(
            p_team := v_my_team,
            p_target := v_pair_a,
            p_date := now() + interval '2 days',
            p_venue := 'Lawn Tenis Club',
            p_message := 'Prueba: aceptá para ver el partido'
        ) into v_challenge;

        v_challenger_team := v_my_team;
    end if;

    v_acceptor := case when v_challenger_team = v_my_team then v_pair_a_p1 else v_user end;

    perform set_config('request.jwt.claim.sub', v_acceptor::text, true);
    perform set_config('request.jwt.claim.role', 'authenticated', true);
    perform set_config('request.jwt.claims',
        jsonb_build_object('sub', v_acceptor::text, 'role', 'authenticated')::text, true);

    select public.accept_doubles_challenge(v_challenge) into v_match;

    raise notice 'dupla=% chat=% desafio=% partido=% acceptor=%', v_my_team, v_chat, v_challenge, v_match, v_acceptor;
end $$;

select m.id as match_id,
       m.match_format,
       m.status,
       m.scheduled_at,
       m.location,
       m.team1_id,
       m.team2_id
  from public.matches m
 where m.match_format = 'doubles'
   and (
        m.player1_id = 'e7201414-091b-4d0c-b3ea-92e282c284d4'::uuid
     or m.player2_id = 'e7201414-091b-4d0c-b3ea-92e282c284d4'::uuid
     or m.partner1_id = 'e7201414-091b-4d0c-b3ea-92e282c284d4'::uuid
     or m.partner2_id = 'e7201414-091b-4d0c-b3ea-92e282c284d4'::uuid
   )
 order by m.created_at desc
 limit 1;
