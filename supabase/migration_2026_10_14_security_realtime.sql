-- =============================================================
-- MIGRACIÓN 2026-10-14 — Endurecimiento de seguridad + Realtime
-- Proyecto qodajlsxihukgfdvntjy
--
-- CORRER EN: Supabase → SQL Editor → New query (o supabase db push)
-- Es idempotente: se puede volver a correr sin romper nada.
-- NO es destructiva: no borra datos ni columnas.
-- =============================================================

-- ──────────────────────────────────────────────────────────────
-- 1) STORAGE "avatars": el dueño del archivo es la 1ª carpeta de la ruta
--    (la app sube a `<uid>/avatar.<ext>`, ver app/edit-profile.tsx).
--    Antes: cualquier usuario autenticado podía sobrescribir/borrar
--    el avatar de cualquier otro.
-- ──────────────────────────────────────────────────────────────
drop policy if exists "Users can upload avatars" on storage.objects;
create policy "Users can upload avatars" on storage.objects
    for insert to authenticated with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "Users can update their avatars" on storage.objects;
create policy "Users can update their avatars" on storage.objects
    for update to authenticated using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

drop policy if exists "Users can delete their avatars" on storage.objects;
create policy "Users can delete their avatars" on storage.objects
    for delete to authenticated using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
    );

-- ──────────────────────────────────────────────────────────────
-- 2) REALTIME: la app escucha postgres_changes en messages,
--    conversations y notifications (además de profiles). Sin esto el
--    chat y el badge de no leídas no se actualizan en vivo.
-- ──────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['profiles', 'messages', 'conversations', 'notifications']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ──────────────────────────────────────────────────────────────
-- 3) Ocultar `profiles.expo_push_token` de los clientes.
--    Antes: `profiles` es legible por cualquiera (select using(true)) e
--    incluía el token push → cualquier portador de la anon key podía leer
--    los tokens de TODOS los usuarios (vector de spam).
--    Ahora: solo el servidor (edge functions con service_role) lee el token.
--    El cliente dejó de leerlo: los `select('*')/select()` sobre profiles
--    se cambiaron por listas explícitas SIN expo_push_token
--    (src/stores/authStore.ts, src/screens/shared/ProfileDetailScreen.tsx)
--    y el push se manda vía la edge function `send-push` (que hay que deployar).
-- ──────────────────────────────────────────────────────────────
revoke select (expo_push_token) on public.profiles from anon, authenticated;

-- LISTO ✅
-- Recordá deployar la función nueva:  supabase functions deploy send-push
