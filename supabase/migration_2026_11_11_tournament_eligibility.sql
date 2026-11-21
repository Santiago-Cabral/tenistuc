-- ──────────────────────────────────────────────────────────────
-- Migration 2026-11-11: Torneos con restricciones de inscripción
-- · profiles.gender: género del jugador (para torneos exclusivos)
-- · tournaments.allowed_gender / allowed_level: para quién es el torneo
-- · enforce_registration_open: exige elegibilidad al inscribirse
-- · RLS: el organizador puede quitar participantes de sus torneos
-- · Storage: bucket público "tournament-images" (foto de portada)
-- Idempotente: se puede correr más de una vez.
-- ──────────────────────────────────────────────────────────────

-- 1) PROFILES: género del jugador
alter table public.profiles
    add column if not exists gender text
    check (gender in ('femenino', 'masculino', 'otro'));

-- 2) TOURNAMENTS: para quién está diseñado el torneo
alter table public.tournaments
    add column if not exists allowed_gender text not null default 'todos'
    check (allowed_gender in ('todos', 'femenino', 'masculino'));

alter table public.tournaments
    add column if not exists allowed_level text not null default 'todas'
    check (allowed_level in ('todas', '1era', '2da', '3era', '4era', '5ta', '6ta'));

-- 3) TRIGGER: extiende la validación de inscripción
--    (lista abierta + cupo + género + categoría del torneo)
create or replace function public.enforce_registration_open()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
    t public.tournaments%rowtype;
    v_count integer;
    v_gender text;
    v_level text;
begin
    select * into t from public.tournaments where id = new.tournament_id;

    if t.status <> 'open' then
        raise exception 'La inscripción para este torneo está cerrada';
    end if;

    if t.max_players is not null and t.max_players > 0 then
        select count(*) into v_count
        from public.tournament_registrations
        where tournament_id = new.tournament_id;
        if v_count >= t.max_players then
            raise exception 'El torneo alcanzó su cupo máximo';
        end if;
    end if;

    -- Torneos exclusivos por género (ej: solo mujeres)
    if t.allowed_gender is not null and t.allowed_gender <> 'todos' then
        select p.gender into v_gender
        from public.profiles p
        where p.id = new.player_id;
        if v_gender is null or v_gender <> t.allowed_gender then
            raise exception 'Este torneo es solo para %',
                case t.allowed_gender
                    when 'femenino' then 'mujeres'
                    when 'masculino' then 'hombres'
                    else t.allowed_gender
                end;
        end if;
    end if;

    -- Torneos exclusivos por categoría (ej: solo 6ta)
    if t.allowed_level is not null and t.allowed_level <> 'todas' then
        select p.level into v_level
        from public.profiles p
        where p.id = new.player_id;
        if v_level is null or v_level <> t.allowed_level then
            raise exception 'Este torneo es solo para la categoría %', t.allowed_level;
        end if;
    end if;

    return new;
end;
$$;

-- 4) RLS: el organizador puede quitar participantes de sus torneos
drop policy if exists "Organizers can remove participants"
    on public.tournament_registrations;
create policy "Organizers can remove participants"
    on public.tournament_registrations
    for delete using (
        exists (
            select 1 from public.tournaments t
            where t.id = tournament_id
              and t.organizer_id = auth.uid()
        )
    );

-- 5) STORAGE: bucket público para las fotos de portada de los torneos
insert into storage.buckets (id, name, public)
values ('tournament-images', 'tournament-images', true)
on conflict (id) do nothing;

drop policy if exists "Public tournament images read" on storage.objects;
create policy "Public tournament images read" on storage.objects
    for select using (bucket_id = 'tournament-images');

drop policy if exists "Users can upload tournament images" on storage.objects;
create policy "Users can upload tournament images" on storage.objects
    for insert to authenticated with check (
        bucket_id = 'tournament-images'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "Users can update their tournament images" on storage.objects;
create policy "Users can update their tournament images" on storage.objects
    for update to authenticated using (
        bucket_id = 'tournament-images'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "Users can delete their tournament images" on storage.objects;
create policy "Users can delete their tournament images" on storage.objects
    for delete to authenticated using (
        bucket_id = 'tournament-images'
        and (storage.foldername(name))[1] = auth.uid()::text
    );
