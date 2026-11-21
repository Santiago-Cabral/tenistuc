-- =============================================================
-- MIGRACIÓN 2026-10-14 — handle_new_user robusto para OAuth
-- Proyecto qodajlsxihukgfdvntjy
--
-- CORRER EN: Supabase → SQL Editor → New query (o supabase db push)
-- NO destructiva: solo `create or replace function` (no toca datos).
--
-- Problema: al entrar con Google/Apple por primera vez, Supabase crea el
-- usuario y dispara este trigger. El username se derivaba del prefijo del
-- email; si ese username ya existía (unique), el insert fallaba y el primer
-- login OAuth se rompía.
-- Solución: si el username colisiona, se reintenta con sufijo numérico
-- (santi, santi1, santi2, ...) y full_name toma también el claim `name`.
-- =============================================================

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
    -- El registro local manda un username; los logins OAuth (Google/Apple) no,
    -- así que usamos el prefijo del email y, si colisiona, le agregamos sufijo.
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

-- LISTO ✅
