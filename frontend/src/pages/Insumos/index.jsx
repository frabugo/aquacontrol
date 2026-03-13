import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { listarInsumos, crearInsumo, actualizarInsumo, ajustarInsumo, obtenerInsumo, desactivarInsumo } from '../../services/insumosService';
import ModalCompra from './ModalCompra';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

function formatN(n) { return Number(n ?? 0).toFixed(2); }

/* ── Modal Crear / Editar Insumo ── */
function InsumoModal({ isOpen, onClose, onSaved, initial }) {
  const editing = !!initial;
  const [form, setForm] = useState({ nombre: '', unidad: 'unidad', stock_minimo: '', precio_unitario: '' });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (isOpen) {
      setForm(initial
        ? { nombre: initial.nombre, unidad: initial.unidad, stock_minimo: initial.stock_minimo, precio_unitario: initial.precio_unitario }
        : { nombre: '', unidad: 'unidad', stock_minimo: '', precio_unitario: '' });
      setError('');
    }
  }, [isOpen, initial]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = editing
        ? await actualizarInsumo(initial.id, form)
        : await crearInsumo(form);
      onSaved(result);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar');
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">{editing ? 'Editar insumo' : 'Nuevo insumo'}</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-3">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nombre *</label>
            <input className={inputCls} required value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} autoFocus />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Unidad</label>
            <select className={inputCls} value={form.unidad} onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))}>
              {['unidad', 'kg', 'litro', 'metro', 'rollo'].map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Stock mínimo</label>
              <input type="number" min="0" step="0.01" className={inputCls} value={form.stock_minimo} onChange={e => setForm(f => ({ ...f, stock_minimo: e.target.value }))} placeholder="0" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Precio unit. (S/)</label>
              <input type="number" min="0" step="0.01" className={inputCls} value={form.precio_unitario} onChange={e => setForm(f => ({ ...f, precio_unitario: e.target.value }))} placeholder="0.00" />
            </div>
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">Cancelar</button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition">
              {loading ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Modal Ajuste de stock ── */
function AjusteModal({ isOpen, onClose, onSaved, insumo }) {
  const [tipo,     setTipo]     = useState('ajuste_entrada');
  const [cantidad, setCantidad] = useState('');
  const [motivo,   setMotivo]   = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  useEffect(() => {
    if (isOpen) { setTipo('ajuste_entrada'); setCantidad(''); setMotivo(''); setError(''); }
  }, [isOpen]);

  if (!isOpen || !insumo) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!cantidad || Number(cantidad) <= 0) return setError('La cantidad debe ser mayor a 0');
    setLoading(true);
    try {
      const result = await ajustarInsumo(insumo.id, { tipo, cantidad: Number(cantidad), motivo });
      onSaved(result);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al ajustar');
    } finally { setLoading(false); }
  }

  const TIPOS = [
    { value: 'ajuste_entrada', label: '+ Entrada',   cls: 'border-green-500 bg-green-50 text-green-700' },
    { value: 'ajuste_salida',  label: '− Salida',    cls: 'border-red-500   bg-red-50   text-red-700'   },
    { value: 'merma',          label: '⚠ Merma',     cls: 'border-orange-500 bg-orange-50 text-orange-700' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Ajuste de stock</h2>
            <p className="text-xs text-slate-400">{insumo.nombre} · actual: {formatN(insumo.stock_actual)} {insumo.unidad}</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
          <div className="grid grid-cols-3 gap-2">
            {TIPOS.map(t => (
              <button key={t.value} type="button" onClick={() => setTipo(t.value)}
                className={`py-2 rounded-xl border text-xs font-semibold transition ${tipo === t.value ? t.cls : 'border-slate-200 text-slate-600'}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Cantidad ({insumo.unidad})</label>
            <input type="number" min="0.01" step="0.01" required className={inputCls} value={cantidad} onChange={e => setCantidad(e.target.value)} autoFocus placeholder="0" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Motivo (opcional)</label>
            <input className={inputCls} value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Descripción del ajuste…" />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">Cancelar</button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition">
              {loading ? 'Guardando…' : 'Aplicar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Página principal ── */
export default function Insumos() {
  const [insumos,  setInsumos]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [q,        setQ]        = useState('');

  const [modalOpen,   setModalOpen]   = useState(false);
  const [editing,     setEditing]     = useState(null);
  const [ajusteOpen,  setAjusteOpen]  = useState(false);
  const [ajusteTarget,setAjusteTarget]= useState(null);
  const [compraOpen,  setCompraOpen]  = useState(false);
  const [panelOpen,   setPanelOpen]   = useState(false);
  const [panelData,   setPanelData]   = useState(null);
  const [panelLoading,setPanelLoading]= useState(false);
  const [confirmId,   setConfirmId]   = useState(null);
  const [deleting,    setDeleting]    = useState(false);

  async function fetchInsumos(query = '') {
    setLoading(true);
    try {
      const res = await listarInsumos({ q: query || undefined, activo: 1 });
      setInsumos(Array.isArray(res.data) ? res.data : []);
    } catch { setInsumos([]); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    const id = setTimeout(() => fetchInsumos(q), 300);
    return () => clearTimeout(id);
  }, [q]);

  function onSaved(insumo) {
    setInsumos(prev => {
      const idx = prev.findIndex(i => i.id === insumo.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = insumo; return n; }
      return [insumo, ...prev];
    });
  }

  async function openPanel(ins) {
    setPanelOpen(true);
    setPanelLoading(true);
    try {
      const data = await obtenerInsumo(ins.id);
      setPanelData(data);
    } catch { setPanelData(null); }
    finally { setPanelLoading(false); }
  }

  async function handleDesactivar() {
    if (!confirmId) return;
    setDeleting(true);
    try {
      await desactivarInsumo(confirmId);
      setInsumos(prev => prev.filter(i => i.id !== confirmId));
      setConfirmId(null);
    } catch { /* silent */ }
    finally { setDeleting(false); }
  }

  const stockBajos = insumos.filter(i => Number(i.stock_actual) <= Number(i.stock_minimo)).length;

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Insumos</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {insumos.length} insumos
            {stockBajos > 0 && (
              <span className="ml-2 text-orange-600 font-medium">· {stockBajos} con stock bajo</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCompraOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-semibold rounded-lg transition shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4" /></svg>
            Nueva compra
          </button>
          <button onClick={() => { setEditing(null); setModalOpen(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Nuevo insumo
          </button>
        </div>
      </div>

      {/* Búsqueda */}
      <div className="relative mb-4 max-w-xs">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
        </svg>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar insumo…"
          className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                {['Insumo', 'Unidad', 'Stock actual', 'Stock mínimo', 'Precio unit.', 'Estado', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 animate-pulse rounded" style={{ width: j === 0 ? '120px' : '60px' }} /></td>
                  ))}</tr>
                ))
              ) : insumos.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">No hay insumos registrados</td></tr>
              ) : insumos.map(ins => {
                const bajo = Number(ins.stock_actual) <= Number(ins.stock_minimo);
                return (
                  <tr key={ins.id} className="hover:bg-slate-50 transition-colors cursor-pointer" onClick={() => openPanel(ins)}>
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {ins.nombre}
                      {ins.es_retornable ? (
                        <span className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-cyan-100 text-cyan-700 align-middle">RETORNABLE</span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-500 capitalize">{ins.unidad}</td>
                    <td className="px-4 py-3 tabular-nums">
                      <span className={`font-semibold ${bajo ? 'text-red-600' : 'text-slate-800'}`}>
                        {formatN(ins.stock_actual)}
                      </span>
                    </td>
                    <td className="px-4 py-3 tabular-nums text-slate-500">{formatN(ins.stock_minimo)}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-600">S/ {formatN(ins.precio_unitario)}</td>
                    <td className="px-4 py-3">
                      {bajo
                        ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Stock bajo</span>
                        : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">OK</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={(e) => { e.stopPropagation(); setAjusteTarget(ins); setAjusteOpen(true); }}
                          title="Ajustar stock"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setEditing(ins); setModalOpen(true); }}
                          title="Editar"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setConfirmId(ins.id); }}
                          title="Inhabilitar"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-600 transition">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Panel lateral de detalle */}
      {panelOpen && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setPanelOpen(false)} />
          <div className="relative w-full max-w-md bg-white shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h3 className="font-semibold text-slate-800">{panelData?.nombre ?? 'Detalle'}</h3>
              <button onClick={() => setPanelOpen(false)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {panelLoading ? (
              <div className="p-5 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-4 bg-slate-100 animate-pulse rounded" />)}
              </div>
            ) : panelData ? (
              <div className="p-5 space-y-5">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-xs text-slate-400">Unidad</p>
                    <p className="font-medium text-slate-700 capitalize">{panelData.unidad}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Stock actual</p>
                    <p className={`font-bold ${panelData.stock_bajo ? 'text-red-600' : 'text-slate-800'}`}>{formatN(panelData.stock_actual)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Stock mínimo</p>
                    <p className="font-medium text-slate-700">{formatN(panelData.stock_minimo)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">Precio unit.</p>
                    <p className="font-medium text-slate-700">S/ {formatN(panelData.precio_unitario)}</p>
                  </div>
                </div>

                {panelData.es_retornable ? (
                  <span className="inline-block px-2 py-1 rounded-lg text-xs font-semibold bg-cyan-100 text-cyan-700">Retornable</span>
                ) : null}

                {/* Movimientos recientes */}
                <div>
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Movimientos recientes</p>
                  {panelData.movimientos?.length > 0 ? (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {panelData.movimientos.slice(0, 20).map(m => (
                        <div key={m.id} className="flex items-center justify-between text-xs bg-slate-50 rounded-lg px-3 py-2">
                          <div>
                            <span className={`font-medium ${Number(m.cantidad) >= 0 ? 'text-green-700' : 'text-red-600'}`}>
                              {Number(m.cantidad) >= 0 ? '+' : ''}{formatN(m.cantidad)}
                            </span>
                            <span className="text-slate-400 ml-2">{m.tipo}</span>
                          </div>
                          <span className="text-slate-400">{m.fecha_hora ? new Date(m.fecha_hora).toLocaleDateString('es-PE') : ''}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 italic">Sin movimientos</p>
                  )}
                </div>

                {/* Recetas donde se usa */}
                {panelData.recetas?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Usado en recetas</p>
                    <div className="space-y-1">
                      {panelData.recetas.map(r => (
                        <div key={r.id} className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2">
                          {r.presentacion_nombre} — {formatN(r.cantidad)} por unidad
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-5 text-sm text-slate-400">Error al cargar datos</div>
            )}
          </div>
        </div>
      )}

      {/* Modal confirmar inhabilitar */}
      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => !deleting && setConfirmId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-red-100 flex items-center justify-center">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" /></svg>
            </div>
            <h3 className="text-base font-semibold text-slate-800 mb-1">Inhabilitar insumo</h3>
            <p className="text-sm text-slate-500 mb-4">
              {insumos.find(i => i.id === confirmId)?.nombre ?? 'Este insumo'} se marcará como inactivo y no aparecerá en las listas.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmId(null)} disabled={deleting}
                className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600 disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={handleDesactivar} disabled={deleting}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded-lg transition">
                {deleting ? 'Inhabilitando…' : 'Inhabilitar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <InsumoModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSaved={onSaved} initial={editing} />
      <AjusteModal isOpen={ajusteOpen} onClose={() => setAjusteOpen(false)} onSaved={onSaved} insumo={ajusteTarget} />
      <ModalCompra isOpen={compraOpen} onClose={() => setCompraOpen(false)} onSaved={() => fetchInsumos(q)} />
    </Layout>
  );
}
