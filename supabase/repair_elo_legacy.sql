-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-10-21 · Reparación del ELO aplicado por el motor heredado
-- ═══════════════════════════════════════════════════════════════════════════
-- El motor heredado (hecho a mano en la BD, sin versionar en el repo) aplicaba
-- el ELO al CREAR el desafío competitivo: un reto de "5 puntos" ya descontaba
-- 16 ELO al rival aunque el partido nunca se jugara ni se confirmara.
-- En la tabla legacy `elo_history` se ve el rastro: 1016 / 984 para el mismo
-- partido, más un 1800 viejo.
--
-- Este script RECONSTRUYE el ELO de todos los jugadores a partir de la única
-- fuente de verdad: los partidos con status = 'completed' y type competitive /
-- tournament, usando la misma fórmula que el motor nuevo (K=32).
--
-- IMPORTANTE:
--   · Ejecutar UNA vez, DESPUÉS de `migration_2026_10_21_elo_engine.sql`.
--   · Sólo recalcula el ELO. Los wins/losses NO se tocan (si el motor viejo
--     los infló al crear los retos, hay que corregirlos a mano: ver la
--     consulta de previsualización del punto 1).
--   · La tabla legacy `elo_history` no se modifica.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1) PREVISUALIZACIÓN (sólo lectura) — corrélo primero y mirá el resultado
-- ───────────────────────────────────────────────────────────────────────────
select
    p.id,
    p.username,
    p.elo                                        as elo_actual,
    p.wins                                       as wins_actuales,
    p.losses                                     as losses_actuales,
    (select count(*) from public.matches m
      where m.status = 'completed'
        and m.type in ('competitive','tournament')
        and (m.player1_id = p.id or m.player2_id = p.id)
    )                                            as partidos_completados,
    (select count(*) from public.challenges c
      where c.match_type = 'competitive'
        and (c.challenger_id = p.id or c.challenged_id = p.id)
    )                                            as retos_competitivos
from public.profiles p
order by p.elo desc, p.username;


-- ───────────────────────────────────────────────────────────────────────────
-- 2) RECONSTRUCCIÓN DEL ELO
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.recompute_all_elo()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    rec        record;
    v_winner   uuid;
    v_loser    uuid;
    v_elo_w    integer;
    v_elo_l    integer;
    v_k        integer;
    v_min      integer;
    v_expected numeric;
    v_delta    integer;
    v_new_l    integer;
    v_loss     integer;
begin
    select k_factor, min_delta
      into v_k, v_min
      from public.elo_engine_settings
     where id = true;

    v_k   := coalesce(v_k, 32);
    v_min := coalesce(v_min, 1);

    -- La reconstrucción deja obsoleta la bitácora anterior.
    delete from public.elo_match_history;

    -- Base 1000 para todos (los que nunca compitieron quedan en 1000).
    update public.profiles set elo = 1000;

    for rec in
        select
            m.id,
            m.player1_id,
            m.player2_id,
            m.score,
            case
                when m.type in ('competitive', 'tournament') then true
                when exists (
                    select 1 from public.challenges c
                     where c.match_id = m.id
                       and c.match_type in ('competitive', 'tournament')
                ) then true
                else false
            end as affects_elo
        from public.matches m
        where m.status = 'completed'
          and m.score is not null
          and nullif(m.score ->> 'winner_id', '') is not null
        order by coalesce(m.confirmed_at, m.played_at, m.created_at) asc
    loop
        if not rec.affects_elo then
            continue;
        end if;

        v_winner := nullif(rec.score ->> 'winner_id', '')::uuid;

        if v_winner = rec.player1_id then
            v_loser := rec.player2_id;
        elsif v_winner = rec.player2_id then
            v_loser := rec.player1_id;
        else
            continue;
        end if;

        if v_loser is null then
            continue;
        end if;

        select elo into v_elo_w from public.profiles where id = v_winner;
        select elo into v_elo_l from public.profiles where id = v_loser;

        if v_elo_w is null or v_elo_l is null then
            continue;
        end if;

        v_expected := 1.0 / (1.0 + power(10.0, ((v_elo_l - v_elo_w)::numeric / 400.0)));
        v_delta    := round(v_k * (1.0 - v_expected))::integer;
        if v_delta < v_min then
            v_delta := v_min;
        end if;

        v_new_l := greatest(0, v_elo_l - v_delta);
        v_loss  := v_elo_l - v_new_l;

        update public.profiles set elo = v_elo_w + v_loss where id = v_winner;
        update public.profiles set elo = v_new_l      where id = v_loser;

        insert into public.elo_match_history (match_id, player_id, elo_before, elo_after, delta)
        values
            (rec.id, v_winner, v_elo_w, v_elo_w + v_loss, v_loss),
            (rec.id, v_loser,  v_elo_l, v_new_l, -v_loss);
    end loop;
end $$;

-- Ejecutar la reconstrucción:
select public.recompute_all_elo();

-- Verificar:
select id, username, elo, wins, losses from public.profiles order by elo desc, username;

-- Bitácora del motor nuevo:
select h.match_id, h.player_id, p.username, h.elo_before, h.elo_after, h.delta, h.created_at
from public.elo_match_history h
join public.profiles p on p.id = h.player_id
order by h.created_at desc;


-- ───────────────────────────────────────────────────────────────────────────
-- 3) OPCIONAL · Recalcular wins/losses
--
--    Si en la previsualización del punto 1 viste que wins/losses están
--    inflados (más victorias que partidos completados), es porque el motor
--    viejo los contaba al CREAR el reto. Descomentá el bloque de abajo para
--    dejarlos alineados con los partidos realmente completados.
--
--    OJO: esto pisa los contadores de todos los jugadores.
--
--    A diferencia del ELO, los wins/losses cuentan TODO partido completado
--    (incluidos amistosos), porque en la app son los "puntos" del panel.
-- ───────────────────────────────────────────────────────────────────────────
/*
create or replace function public.recompute_all_wins_losses()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    m        record;
    v_winner uuid;
begin
    update public.profiles set wins = 0, losses = 0;

    for m in
        select player1_id, player2_id, score
        from public.matches
        where status = 'completed'
          and score is not null
          and nullif(score ->> 'winner_id', '') is not null
    loop
        v_winner := nullif(m.score ->> 'winner_id', '')::uuid;

        if v_winner = m.player1_id then
            update public.profiles set wins = wins + 1 where id = m.player1_id;
            update public.profiles set losses = losses + 1 where id = m.player2_id;
        elsif v_winner = m.player2_id then
            update public.profiles set wins = wins + 1 where id = m.player2_id;
            update public.profiles set losses = losses + 1 where id = m.player1_id;
        end if;
    end loop;
end $$;

select public.recompute_all_wins_losses();
select username, elo, wins, losses from public.profiles order by elo desc;
*/
