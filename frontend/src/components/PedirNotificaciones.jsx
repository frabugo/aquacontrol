import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useNotificaciones } from '../hooks/useNotificaciones'

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true

const PedirNotificaciones = () => {
  const { user } = useAuth()
  const { solicitarPermiso } = useNotificaciones()
  const [estado, setEstado] = useState(null)
  const audioCtxRef = useRef(null)

  useEffect(() => {
    if (!user?.notif_pedidos) return

    // Si tiene Notification API (Android, desktop, iOS standalone en 16.4+)
    if ('Notification' in window) {
      const permiso = Notification.permission
      if (permiso === 'granted') {
        setEstado('ok')
      } else if (permiso === 'denied') {
        // Bloqueado, pero igual funciona con sonido+voz
        setEstado('ok')
      } else {
        setEstado('pedir')
      }
      return
    }

    // Sin Notification API (iOS Safari no standalone) — solo sonido
    setEstado('pedir_sonido')
  }, [user?.notif_pedidos])

  const handleActivarSonido = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      audioCtxRef.current = ctx
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.3, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3)
      osc.start(ctx.currentTime)
      osc.stop(ctx.currentTime + 0.3)
    } catch (e) {}

    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices()
      const u = new SpeechSynthesisUtterance('Alertas activadas')
      u.lang = 'es-PE'
      u.volume = 0.5
      window.speechSynthesis.speak(u)
    }

    setEstado('ok')
  }

  const handleSolicitar = async () => {
    const resultado = await solicitarPermiso()
    // Independientemente del resultado, dejamos usar la app (sonido + voz siempre funciona)
    setEstado('ok')
  }

  if (!user?.notif_pedidos) return null
  if (estado === 'ok')       return null
  if (estado === null)       return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99998,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: 'white', borderRadius: 20,
        padding: '32px 24px', maxWidth: 360, width: '100%', textAlign: 'center',
      }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🔔</div>

        {estado === 'pedir_sonido' && (<>
          <div style={{ fontWeight: 800, fontSize: 20, color: '#1e293b', marginBottom: 10 }}>
            Activar alertas de pedidos
          </div>
          <div style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, marginBottom: 16 }}>
            Toca el boton para activar las alertas con
            <strong style={{ color: '#1e293b' }}> sonido y voz </strong>
            cuando te asignen un nuevo pedido.
          </div>
          {!isStandalone() && (
            <div style={{
              fontSize: 12, color: '#f59e0b', background: '#fffbeb',
              borderRadius: 8, padding: '8px 12px', marginBottom: 16, lineHeight: 1.5,
            }}>
              Para recibir notificaciones con la app cerrada, agrega AquaControl a tu pantalla de inicio.
            </div>
          )}
          <button onClick={handleActivarSonido} style={{
            width: '100%', padding: '16px 0',
            background: '#2563EB', border: 'none', borderRadius: 12,
            color: 'white', fontSize: 16, fontWeight: 700, cursor: 'pointer',
          }}>
            Activar sonido y voz
          </button>
        </>)}

        {estado === 'pedir' && (<>
          <div style={{ fontWeight: 800, fontSize: 20, color: '#1e293b', marginBottom: 10 }}>
            Activar notificaciones
          </div>
          <div style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, marginBottom: 16 }}>
            Para recibir alertas de nuevos pedidos
            <strong style={{ color: '#1e293b' }}> incluso con la app cerrada</strong>,
            activa las notificaciones.
          </div>
          {!isStandalone() && (
            <div style={{
              fontSize: 12, color: '#f59e0b', background: '#fffbeb',
              borderRadius: 8, padding: '8px 12px', marginBottom: 16, lineHeight: 1.5,
            }}>
              En iPhone/iPad: primero agrega AquaControl a tu pantalla de inicio, luego activa las notificaciones.
            </div>
          )}
          <button onClick={handleSolicitar} style={{
            width: '100%', padding: '16px 0',
            background: '#2563EB', border: 'none', borderRadius: 12,
            color: 'white', fontSize: 16, fontWeight: 700, cursor: 'pointer',
          }}>
            Activar notificaciones
          </button>
        </>)}
      </div>
    </div>
  )
}

export default PedirNotificaciones
