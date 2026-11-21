-- =============================================================
-- 2026-11-11 — Notificaciones de chat/desafío: reemplaza los
-- webhooks manuales del dashboard por triggers de la base (pg_net)
-- que llaman directo a la edge function `notify`.
--
-- Paso 1: correr este archivo completo en Supabase → SQL Editor.
-- Paso 2 (una sola vez): cargar el NOTIFY_SECRET (el mismo de .env,
--          el que tiene la edge function `notify`). NO está en este
--          archivo para que no quede commiteado en git:
--
--   update public.app_config
--   set value = 'TU_NOTIFY_SECRET'
--   where key = 'notify_secret';
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- 1) EXTENSIÓN pg_net (llamadas HTTP desde triggers; en Supabase
--    vive en el schema `extensions`)
-- ──────────────────────────────────────────────────────────────
create extension if not exists pg_net;

-- ──────────────────────────────────────────────────────────────
-- 2) CONFIG: URL de la edge function + secret
--    app_config tiene RLS sin policies: solo postgres/service_role
--    (y funciones security definer) pueden leerla. El cliente no.
-- ──────────────────────────────────────────────────────────────
create table if not exists public.app_config (
    key   text primary key,
    value text not null
);

alter table public.app_config enable row level security;

insert into public.app_config (key, value) values
    ('notify_url', 'https://qodajlsxihukgfdvntjy.supabase.co/functions/v1/notify'),
    -- placeholder vacío: el trigger no envía nada hasta cargar el secret real
    ('notify_secret', '')
on conflict (key) do nothing;

-- ──────────────────────────────────────────────────────────────
-- 3) FUNCIÓN: arma el mismo payload que mandaban los webhooks del
--    dashboard y lo POSTea a la edge function `notify` (asincrónico).
-- ──────────────────────────────────────────────────────────────
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

    -- Sin secret cargado no se envía nada (la app sigue funcionando).
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

-- ──────────────────────────────────────────────────────────────
-- 4) TRIGGERS: los mismos eventos que exigían los webhooks
--    manuales (sección 15 del schema). La edge function filtra
--    por su cuenta qué evento genera notificación.
-- ──────────────────────────────────────────────────────────────
-- Desafío recibido
drop trigger if exists trg_notify_challenge_created on public.challenges;
create trigger trg_notify_challenge_created
    after insert on public.challenges
    for each row execute function public.call_notify_webhook();

-- Torneo nuevo / iniciado / lista cerrada-reabierta
drop trigger if exists trg_notify_tournament_changes on public.tournaments;
create trigger trg_notify_tournament_changes
    after insert or update on public.tournaments
    for each row execute function public.call_notify_webhook();

-- Nueva inscripción (aviso al organizador)
drop trigger if exists trg_notify_registration_changes on public.tournament_registrations;
create trigger trg_notify_registration_changes
    after insert or update on public.tournament_registrations
    for each row execute function public.call_notify_webhook();

-- Partido programado (aviso a ambos jugadores)
drop trigger if exists trg_notify_match_changes on public.matches;
create trigger trg_notify_match_changes
    after update on public.matches
    for each row execute function public.call_notify_webhook();

-- Mensaje nuevo (notificación de chat)
drop trigger if exists trg_notify_message_sent on public.messages;
create trigger trg_notify_message_sent
    after insert on public.messages
    for each row execute function public.call_notify_webhook();

-- ──────────────────────────────────────────────────────────────
-- 5) VERIFICACIÓN (opcional): ver si pg_net está encolando pedidos
--    select * from net._http_response order by created desc limit 5;
-- ──────────────────────────────────────────────────────────────
