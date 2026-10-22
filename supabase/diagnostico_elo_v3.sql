-- ═══════════════════════════════════════════════════════════════════════════
-- Diagnóstico v3 · lo que falta (2 consultas, pegá los 2 resultados)
-- ═══════════════════════════════════════════════════════════════════════════

-- A) HUELLA de cada trigger + CUERPO de su función (todo junto)
select
    c.relname                          as tabla,
    t.tgname                           as trigger,
    t.tgenabled                        as habilitado,   -- O = on, D = off, A = always
    p.proname                          as funcion,
    pg_get_triggerdef(t.oid)           as se_dispara_en,
    -- huella rápida de qué hace:
    (pg_get_functiondef(p.oid) ilike '%elo_history%')          as escribe_elo_history,
    (pg_get_functiondef(p.oid) ilike '%elo_match_history%')     as escribe_elo_match_history,
    (pg_get_functiondef(p.oid) ilike '%profiles%')              as toca_profiles,
    (pg_get_functiondef(p.oid) ilike '%wins%')                  as toca_wins,
    (pg_get_functiondef(p.oid) ilike '%losses%')                as toca_losses,
    (pg_get_functiondef(p.oid) ilike '%challenges%')            as lee_challenges,
    (pg_get_functiondef(p.oid) ilike '%winner_id%')             as usa_winner_id,
    (pg_get_functiondef(p.oid) ilike '%set elo%')               as setea_elo,
    (pg_get_functiondef(p.oid) ilike '%insert into%')           as inserta,
    pg_get_functiondef(p.oid)                                  as cuerpo
from pg_trigger t
join pg_class     c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
join pg_proc      p on p.oid = t.tgfoid
where not t.tgisinternal
  and n.nspname = 'public'
  and c.relname in ('matches', 'challenges')
order by c.relname, t.tgname;


-- B) El partido del 20/10 (el que sí se completó) + los ajustes del motor
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
