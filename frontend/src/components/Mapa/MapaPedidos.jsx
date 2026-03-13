import { useEffect, useState } from 'react';

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
const ESTADO_COLOR = {
  pendiente: '#3B82F6', en_camino: '#F59E0B',
  entregado: '#10B981', no_entregado: '#EF4444',
};

export default function MapaPedidos({ pedidos = [], height = 'calc(100vh - 300px)' }) {
  const [MC, setMC] = useState(null);

  useEffect(() => {
    Promise.all([import('react-leaflet'), import('leaflet')]).then(([rl, L]) => {
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
      setMC({ ...rl, L });
    });
  }, []);

  const conCoords = pedidos.filter(p => p.lat && p.lng);

  function createIcon(estado, orden) {
    if (!MC) return null;
    const color = ESTADO_COLOR[estado] || '#6b7280';
    return new MC.L.DivIcon({
      className: '',
      html: `<div style="
        background:${color};color:white;width:28px;height:28px;
        border-radius:50%;display:flex;align-items:center;justify-content:center;
        font-size:12px;font-weight:700;border:2px solid white;
        box-shadow:0 2px 4px rgba(0,0,0,0.3)
      ">${orden || ''}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }

  if (!MC) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 flex items-center justify-center" style={{ height }}>
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (conCoords.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 flex items-center justify-center text-slate-400" style={{ height }}>
        <div className="text-center">
          <svg className="w-12 h-12 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
          </svg>
          <p className="text-sm">No hay pedidos con coordenadas</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden" style={{ height }}>
      <MC.MapContainer
        center={[Number(conCoords[0].lat), Number(conCoords[0].lng)]}
        zoom={13} style={{ height: '100%', width: '100%' }}>
        <MC.TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {conCoords.length > 1 && (
          <MC.Polyline
            positions={conCoords.map(p => [Number(p.lat), Number(p.lng)])}
            color="#3b82f6" weight={2} opacity={0.5} dashArray="8 4"
          />
        )}
        {conCoords.map(p => (
          <MC.Marker key={p.id} position={[Number(p.lat), Number(p.lng)]}
            icon={createIcon(p.estado, p.orden_entrega)}>
            <MC.Popup>
              <div className="min-w-[200px]">
                <p className="font-semibold text-sm">{p.orden_entrega}. {p.cliente_nombre}</p>
                <p className="text-xs text-gray-500 mt-1">{p.direccion || p.cliente_direccion || 'Sin dirección'}</p>
                {p.cliente_telefono && <p className="text-xs text-gray-500">Tel: {p.cliente_telefono}</p>}
                {p.productos_resumen && <p className="text-xs text-gray-600 mt-1 font-medium">{p.productos_resumen}</p>}
                <p className="text-xs mt-1">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${ESTADO_BADGE[p.estado] || ''}`}>
                    {ESTADO_LABEL[p.estado] || p.estado}
                  </span>
                </p>
              </div>
            </MC.Popup>
          </MC.Marker>
        ))}
      </MC.MapContainer>
    </div>
  );
}
