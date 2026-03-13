import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';

export default function SesionDesplazada() {
  const { logout } = useAuth();
  const [visible, setVisible] = useState(false);
  const [segundos, setSegundos] = useState(5);

  const salir = useCallback(() => {
    setVisible(false);
    logout();
  }, [logout]);

  useEffect(() => {
    const handler = () => {
      setVisible(true);
      setSegundos(5);
    };
    window.addEventListener('sesion:desplazada', handler);
    return () => window.removeEventListener('sesion:desplazada', handler);
  }, []);

  useEffect(() => {
    if (!visible) return;
    if (segundos <= 0) { salir(); return; }
    const t = setTimeout(() => setSegundos(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [visible, segundos, salir]);

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, padding: '32px 28px',
        maxWidth: 380, width: '90%', textAlign: 'center',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🔒</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 20, color: '#b91c1c' }}>
          Sesión desplazada
        </h2>
        <p style={{ margin: '0 0 20px', color: '#555', fontSize: 14, lineHeight: 1.5 }}>
          Tu sesión fue cerrada porque ingresaste desde otro dispositivo.
        </p>

        {/* Barra progreso */}
        <div style={{
          background: '#e5e7eb', borderRadius: 6, height: 6, marginBottom: 16, overflow: 'hidden',
        }}>
          <div style={{
            background: '#b91c1c', height: '100%', borderRadius: 6,
            width: `${(segundos / 5) * 100}%`,
            transition: 'width 1s linear',
          }} />
        </div>

        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#888' }}>
          Redirigiendo en {segundos}s…
        </p>

        <button
          onClick={salir}
          style={{
            background: '#b91c1c', color: '#fff', border: 'none', borderRadius: 8,
            padding: '10px 32px', fontSize: 15, cursor: 'pointer',
          }}
        >
          Salir ahora
        </button>
      </div>
    </div>
  );
}
