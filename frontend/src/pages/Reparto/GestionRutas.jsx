import { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import {
  listarRutas, crearRuta, salirRuta, cargarVehiculo, obtenerRuta,
} from '../../services/rutasService';
import { listarVehiculos } from '../../services/vehiculosService';
import { listarRepartidores } from '../../services/pedidosService';
import { listarPresentaciones } from '../../services/presentacionesService';
import MapaPedidos from '../../components/Mapa/MapaPedidos';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const ESTADO_BADGE = {
  preparando: 'bg-yellow-100 text-yellow-700',
  en_ruta:    'bg-blue-100 text-blue-700',
  regresando: 'bg-orange-100 text-orange-700',
  finalizada: 'bg-green-100 text-green-700',
};
const ESTADO_LABEL = {
  preparando: 'Preparando', en_ruta: 'En ruta',
  regresando: 'Regresando', finalizada: 'Finalizada',
};

/* ═══ Modal Nueva Ruta ═══ */
function NuevaRutaModal({ isOpen, onClose, onSaved }) {
  const [repartidores, setRepartidores] = useState([]);
  const [vehiculos, setVehiculos]       = useState([]);
  const [repartidorId, setRepartidorId] = useState('');
  const [vehiculoId, setVehiculoId]     = useState('');
  const [fecha, setFecha]               = useState(today());
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');

  useEffect(() => {
    if (isOpen) {
      setRepartidorId(''); setVehiculoId(''); setFecha(today()); setError('');
      listarRepartidores().then(r => setRepartidores(r.data || [])).catch(() => {});
      listarVehiculos().then(r => setVehiculos(r.data || [])).catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!repartidorId || !vehiculoId) return setError('Selecciona repartidor y vehículo');
    setLoading(true); setError('');
    try {
      await crearRuta({ repartidor_id: Number(repartidorId), vehiculo_id: Number(vehiculoId), fecha });
      onSaved(); onClose();
    } catch (err) { setError(err.response?.data?.error || 'Error al crear ruta'); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">Nueva ruta</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Repartidor</label>
            <select className={inputCls} value={repartidorId} onChange={e => setRepartidorId(e.target.value)} required>
              <option value="">Seleccionar...</option>
              {repartidores.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Vehículo</label>
            <select className={inputCls} value={vehiculoId} onChange={e => setVehiculoId(e.target.value)} required>
              <option value="">Seleccionar...</option>
              {vehiculos.map(v => <option key={v.id} value={v.id}>{v.placa} {v.marca ? `- ${v.marca} ${v.modelo || ''}` : ''}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Fecha</label>
            <input type="date" className={inputCls} value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600">Cancelar</button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition">
              {loading ? 'Creando...' : 'Crear ruta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ═══ Modal Cargar Vehículo ═══ */
function CargarModal({ isOpen, onClose, rutaId, onSaved }) {
  const [presentaciones, setPresentaciones] = useState([]);
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (isOpen) {
      setItems([]); setError('');
      listarPresentaciones({ activo: 1, limit: 100 })
        .then(r => {
          const pres = Array.isArray(r.data) ? r.data : [];
          setPresentaciones(pres);
          setItems(pres.map(p => ({ presentacion_id: p.id, nombre: p.nombre, cantidad: 0, stock: p.stock_llenos })));
        }).catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  function updateItem(idx, val) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, cantidad: Math.max(0, Number(val) || 0) } : it));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const toLoad = items.filter(i => i.cantidad > 0);
    if (toLoad.length === 0) return setError('Agrega al menos un producto para cargar');
    setLoading(true); setError('');
    try {
      await cargarVehiculo(rutaId, { items: toLoad.map(i => ({ presentacion_id: i.presentacion_id, cantidad: i.cantidad })) });
      onSaved(); onClose();
    } catch (err) { setError(err.response?.data?.error || 'Error al cargar vehículo'); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-base font-semibold text-slate-800">Cargar vehículo</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
          <p className="text-xs text-slate-400">Ingresa la cantidad de llenos a cargar por presentación</p>
          {items.map((it, idx) => (
            <div key={it.presentacion_id} className="flex items-center gap-3">
              <span className="text-sm text-slate-700 flex-1">{it.nombre}</span>
              <span className="text-xs text-slate-400">Stock: {it.stock}</span>
              <input type="number" min="0" max={it.stock} className={`${inputCls} w-24 text-center`}
                value={it.cantidad || ''} onChange={e => updateItem(idx, e.target.value)} placeholder="0" />
            </div>
          ))}
        </form>
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
          <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600">Cancelar</button>
          <button type="button" onClick={handleSubmit} disabled={loading}
            className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition">
            {loading ? 'Cargando...' : 'Confirmar carga'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ═══ Detalle Ruta Panel ═══ */
function DetalleRuta({ ruta, onBack, onRefresh }) {
  const [detalle, setDetalle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cargarOpen, setCargarOpen] = useState(false);
  const [tab, setTab] = useState('pedidos');

  const fetchDetalle = useCallback(async () => {
    setLoading(true);
    try {
      const data = await obtenerRuta(ruta.id);
      setDetalle(data);
    } catch { /* ignore */ }
    setLoading(false);
  }, [ruta.id]);

  useEffect(() => { fetchDetalle(); }, [fetchDetalle]);

  if (loading || !detalle) {
    return <div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;
  }

  async function handleSalir() {
    if (!window.confirm('¿Iniciar la ruta? El repartidor saldrá a repartir.')) return;
    try {
      await salirRuta(ruta.id);
      fetchDetalle(); onRefresh();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 mb-4">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        Volver a rutas
      </button>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{detalle.numero}</h2>
            <p className="text-sm text-slate-500">{detalle.repartidor_nombre} · {detalle.vehiculo_placa}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3 py-1 rounded-full text-xs font-medium ${ESTADO_BADGE[detalle.estado] || ''}`}>
              {ESTADO_LABEL[detalle.estado] || detalle.estado}
            </span>
            {detalle.estado === 'preparando' && (
              <>
                <button onClick={() => setCargarOpen(true)}
                  className="px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition">
                  Cargar vehículo
                </button>
                <button onClick={handleSalir}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition">
                  Iniciar ruta
                </button>
              </>
            )}
          </div>
        </div>

        {/* Stock del vehículo */}
        {detalle.stock && detalle.stock.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Stock del vehículo</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {detalle.stock.map(s => (
                <div key={s.id} className="bg-slate-50 rounded-lg px-3 py-2 text-sm">
                  <p className="font-medium text-slate-700">{s.presentacion_nombre}</p>
                  <div className="flex gap-3 text-xs text-slate-500 mt-1">
                    <span>Cargados: {s.llenos_cargados}</span>
                    <span>Entregados: {s.llenos_entregados}</span>
                    <span className="font-medium text-slate-700">Disponible: {s.llenos_cargados - s.llenos_entregados}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Caja resumen */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-green-50 rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-green-600">Cobrado</p>
            <p className="text-lg font-bold text-green-700">S/ {Number(detalle.total_cobrado || 0).toFixed(2)}</p>
          </div>
          <div className="bg-red-50 rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-red-600">Gastos</p>
            <p className="text-lg font-bold text-red-700">S/ {Number(detalle.total_gastos || 0).toFixed(2)}</p>
          </div>
          <div className="bg-blue-50 rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-blue-600">Neto</p>
            <p className="text-lg font-bold text-blue-700">S/ {Number(detalle.neto_a_entregar || 0).toFixed(2)}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 rounded-xl p-1 w-fit">
        {['pedidos', 'mapa'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition capitalize ${
              tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === 'pedidos' ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {['#', 'Folio', 'Cliente', 'Productos', 'Estado'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-left">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(detalle.pedidos || []).length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">Sin pedidos asignados</td></tr>
              ) : detalle.pedidos.map(p => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-400">{p.orden_entrega}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">{p.numero}</span></td>
                  <td className="px-4 py-3 font-medium text-slate-800">{p.cliente_nombre}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{p.productos_resumen || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGE[p.estado] || ''}`}>
                      {ESTADO_LABEL[p.estado] || p.estado}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <MapaPedidos pedidos={(detalle.pedidos || []).map(p => ({
          ...p, lat: p.latitud || p.cliente_lat, lng: p.longitud || p.cliente_lng,
          direccion: p.cliente_direccion,
        }))} />
      )}

      <CargarModal isOpen={cargarOpen} onClose={() => setCargarOpen(false)} rutaId={ruta.id}
        onSaved={() => { fetchDetalle(); onRefresh(); }} />
    </div>
  );
}

/* ═══ Página principal ═══ */
export default function GestionRutas() {
  const [rutas, setRutas]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [fechaIni, setFechaIni] = useState(today());
  const [fechaFin, setFechaFin] = useState(today());
  const [modalOpen, setModalOpen] = useState(false);
  const [selected, setSelected]   = useState(null);

  const fetchRutas = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listarRutas({
        fecha_inicio: fechaIni || undefined,
        fecha_fin: fechaFin || undefined,
      });
      setRutas(Array.isArray(res.data) ? res.data : []);
    } catch { setRutas([]); }
    setLoading(false);
  }, [fechaIni, fechaFin]);

  useEffect(() => { fetchRutas(); }, [fetchRutas]);

  // Auto-refrescar al volver a la pestaña
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') fetchRutas();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [fetchRutas]);

  function setRango(ini, fin) { setFechaIni(ini); setFechaFin(fin); }
  const hoy = today();
  const hace7 = (() => { const d = new Date(); d.setDate(d.getDate() - 6); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  const inicioMes = hoy.slice(0, 8) + '01';

  if (selected) {
    return (
      <Layout>
        <DetalleRuta ruta={selected} onBack={() => setSelected(null)} onRefresh={fetchRutas} />
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Gestión de Rutas</h1>
        <p className="text-sm text-slate-500 mt-0.5">Crear rutas, cargar vehículos y gestionar entregas</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
        <button onClick={() => setRango(hoy, hoy)}
          className={`px-3 py-2 text-xs border rounded-lg transition ${fechaIni === hoy && fechaFin === hoy ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-slate-300 hover:bg-slate-50 text-slate-600'}`}>Hoy</button>
        <button onClick={() => setRango(hace7, hoy)}
          className={`px-3 py-2 text-xs border rounded-lg transition ${fechaIni === hace7 && fechaFin === hoy ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-slate-300 hover:bg-slate-50 text-slate-600'}`}>7 dias</button>
        <button onClick={() => setRango(inicioMes, hoy)}
          className={`px-3 py-2 text-xs border rounded-lg transition ${fechaIni === inicioMes && fechaFin === hoy ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-slate-300 hover:bg-slate-50 text-slate-600'}`}>Mes</button>
        <button onClick={() => setRango('', '')}
          className={`px-3 py-2 text-xs border rounded-lg transition ${!fechaIni && !fechaFin ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-slate-300 hover:bg-slate-50 text-slate-600'}`}>Todas</button>
        <input type="date" value={fechaIni} onChange={e => setFechaIni(e.target.value)}
          className="px-2 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition w-[130px]" />
        <span className="text-xs text-slate-400">a</span>
        <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)}
          className="px-2 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition w-[130px]" />
        <div className="ml-auto">
          <button onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Nueva ruta
          </button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse">
              <div className="h-5 bg-slate-100 rounded w-24 mb-3" />
              <div className="h-4 bg-slate-100 rounded w-40 mb-2" />
              <div className="h-4 bg-slate-100 rounded w-32" />
            </div>
          ))
        ) : rutas.length === 0 ? (
          <div className="col-span-full text-center py-12 text-slate-400">No hay rutas para esta fecha</div>
        ) : rutas.map(r => (
          <div key={r.id} onClick={() => setSelected(r)}
            className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:border-blue-300 hover:shadow-md transition cursor-pointer">
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold text-slate-800">{r.numero}</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGE[r.estado] || ''}`}>
                {ESTADO_LABEL[r.estado] || r.estado}
              </span>
            </div>
            <p className="text-sm text-slate-600">{r.repartidor_nombre}</p>
            <p className="text-xs text-slate-400">{r.vehiculo_placa} {r.vehiculo_marca || ''}</p>
            {(() => {
              const entr = Number(r.pedidos_entregados) || 0;
              const total = Number(r.total_pedidos) || 0;
              const noEntr = Number(r.pedidos_no_entregados) || 0;
              const porAtender = total - entr - noEntr;
              const pct = total > 0 ? Math.round(entr / total * 100) : 0;
              return (
                <>
                  <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                    <span className="font-semibold text-slate-700">{entr}/{total} entregas</span>
                    {porAtender > 0 && (
                      <span className="text-amber-600">{porAtender} por atender</span>
                    )}
                    {noEntr > 0 && (
                      <span className="text-red-500">{noEntr} no entr.</span>
                    )}
                    <span className="ml-auto font-medium text-green-600">S/ {Number(r.total_cobrado || 0).toFixed(2)}</span>
                  </div>
                  {total > 0 && (
                    <div className="mt-2">
                      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${
                          entr === total ? 'bg-emerald-500' : 'bg-gradient-to-r from-blue-500 to-blue-400'
                        }`}
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
            {Number(r.km_diferencia_inicio) > 0 && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 rounded-lg px-2.5 py-1">
                <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                +{Number(r.km_diferencia_inicio).toLocaleString()} km uso externo
              </div>
            )}
          </div>
        ))}
      </div>

      <NuevaRutaModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSaved={fetchRutas} />
    </Layout>
  );
}
