-- ═══════════════════════════════════════════════════════════════════════════
-- Diagnóstico v2 (SÓLO LECTURA) · lo que falta del motor de ELO
-- Corrélo y pegá los 5 resultados.
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) AJUSTES DEL MOTOR (manage_wins_losses + K factor)
select * from public.elo_engine_settings;


-- 2) TODOS los triggers de matches/challenges + su función completa
--    (acá está la verdad: qué se dispara y cuándo)
select
    c.relname        as tabla,
    t.tgname         as trigger,
    t.tgenabled      as habilitado,   -- O = habilitado, D = deshabilitado, A = always
    p.proname        as funcion,
    pg_get_functiondef(p.oid) as cuerpo
from pg_trigger t
join pg_class     c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc      p on p.oid = t.tgfoid
where not t.tgisinternal
  and n.nspname = 'public'
  and c.relname in ('matches', 'challenges')
order by c.relname, t.tgname;


-- 3) ¿Hay rastros del motor viejo para retos que NUNCA se jugaron?
--    (match_id null = se aplicó el ELO sin partido)
select h.id, h.player_id, p.username, h.elo, h.match_id, h.recorded_at
from public.elo_history h
left join public.profiles p on p.id = h.player_id
order by h.recorded_at desc;


-- 4) El partido que SÍ se completó (el 20/10) + el del 24/04
select
    m.id,
    m.type,
    m.status,
    m.score,
    m.elo_delta_p1,
    m.elo_delta_p2,
    m.created_at,
    m.played_at,
    m.confirmed_at,
    p1.username as player1,
    p2.username as player2
from public.matches m
left join public.profiles p1 on p1.id = m.player1_id
left join public.profiles p2 on p2.id = m.player2_id
where m.id in ('71d343e4-f5a6-411b-8099-b416b57875ee', '6e44d3ef-0fa2-41c7-bf08-80c6b41cfade');


-- 5) Map id → username (para leer la bitácora) + estado final
select id, username, elo, wins, losses
from public.profiles
order by elo desc, username;


-- 6) Verificar que el Realtime quedó bien
select pubname, schemaname, tablename
from pg_publication_tables
order by pubname, tablename;
