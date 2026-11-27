begin;

delete from public.notifications
 where related_id in (
    '11111111-1111-4111-8111-111111111111'::uuid,
    '44444444-4444-4444-8444-444444444444'::uuid
 );

delete from public.doubles_challenges
 where id = '44444444-4444-4444-8444-444444444444'::uuid;

delete from public.doubles_teams
 where id in (
    '11111111-1111-4111-8111-111111111111'::uuid,
    '22222222-2222-4222-8222-222222222222'::uuid,
    '33333333-3333-4333-8333-333333333333'::uuid
 );

insert into public.doubles_teams (
    id, player1_id, player2_id, created_by, status,
    is_permanent, keep_p1, keep_p2, name, elo
)
select
    '11111111-1111-4111-8111-111111111111'::uuid,
    a.id, b.id, a.id, 'invited',
    false, false, false, null,
    round((a.elo + b.elo)::numeric / 2)::integer
from public.profiles a, public.profiles b
where a.id = '7dfed317-a423-486f-9fcc-a5fda7c3b66f'::uuid
  and b.id = 'e7201414-091b-4d0c-b3ea-92e282c284d4'::uuid;

insert into public.doubles_teams (
    id, player1_id, player2_id, created_by, status,
    is_permanent, keep_p1, keep_p2, name, elo
)
select
    '22222222-2222-4222-8222-222222222222'::uuid,
    a.id, b.id, a.id, 'ready',
    true, true, true, 'Dupla Prueba A',
    round((a.elo + b.elo)::numeric / 2)::integer
from public.profiles a, public.profiles b
where a.id = '913f501e-daa9-4db7-9b9f-b3e85919a8b0'::uuid
  and b.id = '5eeb13d4-d0a6-472b-a17f-8bf561ba4adc'::uuid;

insert into public.doubles_teams (
    id, player1_id, player2_id, created_by, status,
    is_permanent, keep_p1, keep_p2, name, elo
)
select
    '33333333-3333-4333-8333-333333333333'::uuid,
    a.id, b.id, a.id, 'ready',
    true, true, true, 'Dupla Prueba B',
    round((a.elo + b.elo)::numeric / 2)::integer
from public.profiles a, public.profiles b
where a.id = '2499bd13-217b-42e0-95b1-adc202305b98'::uuid
  and b.id = 'cfb15568-073e-464b-8f9d-ad95af9bce45'::uuid;

insert into public.doubles_challenges (
    id, challenger_team_id, challenged_team_id, status,
    proposed_date, proposed_venue, message, created_by
)
values (
    '44444444-4444-4444-8444-444444444444'::uuid,
    '22222222-2222-4222-8222-222222222222'::uuid,
    '33333333-3333-4333-8333-333333333333'::uuid,
    'pending',
    now() + interval '1 day',
    'Tucumán Lawn Tennis Club',
    'Prueba: Dupla A desafía a Dupla B',
    '913f501e-daa9-4db7-9b9f-b3e85919a8b0'::uuid
);

insert into public.notifications (user_id, type, title, body, data, related_id)
values
    (
        'e7201414-091b-4d0c-b3ea-92e282c284d4'::uuid,
        'doubles_invite_received',
        'Invitación de dobles',
        'Santi Cab te invitó a formar una dupla (prueba).',
        jsonb_build_object(
            'type', 'doubles_invite_received',
            'doubles_invitation_id', '11111111-1111-4111-8111-111111111111'::uuid
        ),
        '11111111-1111-4111-8111-111111111111'::uuid
    ),
    (
        '2499bd13-217b-42e0-95b1-adc202305b98'::uuid,
        'doubles_challenge_received',
        'Desafío de dobles',
        'Dupla A desafió a Dupla B (prueba).',
        jsonb_build_object(
            'type', 'doubles_challenge_received',
            'doubles_challenge_id', '44444444-4444-4444-8444-444444444444'::uuid
        ),
        '44444444-4444-4444-8444-444444444444'::uuid
    ),
    (
        'cfb15568-073e-464b-8f9d-ad95af9bce45'::uuid,
        'doubles_challenge_received',
        'Desafío de dobles',
        'Dupla A desafió a Dupla B (prueba).',
        jsonb_build_object(
            'type', 'doubles_challenge_received',
            'doubles_challenge_id', '44444444-4444-4444-8444-444444444444'::uuid
        ),
        '44444444-4444-4444-8444-444444444444'::uuid
    );

commit;

select id, player1_id, player2_id, status, is_permanent
  from public.doubles_teams
 where id in (
    '11111111-1111-4111-8111-111111111111'::uuid,
    '22222222-2222-4222-8222-222222222222'::uuid,
    '33333333-3333-4333-8333-333333333333'::uuid
 )
 order by id;

select id, challenger_team_id, challenged_team_id, status
  from public.doubles_challenges
 where id = '44444444-4444-4444-8444-444444444444'::uuid;
