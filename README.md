# TenisTuc 🎾

App de tenis amateur — "The Kinetic Court"  
React Native + Expo + Supabase

---

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React Native + Expo Router |
| Backend | Supabase (Auth + DB + Realtime) |
| Estado | Zustand |
| Fuentes | Lexend + Plus Jakarta Sans |
| Diseño | The Kinetic Court Design System |

---

## Pantallas incluidas

| Pantalla | Ruta | Estado |
|---|---|---|
| Login | `/login` | ✅ |
| Registro | `/register` | ✅ |
| Olvidé contraseña | `/forgot-password` | ✅ |
| Home / Dashboard | `/(tabs)/` | ✅ |
| Buscar Rivales | `/(tabs)/rivals` | ✅ |
| Ranking | `/(tabs)/ranking` | ✅ |
| Mensajes (bandeja) | `/(tabs)/messages` | ✅ |
| Perfil propio | `/(tabs)/profile` | ✅ |
| Panel Organizador | `/(tabs)/organizer` | ✅ |
| Chat | `/chat/[id]` | ✅ |
| Perfil de otro jugador | `/profile/[id]` | ✅ |
| Detalle de torneo | `/tournament/[id]` | ✅ |
| Mis partidos | `/matches` | ✅ |
| Editar perfil | `/edit-profile` | ✅ |

---

## Setup

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar Supabase

1. Crear proyecto en [supabase.com](https://supabase.com)
2. Ir a **SQL Editor** y ejecutar `supabase/schema.sql`
3. Ir a **Settings → API** y copiar URL y anon key
4. Actualizar `.env`:

```env
EXPO_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key
```

### 3. Configurar Google OAuth (opcional)

1. En Supabase → Authentication → Providers → Google
2. Crear credenciales en [Google Cloud Console](https://console.cloud.google.com)
3. Agregar redirect URI: `tenistuc://auth/callback`

### 4. Correr

```bash
# Development
npx expo start

# iOS
npx expo start --ios

# Android  
npx expo start --android
```

---

## Estructura del proyecto

```
tenistuc/
├── app/                        # Expo Router (rutas)
│   ├── (tabs)/                 # Tab navigator
│   │   ├── _layout.tsx         # Tab bar config
│   │   ├── index.tsx           # Home
│   │   ├── rivals.tsx          # Buscar rivales
│   │   ├── ranking.tsx         # Ranking
│   │   ├── messages.tsx        # Bandeja mensajes
│   │   ├── profile.tsx         # Mi perfil
│   │   └── organizer.tsx       # Panel organizador
│   ├── chat/[id].tsx           # Chat 1:1
│   ├── profile/[id].tsx        # Perfil ajeno
│   ├── tournament/[id].tsx     # Detalle torneo
│   ├── matches.tsx             # Mis partidos
│   ├── edit-profile.tsx        # Editar perfil
│   ├── login.tsx               # Login
│   ├── register.tsx            # Registro
│   ├── forgot-password.tsx     # Recuperar contraseña
│   └── _layout.tsx             # Root layout + auth guard + fonts
│
├── src/
│   ├── Auth/
│   │   └── authStore.ts        # Zustand store (fuente única)
│   ├── components/
│   │   └── ui/index.tsx        # Design system components
│   ├── login/
│   │   ├── LoginScreen.tsx
│   │   ├── RegisterScreen.tsx
│   │   └── ForgotPasswordScreen.tsx
│   ├── screens/
│   │   ├── HomeScreen.tsx
│   │   ├── RivalsScreen.tsx
│   │   ├── RankingScreen.tsx
│   │   ├── ProfileScreen.tsx
│   │   └── ChatScreen.tsx
│   ├── services/
│   │   └── supabase/Supabase.ts
│   ├── store/
│   │   └── authStore.ts        # Re-export de Auth/authStore
│   └── theme/
│       └── index.ts            # Colors, Typography, Spacing, Radius
│
├── supabase/
│   └── schema.sql              # Esquema completo de BD
│
├── .env                        # Variables de entorno
├── app.json                    # Expo config
├── babel.config.js
├── package.json
└── tsconfig.json
```

---

## Base de datos (Supabase)

### Tablas principales

| Tabla | Descripción |
|---|---|
| `profiles` | Datos de atletas y organizadores |
| `matches` | Partidos (friendly, challenge, tournament) |
| `tournaments` | Torneos creados por organizadores |
| `tournament_registrations` | Inscripciones + estado de pago |
| `challenges` | Retos entre jugadores |
| `conversations` | Hilos de chat |
| `messages` | Mensajes individuales (Realtime) |
| `achievements` | Catálogo de logros |
| `player_achievements` | Logros ganados por jugador |
| `elo_history` | Historial de ELO para gráficos |

### Realtime habilitado en:
- `messages` — chat en tiempo real
- `challenges` — notificaciones de retos
- `matches` — actualizaciones de partidos

---

## Notas de diseño

El sistema de diseño **"The Kinetic Court"** usa:
- **Colores:** `#4f6300` (verde oliva) + `#d4fa57` (verde lima) sobre `#f7f7f0` (off-white)
- **Tipografía:** Lexend (headlines) + Plus Jakarta Sans (body)
- **Sin bordes de 1px** — separación por capas de color
- **Glassmorphism** en tab bar y elementos flotantes
- **Pill buttons** y corners redondeados (`xl`/`full`)
