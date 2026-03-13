import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { listarPresentaciones } from '../../services/presentacionesService';
import { obtenerReceta, agregarInsumo, editarReceta, eliminarReceta } from '../../services/recetasService';
import { listarInsumos } from '../../services/insumosService';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

function formatN(n) { return Number(n ?? 0).toFixed(2); }

/* ── Modal Editar Receta ── */
function RecetaModal({ isOpen, onClose, presentacion, onSaved }) {
  const [items, setItems]     = useState([]);
  const [costo, setCosto]     = useState(0);
  const [insumos, setInsumos] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  // nuevo insumo form
  const [nuevoInsumoId, setNuevoInsumoId]   = useState('');
  const [nuevoCantidad, setNuevoCantidad]    = useState('');
  const [nuevoOpcional, setNuevoOpcional]    = useState(false);
  const [adding, setAdding]                  = useState(false);

  useEffect(() => {
    if (isOpen && presentacion) {
      setError('');
      setNuevoInsumoId(''); setNuevoCantidad(''); setNuevoOpcional(false);
      loadReceta();
      listarInsumos({ activo: 1 }).then(r => setInsumos(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    }
  }, [isOpen, presentacion]);

  async function loadReceta() {
    try {
      const res = await obtenerReceta(presentacion.id);
      setItems(Array.isArray(res.data) ? res.data : []);
      setCosto(res.costo_estimado ?? 0);
    } catch { setItems([]); }
  }

  if (!isOpen || !presentacion) return null;

  async function handleAdd(e) {
    e.preventDefault();
    if (!nuevoInsumoId || !nuevoCantidad || Number(nuevoCantidad) <= 0) {
      return setError('Selecciona insumo y cantidad válida');
    }
    setError(''); setAdding(true);
    try {
      await agregarInsumo({
        presentacion_id: presentacion.id,
        insumo_id: Number(nuevoInsumoId),
        cantidad: Number(nuevoCantidad),
        es_opcional: nuevoOpcional ? 1 : 0,
      });
      setNuevoInsumoId(''); setNuevoCantidad(''); setNuevoOpcional(false);
      await loadReceta();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al agregar');
    } finally { setAdding(false); }
  }

  async function handleUpdate(item, patch) {
    setLoading(true);
    try {
      await editarReceta(item.id, patch);
      await loadReceta();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al actualizar');
    } finally { setLoading(false); }
  }

  async function handleRemove(item) {
    if (!window.confirm(`¿Quitar ${item.insumo_nombre} de la receta?`)) return;
    try {
      await eliminarReceta(item.id);
      await loadReceta();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al eliminar');
    }
  }

  const insumosDisponibles = insumos.filter(i => !items.some(it => it.insumo_id === i.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { onSaved(); onClose(); }} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Receta: {presentacion.nombre}</h2>
            <p className="text-xs text-slate-400">Costo estimado: S/ {formatN(costo)}</p>
          </div>
          <button type="button" onClick={() => { onSaved(); onClose(); }} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

          {/* Lista de insumos en receta */}
          {items.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Receta vacía. Agrega insumos abajo.</p>
          ) : (
            <div className="space-y-2">
              {items.map(item => (
                <div key={item.id} className="flex items-center gap-2 bg-slate-50 rounded-xl p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">
                      {item.insumo_nombre}
                      {item.es_opcional ? <span className="ml-1.5 text-xs text-slate-400 italic">(opcional)</span> : null}
                    </p>
                    <p className="text-xs text-slate-400">{item.unidad}</p>
                  </div>
                  <input type="number" min="0.001" step="0.001"
                    className="w-20 px-2 py-1.5 text-sm text-right border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    defaultValue={item.cantidad}
                    onBlur={e => {
                      const v = Number(e.target.value);
                      if (v > 0 && v !== Number(item.cantidad)) handleUpdate(item, { cantidad: v });
                    }}
                  />
                  <label className="flex items-center gap-1 text-xs text-slate-500 cursor-pointer">
                    <input type="checkbox" checked={!!item.es_opcional}
                      onChange={e => handleUpdate(item, { es_opcional: e.target.checked ? 1 : 0 })}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                    Opc.
                  </label>
                  <button onClick={() => handleRemove(item)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition shrink-0">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Agregar insumo */}
          <form onSubmit={handleAdd} className="border border-dashed border-slate-300 rounded-xl p-3 space-y-2 bg-white">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Agregar insumo</p>
            <div className="grid grid-cols-3 gap-2">
              <select className={inputCls + ' col-span-2'} value={nuevoInsumoId} onChange={e => setNuevoInsumoId(e.target.value)}>
                <option value="">Seleccionar insumo…</option>
                {insumosDisponibles.map(i => <option key={i.id} value={i.id}>{i.nombre} ({i.unidad})</option>)}
              </select>
              <input type="number" min="0.001" step="0.001" className={inputCls} value={nuevoCantidad}
                onChange={e => setNuevoCantidad(e.target.value)} placeholder="Cant." />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                <input type="checkbox" checked={nuevoOpcional} onChange={e => setNuevoOpcional(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                Opcional
              </label>
              <button type="submit" disabled={adding}
                className="px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition">
                {adding ? 'Agregando…' : 'Agregar'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

/* ── Página principal ── */
export default function Recetas() {
  const [presentaciones, setPresentaciones] = useState([]);
  const [recetas, setRecetas]               = useState({}); // { presId: { data, costo_estimado } }
  const [loading, setLoading]               = useState(true);
  const [editTarget, setEditTarget]         = useState(null);

  async function fetchAll() {
    setLoading(true);
    try {
      const res = await listarPresentaciones({ activo: 1, limit: 100 });
      const preses = Array.isArray(res.data) ? res.data : [];
      setPresentaciones(preses);

      const recetaMap = {};
      await Promise.all(preses.map(async (p) => {
        try {
          const r = await obtenerReceta(p.id);
          recetaMap[p.id] = { data: Array.isArray(r.data) ? r.data : [], costo_estimado: r.costo_estimado ?? 0 };
        } catch { recetaMap[p.id] = { data: [], costo_estimado: 0 }; }
      }));
      setRecetas(recetaMap);
    } catch { setPresentaciones([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchAll(); }, []);

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Recetas</h1>
          <p className="text-sm text-slate-500 mt-0.5">Fórmulas de producción por presentación</p>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse">
              <div className="h-5 bg-slate-100 rounded w-32 mb-3" />
              <div className="space-y-2">
                <div className="h-3 bg-slate-100 rounded w-full" />
                <div className="h-3 bg-slate-100 rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      ) : presentaciones.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400">
          No hay presentaciones registradas
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {presentaciones.map(p => {
            const rec = recetas[p.id] || { data: [], costo_estimado: 0 };
            return (
              <div key={p.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow">
                <div className="px-5 pt-4 pb-3 border-b border-slate-100">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-slate-800">{p.nombre}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      p.modo_stock === 'lotes' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {p.modo_stock === 'lotes' ? 'LOTES' : 'SIMPLE'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Costo estimado: <span className="font-medium text-slate-600">S/ {formatN(rec.costo_estimado)}</span>
                  </p>
                </div>

                <div className="px-5 py-3">
                  {rec.data.length === 0 ? (
                    <p className="text-xs text-slate-400 italic py-2">Sin insumos definidos</p>
                  ) : (
                    <div className="space-y-1.5">
                      {rec.data.map(item => (
                        <div key={item.id} className="flex items-center justify-between text-xs">
                          <span className={item.es_opcional ? 'text-slate-400 italic' : 'text-slate-700'}>
                            {item.insumo_nombre}
                            {item.es_opcional ? ' (opc.)' : ''}
                          </span>
                          <span className="tabular-nums text-slate-500">{formatN(item.cantidad)} {item.unidad}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="px-5 pb-4">
                  <button onClick={() => setEditTarget(p)}
                    className="w-full py-2 text-xs font-semibold text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-lg transition">
                    Editar receta
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <RecetaModal
        isOpen={!!editTarget}
        onClose={() => setEditTarget(null)}
        presentacion={editTarget}
        onSaved={fetchAll}
      />
    </Layout>
  );
}
