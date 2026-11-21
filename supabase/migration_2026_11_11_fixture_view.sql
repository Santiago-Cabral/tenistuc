-- =============================================================
-- 2026-11-11 — Fixture visible para jugadores inscriptos
--
-- Antes: un jugador solo podía ver los partidos donde era
-- player1/player2 o el creador (el organizador). Con esto el
-- inscripto a un torneo ve el cuadro COMPLETO con fechas y canchas.
--
-- Lo necesita la sección "Fixture y fechas" del detalle de torneo
-- (src/components/tournament/AthleteFixtureSection.tsx).
-- =============================================================

-- 1) RLS: partidos del torneo visibles para sus inscriptos
drop policy if exists "Players can view matches" on public.matches;

create policy "Players can view matches" on public.matches
    for select using (
        player1_id = auth.uid()
        or player2_id = auth.uid()
        or created_by = auth.uid()
        -- jugadores inscriptos al torneo: ven el fixture completo
        or exists (
            select 1
            from public.tournament_registrations tr
            where tr.tournament_id = matches.tournament_id
              and tr.player_id = auth.uid()
        )
    );

-- 2) Realtime en matches: el fixture del jugador se actualiza solo
--    cuando el organizador programa fechas o carga resultados
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'matches'
  ) then
    execute 'alter publication supabase_realtime add table public.matches';
  end if;
end $$;
