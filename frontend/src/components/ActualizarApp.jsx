import { useState, useEffect, useRef } from 'react'

const POLL_INTERVAL = 60_000 // cada 60 segundos

export default function ActualizarApp() {
  const [hayUpdate, setHayUpdate] = useState(false)
  const [actualizando, setActualizando] = useState(false)
  const versionRef = useRef(null)

  useEffect(() => {
    let timer

    async function checkVersion() {
      try {
        const res = await fetch('/version.json?_=' + Date.now(), {
          cache: 'no-store',
        })
        if (!res.ok) return
        const data = await res.json()

        if (!versionRef.current) {
          // Primera carga: guardar versión actual
          versionRef.current = data.v
          return
        }

        if (data.v !== versionRef.current) {
          setHayUpdate(true)
        }
      } catch {
        // Sin conexión o error — ignorar
      }
    }

    // También escuchar evento del SW (nuevo SW waiting)
    const swHandler = () => setHayUpdate(true)
    window.addEventListener('sw:update-available', swHandler)

    checkVersion()
    timer = setInterval(checkVersion, POLL_INTERVAL)

    return () => {
      clearInterval(timer)
      window.removeEventListener('sw:update-available', swHandler)
    }
  }, [])

  async function handleActualizar() {
    setActualizando(true)
    try {
      // 1. Decirle al SW waiting que tome el control
      const reg = await navigator.serviceWorker?.getRegistration()
      if (reg?.waiting) {
        reg.waiting.postMessage({ tipo: 'SKIP_WAITING' })
      }

      // 2. Limpiar caches del SW
      const keys = await caches.keys()
      await Promise.all(keys.map(k => caches.delete(k)))

      // 3. Recargar forzado
      window.location.reload()
    } catch {
      window.location.reload()
    }
  }

  if (!hayUpdate) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 99990,
      width: '92%',
      maxWidth: 400,
      animation: 'slideUp 0.3s ease',
    }}>
      <div style={{
        background: '#0F172A',
        color: 'white',
        borderRadius: 16,
        padding: '14px 18px',
        boxShadow: '0 8px 30px rgba(0,0,0,0.4)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}>
        <div style={{
          width: 42, height: 42, borderRadius: 12,
          background: 'rgba(37,99,235,0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, flexShrink: 0,
        }}>
          🚀
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 14 }}>
            Nueva versión disponible
          </div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>
            Actualiza para obtener las mejoras
          </div>
        </div>
        <button
          onClick={handleActualizar}
          disabled={actualizando}
          style={{
            background: '#2563EB',
            border: 'none',
            borderRadius: 10,
            padding: '10px 16px',
            color: 'white',
            fontSize: 13,
            fontWeight: 700,
            cursor: actualizando ? 'wait' : 'pointer',
            flexShrink: 0,
            opacity: actualizando ? 0.7 : 1,
          }}
        >
          {actualizando ? 'Actualizando...' : 'Actualizar'}
        </button>
      </div>
    </div>
  )
}
