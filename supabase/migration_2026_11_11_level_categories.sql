-- =============================================================
-- 2026-11-11 — Categorías: de 11 niveles nominados a 6 categorías (1era..6ta)
-- Ejecutar en: Supabase → SQL Editor → New query
-- =============================================================

-- 1) Quitar el constraint viejo para poder migrar los datos
alter table public.profiles drop constraint if exists profiles_level_check;

-- 2) Mapear niveles existentes a las nuevas categorías
update public.profiles
set level = case level
    when 'Amateur I'    then '6ta'
    when 'Amateur II'   then '6ta'
    when 'Intermedio'   then '5ta'
    when 'Avanzado'     then '4ta'
    when 'Competitivo'  then '4ta'
    when 'Semi-Pro I'   then '3era'
    when 'Semi-Pro II'  then '3era'
    when 'Pro I'        then '2da'
    when 'Pro II'       then '2da'
    when 'Elite'        then '1era'
    when 'Legendary'    then '1era'
    else '6ta'
end;

-- 3) Nuevo default + check con las 6 categorías
alter table public.profiles
    alter column level set default '6ta';

alter table public.profiles
    add constraint profiles_level_check check (level in (
        '1era', '2da', '3era', '4ta', '5ta', '6ta'
    ));

-- 4) Actualizar el default del trigger de registro OAuth
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
    base_username text;
    candidate text;
    n int := 0;
begin
    base_username := coalesce(
        nullif(new.raw_user_meta_data ->> 'username', ''),
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        'jugador'
    );

    candidate := base_username;
    loop
        begin
            insert into public.profiles (id, username, full_name, role, level)
            values (
                new.id,
                candidate,
                coalesce(
                    nullif(new.raw_user_meta_data ->> 'full_name', ''),
                    nullif(new.raw_user_meta_data ->> 'name', ''),
                    ''
                ),
                coalesce(new.raw_user_meta_data ->> 'role', 'athlete'),
                coalesce(new.raw_user_meta_data ->> 'level', '6ta')
            )
            on conflict (id) do nothing;
            return new;
        exception when unique_violation then
            n := n + 1;
            candidate := case
                when n <= 1000 then base_username || n::text
                else base_username || '_' || floor(random() * 1000000)::text
            end;
        end;
    end loop;
end;
$$;
