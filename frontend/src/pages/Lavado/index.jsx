import { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { obtenerPendientes, listarLavados, registrarLavado, listarIngresosVacios } from '../../services/lavadosService';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function formatN(n) { return Number(n ?? 0).toFixed(2); }

/* ── Modal Registrar Lavado ── */
function LavadoModal({ isOpen, onClose, onSaved, pendiente }) {
  const [cantidad, setCantidad] = useState('');
  const [notas, setNotas]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    if (isOpen) { setCantidad(''); setNotas(''); setError(''); }
  }, [isOpen]);

  if (!isOpen || !pendiente) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!cantidad || Number(cantidad) <= 0) return setError('La cantidad debe ser mayor a 0');
    setError(''); setLoading(true);
    try {
      await registrarLavado({
        insumo_id: pendiente.insumo_id || undefined,
        presentacion_id: pendiente.presentacion_id,
        cantidad: Number(cantidad),
        notas: notas.trim() || null,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrar lavado');
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Registrar lavado</h2>
            <p className="text-xs text-slate-400">{pendiente.insumo_nombre ?? pendiente.presentacion_nombre} · pendientes: {formatN(pendiente.cantidad_pendiente)}</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Cantidad a lavar</label>
            <input type="number" min="1" step="1" required className={inputCls} value={cantidad}
              onChange={e => setCantidad(e.target.value)} autoFocus placeholder="0" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notas (opcional)</label>
            <input className={inputCls} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones…" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">Cancelar</button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition">
              {loading ? 'Registrando…' : 'Registrar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Filtros de fecha reutilizables ── */
function FiltrosFecha({ fechaIni, setFechaIni, fechaFin, setFechaFin, onReset }) {
  return (
    <div className="flex flex-wrap gap-3 mb-4">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-slate-400">Desde</span>
        <input type="date" value={fechaIni} onChange={e => { setFechaIni(e.target.value); onReset?.(); }}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
        <span className="text-xs text-slate-400">Hasta</span>
        <input type="date" value={fechaFin} onChange={e => { setFechaFin(e.target.value); onReset?.(); }}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
      </div>
      <button onClick={() => { setFechaIni(today()); setFechaFin(today()); onReset?.(); }}
        className="px-3 py-2 text-xs border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">Hoy</button>
      <button onClick={() => {
          const d = new Date(); d.setDate(d.getDate() - 6);
          setFechaIni(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
          setFechaFin(today()); onReset?.();
        }}
        className="px-3 py-2 text-xs border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">7 días</button>
      <button onClick={() => {
          const d = new Date();
          setFechaIni(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`);
          setFechaFin(today()); onReset?.();
        }}
        className="px-3 py-2 text-xs border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">Mes</button>
      <button onClick={() => { setFechaIni(''); setFechaFin(''); onReset?.(); }}
        className={`px-3 py-2 text-xs border rounded-lg transition ${!fechaIni && !fechaFin ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-slate-300 hover:bg-slate-50 text-slate-600'}`}>Todos</button>
    </div>
  );
}

/* ── Paginación reutilizable ── */
function Paginacion({ page, pages, setPage }) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-white">
      <p className="text-xs text-slate-500">Página {page} de {pages}</p>
      <div className="flex gap-2">
        <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
          className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">Anterior</button>
        <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
          className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">Siguiente</button>
      </div>
    </div>
  );
}

const origenBadge = {
  visita_planta:      { label: 'Visita planta', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  finalizacion_ruta:  { label: 'Fin de ruta',   cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  devolucion_cliente: { label: 'Dev. cliente',  cls: 'bg-green-50 text-green-700 border-green-200' },
};

/* ── Página principal ── */
export default function Lavado() {
  const [pendientes, setPendientes] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [modalTarget, setModalTarget] = useState(null);

  // Tab activo
  const [tab, setTab] = useState('historial');

  // Historial state
  const [lavados, setLavados]       = useState([]);
  const [totalH, setTotalH]         = useState(0);
  const [pagesH, setPagesH]         = useState(1);
  const [pageH, setPageH]           = useState(1);
  const [fechaIniH, setFechaIniH]   = useState(today());
  const [fechaFinH, setFechaFinH]   = useState(today());
  const [loadingH, setLoadingH]     = useState(true);

  // Ingresos vacios state
  const [ingresos, setIngresos]     = useState([]);
  const [totalI, setTotalI]         = useState(0);
  const [pagesI, setPagesI]         = useState(1);
  const [pageI, setPageI]           = useState(1);
  const [fechaIniI, setFechaIniI]   = useState(today());
  const [fechaFinI, setFechaFinI]   = useState(today());
  const [loadingI, setLoadingI]     = useState(true);

  async function fetchPendientes() {
    try {
      const res = await obtenerPendientes();
      setPendientes(Array.isArray(res.data) ? res.data : []);
    } catch { setPendientes([]); }
  }

  const fetchHistorial = useCallback(async (fi, ff, p) => {
    setLoadingH(true);
    try {
      const res = await listarLavados({ fecha_inicio: fi || undefined, fecha_fin: ff || undefined, page: p, limit: 20 });
      setLavados(Array.isArray(res.data) ? res.data : []);
      setTotalH(res.total ?? 0);
      setPagesH(res.pages ?? 1);
    } catch { setLavados([]); }
    finally { setLoadingH(false); }
  }, []);

  const fetchIngresos = useCallback(async (fi, ff, p) => {
    setLoadingI(true);
    try {
      const res = await listarIngresosVacios({ fecha_inicio: fi || undefined, fecha_fin: ff || undefined, page: p, limit: 20 });
      setIngresos(Array.isArray(res.data) ? res.data : []);
      setTotalI(res.total ?? 0);
      setPagesI(res.pages ?? 1);
    } catch { setIngresos([]); }
    finally { setLoadingI(false); }
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await fetchPendientes();
      setLoading(false);
    }
    init();
  }, []);

  useEffect(() => { fetchHistorial(fechaIniH, fechaFinH, pageH); }, [fechaIniH, fechaFinH, pageH, fetchHistorial]);
  useEffect(() => { fetchIngresos(fechaIniI, fechaFinI, pageI); }, [fechaIniI, fechaFinI, pageI, fetchIngresos]);

  function onSaved() {
    fetchPendientes();
    fetchHistorial(fechaIniH, fechaFinH, 1);
    setPageH(1);
  }

  const tabCls = (t) => `px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition ${
    tab === t ? 'border-blue-600 text-blue-700 bg-white' : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
  }`;

  return (
    <Layout>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Lavado</h1>
        <p className="text-sm text-slate-500 mt-0.5">Gestión de retornables pendientes de lavado</p>
      </div>

      {/* Sección Pendientes */}
      <div className="mb-8">
        <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-3">Pendientes de lavado</h2>
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse">
                <div className="h-5 bg-slate-100 rounded w-24 mb-2" />
                <div className="h-8 bg-slate-100 rounded w-16" />
              </div>
            ))}
          </div>
        ) : pendientes.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 px-6 py-8 text-center text-slate-400 text-sm">
            No hay items pendientes de lavado
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pendientes.map((p, i) => (
              <div key={p.insumo_id ?? p.presentacion_id ?? i} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center justify-between">
                <div>
                  <p className="font-medium text-slate-800">{p.insumo_nombre ?? p.presentacion_nombre ?? 'Sin nombre'}</p>
                  <p className="text-2xl font-bold text-orange-600 tabular-nums mt-1">{formatN(p.cantidad_pendiente)}</p>
                  <p className="text-xs text-slate-400">pendientes</p>
                </div>
                <button onClick={() => setModalTarget(p)}
                  className="px-3 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition shadow-sm">
                  Registrar lavado
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 mb-4">
        <button className={tabCls('historial')} onClick={() => setTab('historial')}>Historial de lavados</button>
        <button className={tabCls('ingresos')} onClick={() => setTab('ingresos')}>Ingresos de vacíos sucios</button>
      </div>

      {/* Tab: Historial de lavados */}
      {tab === 'historial' && (
        <div>
          <FiltrosFecha fechaIni={fechaIniH} setFechaIni={setFechaIniH} fechaFin={fechaFinH} setFechaFin={setFechaFinH} onReset={() => setPageH(1)} />

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-left">
                    {['Fecha / Hora', 'Producto', 'Cantidad', 'Operario', 'Notas'].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingH ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>{Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 animate-pulse rounded" /></td>
                      ))}</tr>
                    ))
                  ) : lavados.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-12 text-center text-slate-400">No hay lavados registrados</td></tr>
                  ) : lavados.map(l => (
                    <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                        {l.fecha_hora ? new Date(l.fecha_hora).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{l.presentacion_nombre ?? l.insumo_nombre ?? `#${l.insumo_id}`}</td>
                      <td className="px-4 py-3 tabular-nums text-slate-800 font-semibold">{formatN(l.cantidad)} {l.unidad ?? ''}</td>
                      <td className="px-4 py-3 text-slate-500">{l.operario_nombre ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs truncate max-w-[200px]">{l.notas ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Paginacion page={pageH} pages={pagesH} setPage={setPageH} />
          </div>
        </div>
      )}

      {/* Tab: Ingresos de vacíos sucios */}
      {tab === 'ingresos' && (
        <div>
          <FiltrosFecha fechaIni={fechaIniI} setFechaIni={setFechaIniI} fechaFin={fechaFinI} setFechaFin={setFechaFinI} onReset={() => setPageI(1)} />

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-left">
                    {['Fecha / Hora', 'Presentación', 'Cantidad', 'Repartidor', 'Origen', 'Registrado por'].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loadingI ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 animate-pulse rounded" /></td>
                      ))}</tr>
                    ))
                  ) : ingresos.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">No hay ingresos de vacíos registrados</td></tr>
                  ) : ingresos.map(iv => {
                    const badge = origenBadge[iv.origen] || { label: iv.origen, cls: 'bg-slate-100 text-slate-600 border-slate-200' };
                    return (
                      <tr key={iv.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                          {iv.fecha_hora ? new Date(iv.fecha_hora).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                        <td className="px-4 py-3 font-medium text-slate-800">{iv.presentacion_nombre ?? '—'}</td>
                        <td className="px-4 py-3 tabular-nums text-slate-800 font-semibold">{iv.cantidad}</td>
                        <td className="px-4 py-3 text-slate-500">{iv.repartidor_nombre ?? '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full border ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{iv.registrado_por_nombre ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Paginacion page={pageI} pages={pagesI} setPage={setPageI} />
          </div>
        </div>
      )}

      <LavadoModal isOpen={!!modalTarget} onClose={() => setModalTarget(null)} onSaved={onSaved} pendiente={modalTarget} />
    </Layout>
  );
}
