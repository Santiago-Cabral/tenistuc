-- ──────────────────────────────────────────────────────────────
-- Horarios y canchas para los partidos del fixture
--   El organizador asigna fecha/hora (matches.scheduled_at) y la
--   cancha (matches.court_id) donde se juega cada partido. Sirve
--   para repartir en varias canchas y horarios y no citar a todos
--   los participantes al mismo tiempo.
--   Idempotente: se puede correr más de una vez.
-- ──────────────────────────────────────────────────────────────

alter table public.matches
    add column if not exists court_id uuid references public.courts (id) on delete set null;

create index if not exists idx_matches_court on public.matches (court_id);
