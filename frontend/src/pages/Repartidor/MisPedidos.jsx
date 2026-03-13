import { useState } from 'react';
import { noEntregado } from '../../services/pedidosService';
import FormEntrega from './FormEntrega';
import MapaMini from '../../components/Mapa/MapaMini';

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

export default function MisPedidos({ ruta, onRefresh }) {
  const [entregando, setEntregando] = useState(null);
  const [showMapa, setShowMapa]     = useState(null);

  const pedidos = ruta.pedidos || [];

  async function handleNoEntregado(pedido) {
    const notas = window.prompt('Motivo por el que no se entregó:');
    if (notas === null) return;
    try {
      await noEntregado(pedido.id, { notas_repartidor: notas });
      onRefresh();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  if (entregando) {
    return <FormEntrega pedido={entregando} ruta={ruta}
      onBack={() => setEntregando(null)} onSaved={() => { setEntregando(null); onRefresh(); }} />;
  }

  return (
    <div className="space-y-3">
      {pedidos.length === 0 ? (
        <div className="text-center py-8 text-slate-400">No tienes pedidos asignados</div>
      ) : pedidos.map(p => {
        const lat = p.latitud || p.cliente_lat;
        const lng = p.longitud || p.cliente_lng;
        return (
          <div key={p.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                  {p.orden_entrega}
                </span>
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">{p.numero}</span>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGE[p.estado] || ''}`}>
                {ESTADO_LABEL[p.estado] || p.estado}
              </span>
            </div>

            <h3 className="font-medium text-slate-800">{p.cliente_nombre}</h3>
            {p.cliente_telefono && <p className="text-xs text-slate-500">Tel: {p.cliente_telefono}</p>}
            {p.cliente_direccion && <p className="text-xs text-slate-400 mt-0.5">{p.cliente_direccion}</p>}
            {p.productos_resumen && <p className="text-sm text-slate-600 mt-1 font-medium">{p.productos_resumen}</p>}
            {p.notas_encargada && <p className="text-xs text-amber-600 mt-1 italic">{p.notas_encargada}</p>}

            {/* Mapa toggle */}
            {lat && lng && (
              <div className="mt-2">
                <button onClick={() => setShowMapa(showMapa === p.id ? null : p.id)}
                  className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                  {showMapa === p.id ? 'Ocultar mapa' : 'Ver en mapa'}
                </button>
                {showMapa === p.id && (
                  <div className="mt-2">
                    <MapaMini lat={lat} lng={lng} height={150} />
                    <a href={`https://www.openstreetmap.org/directions?to=${lat},${lng}`}
                      target="_blank" rel="noopener noreferrer"
                      className="mt-1 inline-block text-xs text-blue-600 hover:text-blue-700 font-medium">
                      Cómo llegar
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            {(p.estado === 'pendiente' || p.estado === 'en_camino') && (
              <div className="flex gap-2 mt-3">
                <button onClick={() => setEntregando(p)}
                  className="flex-1 px-3 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition">
                  Entregar
                </button>
                <button onClick={() => handleNoEntregado(p)}
                  className="px-3 py-2 text-sm font-medium text-red-600 border border-red-200 hover:bg-red-50 rounded-lg transition">
                  No entregado
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
