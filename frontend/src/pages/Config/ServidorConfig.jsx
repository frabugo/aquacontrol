import { useState, useEffect } from 'react';

const ServidorConfig = () => {
  const [url, setUrl] = useState('');
  const [guardado, setGuardado] = useState(false);
  const [probando, setProbando] = useState(false);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    const actual = localStorage.getItem('AQUA_API_URL') || '';
    setUrl(actual);
  }, []);

  const probarConexion = async (urlTest) => {
    setProbando(true);
    setResultado(null);
    try {
      const res = await fetch(`${urlTest}/api/ping`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        setResultado({ ok: true, msg: 'Conexion exitosa' });
      } else {
        setResultado({ ok: false, msg: `Error ${res.status}` });
      }
    } catch {
      setResultado({ ok: false, msg: 'No se pudo conectar' });
    } finally {
      setProbando(false);
    }
  };

  const guardar = () => {
    if (url.trim()) {
      localStorage.setItem('AQUA_API_URL', url.trim());
    } else {
      localStorage.removeItem('AQUA_API_URL');
    }
    setGuardado(true);
    setTimeout(() => {
      window.location.reload();
    }, 1000);
  };

  const limpiar = () => {
    localStorage.removeItem('AQUA_API_URL');
    setUrl('');
    window.location.reload();
  };

  return (
    <div style={{
      maxWidth: 500,
      margin: '60px auto',
      padding: 32,
      background: 'white',
      borderRadius: 12,
      boxShadow: '0 4px 24px rgba(0,0,0,0.1)',
    }}>
      <h2 style={{ margin: '0 0 8px', color: '#1e293b' }}>
        Configurar Servidor
      </h2>
      <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 24px' }}>
        Ingresa la URL del backend cuando uses un tunel externo como localtunnel o ngrok.
      </p>

      <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>
        URL del backend
      </label>
      <input
        type="url"
        value={url}
        onChange={(e) => {
          setUrl(e.target.value);
          setGuardado(false);
          setResultado(null);
        }}
        placeholder="https://192.168.18.59:3001"
        style={{
          width: '100%',
          padding: '10px 14px',
          marginTop: 6,
          marginBottom: 12,
          border: '1px solid #D1D5DB',
          borderRadius: 8,
          fontSize: 14,
          boxSizing: 'border-box',
        }}
      />

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => probarConexion(url)}
          disabled={!url || probando}
          style={{
            flex: 1,
            padding: '10px 0',
            background: '#F1F5F9',
            border: '1px solid #E2E8F0',
            borderRadius: 8,
            cursor: url ? 'pointer' : 'not-allowed',
            fontSize: 14,
            fontWeight: 600,
            color: '#475569',
          }}
        >
          {probando ? 'Probando...' : 'Probar'}
        </button>

        <button
          onClick={guardar}
          disabled={guardado}
          style={{
            flex: 2,
            padding: '10px 0',
            background: guardado ? '#10B981' : '#2563EB',
            border: 'none',
            borderRadius: 8,
            cursor: 'pointer',
            fontSize: 14,
            fontWeight: 600,
            color: 'white',
          }}
        >
          {guardado ? 'Guardado — recargando...' : 'Guardar y recargar'}
        </button>
      </div>

      {resultado && (
        <div style={{
          padding: '10px 14px',
          borderRadius: 8,
          background: resultado.ok ? '#ECFDF5' : '#FEF2F2',
          color: resultado.ok ? '#065F46' : '#991B1B',
          fontSize: 14,
          marginBottom: 12,
        }}>
          {resultado.msg}
        </div>
      )}

      <button
        onClick={limpiar}
        style={{
          width: '100%',
          padding: '8px 0',
          background: 'transparent',
          border: '1px solid #FCA5A5',
          borderRadius: 8,
          cursor: 'pointer',
          fontSize: 13,
          color: '#DC2626',
        }}
      >
        Usar URL local por defecto
      </button>

      <div style={{
        marginTop: 24,
        padding: 14,
        background: '#F8FAFC',
        borderRadius: 8,
        fontSize: 12,
        color: '#64748b',
      }}>
        <strong>URL actual activa:</strong><br />
        <code style={{
          background: '#E2E8F0',
          padding: '2px 6px',
          borderRadius: 4,
        }}>
          {localStorage.getItem('AQUA_API_URL') || 'localhost (por defecto)'}
        </code>
      </div>
    </div>
  );
};

export default ServidorConfig;
