import { useCallback, useEffect, useRef, useState } from 'react';
import Layout from '../../components/Layout';
import {
  listarPedidos, cambiarEstado, dataMapa, listarRepartidores, asignarRepartidor,
} from '../../services/pedidosService';
import FormPedido from './FormPedido';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const ESTADO_BADGE = {
  pendiente:     'bg-yellow-100 text-yellow-700',
  en_camino:     'bg-blue-100 text-blue-700',
  entregado:     'bg-green-100 text-green-700',
  no_entregado:  'bg-red-100 text-red-700',
  reasignado:    'bg-slate-100 text-slate-500',
};

const ESTADO_LABEL = {
  pendiente: 'Pendiente', en_camino: 'En camino', entregado: 'Entregado',
  no_entregado: 'No entregado', reasignado: 'Reasignado',
};

/* ═══ Tab Lista ═══ */
function TabLista({ onSaved }) {
  const [pedidos, setPedidos]       = useState([]);
  const [total, setTotal]           = useState(0);
  const [pages, setPages]           = useState(1);
  const [page, setPage]             = useState(1);
  const [loading, setLoading]       = useState(true);
  const [fechaIni, setFechaIni]     = useState(today());
  const [fechaFin, setFechaFin]     = useState(today());
  const [repartidores, setRepartidores] = useState([]);
  const [filtroRep, setFiltroRep]   = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [modalOpen, setModalOpen]   = useState(false);

  useEffect(() => {
    listarRepartidores().then(r => setRepartidores(r.data || [])).catch(() => {});
  }, []);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listarPedidos({
        fecha_inicio: fechaIni || undefined,
        fecha_fin: fechaFin || undefined,
        repartidor_id: filtroRep || undefined,
        estado: filtroEstado || undefined,
        page, limit: 30,
      });
      setPedidos(Array.isArray(res.data) ? res.data : []);
      setTotal(res.total ?? 0);
      setPages(res.pages ?? 1);
    } catch { setPedidos([]); }
    finally { setLoading(false); }
  }, [fechaIni, fechaFin, filtroRep, filtroEstado, page]);

  useEffect(() => { fetch(); }, [fetch]);

  async function handleEstado(pedido, nuevoEstado) {
    const label = ESTADO_LABEL[nuevoEstado] || nuevoEstado;
    if (!window.confirm(`¿Cambiar estado a "${label}"?`)) return;
    try {
      await cambiarEstado(pedido.id, { estado: nuevoEstado });
      fetch();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  async function handleAsignarRepartidor(pedidoId, repId) {
    try {
      await asignarRepartidor(pedidoId, { repartidor_id: repId || null });
      fetch();
    } catch (err) { alert(err.response?.data?.error || 'Error al asignar repartidor'); }
  }

  function setRango(ini, fin) { setFechaIni(ini); setFechaFin(fin); setPage(1); }
  const hoy = today();
  const hace7 = (() => { const d = new Date(); d.setDate(d.getDate() - 6); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  const inicioMes = hoy.slice(0, 8) + '01';

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
        <button onClick={() => setRango(hoy, hoy)}
          className={`px-3 py-2 text-xs border rounded-lg transition ${fechaIni === hoy && fechaFin === hoy ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-slate-300 hover:bg-slate-50 text-slate-600'}`}>Hoy</button>
        <button onClick={() => setRango(hace7, hoy)}
          className={`px-3 py-2 text-xs border rounded-lg transition ${fechaIni === hace7 && fechaFin === hoy ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-slate-300 hover:bg-slate-50 text-slate-600'}`}>7 dias</button>
        <button onClick={() => setRango(inicioMes, hoy)}
          className={`px-3 py-2 text-xs border rounded-lg transition ${fechaIni === inicioMes && fechaFin === hoy ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-slate-300 hover:bg-slate-50 text-slate-600'}`}>Mes</button>
        <button onClick={() => setRango('', '')}
          className={`px-3 py-2 text-xs border rounded-lg transition ${!fechaIni && !fechaFin ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-slate-300 hover:bg-slate-50 text-slate-600'}`}>Todas</button>
        <input type="date" value={fechaIni} onChange={e => { setFechaIni(e.target.value); setPage(1); }}
          className="px-2 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition w-[130px]" />
        <span className="text-xs text-slate-400">a</span>
        <input type="date" value={fechaFin} onChange={e => { setFechaFin(e.target.value); setPage(1); }}
          className="px-2 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition w-[130px]" />
        <select value={filtroRep} onChange={e => { setFiltroRep(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition">
          <option value="">Todos los repartidores</option>
          {repartidores.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
        <select value={filtroEstado} onChange={e => { setFiltroEstado(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>

        <div className="ml-auto">
          <button onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Nuevo pedido
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                {['#', 'Folio', 'Cliente', 'Dirección', 'Repartidor', 'Productos', 'Estado', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 animate-pulse rounded" style={{ width: '80px' }} /></td>
                  ))}</tr>
                ))
              ) : pedidos.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-12 text-center text-slate-400">No hay pedidos</td></tr>
              ) : pedidos.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-400 tabular-nums">{p.orden_entrega}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">{p.numero}</span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{p.cliente_nombre}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs max-w-[200px] truncate">
                    {p.direccion_entrega || p.cliente_direccion || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.estado === 'pendiente' ? (
                      <select
                        value={p.repartidor_id_resuelto || p.repartidor_id || ''}
                        onChange={e => handleAsignarRepartidor(p.id, e.target.value)}
                        className="px-2 py-1 text-xs border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-white"
                      >
                        <option value="">Sin asignar</option>
                        {repartidores.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
                      </select>
                    ) : (
                      p.repartidor_nombre || <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 max-w-[200px] truncate">{p.productos_resumen || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGE[p.estado] || ''}`}>
                      {ESTADO_LABEL[p.estado] || p.estado}
                    </span>
                    {p.estado === 'no_entregado' && p.notas_repartidor && (
                      <p className="text-[11px] text-red-500 mt-0.5 truncate max-w-[180px]" title={p.notas_repartidor}>
                        {p.notas_repartidor}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      {p.estado === 'pendiente' && (
                        <button onClick={() => handleEstado(p, 'en_camino')}
                          className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-lg transition font-medium">
                          En camino
                        </button>
                      )}
                      {p.estado === 'en_camino' && (
                        <>
                          <button onClick={() => handleEstado(p, 'entregado')}
                            className="px-2 py-1 text-xs text-green-600 hover:bg-green-50 border border-green-200 rounded-lg transition font-medium">
                            Entregado
                          </button>
                          <button onClick={() => handleEstado(p, 'no_entregado')}
                            className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition font-medium">
                            No entregado
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">Página {page} de {pages} &middot; {total} pedido{total !== 1 ? 's' : ''}</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">Anterior</button>
              <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">Siguiente</button>
            </div>
          </div>
        )}
      </div>

      <FormPedido isOpen={modalOpen} onClose={() => setModalOpen(false)}
        onSaved={() => { fetch(); onSaved(); }} />
    </>
  );
}

/* ═══ Tab Mapa ═══ */
function TabMapa() {
  const [puntos, setPuntos]         = useState([]);
  const [loading, setLoading]       = useState(true);
  const [fecha, setFecha]           = useState(today());
  const [repartidores, setRepartidores] = useState([]);
  const [filtroRep, setFiltroRep]   = useState('');
  const [MapComponents, setMapComponents] = useState(null);
  const mapRef = useRef(null);

  // Lazy load react-leaflet
  useEffect(() => {
    Promise.all([
      import('react-leaflet'),
      import('leaflet'),
    ]).then(([rl, L]) => {
      // Fix default marker icons
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
      setMapComponents({ ...rl, L });
    });
  }, []);

  useEffect(() => {
    listarRepartidores().then(r => setRepartidores(r.data || [])).catch(() => {});
  }, []);

  const fetchMapa = useCallback(async () => {
    setLoading(true);
    try {
      const res = await dataMapa({ fecha: fecha || today(), repartidor_id: filtroRep || undefined });
      setPuntos(Array.isArray(res.data) ? res.data : []);
    } catch { setPuntos([]); }
    finally { setLoading(false); }
  }, [fecha, filtroRep]);

  useEffect(() => { fetchMapa(); }, [fetchMapa]);

  const puntosConCoords = puntos.filter(p => p.lat && p.lng);

  const ESTADO_COLOR = {
    pendiente:    '#eab308',
    en_camino:    '#3b82f6',
    entregado:    '#22c55e',
    no_entregado: '#ef4444',
  };

  function createIcon(estado, orden) {
    if (!MapComponents) return null;
    const color = ESTADO_COLOR[estado] || '#6b7280';
    return new MapComponents.L.DivIcon({
      className: '',
      html: `<div style="
        background:${color}; color:white; width:28px; height:28px;
        border-radius:50%; display:flex; align-items:center; justify-content:center;
        font-size:12px; font-weight:700; border:2px solid white;
        box-shadow:0 2px 4px rgba(0,0,0,0.3);
      ">${orden}</div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400">Fecha</span>
          <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
        </div>
        <select value={filtroRep} onChange={e => setFiltroRep(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition">
          <option value="">Todos los repartidores</option>
          {repartidores.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
        </select>
        <button onClick={() => setFecha(today())}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">Hoy</button>

        {/* Leyenda */}
        <div className="ml-auto flex items-center gap-3">
          {Object.entries(ESTADO_COLOR).map(([estado, color]) => (
            <div key={estado} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-full" style={{ background: color }} />
              <span className="text-xs text-slate-500">{ESTADO_LABEL[estado]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden" style={{ height: 'calc(100vh - 260px)' }}>
        {!MapComponents ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : puntosConCoords.length === 0 ? (
          <div className="flex items-center justify-center h-full text-slate-400">
            <div className="text-center">
              <svg className="w-12 h-12 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              <p className="text-sm">No hay pedidos con coordenadas para esta fecha</p>
              <p className="text-xs mt-1">Asigna coordenadas a los clientes o pedidos</p>
            </div>
          </div>
        ) : (
          <MapComponents.MapContainer
            ref={mapRef}
            center={[Number(puntosConCoords[0].lat), Number(puntosConCoords[0].lng)]}
            zoom={13}
            style={{ height: '100%', width: '100%' }}
          >
            <MapComponents.TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Línea de ruta */}
            {puntosConCoords.length > 1 && (
              <MapComponents.Polyline
                positions={puntosConCoords.map(p => [Number(p.lat), Number(p.lng)])}
                color="#3b82f6"
                weight={2}
                opacity={0.5}
                dashArray="8 4"
              />
            )}

            {/* Markers */}
            {puntosConCoords.map(p => (
              <MapComponents.Marker
                key={p.id}
                position={[Number(p.lat), Number(p.lng)]}
                icon={createIcon(p.estado, p.orden_entrega)}
              >
                <MapComponents.Popup>
                  <div className="min-w-[200px]">
                    <p className="font-semibold text-sm">{p.orden_entrega}. {p.cliente_nombre}</p>
                    <p className="text-xs text-gray-500 mt-1">{p.direccion || 'Sin dirección'}</p>
                    {p.cliente_telefono && <p className="text-xs text-gray-500">Tel: {p.cliente_telefono}</p>}
                    {p.productos_resumen && <p className="text-xs text-gray-600 mt-1 font-medium">{p.productos_resumen}</p>}
                    {p.notas_encargada && <p className="text-xs text-gray-400 mt-1 italic">{p.notas_encargada}</p>}
                    <p className="text-xs mt-1">
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${ESTADO_BADGE[p.estado] || ''}`}>
                        {ESTADO_LABEL[p.estado] || p.estado}
                      </span>
                    </p>
                    {p.repartidor_nombre && <p className="text-xs text-gray-500 mt-1">Repartidor: {p.repartidor_nombre}</p>}
                  </div>
                </MapComponents.Popup>
              </MapComponents.Marker>
            ))}
          </MapComponents.MapContainer>
        )}
      </div>

      {!loading && (
        <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
          <span>{puntos.length} pedido{puntos.length !== 1 ? 's' : ''} total</span>
          <span>{puntosConCoords.length} con coordenadas</span>
          {puntos.length > puntosConCoords.length && (
            <span className="text-amber-600">{puntos.length - puntosConCoords.length} sin ubicación</span>
          )}
        </div>
      )}
    </>
  );
}

/* ═══ Página principal ═══ */
export default function Pedidos() {
  const [tab, setTab] = useState('lista');
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <Layout>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Pedidos</h1>
        <p className="text-sm text-slate-500 mt-0.5">Gestión de pedidos de reparto y mapa de entregas</p>
      </div>

      <div className="flex gap-1 mb-5 bg-slate-100 rounded-xl p-1 w-fit">
        <button onClick={() => setTab('lista')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
            tab === 'lista' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}>
          Lista
        </button>
        <button onClick={() => setTab('mapa')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
            tab === 'mapa' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}>
          Mapa
        </button>
      </div>

      {tab === 'lista'
        ? <TabLista key={refreshKey} onSaved={() => setRefreshKey(k => k + 1)} />
        : <TabMapa key={refreshKey} />
      }
    </Layout>
  );
}
