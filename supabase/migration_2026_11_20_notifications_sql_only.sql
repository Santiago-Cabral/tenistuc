alter table public.notifications drop constraint if exists notifications_type_check;

alter table public.notifications add constraint notifications_type_check
check (type in (
    'message',
    'challenge',
    'challenge_received',
    'challenge_accepted',
    'challenge_rejected',
    'tournament',
    'tournament_new',
    'tournament_start',
    'tournament_update',
    'tournament_registration',
    'fixture_ready',
    'match_scheduled',
    'match_result',
    'match_confirmed',
    'payment',
    'system',
    'test'
));

create or replace function public.send_push_direct(
    p_user_id uuid,
    p_type text,
    p_title text,
    p_body text,
    p_data jsonb,
    p_related_id uuid default null
)
returns void
language plpgsql
security definer set search_path = public, extensions
as $$
declare
    v_token text;
begin
    insert into public.notifications (user_id, type, title, body, data, related_id)
    values (p_user_id, p_type, p_title, p_body, coalesce(p_data, '{}'::jsonb), p_related_id);

    select expo_push_token into v_token
    from public.profiles
    where id = p_user_id;

    if v_token is null or v_token not like 'ExponentPushToken%' then
        return;
    end if;

    begin
        perform net.http_post(
            'https://api.expo.dev/v2/push/send',
            jsonb_build_array(jsonb_build_object(
                'to', v_token,
                'title', p_title,
                'body', p_body,
                'data', coalesce(p_data, '{}'::jsonb),
                'sound', 'default',
                'badge', 1,
                'priority', 'high',
                'channelId', 'default'
            )),
            '{}'::jsonb,
            jsonb_build_object(
                'Content-Type', 'application/json',
                'Accept', 'application/json'
            ),
            5000
        );
    exception when others then
        raise warning 'send_push_direct failed: %', sqlerrm;
    end;
end;
$$;

revoke all on function public.send_push_direct(uuid, text, text, text, jsonb, uuid) from public;
revoke all on function public.send_push_direct(uuid, text, text, text, jsonb, uuid) from anon;
revoke all on function public.send_push_direct(uuid, text, text, text, jsonb, uuid) from authenticated;

create or replace function public.call_notify_webhook()
returns trigger
language plpgsql
security definer set search_path = public, extensions
as $$
declare
    v_rec jsonb;
    v_old jsonb;
    v_id uuid;
    v_user uuid;
    v_title text;
    v_body text;
    v_content text;
    v_when text;
    v_data jsonb;
    v_avatar text;
    v_tournament_name text;
    v_row record;
