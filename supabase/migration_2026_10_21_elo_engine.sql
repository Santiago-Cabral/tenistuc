-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-10-21 · Motor de ELO versionado + Realtime de matches/challenges
-- ═══════════════════════════════════════════════════════════════════════════
-- Problema que resuelve:
--   1) El ELO se aplicaba al CREAR el desafío (trigger heredado, hecho a mano en
--      la BD y sin versionar en el repo): un reto de "5 puntos" ya descontaba
--      16 ELO al rival aunque el partido nunca se jugara ni se confirmara, y el
--      ranking / panel de puntos no se actualizaba.
--   2) `matches` y `challenges` no estaban en la publicación
--      `supabase_realtime`, por eso el cliente no recibía los cambios en vivo.
--
-- Comportamiento nuevo:
--   · El ELO se aplica SOLO cuando el partido pasa a `status = 'completed'`
--     (al confirmar el resultado).
--   · Idempotente: guarda el delta en matches.elo_delta_p1/p2, así que
--     confirmar dos veces no descuenta dos veces.
--   · Suma cero: el ganador gana exactamente lo que pierde el perdedor.
--   · Los deltas que el motor heredado aplicaba de más se revierten con el
--     script opcional `repair_elo_legacy.sql`.
--
-- Ejecutar en: Supabase → SQL Editor → Run. Es idempotente.
-- OJO: si un paso falla, la transacción entera se revierte. Corrélo de a una.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1) Ajustes del motor (K factor, delta mínimo, quién gestiona wins/losses)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.elo_engine_settings (
    id                 boolean primary key default true,
    k_factor           integer not null default 32,
    min_delta          integer not null default 1,
    manage_wins_losses boolean not null default false
);

insert into public.elo_engine_settings (id, k_factor, min_delta, manage_wins_losses)
values (true, 32, 1, false)
on conflict (id) do update
    set k_factor  = excluded.k_factor,
        min_delta = excluded.min_delta;

-- La tabla de ajustes es sólo del servidor (SQL Editor / service_role).
alter table public.elo_engine_settings enable row level security;


-- ───────────────────────────────────────────────────────────────────────────
-- 2) Auditar y desactivar el motor heredado
--
--    La BD ya tiene una tabla `elo_history` (id, player_id, elo, match_id,
--    recorded_at) que es la bitácora del motor viejo. NO se toca: el motor
--    nuevo usa su propia tabla `elo_match_history`.
--
--    Se recorren TODOS los triggers de matches/challenges y se clasifican:
--      · is_elo        → el trigger mueve el ELO  → se desactiva
--      · manages_wl    → el trigger mueve wins/losses
--    Si ningún trigger vigente mueve wins/losses, el motor nuevo pasa a
--    encargarse deellos (si no, nadie los movería nunca más).
--
--    Se usa DISABLE en vez de DROP: es reversible con
--    `alter table public.<tabla> enable trigger <trigger>;`
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare
    r               record;
    v_body          text;
    v_is_elo        boolean;
    v_manages_wl    boolean;
    v_elo_wl        boolean := false;
    v_otras_wl      boolean := false;
    v_manage_wl     boolean;
begin
    for r in
        select c.relname  as tabla,
               t.tgname   as trig,
               p.proname  as func,
               pg_get_functiondef(p.oid) as body
        from pg_trigger t
        join pg_class     c on c.oid = t.tgrelid
        join pg_namespace n on n.oid = c.relnamespace
        join pg_proc      p on p.oid = t.tgfoid
        where not t.tgisinternal
          and n.nspname = 'public'
          and c.relname in ('matches', 'challenges')
        -- Nunca tocar el motor nuevo ni los triggers de notificación
        and t.tgname <> 'trg_apply_match_elo'
        and p.proname <> 'apply_match_elo'
        and p.proname <> 'http_request'
    loop
        v_body := r.body;

        v_is_elo := (r.trig ilike '%elo%')
                 or (r.func ilike '%elo%')
                 or (v_body ilike '%elo_delta%')
                 or (v_body ilike '%set elo%')
                 or (v_body ilike '%elo =%')
                 or (v_body ilike '%elo+%')
                 or (v_body ilike '%+ elo%');

        v_manages_wl := (v_body ilike '%wins%') or (v_body ilike '%losses%');

        if v_manages_wl then
            if v_is_elo then
                v_elo_wl := true;
            else
                v_otras_wl := true;
            end if;
        end if;

        raise notice 'trigger %.% (fn %) · elo=% · wins/losses=%',
            r.tabla, r.trig, r.func, v_is_elo, v_manages_wl;

        if v_is_elo then
            raise notice '→ DESACTIVANDO trigger ELO heredado: %.%', r.tabla, r.trig;
            execute format('alter table public.%I disable trigger %I', r.tabla, r.trig);
        end if;
    end loop;

    -- Si el trigger heredado de ELO era el que movía wins/losses, al
    -- desactivarlo quedamos sin nadie a cargo → el motor nuevo los toma.
    -- Si hay otro trigger (no-ELO) que los mueve, ese sigue a cargo y
    -- nosotros no los tocamos (para no contarlos dos veces).
    v_manage_wl := not v_otras_wl;

    update public.elo_engine_settings
       set manage_wins_losses = v_manage_wl
     where id = true;

    raise notice 'trigger ELO que movía wins/losses = % · otro trigger que los mueve = % · manage_wins_losses = %',
        v_elo_wl, v_otras_wl, v_manage_wl;
end $$;


-- ───────────────────────────────────────────────────────────────────────────
-- 3) Bitácora del motor nuevo
--    (tabla nueva: la legacy `elo_history` queda intacta)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists public.elo_match_history (
    id          uuid primary key default gen_random_uuid(),
    match_id    uuid references public.matches (id) on delete cascade,
    player_id   uuid not null references public.profiles (id) on delete cascade,
    elo_before  integer not null,
    elo_after   integer not null,
    delta       integer not null,
    created_at  timestamptz not null default now()
);

