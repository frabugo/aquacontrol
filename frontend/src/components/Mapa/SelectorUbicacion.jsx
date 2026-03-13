import { useEffect, useRef, useState } from 'react';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

export default function SelectorUbicacion({ lat, lng, direccion, onSave, onClose }) {
  const [MC, setMC] = useState(null);
  const [pos, setPos] = useState({ lat: lat || -12.0464, lng: lng || -77.0428 });
  const [busqueda, setBusqueda] = useState(direccion || '');
  const [buscando, setBuscando] = useState(false);
  const [dirResultado, setDirResultado] = useState('');
  const markerRef = useRef(null);

  useEffect(() => {
    Promise.all([import('react-leaflet'), import('leaflet')]).then(([rl, L]) => {
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
      setMC(rl);
    });
  }, []);

  async function buscarEnMapa() {
    if (!busqueda.trim()) return;
    setBuscando(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(busqueda + ' Lima Peru')}&format=json&limit=1`;
      const resp = await fetch(url, { headers: { 'User-Agent': 'AquaControl/1.0' } });
      const data = await resp.json();
      if (data.length > 0) {
        const r = data[0];
        setPos({ lat: Number(r.lat), lng: Number(r.lon) });
        setDirResultado(r.display_name);
      }
    } catch { /* ignore */ }
    setBuscando(false);
  }

  async function reverseGeocode(lat, lng) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`;
      const resp = await fetch(url, { headers: { 'User-Agent': 'AquaControl/1.0' } });
      const data = await resp.json();
      if (data.display_name) setDirResultado(data.display_name);
    } catch { /* ignore */ }
  }

  function MapClickHandler() {
    if (!MC) return null;
    MC.useMapEvents({
      click(e) {
        setPos({ lat: e.latlng.lat, lng: e.latlng.lng });
        reverseGeocode(e.latlng.lat, e.latlng.lng);
      },
    });
    return null;
  }

  function DraggableMarker() {
    if (!MC) return null;
    return (
      <MC.Marker position={[pos.lat, pos.lng]} draggable
        ref={markerRef}
        eventHandlers={{
          dragend() {
            const m = markerRef.current;
            if (m) {
              const p = m.getLatLng();
              setPos({ lat: p.lat, lng: p.lng });
              reverseGeocode(p.lat, p.lng);
            }
          },
        }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">Seleccionar ubicación</h2>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-4 space-y-3 flex-1 overflow-y-auto">
          <div className="flex gap-2">
            <input className={inputCls} value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), buscarEnMapa())}
              placeholder="Dirección para buscar..." />
            <button type="button" onClick={buscarEnMapa} disabled={buscando}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition whitespace-nowrap disabled:bg-blue-300">
              {buscando ? 'Buscando...' : 'Buscar'}
            </button>
          </div>

          {dirResultado && (
            <p className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 truncate">{dirResultado}</p>
          )}

          <div className="rounded-lg overflow-hidden border border-slate-200" style={{ height: 350 }}>
            {MC ? (
              <MC.MapContainer center={[pos.lat, pos.lng]} zoom={15}
                style={{ height: '100%', width: '100%' }} key={`${pos.lat}-${pos.lng}`}>
                <MC.TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <DraggableMarker />
                <MapClickHandler />
              </MC.MapContainer>
            ) : (
              <div className="h-full flex items-center justify-center bg-slate-100">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-50 rounded-lg px-3 py-2">
              <span className="text-slate-400">Lat:</span> <span className="font-mono text-slate-700">{pos.lat.toFixed(6)}</span>
            </div>
            <div className="bg-slate-50 rounded-lg px-3 py-2">
              <span className="text-slate-400">Lng:</span> <span className="font-mono text-slate-700">{pos.lng.toFixed(6)}</span>
            </div>
          </div>
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-slate-100">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600 transition">
            Cancelar
          </button>
          <button type="button"
            onClick={() => onSave({ lat: pos.lat, lng: pos.lng, direccion_mapa: dirResultado })}
            className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition">
            Confirmar ubicación
          </button>
        </div>
      </div>
    </div>
  );
}
