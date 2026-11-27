alter table public.profiles
    add column if not exists has_seen_tutorial boolean not null default false;

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles
    for update
    using (auth.uid() = id)
    with check (auth.uid() = id);
