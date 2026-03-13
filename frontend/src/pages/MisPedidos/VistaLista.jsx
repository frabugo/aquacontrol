import { useState } from 'react';
import { noEntregado, cambiarEstado } from '../../services/pedidosService';
import FormEntrega from '../Repartidor/FormEntrega';

const ESTADO_BADGE = {
  pendiente:     'bg-yellow-100 text-yellow-700',
  en_camino:     'bg-blue-100 text-blue-700',
  entregado:     'bg-green-100 text-green-700',
  no_entregado:  'bg-red-100 text-red-700',
};
const ESTADO_LABEL = {
  pendiente: 'Pendiente', en_camino: 'En camino',
  entregado: 'Entregado', no_entregado: 'No entregado',
};

export default function VistaLista({ pedidos, loading, onRefresh }) {
  const [entregando, setEntregando] = useState(null);
  const [marcando, setMarcando]     = useState(null); // id del pedido marcándose en_camino

  async function handleEnCamino(p) {
    setMarcando(p.id);
    try {
      await cambiarEstado(p.id, { estado: 'en_camino' });
      window.dispatchEvent(new Event('pedido:estado-cambiado'));
      onRefresh();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
    finally { setMarcando(null); }
  }

  async function handleNoEntregado(p) {
    const motivo = window.prompt('Motivo de no entrega:');
    if (motivo === null) return;
    try {
      await noEntregado(p.id, { notas_repartidor: motivo });
      window.dispatchEvent(new Event('pedido:estado-cambiado'));
      onRefresh();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  function abrirGoogleMaps(lat, lng) {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, '_blank');
  }

  if (entregando) {
    return (
      <FormEntrega
        pedido={entregando}
        ruta={null}
        onBack={() => setEntregando(null)}
        onSaved={() => { setEntregando(null); onRefresh(); }}
      />
    );
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 p-4 animate-pulse">
            <div className="h-4 bg-slate-100 rounded w-1/3 mb-3" />
            <div className="h-3 bg-slate-100 rounded w-2/3 mb-2" />
            <div className="h-3 bg-slate-100 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (pedidos.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center text-slate-400">
        <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
        <p className="text-sm">No tienes pedidos asignados para esta fecha</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {pedidos.map((p, i) => (
        <div key={p.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 hover:shadow-md transition">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                {p.orden_entrega || i + 1}
              </span>
              <div>
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">{p.numero}</span>
              </div>
            </div>
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGE[p.estado] || ''}`}>
              {ESTADO_LABEL[p.estado] || p.estado}
            </span>
          </div>

          <h3 className="text-sm font-semibold text-slate-800 mb-1">{p.cliente_nombre}</h3>
          {p.cliente_direccion && (
            <p className="text-xs text-slate-500 mb-1 flex items-start gap-1">
              <svg className="w-3.5 h-3.5 mt-0.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              {p.cliente_direccion}
            </p>
          )}
          {p.cliente_telefono && (
            <p className="text-xs text-slate-500 mb-1 flex items-center gap-1">
              <svg className="w-3.5 h-3.5 shrink-0 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
              </svg>
              <a href={`tel:${p.cliente_telefono}`} className="text-blue-600 hover:underline">{p.cliente_telefono}</a>
            </p>
          )}
          {p.productos_resumen && (
            <p className="text-xs text-slate-600 font-medium mt-1 bg-slate-50 rounded-lg px-2 py-1">{p.productos_resumen}</p>
          )}
          {p.notas_encargada && (
            <p className="text-xs text-amber-600 italic mt-1">{p.notas_encargada}</p>
          )}

          {/* Actions — flujo: pendiente → en_camino → entregado */}
          {p.estado === 'pendiente' && (
            <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
              {p.lat && p.lng && (
                <button onClick={() => abrirGoogleMaps(p.lat, p.lng)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                  </svg>
                  Navegar
                </button>
              )}
              <button onClick={() => handleEnCamino(p)} disabled={marcando === p.id}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                </svg>
                {marcando === p.id ? 'Marcando...' : 'En camino'}
              </button>
              <button onClick={() => handleNoEntregado(p)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                No entregado
              </button>
            </div>
          )}
          {p.estado === 'en_camino' && (
            <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
              {p.lat && p.lng && (
                <button onClick={() => abrirGoogleMaps(p.lat, p.lng)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
                  </svg>
                  Navegar
                </button>
              )}
              <button onClick={() => setEntregando(p)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Entregar
              </button>
              <button onClick={() => handleNoEntregado(p)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-lg transition">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
                No entregado
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
