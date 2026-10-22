-- ═══════════════════════════════════════════════════════════════════════════
-- Diagnóstico (SÓLO LECTURA) · triggers de ELO en matches/challenges
-- Corrélo ANTES de la migración y pegá el resultado.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) Todos los triggers de matches / challenges + su función
select
    c.relname                                  as tabla,
    t.tgname                                   as trigger,
    p.proname                                  as funcion,
    pg_get_triggerdef(t.oid)                   as definicion_trigger,
    t.tgenabled                                as habilitado,
    pg_get_functiondef(p.oid)                 as cuerpo_funcion
from pg_trigger t
join pg_class     c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc      p on p.oid = t.tgfoid
where not t.tgisinternal
  and n.nspname = 'public'
  and c.relname in ('matches', 'challenges')
order by c.relname, t.tgname;


-- 2) Estado actual de los perfiles
select id, username, elo, wins, losses, level, created_at
from public.profiles
order by elo desc, username;


-- 3) Bitácora del motor heredado
select h.id, h.player_id, p.username, h.elo, h.match_id, h.recorded_at
from public.elo_history h
left join public.profiles p on p.id = h.player_id
order by h.recorded_at desc, p.username;


-- 4) Qué publica realtime
select pubname, schemaname, tablename
from pg_publication_tables
order by pubname, tablename;


-- 5) Partidos completados (fuente de verdad del ELO)
select
    m.id,
    m.type,
    m.status,
    m.score,
    m.created_at,
    m.played_at,
    m.confirmed_at,
    m.elo_delta_p1,
    m.elo_delta_p2,
    p1.username as player1,
    p2.username as player2
from public.matches m
left join public.profiles p1 on p1.id = m.player1_id
left join public.profiles p2 on p2.id = m.player2_id
where m.status = 'completed'
   or m.type = 'competitive'
order by coalesce(m.confirmed_at, m.played_at, m.created_at) desc;


-- 6) Retos competitivos
select
    c.id,
    c.status,
    c.match_type,
    c.created_at,
    c.match_id,
    p1.username as challenger,
    p2.username as challenged,
    m.status as match_status
from public.challenges c
left join public.profiles p1 on p1.id = c.challenger_id
left join public.profiles p2 on p2.id = c.challenged_id
left join public.matches   m  on m.id = c.match_id
where c.match_type = 'competitive'
order by c.created_at desc;
