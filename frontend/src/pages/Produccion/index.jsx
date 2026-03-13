import { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { listarLotes, crearLote, completarLote, rechazarLote, getReceta, verificarInsumos } from '../../services/produccionService';
import { listarPresentaciones } from '../../services/presentacionesService';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function formatN(n) { return Number(n ?? 0).toFixed(2); }

const ESTADO_BADGE = {
  en_proceso: { cls: 'bg-blue-100 text-blue-700',   label: 'En proceso' },
  completado:  { cls: 'bg-green-100 text-green-700', label: 'Completado'  },
  rechazado:   { cls: 'bg-red-100 text-red-400',     label: 'Rechazado'  },
};

const TURNO_LABEL = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' };

/* ── Modal Nuevo Lote ── */
function NuevoLoteModal({ isOpen, onClose, onSaved }) {
  const [presentaciones, setPresentaciones] = useState([]);
  const [presId,   setPresId]   = useState('');
  const [turno,    setTurno]    = useState('manana');
  const [receta,   setReceta]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    if (isOpen) {
      setPresId(''); setTurno('manana'); setReceta([]); setError('');
      listarPresentaciones({ activo: 1, es_producto_final: 0, limit: 100 })
        .then(r => setPresentaciones(Array.isArray(r.data) ? r.data : []))
        .catch(() => {});
    }
  }, [isOpen]);

  useEffect(() => {
    if (!presId) { setReceta([]); return; }
    getReceta(presId)
      .then(r => setReceta(Array.isArray(r.data) ? r.data : []))
      .catch(() => setReceta([]));
  }, [presId]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!presId) return setError('Selecciona un producto');
    setError('');
    setLoading(true);
    try {
      const lote = await crearLote({ presentacion_id: presId, turno });
      onSaved(lote);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al crear lote');
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">Iniciar lote de producción</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Producto *</label>
            <select className={inputCls} value={presId} onChange={e => setPresId(e.target.value)} required>
              <option value="">Seleccionar…</option>
              {presentaciones.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Turno</label>
            <div className="grid grid-cols-3 gap-2">
              {['manana','tarde','noche'].map(t => (
                <button key={t} type="button" onClick={() => setTurno(t)}
                  className={`py-2 rounded-xl border text-xs font-medium transition capitalize
                    ${turno === t ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>
                  {TURNO_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Receta preview */}
          {receta.length > 0 && (
            <div className="bg-slate-50 rounded-xl p-3 space-y-1.5">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Receta (por unidad)</p>
              {receta.map(r => (
                <div key={r.id} className="flex items-center justify-between text-xs">
                  <span className={r.es_opcional ? 'text-slate-400 italic' : 'text-slate-700'}>
                    {r.insumo_nombre} {r.es_opcional && '(opcional)'}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums text-slate-600">{formatN(r.cantidad)} {r.unidad}</span>
                    <span className={`text-xs ${Number(r.stock_actual) < Number(r.cantidad) ? 'text-red-500' : 'text-green-600'}`}>
                      / {formatN(r.stock_actual)} disp.
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">Cancelar</button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition">
              {loading ? 'Creando…' : 'Iniciar lote'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Modal Completar Lote ── */
function CompletarModal({ isOpen, onClose, onSaved, lote }) {
  const [cantidad, setCantidad] = useState('');
  const [notas,    setNotas]    = useState('');
  const [receta,   setReceta]   = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [verificacion, setVerificacion] = useState(null);
  const [verificando, setVerificando]   = useState(false);

  useEffect(() => {
    if (isOpen && lote) {
      setCantidad(''); setNotas(''); setError('');
      setVerificacion(null); setVerificando(false);
      getReceta(lote.presentacion_id)
        .then(r => setReceta(Array.isArray(r.data) ? r.data : []))
        .catch(() => setReceta([]));
    }
  }, [isOpen, lote]);

  if (!isOpen || !lote) return null;

  const qty = Number(cantidad) || 0;

  async function handleVerificar() {
    if (qty <= 0) return setError('Ingresa una cantidad primero');
    setVerificando(true); setError('');
    try {
      const res = await verificarInsumos({ presentacion_id: lote.presentacion_id, cantidad: qty });
      setVerificacion(res);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al verificar');
    } finally { setVerificando(false); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (qty <= 0) return setError('La cantidad debe ser mayor a 0');
    setError('');
    setLoading(true);
    try {
      const updated = await completarLote(lote.id, { cantidad_producida: qty, notas });
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al completar lote');
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Completar lote</h2>
            <p className="text-xs text-slate-400">{lote.numero} · {lote.presentacion_nombre}</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Cantidad producida *</label>
            <input type="number" min="1" step="1" required className={inputCls} value={cantidad} onChange={e => setCantidad(e.target.value)} autoFocus placeholder="0 unidades" />
          </div>

          {/* Consumo estimado */}
          {qty > 0 && receta.filter(r => !r.es_opcional).length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-1.5">
              <p className="text-xs font-semibold text-amber-700 mb-2">Insumos que se consumirán</p>
              {receta.filter(r => !r.es_opcional).map(r => {
                const necesita = Number(r.cantidad) * qty;
                const ok = Number(r.stock_actual) >= necesita;
                return (
                  <div key={r.id} className="flex items-center justify-between text-xs">
                    <span className="text-slate-700">{r.insumo_nombre}</span>
                    <span className={`tabular-nums font-medium ${ok ? 'text-slate-700' : 'text-amber-600'}`}>
                      {formatN(necesita)} {r.unidad}
                      {!ok && ` (hay ${formatN(r.stock_actual)})`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Verificación de insumos */}
          {qty > 0 && (
            <button type="button" onClick={handleVerificar} disabled={verificando}
              className="w-full py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-lg transition">
              {verificando ? 'Verificando…' : 'Verificar insumos'}
            </button>
          )}
          {verificacion?.data && (
            <div className={`rounded-xl p-3 space-y-1.5 border ${verificacion.ok ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
              <p className={`text-xs font-semibold mb-2 ${verificacion.ok ? 'text-green-700' : 'text-amber-700'}`}>
                {verificacion.ok ? 'Stock suficiente' : 'Stock bajo — se puede completar igualmente'}
              </p>
              {verificacion.data.map(item => (
                <div key={item.insumo_id} className="flex items-center justify-between text-xs">
                  <span className={item.es_opcional ? 'text-slate-400 italic' : 'text-slate-700'}>
                    {item.insumo_nombre} {item.es_opcional ? '(opc.)' : ''}
                  </span>
                  <span className={`tabular-nums font-medium ${item.suficiente ? 'text-green-700' : 'text-amber-600'}`}>
                    {formatN(item.necesita)} / {formatN(item.stock_actual)} disp.
                  </span>
                </div>
              ))}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notas (opcional)</label>
            <input className={inputCls} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones del lote…" />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">Cancelar</button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-green-400 rounded-lg transition">
              {loading ? 'Completando…' : 'Completar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Página principal ── */
export default function Produccion() {
  const [lotes,   setLotes]   = useState([]);
  const [total,   setTotal]   = useState(0);
  const [pages,   setPages]   = useState(1);
  const [page,    setPage]    = useState(1);
  const [fechaIni, setFechaIni] = useState(today());
  const [fechaFin, setFechaFin] = useState(today());
  const [estado,  setEstado]  = useState('');
  const [loading, setLoading] = useState(true);

  const [nuevoOpen,    setNuevoOpen]    = useState(false);
  const [completarTgt, setCompletarTgt] = useState(null);

  const fetchLotes = useCallback(async (fi, ff, est, p) => {
    setLoading(true);
    try {
      const res = await listarLotes({ fecha_inicio: fi || undefined, fecha_fin: ff || undefined, estado: est || undefined, page: p, limit: 20 });
      setLotes(Array.isArray(res.data) ? res.data : []);
      setTotal(res.total ?? 0);
      setPages(res.pages ?? 1);
    } catch { setLotes([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLotes(fechaIni, fechaFin, estado, page); }, [fechaIni, fechaFin, estado, page, fetchLotes]);

  function onNuevoSaved(lote) { fetchLotes(fechaIni, fechaFin, estado, 1); setPage(1); }
  function onCompletarSaved(lote) {
    setLotes(prev => prev.map(l => l.id === lote.id ? lote : l));
  }

  async function handleRechazar(lote) {
    if (!window.confirm(`¿Rechazar lote ${lote.numero}?`)) return;
    try {
      await rechazarLote(lote.id, {});
      setLotes(prev => prev.map(l => l.id === lote.id ? { ...l, estado: 'rechazado' } : l));
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Producción</h1>
          <p className="text-sm text-slate-500 mt-0.5">{loading ? '...' : `${total} lote${total !== 1 ? 's' : ''}`}</p>
        </div>
        <button onClick={() => setNuevoOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition shadow-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Nuevo lote
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400">Desde</span>
          <input type="date" value={fechaIni} onChange={e => { setFechaIni(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
          <span className="text-xs text-slate-400">Hasta</span>
          <input type="date" value={fechaFin} onChange={e => { setFechaFin(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
        </div>
        <button onClick={() => { setFechaIni(today()); setFechaFin(today()); setPage(1); }}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">Hoy</button>
        <button onClick={() => {
            const d = new Date(); d.setDate(d.getDate() - 6);
            setFechaIni(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
            setFechaFin(today()); setPage(1);
          }}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">7 días</button>
        <button onClick={() => {
            const d = new Date();
            setFechaIni(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`);
            setFechaFin(today()); setPage(1);
          }}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">Mes</button>
        <button onClick={() => { setFechaIni(''); setFechaFin(''); setPage(1); }}
          className={`px-3 py-2 text-xs border rounded-lg transition ${!fechaIni && !fechaFin ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-slate-300 hover:bg-slate-50 text-slate-600'}`}>Todos</button>
        <select value={estado} onChange={e => { setEstado(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition">
          <option value="">Todos los estados</option>
          <option value="en_proceso">En proceso</option>
          <option value="completado">Completado</option>
          <option value="rechazado">Rechazado</option>
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                {['Lote', 'Fecha', 'Producto', 'Turno', 'Cantidad', 'Estado', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 animate-pulse rounded" /></td>
                  ))}</tr>
                ))
              ) : lotes.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">No hay lotes registrados</td></tr>
              ) : lotes.map(l => {
                const badge = ESTADO_BADGE[l.estado] ?? ESTADO_BADGE.en_proceso;
                return (
                  <tr key={l.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{l.numero}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{l.fecha}</td>
                    <td className="px-4 py-3 font-medium text-slate-800">{l.presentacion_nombre}</td>
                    <td className="px-4 py-3 text-slate-500 capitalize">{TURNO_LABEL[l.turno] ?? l.turno}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-800">
                      {l.estado === 'completado' ? <span className="font-semibold text-green-700">{l.cantidad_producida}</span> : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                    </td>
                    <td className="px-4 py-3">
                      {l.estado === 'en_proceso' && (
                        <div className="flex items-center gap-1">
                          <button onClick={() => setCompletarTgt(l)}
                            className="px-2.5 py-1 text-xs font-medium bg-green-600 hover:bg-green-700 text-white rounded-lg transition">
                            Completar
                          </button>
                          <button onClick={() => handleRechazar(l)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition" title="Rechazar">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-white">
            <p className="text-xs text-slate-500">Página {page} de {pages}</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">← Anterior</button>
              <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">Siguiente →</button>
            </div>
          </div>
        )}
      </div>

      <NuevoLoteModal  isOpen={nuevoOpen}            onClose={() => setNuevoOpen(false)}       onSaved={onNuevoSaved} />
      <CompletarModal  isOpen={!!completarTgt}       onClose={() => setCompletarTgt(null)}     onSaved={onCompletarSaved} lote={completarTgt} />
    </Layout>
  );
}
