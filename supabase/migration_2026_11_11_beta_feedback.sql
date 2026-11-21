-- =============================================================
-- 2026-11-11 — Feedback de la beta: comentarios + votos estilo
-- Product Hunt (el más votado arriba) + reportes de comentarios.
-- Ejecutar en: Supabase → SQL Editor → New query
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- 1) TABLAS
-- ──────────────────────────────────────────────────────────────
create table if not exists public.beta_feedback (
    id          uuid primary key default gen_random_uuid(),
    user_id     uuid not null references public.profiles (id) on delete cascade,
    content     text not null check (char_length(content) between 1 and 500),
    votes_count integer not null default 0,
    created_at  timestamptz not null default now()
);

-- Un voto por usuario y comentario (PK compuesta)
create table if not exists public.beta_feedback_votes (
    feedback_id uuid not null references public.beta_feedback (id) on delete cascade,
    user_id     uuid not null references public.profiles (id) on delete cascade,
    created_at  timestamptz not null default now(),
    primary key (feedback_id, user_id)
);

-- Un reporte por usuario y comentario (PK compuesta)
create table if not exists public.beta_feedback_reports (
    feedback_id uuid not null references public.beta_feedback (id) on delete cascade,
    reporter_id uuid not null references public.profiles (id) on delete cascade,
    reason      text not null check (reason in ('spam', 'ofensivo', 'acoso', 'otro')),
    created_at  timestamptz not null default now(),
    primary key (feedback_id, reporter_id)
);

create index if not exists idx_beta_feedback_rank
    on public.beta_feedback (votes_count desc, created_at desc);
create index if not exists idx_beta_feedback_votes_user
    on public.beta_feedback_votes (user_id);
create index if not exists idx_beta_feedback_reports_reporter
    on public.beta_feedback_reports (reporter_id);

-- ──────────────────────────────────────────────────────────────
-- 2) CONTADOR DE VOTOS mantenido por trigger
--    (security definer: actualiza beta_feedback sin depender de
--     la RLS de quien vota)
-- ──────────────────────────────────────────────────────────────
create or replace function public.sync_beta_feedback_votes_count()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    if (tg_op = 'INSERT') then
        update public.beta_feedback
        set votes_count = votes_count + 1
        where id = new.feedback_id;
    elsif (tg_op = 'DELETE') then
        update public.beta_feedback
        set votes_count = votes_count - 1
        where id = old.feedback_id;
    end if;
    return null;
end;
$$;

drop trigger if exists on_beta_feedback_votes_changed on public.beta_feedback_votes;
create trigger on_beta_feedback_votes_changed
    after insert or delete on public.beta_feedback_votes
    for each row execute function public.sync_beta_feedback_votes_count();

-- ──────────────────────────────────────────────────────────────
-- 3) ROW LEVEL SECURITY
-- ──────────────────────────────────────────────────────────────
alter table public.beta_feedback enable row level security;
alter table public.beta_feedback_votes enable row level security;
alter table public.beta_feedback_reports enable row level security;

-- BETA FEEDBACK
drop policy if exists "Beta feedback is viewable" on public.beta_feedback;
create policy "Beta feedback is viewable" on public.beta_feedback
    for select using (true);

drop policy if exists "Users can create their own beta feedback" on public.beta_feedback;
create policy "Users can create their own beta feedback" on public.beta_feedback
    for insert with check (user_id = auth.uid());

drop policy if exists "Users can delete their own beta feedback" on public.beta_feedback;
create policy "Users can delete their own beta feedback" on public.beta_feedback
    for delete using (user_id = auth.uid());

-- VOTES
drop policy if exists "Beta feedback votes are viewable" on public.beta_feedback_votes;
create policy "Beta feedback votes are viewable" on public.beta_feedback_votes
    for select using (true);

drop policy if exists "Users can vote as themselves" on public.beta_feedback_votes;
create policy "Users can vote as themselves" on public.beta_feedback_votes
    for insert with check (user_id = auth.uid());

drop policy if exists "Users can remove their own vote" on public.beta_feedback_votes;
create policy "Users can remove their own vote" on public.beta_feedback_votes
    for delete using (user_id = auth.uid());

-- REPORTS (solo el reportante ve sus propios reportes)
drop policy if exists "Users can view their own reports" on public.beta_feedback_reports;
create policy "Users can view their own reports" on public.beta_feedback_reports
    for select using (reporter_id = auth.uid());

drop policy if exists "Users can report as themselves" on public.beta_feedback_reports;
create policy "Users can report as themselves" on public.beta_feedback_reports
    for insert with check (reporter_id = auth.uid());

-- ──────────────────────────────────────────────────────────────
-- 4) REALTIME: para que los votos y comentarios nuevos lleguen en vivo
-- ──────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'beta_feedback'
  ) then
    execute 'alter publication supabase_realtime add table public.beta_feedback';
  end if;
end $$;
