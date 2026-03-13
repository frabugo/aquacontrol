import { useCallback, useEffect, useRef, useState } from 'react';
import { cambiarEstado } from '../../services/pedidosService';

const ESTADO_COLOR = {
  pendiente:    '#eab308',
  en_camino:    '#3b82f6',
  entregado:    '#22c55e',
  no_entregado: '#ef4444',
};
const ESTADO_LABEL = {
  pendiente: 'Pendiente', en_camino: 'En camino',
  entregado: 'Entregado', no_entregado: 'No entregado',
};

/* Leaflet CSS injector */
function injectLeafletCss() {
  if (document.getElementById('leaflet-css')) return;
  const link = document.createElement('link');
  link.id = 'leaflet-css';
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
  document.head.appendChild(link);
}

/* Pulsating GPS animation (injected once) */
function injectGpsStyle() {
  if (document.getElementById('gps-pulse-style')) return;
  const style = document.createElement('style');
  style.id = 'gps-pulse-style';
  style.textContent = `
    @keyframes gps-pulse {
      0%   { transform: scale(1);   opacity: 1; }
      100% { transform: scale(2.5); opacity: 0; }
    }
    .gps-marker {
      width: 18px; height: 18px; background: #3b82f6; border-radius: 50%;
      border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.35);
      position: relative;
    }
    .gps-marker::after {
      content: ''; position: absolute; inset: -4px;
      border-radius: 50%; border: 2px solid #3b82f6;
      animation: gps-pulse 1.5s ease-out infinite;
    }
  `;
  document.head.appendChild(style);
}

