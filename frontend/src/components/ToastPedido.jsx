import { useState, useEffect } from 'react'

export default function ToastPedido() {
  const [toast, setToast] = useState(null)

  useEffect(() => {
    const handler = (e) => {
      const data = e.detail || {}
      setToast({
        numero: data.numero || '',
        cliente: data.cliente || 'Nuevo pedido',
        ts: Date.now(),
      })
    }
    window.addEventListener('pedido:nuevo-recibido', handler)
    return () => window.removeEventListener('pedido:nuevo-recibido', handler)
  }, [])

  // Auto-ocultar después de 6 segundos
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast?.ts])

  if (!toast) return null

  return (
    <div style={{
      position: 'fixed', top: 'calc(16px + env(safe-area-inset-top, 0px))', left: '50%', transform: 'translateX(-50%)',
      zIndex: 99999, width: '92%', maxWidth: 380,
      animation: 'slideDown 0.3s ease',
    }}>
      <div style={{
        background: '#1e40af', color: 'white',
        borderRadius: 16, padding: '14px 18px',
        boxShadow: '0 8px 30px rgba(30,64,175,0.4)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'rgba(255,255,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, flexShrink: 0,
        }}>
          📦
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>
            Nuevo pedido asignado
          </div>
          <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>
            {toast.numero ? `${toast.numero} — ` : ''}{toast.cliente}
          </div>
        </div>
        <button onClick={() => setToast(null)} style={{
          background: 'rgba(255,255,255,0.2)', border: 'none',
          borderRadius: 8, width: 32, height: 32,
          color: 'white', fontSize: 16, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          ✕
        </button>
      </div>
    </div>
  )
}