begin
    if TG_OP = 'DELETE' then
        v_rec := to_jsonb(old);
        v_old := '{}'::jsonb;
    else
        v_rec := to_jsonb(new);
        if TG_OP = 'UPDATE' then
            v_old := to_jsonb(old);
        else
            v_old := '{}'::jsonb;
        end if;
    end if;

    if TG_TABLE_NAME = 'messages' and TG_OP = 'INSERT' then
        v_id := (v_rec->>'conversation_id')::uuid;

        select case
                   when participant1_id = (v_rec->>'sender_id')::uuid then participant2_id
                   else participant1_id
               end
        into v_user
        from public.conversations
        where id = v_id
          and (participant1_id = (v_rec->>'sender_id')::uuid
            or participant2_id = (v_rec->>'sender_id')::uuid);

        if v_user is not null then
            select coalesce(nullif(full_name, ''), 'Nuevo mensaje'), avatar_url
            into v_title, v_avatar
            from public.profiles
            where id = (v_rec->>'sender_id')::uuid;

            v_content := coalesce(nullif(v_rec->>'content', ''), 'Nuevo mensaje');
            v_body := case
                when length(v_content) > 60 then left(v_content, 60) || '...'
                else v_content
            end;
            v_data := jsonb_build_object(
                'type', 'message',
                'conversation_id', v_id,
                'avatar_url', v_avatar
            );

            perform public.send_push_direct(
                v_user,
                'message',
                coalesce(v_title, 'Nuevo mensaje'),
                v_body,
                v_data,
                v_id
            );
        end if;

    elsif TG_TABLE_NAME = 'challenges' and TG_OP = 'INSERT' then
        v_id := (v_rec->>'id')::uuid;

        select coalesce(nullif(full_name, ''), 'Alguien'), avatar_url
        into v_title, v_avatar
        from public.profiles
        where id = (v_rec->>'challenger_id')::uuid;

        v_title := coalesce(v_title, 'Alguien');
        v_body := v_title || ' te desafió a un partido';
        v_data := jsonb_build_object(
            'type', 'challenge',
            'challenge_id', v_id,
            'avatar_url', v_avatar
        );

        perform public.send_push_direct(
            (v_rec->>'challenged_id')::uuid,
            'challenge',
            'Nuevo desafío',
            v_body,
            v_data,
            v_id
        );

    elsif TG_TABLE_NAME = 'tournaments' and TG_OP = 'INSERT' then
        v_id := (v_rec->>'id')::uuid;
        v_data := jsonb_build_object('type', 'tournament_new', 'tournament_id', v_id);

        for v_row in select id from public.profiles where role = 'athlete' loop
            perform public.send_push_direct(
                v_row.id,
                'tournament_new',
                'Nuevo torneo disponible',
                'Se abrió la inscripción: ' || coalesce(v_rec->>'name', ''),
                v_data,
                v_id
            );
        end loop;

    elsif TG_TABLE_NAME = 'tournaments' and TG_OP = 'UPDATE' then
        v_id := (v_rec->>'id')::uuid;

        if v_rec->>'status' = 'in_progress'
           and v_old->>'status' is distinct from 'in_progress' then
            v_data := jsonb_build_object('type', 'tournament_start', 'tournament_id', v_id);

            for v_row in select id from public.profiles where role = 'athlete' loop
                perform public.send_push_direct(
                    v_row.id,
                    'tournament_start',
                    'Torneo iniciado',
                    'Comenzó el torneo: ' || coalesce(v_rec->>'name', ''),
                    v_data,
                    v_id
                );
            end loop;

        elsif v_rec->>'status' is distinct from v_old->>'status'
              and v_rec->>'status' in ('closed', 'open') then
            v_title := case
                when v_rec->>'status' = 'closed' then 'Lista cerrada'
                else 'Lista reabierta'
            end;
            v_body := case
                when v_rec->>'status' = 'closed'
                    then 'Se cerró la lista de inscripción para '
                else 'Se reabrió la lista de inscripción para '
            end || coalesce(v_rec->>'name', '');
            v_data := jsonb_build_object('type', 'tournament_update', 'tournament_id', v_id);

            for v_row in
                select player_id
                from public.tournament_registrations
                where tournament_id = v_id
            loop
                perform public.send_push_direct(
                    v_row.player_id,
                    'tournament_update',
                    v_title,
                    v_body,
                    v_data,
                    v_id
                );
            end loop;
        end if;

    elsif TG_TABLE_NAME = 'tournament_registrations' and TG_OP = 'INSERT' then
        v_id := (v_rec->>'tournament_id')::uuid;

        select t.organizer_id, coalesce(nullif(p.full_name, ''), 'Alguien'), t.name
        into v_user, v_title, v_tournament_name
        from public.tournaments t
        join public.profiles p on p.id = (v_rec->>'player_id')::uuid
        where t.id = v_id;

        if v_user is not null then
            v_data := jsonb_build_object('type', 'tournament_registration', 'tournament_id', v_id);
            perform public.send_push_direct(
                v_user,
                'tournament_registration',
                'Nueva inscripción',
                v_title || ' se inscribió en ' || coalesce(v_tournament_name, ''),
                v_data,
                v_id
            );
        end if;

    elsif TG_TABLE_NAME = 'matches' and TG_OP = 'UPDATE'
          and v_rec->>'scheduled_at' is not null
          and v_rec->>'scheduled_at' is distinct from v_old->>'scheduled_at' then
        v_id := (v_rec->>'id')::uuid;
        v_when := to_char(
            ((v_rec->>'scheduled_at')::timestamptz at time zone 'America/Argentina/Tucuman'),
            'DD/MM HH24:MI'
        );
        v_body := 'Tu partido se juega el ' || v_when
            || case
                   when nullif(v_rec->>'location', '') is not null
                       then ' en ' || (v_rec->>'location')
                   else ''
               end;
        v_data := jsonb_build_object('type', 'match_scheduled', 'match_id', v_id);

        for v_user in
            select x
            from unnest(array[
                (v_rec->>'player1_id')::uuid,
                (v_rec->>'player2_id')::uuid
            ]) as x
            where x is not null
        loop
            perform public.send_push_direct(
                v_user,
                'match_scheduled',
                'Partido programado',
                v_body,
                v_data,
                v_id
            );
        end loop;
    end if;

    if TG_OP = 'DELETE' then
        return old;
    end if;
    return new;
end;
$$;

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = 'notifications'
    ) then
        alter publication supabase_realtime add table public.notifications;
    end if;
end $$;
