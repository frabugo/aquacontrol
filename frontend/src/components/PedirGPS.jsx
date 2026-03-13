import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'

export default function PedirGPS() {
  const { user } = useAuth()
  const [estado, setEstado] = useState(null) // null | 'pedir' | 'ok' | 'denegado'

  useEffect(() => {
    if (!user?.gps_obligatorio) return

    // Verificar si ya tiene permiso
    if (navigator.permissions?.query) {
      navigator.permissions.query({ name: 'geolocation' }).then(result => {
        if (result.state === 'granted') {
          setEstado('ok')
        } else if (result.state === 'denied') {
          setEstado('denegado')
        } else {
          setEstado('pedir')
        }
      }).catch(() => {
        // Fallback: pedir directamente
        setEstado('pedir')
      })
    } else {
      setEstado('pedir')
    }
  }, [user?.gps_obligatorio])

  const handleActivar = () => {
    navigator.geolocation.getCurrentPosition(
      () => setEstado('ok'),
      (err) => {
        if (err.code === 1) {
          setEstado('denegado')
        } else {
          // Timeout u otro error, pero el permiso puede estar concedido
          setEstado('ok')
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  if (!user?.gps_obligatorio) return null
  if (estado === 'ok' || estado === null) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 99997,
      background: 'rgba(0,0,0,0.85)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <div style={{
        background: 'white', borderRadius: 20,
        padding: '32px 24px', maxWidth: 360, width: '100%', textAlign: 'center',
      }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>
          {estado === 'denegado' ? '\u{1F6AB}' : '\u{1F4CD}'}
        </div>

        {estado === 'denegado' ? (<>
          <div style={{ fontWeight: 800, fontSize: 20, color: '#dc2626', marginBottom: 10 }}>
            GPS bloqueado
          </div>
          <div style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, marginBottom: 16 }}>
            El permiso de ubicaci&oacute;n fue denegado. Para usar la app necesitas activar el GPS manualmente desde
            <strong style={{ color: '#1e293b' }}> Ajustes del navegador &gt; Permisos &gt; Ubicaci&oacute;n</strong>.
          </div>
          <button onClick={() => setEstado('ok')} style={{
            width: '100%', padding: '14px 0',
            background: '#64748b', border: 'none', borderRadius: 12,
            color: 'white', fontSize: 15, fontWeight: 700, cursor: 'pointer',
          }}>
            Continuar de todos modos
          </button>
        </>) : (<>
          <div style={{ fontWeight: 800, fontSize: 20, color: '#1e293b', marginBottom: 10 }}>
            Activar ubicaci&oacute;n
          </div>
          <div style={{ fontSize: 14, color: '#64748b', lineHeight: 1.6, marginBottom: 16 }}>
            AquaControl necesita acceder a tu
            <strong style={{ color: '#1e293b' }}> ubicaci&oacute;n GPS </strong>
            para el seguimiento de rutas y entregas en tiempo real.
          </div>
          <button onClick={handleActivar} style={{
            width: '100%', padding: '16px 0',
            background: '#2563EB', border: 'none', borderRadius: 12,
            color: 'white', fontSize: 16, fontWeight: 700, cursor: 'pointer',
          }}>
            Activar GPS
          </button>
        </>)}
      </div>
    </div>
  )
}
