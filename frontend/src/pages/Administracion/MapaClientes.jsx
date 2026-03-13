import { useState, useEffect, useRef, useMemo } from 'react';
import Layout from '../../components/Layout';
import { listarClientes } from '../../services/clientesService';

/* ── Lazy Leaflet ── */
let _rl = null;
async function getLeaflet() {
  if (_rl) return _rl;
  const [RL, RC] = await Promise.all([
    import('react-leaflet'),
    import('leaflet/dist/leaflet.css'),
  ]);
  // Fix default icon
  const L = await import('leaflet');
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
  _rl = RL;
  return _rl;
}

export default function MapaClientes() {
  const [ready, setReady]       = useState(!!_rl);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filtro, setFiltro]     = useState('con_coords'); // 'con_coords' | 'sin_coords' | 'todos'
  const [search, setSearch]     = useState('');
  const mapRef = useRef(null);

  useEffect(() => {
    if (!_rl) getLeaflet().then(() => setReady(true));
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await listarClientes({ limit: 9999 });
        setClientes(res.data || []);
      } catch { /* silenciar */ }
      setLoading(false);
    })();
  }, []);

  const conCoords = useMemo(() => clientes.filter(c => c.latitud && c.longitud), [clientes]);
  const sinCoords = useMemo(() => clientes.filter(c => !c.latitud || !c.longitud), [clientes]);

  const listaFiltrada = useMemo(() => {
    let lista = filtro === 'con_coords' ? conCoords : filtro === 'sin_coords' ? sinCoords : clientes;
    if (search.trim()) {
      const q = search.toLowerCase();
      lista = lista.filter(c =>
        c.nombre?.toLowerCase().includes(q) ||
        c.direccion?.toLowerCase().includes(q) ||
        c.telefono?.includes(q)
      );
    }
    return lista;
  }, [filtro, conCoords, sinCoords, clientes, search]);

  const pct = clientes.length > 0 ? Math.round((conCoords.length / clientes.length) * 100) : 0;

  function centrarEn(c) {
    if (!mapRef.current || !c.latitud || !c.longitud) return;
    mapRef.current.setView([Number(c.latitud), Number(c.longitud)], 17, { animate: true });
  }

  return (
    <Layout>
      <div className="mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Mapa de Clientes</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Ubicaciones guardadas desde los pedidos — el sistema aprende con cada entrega
        </p>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">Total clientes</p>
          <p className="text-2xl font-bold text-slate-800 mt-1">{clientes.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-emerald-200 p-4">
          <p className="text-[11px] uppercase tracking-wider text-emerald-500 font-semibold">Con ubicacion</p>
          <p className="text-2xl font-bold text-emerald-600 mt-1">{conCoords.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-amber-200 p-4">
          <p className="text-[11px] uppercase tracking-wider text-amber-500 font-semibold">Sin ubicacion</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{sinCoords.length}</p>
        </div>
        <div className="bg-white rounded-xl border border-blue-200 p-4">
          <p className="text-[11px] uppercase tracking-wider text-blue-500 font-semibold">% Aprendido</p>
          <div className="flex items-end gap-2 mt-1">
            <p className="text-2xl font-bold text-blue-600">{pct}%</p>
            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden mb-1.5">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Map */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden mb-5">
        <div className="h-[400px] sm:h-[500px]">
          {!ready || loading ? (
            <div className="flex items-center justify-center h-full bg-slate-50">
              <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="ml-2 text-sm text-slate-400">Cargando mapa...</span>
            </div>
          ) : (
            <MapaConClientes clientes={conCoords} mapRef={mapRef} />
          )}
        </div>
      </div>

      {/* Filters + Table */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          {/* Filtro */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-0.5">
            {[
              { key: 'con_coords', label: 'Con ubicacion', count: conCoords.length },
              { key: 'sin_coords', label: 'Sin ubicacion', count: sinCoords.length },
              { key: 'todos',      label: 'Todos',         count: clientes.length },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFiltro(f.key)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${
                  filtro === f.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {f.label} <span className="text-slate-400">({f.count})</span>
              </button>
            ))}
          </div>
          {/* Search */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="Buscar cliente..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left py-2 px-3 text-xs font-semibold text-slate-400 uppercase">Cliente</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-slate-400 uppercase hidden sm:table-cell">Direccion</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-slate-400 uppercase hidden md:table-cell">Telefono</th>
                <th className="text-center py-2 px-3 text-xs font-semibold text-slate-400 uppercase">GPS</th>
                <th className="text-center py-2 px-3 text-xs font-semibold text-slate-400 uppercase">Accion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {listaFiltrada.length === 0 ? (
                <tr>
                  <td colSpan="5" className="text-center py-8 text-slate-400 text-sm">
                    {loading ? 'Cargando...' : 'Sin resultados'}
                  </td>
                </tr>
              ) : (
                listaFiltrada.slice(0, 100).map(c => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="py-2 px-3">
                      <p className="font-medium text-slate-800">{c.nombre}</p>
                      <p className="text-xs text-slate-400 sm:hidden">{c.direccion || '—'}</p>
                    </td>
                    <td className="py-2 px-3 text-slate-600 hidden sm:table-cell">{c.direccion || '—'}</td>
                    <td className="py-2 px-3 text-slate-600 hidden md:table-cell">{c.telefono || '—'}</td>
                    <td className="py-2 px-3 text-center">
                      {c.latitud && c.longitud ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                          Si
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                          No
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-center">
                      {c.latitud && c.longitud ? (
                        <button
                          onClick={() => centrarEn(c)}
                          className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Ver en mapa
                        </button>
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
          {listaFiltrada.length > 100 && (
            <p className="text-xs text-slate-400 text-center py-2">
              Mostrando 100 de {listaFiltrada.length} clientes
            </p>
          )}
        </div>
      </div>
    </Layout>
  );
}

/* ── Map sub-component ── */
function MapaConClientes({ clientes, mapRef }) {
  // Calculate bounds
  const bounds = useMemo(() => {
    if (clientes.length === 0) return null;
    const lats = clientes.map(c => Number(c.latitud));
    const lngs = clientes.map(c => Number(c.longitud));
    return [
      [Math.min(...lats) - 0.005, Math.min(...lngs) - 0.005],
      [Math.max(...lats) + 0.005, Math.max(...lngs) + 0.005],
    ];
  }, [clientes]);

  const MapRefSetter = () => {
    const map = _rl.useMap();
    useEffect(() => { mapRef.current = map; }, [map]);
    return null;
  };

  return (
    <_rl.MapContainer
      center={bounds ? [(bounds[0][0] + bounds[1][0]) / 2, (bounds[0][1] + bounds[1][1]) / 2] : [-12.04, -77.04]}
      zoom={bounds ? undefined : 12}
      bounds={bounds || undefined}
      style={{ height: '100%', width: '100%' }}
    >
      <_rl.TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapRefSetter />
      {clientes.map(c => (
        <_rl.Marker
          key={c.id}
          position={[Number(c.latitud), Number(c.longitud)]}
        >
          <_rl.Popup>
            <div className="text-xs">
              <p className="font-bold text-slate-800">{c.nombre}</p>
              {c.direccion && <p className="text-slate-500 mt-0.5">{c.direccion}</p>}
              {c.telefono && <p className="text-slate-500">{c.telefono}</p>}
              <p className="text-[10px] text-slate-400 font-mono mt-1">
                {Number(c.latitud).toFixed(6)}, {Number(c.longitud).toFixed(6)}
              </p>
            </div>
          </_rl.Popup>
        </_rl.Marker>
      ))}
    </_rl.MapContainer>
  );
}
