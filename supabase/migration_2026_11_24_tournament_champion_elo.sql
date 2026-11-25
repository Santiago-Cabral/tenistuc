alter table public.tournaments
    add column if not exists champion_id uuid,
    add column if not exists champion_match_id uuid references public.matches (id) on delete set null,
    add column if not exists champion_elo integer not null default 0,
    add column if not exists champion_elo_applied boolean not null default false;

do $$
begin
    if not exists (
        select 1
          from pg_constraint
         where conname = 'tournaments_champion_id_fkey'
           and conrelid = 'public.tournaments'::regclass
    ) then
        alter table public.tournaments
            add constraint tournaments_champion_id_fkey
            foreign key (champion_id) references public.profiles (id) on delete set null;
    end if;
end $$;

create or replace function public.settle_tournament_champion(p_tournament_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
    v_t           public.tournaments%rowtype;
    v_match       public.matches%rowtype;
    v_winner      uuid;
    v_points      integer;
    v_before      integer;
    v_after       integer;
    v_old_before  integer;
    v_old_after   integer;
begin
    select * into v_t
      from public.tournaments
     where id = p_tournament_id
     for update;

    if not found then
        return;
    end if;

    select * into v_match
      from public.matches
     where tournament_id = p_tournament_id
       and status = 'completed'
       and next_match_id is null
       and nullif(score ->> 'winner_id', '') is not null
     order by round desc, bracket_position
     limit 1;

    if not found then
        return;
    end if;

    v_winner := nullif(v_match.score ->> 'winner_id', '')::uuid;
    if v_winner is null then
        return;
    end if;

    v_points := greatest(coalesce(v_t.elo_points, 0), 0);

    select elo into v_before from public.profiles where id = v_winner;
    if v_before is null then
        return;
    end if;

    if v_t.champion_elo_applied and v_t.champion_id = v_winner then
        return;
    end if;

    if v_t.champion_elo_applied and v_t.champion_id is not null then
        select elo into v_old_before from public.profiles where id = v_t.champion_id;
        if v_old_before is not null then
            v_old_after := greatest(0, v_old_before - coalesce(v_t.champion_elo, 0));
            update public.profiles set elo = v_old_after where id = v_t.champion_id;
            if v_old_after <> v_old_before then
                insert into public.elo_match_history (match_id, player_id, elo_before, elo_after, delta)
                values (v_match.id, v_t.champion_id, v_old_before, v_old_after, v_old_after - v_old_before);
            end if;
        end if;
    end if;

    v_after := v_before + v_points;

    if v_points > 0 then
        update public.profiles set elo = v_after where id = v_winner;
        insert into public.elo_match_history (match_id, player_id, elo_before, elo_after, delta)
        values (v_match.id, v_winner, v_before, v_after, v_points);
    end if;

    update public.tournaments
       set champion_id = v_winner,
           champion_match_id = v_match.id,
           champion_elo = v_points,
           champion_elo_applied = true
     where id = p_tournament_id;
end $$;

create or replace function public.trg_tournament_champion_elo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    if new.tournament_id is null then
        return new;
    end if;

    if new.status is distinct from 'completed' then
        return new;
    end if;

    perform public.settle_tournament_champion(new.tournament_id);
    return new;
end $$;

drop trigger if exists trg_tournament_champion_elo on public.matches;
create trigger trg_tournament_champion_elo
after update of status, score on public.matches
for each row execute function public.trg_tournament_champion_elo();

do $$
declare
    r record;
begin
    for r in
        select distinct m.tournament_id
          from public.matches m
         where m.tournament_id is not null
           and m.status = 'completed'
           and m.next_match_id is null
           and nullif(m.score ->> 'winner_id', '') is not null
    loop
        perform public.settle_tournament_champion(r.tournament_id);
    end loop;
end $$;

revoke all on function public.settle_tournament_champion(uuid) from public;
revoke all on function public.trg_tournament_champion_elo() from public;
grant execute on function public.settle_tournament_champion(uuid) to service_role;
grant execute on function public.trg_tournament_champion_elo() to service_role;
