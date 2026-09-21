import { useEffect } from 'react'
import { AppState } from 'react-native'
import { useAuthStore } from '../stores/authStore'
import { presenceService } from '../services/presenceService'

// Marca al usuario como en línea mientras la app está en primer plano y
// como fuera de línea cuando pasa a background, se cierra la sesión o se
// desmonta el componente. Renueva last_seen cada 30s (heartbeat) para que
// otros clientes puedan detectar presencia aunque la app se cierre de golpe.
export function usePresence() {
  const session = useAuthStore((s) => s.session)
  const userId = session?.user?.id ?? null

  useEffect(() => {
    if (!userId) return

    let active = true

    const goOnline = () => {
      if (!active) return
      presenceService.markOnline(userId).catch(() => {})
      // Heartbeat: mantiene last_seen fresco mientras el usuario está en app.
      const heartbeat = setInterval(() => {
        presenceService.touch(userId).catch(() => {})
      }, 30_000)
      return heartbeat
    }

    const goOffline = () => {
      active = false
      presenceService.markOffline(userId).catch(() => {})
    }

    let heartbeat = goOnline()

    const sub = AppState.addEventListener('change', (next) => {
      if (heartbeat) {
        clearInterval(heartbeat)
        heartbeat = undefined
      }
      if (next === 'active' && userId) {
        active = true
        heartbeat = goOnline()
      } else {
        goOffline()
      }
    })

    return () => {
      sub.remove()
      if (heartbeat) clearInterval(heartbeat)
      goOffline()
    }
  }, [userId])
}