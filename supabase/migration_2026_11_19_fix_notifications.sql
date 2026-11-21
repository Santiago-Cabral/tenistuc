-- =============================================================
-- 2026-11-19 — Reparar notificaciones push
-- Ejecutar en: Supabase → SQL Editor → New query
-- =============================================================

-- 1) pg_net: llamada posicional (evita el parámetro inexistente
--    `timeout_millis`) y sin bloquear la escritura original si falla.
create or replace function public.call_notify_webhook()
returns trigger
language plpgsql
security definer set search_path = public, extensions
as $$
declare
    v_url    text;
    v_secret text;
begin
    select value into v_url    from public.app_config where key = 'notify_url';
    select value into v_secret from public.app_config where key = 'notify_secret';

    if v_url is null or v_secret is null or v_secret = '' then
        return coalesce(new, old);
    end if;

    begin
        perform net.http_post(
            v_url,
            jsonb_build_object(
                'type', TG_OP,
                'table', TG_TABLE_NAME,
                'record', case when TG_OP = 'DELETE' then to_jsonb(old) else to_jsonb(new) end,
                'old_record', case when TG_OP = 'UPDATE' then to_jsonb(old) else '{}'::jsonb end
            ),
            '{}'::jsonb,
            jsonb_build_object(
                'Content-Type', 'application/json',
                'Authorization', 'Bearer ' || v_secret
            ),
            5000
        );
    exception when others then
        raise warning 'call_notify_webhook failed: %', sqlerrm;
    end;

    return coalesce(new, old);
end;
$$;

-- 2) Realtime para que la notificación aparezca también en la app abierta.
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

-- 3) Verificación rápida (no muestra el secreto):
--    select key, length(value) as value_len, (value = '') as is_empty
--    from public.app_config order by key;
