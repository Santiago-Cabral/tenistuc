alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
    add constraint profiles_role_check
    check (role in ('athlete', 'organizer', 'admin'));

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
                case
                    when new.raw_user_meta_data ->> 'role' = 'organizer' then 'organizer'
                    else 'athlete'
                end,
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

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer set search_path = public
as $$
    select exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'admin'
    );
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

drop policy if exists "Admins can update profiles" on public.profiles;
create policy "Admins can update profiles" on public.profiles
    for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can update tournaments" on public.tournaments;
create policy "Admins can update tournaments" on public.tournaments
    for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins can delete tournaments" on public.tournaments;
create policy "Admins can delete tournaments" on public.tournaments
    for delete using (public.is_admin());

create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
    if not public.is_admin() then
        raise exception 'No tenés permisos de administrador';
    end if;
    if p_user_id = auth.uid() then
        raise exception 'No podés eliminar tu propia cuenta';
    end if;
    if not exists (select 1 from auth.users where id = p_user_id) then
        raise exception 'Usuario no encontrado';
    end if;

    delete from auth.users where id = p_user_id;
end;
$$;

revoke execute on function public.admin_delete_user(uuid) from public;
grant execute on function public.admin_delete_user(uuid) to authenticated;

create or replace function public.admin_update_user(
    p_user_id uuid,
    p_username text,
    p_full_name text,
    p_role text,
    p_city text,
    p_club text,
    p_elo integer,
    p_level text,
    p_age_category text,
    p_gender text,
    p_bio text
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
    if not public.is_admin() then
        raise exception 'No tenés permisos de administrador';
    end if;
    if p_role not in ('athlete', 'organizer', 'admin') then
        raise exception 'Rol inválido';
    end if;
    if p_level not in ('1era', '2da', '3era', '4ta', '5ta', '6ta') then
        raise exception 'Nivel inválido';
    end if;
    if p_age_category not in ('libre', '+30', '+40', '+50', '+60', '+70', '+80') then
        raise exception 'Categoría de edad inválida';
    end if;
    if p_gender is not null and p_gender not in ('femenino', 'masculino', 'otro') then
        raise exception 'Género inválido';
    end if;
    if nullif(btrim(coalesce(p_username, '')), '') is null then
        raise exception 'El usuario es obligatorio';
    end if;
    if p_user_id = auth.uid() and p_role <> 'admin' then
        raise exception 'No podés quitarte el rol de administrador';
    end if;

    update public.profiles
    set username = btrim(p_username),
        full_name = coalesce(btrim(p_full_name), ''),
        role = p_role,
        city = nullif(btrim(coalesce(p_city, '')), ''),
        club = nullif(btrim(coalesce(p_club, '')), ''),
        elo = greatest(coalesce(p_elo, 1000), 0),
        level = p_level,
        age_category = p_age_category,
        gender = p_gender,
        bio = nullif(btrim(coalesce(p_bio, '')), '')
    where id = p_user_id;

    if not found then
        raise exception 'Usuario no encontrado';
    end if;
end;
$$;

revoke execute on function public.admin_update_user(uuid, text, text, text, text, text, integer, text, text, text, text) from public;
grant execute on function public.admin_update_user(uuid, text, text, text, text, text, integer, text, text, text, text) to authenticated;

create or replace function public.admin_delete_tournament(p_tournament_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
    if not public.is_admin() then
        raise exception 'No tenés permisos de administrador';
    end if;
    if not exists (select 1 from public.tournaments where id = p_tournament_id) then
        raise exception 'Torneo no encontrado';
    end if;

    delete from public.tournaments where id = p_tournament_id;
end;
$$;

revoke execute on function public.admin_delete_tournament(uuid) from public;
grant execute on function public.admin_delete_tournament(uuid) to authenticated;

create or replace function public.admin_update_tournament(
    p_tournament_id uuid,
    p_name text,
    p_description text,
    p_status text,
    p_max_players integer,
    p_location text,
    p_starts_at timestamptz,
    p_allowed_gender text,
    p_allowed_level text,
    p_prize_money integer,
    p_entry_fee integer
)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
    if not public.is_admin() then
        raise exception 'No tenés permisos de administrador';
    end if;
    if nullif(btrim(coalesce(p_name, '')), '') is null then
        raise exception 'El nombre del torneo es obligatorio';
    end if;
    if p_status not in ('upcoming', 'open', 'closed', 'in_progress', 'completed') then
        raise exception 'Estado inválido';
    end if;
    if p_allowed_gender not in ('todos', 'femenino', 'masculino') then
        raise exception 'Género permitido inválido';
    end if;
    if p_allowed_level not in ('todas', '1era', '2da', '3era', '4ta', '5ta', '6ta') then
        raise exception 'Nivel permitido inválido';
    end if;

    update public.tournaments
    set name = btrim(p_name),
        description = nullif(btrim(coalesce(p_description, '')), ''),
        status = p_status,
        max_players = case when p_max_players is null or p_max_players <= 0 then null else p_max_players end,
        location = nullif(btrim(coalesce(p_location, '')), ''),
        starts_at = p_starts_at,
        allowed_gender = p_allowed_gender,
        allowed_level = p_allowed_level,
        prize_money = greatest(coalesce(p_prize_money, 0), 0),
        entry_fee = greatest(coalesce(p_entry_fee, 0), 0)
    where id = p_tournament_id;

    if not found then
        raise exception 'Torneo no encontrado';
    end if;
end;
$$;

revoke execute on function public.admin_update_tournament(uuid, text, text, text, integer, text, timestamptz, text, text, integer, integer) from public;
grant execute on function public.admin_update_tournament(uuid, text, text, text, integer, text, timestamptz, text, text, integer, integer) to authenticated;
