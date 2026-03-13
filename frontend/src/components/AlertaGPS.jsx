import { useState, useEffect } from 'react';
import sonidos from '../utils/sonidos';

const AlertaGPS = () => {
  const [visible, setVisible] = useState(false);
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    const handler = (e) => {
      setMotivo(e.detail?.motivo || 'GPS desactivado');
      setVisible(true);
      sonidos.alertaGPS();
    };

    const recuperado = () => {
      setVisible(false);
    };

    window.addEventListener('gps:perdido', handler);
    window.addEventListener('gps:recuperado', recuperado);

    return () => {
      window.removeEventListener('gps:perdido', handler);
      window.removeEventListener('gps:recuperado', recuperado);
    };
  }, []);

  if (!visible) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 9999,
      background: '#FEF2F2',
      borderBottom: '3px solid #EF4444',
      padding: '12px 20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16,
      boxShadow: '0 4px 12px rgba(239,68,68,0.2)',
      animation: 'slideDown 0.3s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 28 }}>{'\u{1F4F5}'}</span>
        <div>
          <div style={{ fontWeight: 700, color: '#991B1B', fontSize: 15 }}>
            {'\u26A0\uFE0F'} GPS desactivado
          </div>
          <div style={{ color: '#B91C1C', fontSize: 13 }}>
            {motivo} — Central no puede verte en el mapa.
            Activa tu ubicación para continuar.
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={() => {
            setVisible(false);
            window.dispatchEvent(new CustomEvent('gps:reintentar'));
          }}
          style={{
            background: '#EF4444',
            color: 'white',
            border: 'none',
            borderRadius: 8,
            padding: '8px 16px',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          {'\u{1F504}'} Reactivar GPS
        </button>
        <button
          onClick={() => setVisible(false)}
          style={{
            background: 'transparent',
            border: '1px solid #FECACA',
            borderRadius: 8,
            padding: '8px 12px',
            color: '#991B1B',
            cursor: 'pointer',
            fontSize: 13,
          }}
        >
          {'\u2715'}
        </button>
      </div>
    </div>
  );
};

export default AlertaGPS;