create index if not exists idx_elo_match_history_player on public.elo_match_history (player_id, created_at desc);
create index if not exists idx_elo_match_history_match  on public.elo_match_history (match_id);

alter table public.elo_match_history enable row level security;

drop policy if exists "Players can view their own elo history" on public.elo_match_history;
create policy "Players can view their own elo history" on public.elo_match_history
    for select using (auth.uid() = player_id);


-- ───────────────────────────────────────────────────────────────────────────
-- 4) Motor de ELO
--    BEFORE UPDATE OF status ON public.matches
--    · Se dispara al pasar a 'completed' (confirmar resultado).
--    · Es idempotente: si los deltas ya estaban guardados, no recalcula.
--    · security definer porque actualiza el perfil del rival (el RLS sólo
--      permite editar el propio perfil).
-- ───────────────────────────────────────────────────────────────────────────
create or replace function public.apply_match_elo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
    v_winner   uuid;
    v_loser    uuid;
    v_type     text;
    v_elo_w    integer;
    v_elo_l    integer;
    v_k        integer;
    v_min      integer;
    v_manage   boolean;
    v_expected numeric;
    v_delta    integer;
    v_new_w    integer;
    v_new_l    integer;
    v_gain     integer;
    v_loss     integer;
    v_d1       integer;
    v_d2       integer;
begin
    -- Sólo en la transición a 'completed'.
    if new.status is distinct from 'completed' then
        return new;
    end if;

    -- Ya estaba completado: no se vuelve a aplicar.
    if old.status = 'completed' then
        return new;
    end if;

    -- Idempotencia: los deltas ya estaban calculados.
    if new.elo_delta_p1 is not null or new.elo_delta_p2 is not null then
        return new;
    end if;

    -- Sólo los partidos que afectan al ELO.
    v_type := coalesce(new.type, 'friendly');
    if v_type not in ('competitive', 'tournament') then
        -- Un match creado desde un reto competitivo también afecta el ELO,
        -- aunque el type del match haya quedado como 'challenge'.
        if not exists (
            select 1
              from public.challenges c
             where c.match_id = new.id
               and c.match_type in ('competitive', 'tournament')
        ) then
            return new;
        end if;
    end if;

    -- Ganador (lo guarda submitResult en score.winner_id).
    v_winner := nullif(new.score ->> 'winner_id', '')::uuid;
    if v_winner is null then
        return new;
    end if;
    if v_winner = new.player1_id then
        v_loser := new.player2_id;
    elsif v_winner = new.player2_id then
        v_loser := new.player1_id;
    else
        return new;
    end if;
    if v_loser is null then
        return new;
    end if;

    select k_factor, min_delta, manage_wins_losses
      into v_k, v_min, v_manage
      from public.elo_engine_settings
     where id = true;

    v_k      := coalesce(v_k, 32);
    v_min    := coalesce(v_min, 1);
    v_manage := coalesce(v_manage, false);

    select elo into v_elo_w from public.profiles where id = v_winner;
    select elo into v_elo_l from public.profiles where id = v_loser;
    if v_elo_w is null or v_elo_l is null then
        return new;
    end if;

    -- Fórmula ELO clásica: E = 1 / (1 + 10^((R_op - R_jug)/400))
    v_expected := 1.0 / (1.0 + power(10.0, ((v_elo_l - v_elo_w)::numeric / 400.0)));
    v_delta    := round(v_k * (1.0 - v_expected))::integer;
    if v_delta < v_min then
        v_delta := v_min;
    end if;

    -- Suma cero (con suelo en 0 para que el ELO nunca sea negativo).
    v_new_l := greatest(0, v_elo_l - v_delta);
    v_loss  := v_elo_l - v_new_l;
    v_new_w := v_elo_w + v_loss;
    v_gain  := v_new_w - v_elo_w;

    update public.profiles set elo = v_new_w where id = v_winner;
    update public.profiles set elo = v_new_l where id = v_loser;

    if v_manage then
        update public.profiles set wins   = wins + 1 where id = v_winner;
        update public.profiles set losses = losses + 1 where id = v_loser;
    end if;

    if new.player1_id = v_winner then
        v_d1 :=  v_gain;
        v_d2 := -v_loss;
    else
        v_d1 := -v_loss;
        v_d2 :=  v_gain;
    end if;

    new.elo_delta_p1 := v_d1;
    new.elo_delta_p2 := v_d2;

    insert into public.elo_match_history (match_id, player_id, elo_before, elo_after, delta)
    values
        (new.id, v_winner, v_elo_w, v_new_w, v_gain),
        (new.id, v_loser,  v_elo_l, v_new_l, -v_loss);

    return new;
end $$;

drop trigger if exists trg_apply_match_elo on public.matches;
create trigger trg_apply_match_elo
    before update of status on public.matches
    for each row execute function public.apply_match_elo();


-- ───────────────────────────────────────────────────────────────────────────
-- 5) Realtime: matches y challenges en la publicación
--    (para que el ranking / panel de puntos se actualicen al instante)
-- ───────────────────────────────────────────────────────────────────────────
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

    foreach t in array array['profiles', 'matches', 'challenges', 'tournaments'] loop
        if exists (select 1 from pg_publication_tables
                    where pubname = 'supabase_realtime'
                      and schemaname = 'public'
                      and tablename = t) then
            raise notice 'supabase_realtime ya publica %', t;
        else
            execute format('alter publication supabase_realtime add table public.%I', t);
            raise notice 'supabase_realtime ahora publica %', t;
        end if;
    end loop;
end $$;