export default function VistaMapa({ pedidos, loading, onRefresh, onEntregar }) {
  const [MapComponents, setMapComponents] = useState(null);
  const [gps, setGps]             = useState(null);
  const [gpsActive, setGpsActive] = useState(false);
  const [selected, setSelected]   = useState(null);
  const [routeLine, setRouteLine] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [marcando, setMarcando]   = useState(false);
  const mapRef    = useRef(null);
  const watchRef  = useRef(null);

  async function handleEnCamino(p) {
    setMarcando(true);
    try {
      await cambiarEstado(p.id, { estado: 'en_camino' });
      setSelected({ ...p, estado: 'en_camino' });
      window.dispatchEvent(new Event('pedido:estado-cambiado'));
      if (onRefresh) onRefresh();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
    finally { setMarcando(false); }
  }

  // Lazy load leaflet
  useEffect(() => {
    injectLeafletCss();
    injectGpsStyle();
    Promise.all([
      import('react-leaflet'),
      import('leaflet'),
    ]).then(([rl, L]) => {
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
      setMapComponents({ ...rl, L });
    });
  }, []);

  // GPS watcher
  useEffect(() => {
    if (!navigator.geolocation) return;
    watchRef.current = navigator.geolocation.watchPosition(
      pos => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGpsActive(true);
      },
      () => setGpsActive(false),
      { enableHighAccuracy: true, maximumAge: 5000 }
    );
    return () => {
      if (watchRef.current != null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, []);

  // Fetch OSRM route when a pedido is selected
  const fetchRoute = useCallback(async (destLat, destLng) => {
    if (!gps) { setRouteLine(null); setRouteInfo(null); return; }
    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${gps.lng},${gps.lat};${destLng},${destLat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.routes && data.routes.length > 0) {
        const route = data.routes[0];
        const coords = route.geometry.coordinates.map(c => [c[1], c[0]]);
        setRouteLine(coords);
        setRouteInfo({
          distKm: (route.distance / 1000).toFixed(1),
          minutos: Math.round(route.duration / 60),
        });
      }
    } catch {
      setRouteLine(null);
      setRouteInfo(null);
    }
  }, [gps]);

  function handleSelectPedido(p) {
    if (selected?.id === p.id) {
      setSelected(null); setRouteLine(null); setRouteInfo(null);
      return;
    }
    setSelected(p);
    if (p.lat && p.lng) fetchRoute(p.lat, p.lng);
  }

  function abrirGoogleMaps(lat, lng) {
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`, '_blank');
  }

  const puntosConCoords = pedidos.filter(p => p.lat && p.lng);

  function createIcon(estado, orden, isSelected) {
    if (!MapComponents) return null;
    const color = ESTADO_COLOR[estado] || '#6b7280';
    const size = isSelected ? 36 : 28;
    const ring = isSelected ? 'box-shadow:0 0 0 3px white, 0 0 0 6px ' + color + ';' : '';
    return new MapComponents.L.DivIcon({
      className: '',
      html: `<div style="
        background:${color}; color:white; width:${size}px; height:${size}px;
        border-radius:50%; display:flex; align-items:center; justify-content:center;
        font-size:${isSelected ? 14 : 12}px; font-weight:700; border:2px solid white;
        box-shadow:0 2px 4px rgba(0,0,0,0.3); ${ring}
        transition: all 0.2s;
      ">${orden}</div>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }

  function createGpsIcon() {
    if (!MapComponents) return null;
    return new MapComponents.L.DivIcon({
      className: '',
      html: '<div class="gps-marker"></div>',
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  }

  // Determine map center
  const center = gps
    ? [gps.lat, gps.lng]
    : puntosConCoords.length > 0
      ? [Number(puntosConCoords[0].lat), Number(puntosConCoords[0].lng)]
      : [-12.0464, -77.0428]; // Lima default

  if (!MapComponents) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center justify-center" style={{ height: 'calc(100vh - 340px)' }}>
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center justify-center" style={{ height: 'calc(100vh - 340px)' }}>
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" style={{ height: 'calc(100vh - 340px)' }}>
        {puntosConCoords.length === 0 && !gps ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              <p className="text-sm">No hay pedidos con coordenadas</p>
              <p className="text-xs mt-1">Activa tu GPS o asigna ubicaciones</p>
            </div>
          </div>
        ) : (
          <MapComponents.MapContainer
            ref={mapRef}
            center={center}
            zoom={14}
            style={{ height: '100%', width: '100%' }}
          >
            <MapComponents.TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* GPS marker */}
            {gps && (
              <MapComponents.Marker
                position={[gps.lat, gps.lng]}
                icon={createGpsIcon()}
                zIndexOffset={1000}
              >
                <MapComponents.Popup>
                  <p className="text-sm font-medium">Tu ubicacion</p>
                </MapComponents.Popup>
              </MapComponents.Marker>
            )}

            {/* OSRM route line */}
            {routeLine && (
              <MapComponents.Polyline
                positions={routeLine}
                color="#3b82f6"
                weight={4}
                opacity={0.8}
              />
            )}

            {/* Pedido markers */}
            {puntosConCoords.map(p => (
              <MapComponents.Marker
                key={p.id}
                position={[Number(p.lat), Number(p.lng)]}
                icon={createIcon(p.estado, p.orden_entrega, selected?.id === p.id)}
                eventHandlers={{ click: () => handleSelectPedido(p) }}
              >
                <MapComponents.Popup>
                  <div className="min-w-[200px]">
                    <p className="font-semibold text-sm">{p.orden_entrega}. {p.cliente_nombre}</p>
                    <p className="text-xs text-gray-500 mt-1">{p.cliente_direccion || 'Sin direccion'}</p>
                    {p.cliente_telefono && <p className="text-xs text-gray-500">Tel: {p.cliente_telefono}</p>}
                    {p.productos_resumen && <p className="text-xs text-gray-600 mt-1 font-medium">{p.productos_resumen}</p>}
                    {p.notas_encargada && <p className="text-xs text-gray-400 mt-1 italic">{p.notas_encargada}</p>}
                  </div>
                </MapComponents.Popup>
              </MapComponents.Marker>
            ))}
          </MapComponents.MapContainer>
        )}
      </div>

      {/* Selected pedido panel */}
      {selected && (
        <div className="absolute bottom-4 left-4 right-4 bg-white rounded-xl border border-slate-200 shadow-lg p-4 z-[1000]">
          <div className="flex items-start justify-between mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center">
                  {selected.orden_entrega}
                </span>
                <h3 className="text-sm font-semibold text-slate-800 truncate">{selected.cliente_nombre}</h3>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0`} style={{
                  backgroundColor: (ESTADO_COLOR[selected.estado] || '#6b7280') + '20',
                  color: ESTADO_COLOR[selected.estado] || '#6b7280',
                }}>
                  {ESTADO_LABEL[selected.estado]}
                </span>
              </div>
              {selected.cliente_direccion && (
                <p className="text-xs text-slate-500 truncate">{selected.cliente_direccion}</p>
              )}
              {selected.productos_resumen && (
                <p className="text-xs text-slate-600 font-medium mt-1">{selected.productos_resumen}</p>
              )}
              {routeInfo && (
                <p className="text-xs text-blue-600 font-medium mt-1">
                  {routeInfo.distKm} km &middot; ~{routeInfo.minutos} min
                </p>
              )}
            </div>
            <button onClick={() => { setSelected(null); setRouteLine(null); setRouteInfo(null); }}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition shrink-0">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          {/* Action buttons */}
          {(selected.estado === 'pendiente' || selected.estado === 'en_camino') && (
            <div className="flex gap-2 pt-2 border-t border-slate-100">
              {selected.lat && selected.lng && (
                <button onClick={() => abrirGoogleMaps(selected.lat, selected.lng)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition">
                  Navegar
                </button>
              )}
              {selected.estado === 'pendiente' && (
                <button onClick={() => handleEnCamino(selected)} disabled={marcando}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition">
                  {marcando ? 'Marcando...' : 'En camino'}
                </button>
              )}
              {selected.estado === 'en_camino' && onEntregar && (
                <button onClick={() => onEntregar(selected)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition">
                  Entregar
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Legend + GPS indicator */}
      <div className="mt-3 flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          {Object.entries(ESTADO_COLOR).map(([estado, color]) => (
            <div key={estado} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full" style={{ background: color }} />
              <span className="text-xs text-slate-500">{ESTADO_LABEL[estado]}</span>
            </div>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <div className={`w-2.5 h-2.5 rounded-full ${gpsActive ? 'bg-green-500' : 'bg-red-400'}`} />
          <span className="text-xs text-slate-500">GPS {gpsActive ? 'activo' : 'inactivo'}</span>
        </div>
      </div>
    </div>
  );
}
