import { useState, useEffect, useRef } from 'react'

const InstalarApp = () => {
  const [mostrar,   setMostrar]   = useState(false)
  const [instalada, setInstalada] = useState(false)
  const [esIOS,     setEsIOS]     = useState(false)
  const promptRef = useRef(null)

  useEffect(() => {
    // Detectar si ya está instalada como PWA
    const yaInstalada =
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true

    if (yaInstalada) {
      setInstalada(true)
      return
    }

    // Detectar iOS (Safari no tiene beforeinstallprompt)
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)
    setEsIOS(ios)

    // Android Chrome: capturar el prompt
    const handler = (e) => {
      e.preventDefault()
      promptRef.current = e
      setMostrar(true)
    }

    window.addEventListener('beforeinstallprompt', handler)

    // iOS: mostrar instrucciones manuales
    if (ios) {
      const yaVio = sessionStorage.getItem('ios_install_visto')
      if (!yaVio) setMostrar(true)
    }

    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  const handleInstalar = async () => {
    if (promptRef.current) {
      promptRef.current.prompt()
      const { outcome } = await promptRef.current.userChoice
      if (outcome === 'accepted') {
        setInstalada(true)
        setMostrar(false)
      }
    }
    promptRef.current = null
  }

  const handleCerrar = () => {
    setMostrar(false)
    if (esIOS) {
      sessionStorage.setItem('ios_install_visto', '1')
    }
  }

  if (!mostrar || instalada) return null

  return (
    <>
      {/* Overlay semitransparente */}
      <div
        onClick={handleCerrar}
        style={{
          position: 'fixed', inset: 0, zIndex: 9997,
          background: 'rgba(0,0,0,0.5)',
        }}
      />

      {/* Banner desde abajo */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 9998,
        background: 'white', borderRadius: '20px 20px 0 0',
        padding: '24px 24px calc(36px + env(safe-area-inset-bottom, 0px))',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
        animation: 'slideUp 0.3s ease',
      }}>
        {/* Handle */}
        <div style={{
          width: 40, height: 4, background: '#E2E8F0',
          borderRadius: 4, margin: '0 auto 20px',
        }}/>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16,
        }}>
          <img
            src="/icons/icon-192.png"
            alt="AquaControl"
            style={{
              width: 56, height: 56, borderRadius: 14,
              boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            }}
          />
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: '#1e293b' }}>
              AquaControl
            </div>
            <div style={{ fontSize: 13, color: '#64748b' }}>
              Instalar como app
            </div>
          </div>
        </div>

        <div style={{
          fontSize: 14, color: '#475569', lineHeight: 1.6, marginBottom: 20,
        }}>
          Instala la app para acceder más rápido, recibir notificaciones y usarla como si fuera nativa.
        </div>

        {/* Android */}
        {!esIOS && (
          <button
            onClick={handleInstalar}
            style={{
              width: '100%', padding: '16px 0',
              background: '#2563EB', border: 'none', borderRadius: 14,
              color: 'white', fontSize: 16, fontWeight: 800, cursor: 'pointer',
              marginBottom: 10,
            }}
          >
            📲 Instalar AquaControl
          </button>
        )}

        {/* iOS: instrucciones paso a paso */}
        {esIOS && (
          <div style={{
            background: '#F0F9FF', border: '1px solid #BAE6FD',
            borderRadius: 12, padding: '14px 16px', marginBottom: 12,
          }}>
            <div style={{
              fontWeight: 700, fontSize: 14, color: '#0369A1', marginBottom: 10,
            }}>
              Cómo instalar en iPhone:
            </div>
            <div style={{ fontSize: 13, color: '#0C4A6E', lineHeight: 1.9 }}>
              1. Toca el botón <strong>Compartir</strong>{' '}
              <span style={{ fontSize: 16 }}>⎙</span> en Safari<br/>
              2. Desplázate y toca <strong>"Agregar a pantalla de inicio"</strong><br/>
              3. Toca <strong>"Agregar"</strong>
            </div>
          </div>
        )}

        <button
          onClick={handleCerrar}
          style={{
            width: '100%', padding: '14px 0',
            background: 'transparent', border: '1px solid #E2E8F0',
            borderRadius: 14, color: '#64748b', fontSize: 15,
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          Ahora no
        </button>
      </div>
    </>
  )
}

export default InstalarApp
