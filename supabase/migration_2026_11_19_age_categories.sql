-- =============================================================
-- 2026-11-19 — Categoría de edad en profiles
-- Ejecutar en: Supabase → SQL Editor → New query
-- =============================================================

-- 1) Columna + constraint (la fecha de nacimiento no se guarda: la app
--    calcula la categoría y persiste solo ese valor).
alter table public.profiles
    add column if not exists age_category text not null default 'libre';

alter table public.profiles drop constraint if exists profiles_age_category_check;

alter table public.profiles
    add constraint profiles_age_category_check check (age_category in (
        'libre', '+30', '+40', '+50', '+60', '+70', '+80'
    ));

-- 2) El trigger de registro guarda la categoría enviada en user_metadata.
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
            insert into public.profiles (id, username, full_name, role, level, age_category)
            values (
                new.id,
                candidate,
                coalesce(
                    nullif(new.raw_user_meta_data ->> 'full_name', ''),
                    nullif(new.raw_user_meta_data ->> 'name', ''),
                    ''
                ),
                coalesce(new.raw_user_meta_data ->> 'role', 'athlete'),
                coalesce(new.raw_user_meta_data ->> 'level', '6ta'),
                coalesce(nullif(new.raw_user_meta_data ->> 'age_category', ''), 'libre')
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
