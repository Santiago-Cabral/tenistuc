# PWA de TenisTuc

## Arquitectura

- Expo SDK 58 + Metro web (`web.bundler: metro`), salida `single` con fallback SPA; se puede publicar en EAS Hosting o Vercel.
- En SDK 58, `output: single` **no usa** `app/+html.tsx` para generar el HTML final: usa `public/index.html`.
  - `app/+html.tsx` se conserva para dev/static.
  - `public/index.html` es la plantilla real de producción.
  - `public/pwa.css` y `public/pwa.js` son compartidos por ambos.
- En `output: single`, verificar que las rutas profundas (`/tournament/123`) reescriban a `/index.html`: EAS Hosting lo hace y Vercel lo define en `vercel.json`.
- No se agregaron dependencias nuevas; las imágenes se generaron con `System.Drawing` de Windows desde `logoverde.png`.

## Comandos

```bash
npm run web        # expo start --web
npm run build:web  # expo export --platform web -> dist/
npm run deploy:web # build:web && eas deploy --prod
npx tsc --noEmit   # verificación de tipos
```

## Deploy en Vercel

- `vercel.json` define `buildCommand: npm run build:web`, `outputDirectory: dist`, rewrite `/(.*)` → `/index.html` y `Cache-Control` sin caché para `/sw.js`.
- `dist/` y `.env` ya están en `.gitignore`: Vercel genera el build y las variables se cargan desde el dashboard.
- Variables de entorno en Vercel (Production y Preview): `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_ANON_KEY`. No agregar `NOTIFY_SECRET` ni secretos de servidor.
- En Supabase → Auth → URL Configuration agregar `https://<dominio>/auth/callback` en Redirect URLs (y Site URL con el origen); para previews usar `https://*.vercel.app/**`.
- El OAuth web vuelve a `/auth/callback` (`app/auth/callback.web.tsx`); si redirectTo es solo `/`, el código queda sin procesar.
- Desplegar con `vercel` (preview) o `vercel --prod`; la CLI imprime la URL HTTPS. También funciona conectando el repo por GitHub.
- Vercel compila con `NODE_ENV=production`, por lo que el service worker se registra también en previews.

## Cambios por fase

- Fase 1: configuración web en `app.json` y scripts en `package.json`.
- Fase 2: Supabase web con localStorage/PKCE, OAuth web, callback `/auth/callback`, aviso de sesión perdida por Safari.
- Fase 3: inputs de fecha nativos del navegador y subida de imágenes con canvas/JPEG para web; Skia sigue no-op en web.
- Fase 4: HTML/CSS de columna 480px, `100dvh` + `visualViewport`, `viewport-fit=cover`, inputs ≥16px, `touch-action`, notificaciones sin blur web.
- Fase 5: manifest, íconos, splashes iOS, service worker, banner de instalación para Safari y labels de tabs web con `WebTabLabel` (`numberOfLines={2}`) para evitar el ellipsis de Expo Router.

## PWA / iOS

- `public/manifest.json`: `display: standalone`, `start_url: /`, `theme_color` `#2D6A4F`, iconos `any` y `maskable`.
- Íconos generados desde `public/icon-transparent.png` (logo sin fondo con recorte circular del 50%): `icon-192.png` e `icon-512.png` transparentes para favicon/manifiesto; `apple-touch-icon.png` con círculo verde; `icon-maskable-512.png` para Android.
- El favicon se declara como PNG transparente en `public/index.html` y `app/+html.tsx` (`/icon-192.png`), sin ICO con fondo.
- Splashes: `splash-1125x2436.png`, `splash-1170x2532.png`, `splash-1179x2556.png`, `splash-1242x2688.png`, `splash-1290x2796.png`.
- `InstallPrompt.web.tsx` muestra una vez el aviso “Compartir → Agregar a pantalla de inicio” en iOS Safari no standalone; se descarta guardando `tenistuc:install-dismissed` en localStorage.
- No se usa `beforeinstallprompt` porque Safari no lo soporta.

## Service worker

- `public/sw.js` (`tenistuc-shell-v3`) cachea solo el shell y archivos del mismo origen: `/`, `/index.html`, `/pwa.css`, `/pwa.js`, `/manifest.json`, íconos y `_expo/`.
- Navegación: network-first con fallback a `/index.html`.
- Assets: cache-first; Supabase y dominios externos nunca se cachean.
- Registro: solo en `Platform.OS === 'web' && process.env.NODE_ENV === 'production'` desde `app/_layout.tsx`.
- Al cambiar el shell, subir el nombre del caché a `tenistuc-shell-v2`, etc.

## Checklist de QA

- [ ] iPhone Safari: instalar desde Compartir → Agregar a pantalla de inicio.
- [ ] iPhone Safari: login/register, callback OAuth, sesión persistente y aviso de sesión borrada.
- [ ] iPhone Safari: teclado no hace zoom, safe areas, scroll hacia atrás, girar pantalla.
- [ ] iPhone Safari: subir foto de perfil y portada de torneo.
- [ ] iPhone Safari: fecha/hora, notificaciones dinámicas y deep links.
- [ ] Android Chrome: install prompt e ícono maskable.
- [ ] EAS Hosting: recarga directa de `/tournament/123`.
- [ ] Regresión Android/iOS nativo (`expo build` / EAS build correspondiente).

## Mercado Pago

- Documentado y **excluido** por decisión del usuario.
- No hay edge functions `mp-*`; solo `notify` y `send-push`.
- El registro a torneos actualmente guarda `payment_status: 'pending'` en `app/tournament/[id].tsx`.
- Para habilitarlo en el futuro: crear preferencia y verificar pago en edge functions con secretos en servidor, manejar el retorno web, actualizar estado con RLS y validar origen HTTPS.

## Web push

- No implementado (Fase 6 opcional no confirmada).
- Las notificaciones in-app funcionan en web mediante `Content.web.tsx`; las push requieren permiso, suscripción y backend de envío.
