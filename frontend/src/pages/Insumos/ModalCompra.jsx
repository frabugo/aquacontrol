import { useEffect, useRef, useState } from 'react';
import { listarInsumos } from '../../services/insumosService';
import { listarPresentaciones } from '../../services/presentacionesService';
import { listarProveedores, obtenerPrecios } from '../../services/proveedoresService';
import { crearCompra } from '../../services/comprasService';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function formatS(n) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);
}

function newItem(id) {
  return { id, tipo_item: 'insumo', insumo_id: '', presentacion_id: '', cantidad: '', precio_unitario: '' };
}

export default function ModalCompra({ isOpen, onClose, onSaved }) {
  const [insumos, setInsumos]             = useState([]);
  const [presentaciones, setPresentaciones] = useState([]);
  const [proveedores, setProveedores]     = useState([]);
  const [proveedor_id, setProveedorId]    = useState('');
  const [preciosHist, setPreciosHist]     = useState([]);
  const [fecha, setFecha]                 = useState(today());
  const [notas, setNotas]                 = useState('');
  const [items, setItems]                 = useState(() => [newItem(1)]);
  const nextId = useRef(2);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => {
    if (isOpen) {
      setProveedorId(''); setFecha(today()); setNotas('');
      setItems([newItem(1)]); nextId.current = 2;
      setError(''); setPreciosHist([]);
      listarInsumos({ activo: 1 }).then(r => setInsumos(Array.isArray(r.data) ? r.data : [])).catch(() => {});
      listarPresentaciones({ activo: 1, limit: 100 }).then(r => setPresentaciones(Array.isArray(r.data) ? r.data : [])).catch(() => {});
      listarProveedores({ limit: 200 }).then(r => setProveedores(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    }
  }, [isOpen]);

  // cargar historial de precios al seleccionar proveedor
  useEffect(() => {
    if (!proveedor_id) { setPreciosHist([]); return; }
    obtenerPrecios(proveedor_id)
      .then(r => setPreciosHist(Array.isArray(r.data) ? r.data : []))
      .catch(() => setPreciosHist([]));
  }, [proveedor_id]);

  if (!isOpen) return null;

  function updateItem(id, patch) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
  }
  function addItem() { setItems(prev => [...prev, newItem(nextId.current++)]); }
  function removeItem(id) { setItems(prev => prev.length > 1 ? prev.filter(it => it.id !== id) : prev); }

  const total = items.reduce((s, it) => s + (Number(it.precio_unitario) * Number(it.cantidad) || 0), 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    for (const it of items) {
      if (it.tipo_item === 'insumo' && !it.insumo_id) return setError('Selecciona un insumo en cada línea');
      if (it.tipo_item === 'presentacion' && !it.presentacion_id) return setError('Selecciona una presentación en cada línea');
      if (!it.cantidad || Number(it.cantidad) <= 0) return setError('La cantidad debe ser mayor a 0');
    }
    setLoading(true);
    try {
      await crearCompra({
        proveedor_id: proveedor_id ? Number(proveedor_id) : null,
        fecha,
        notas: notas.trim() || null,
        items: items.map(it => ({
          tipo_item: it.tipo_item,
          insumo_id: it.tipo_item === 'insumo' ? Number(it.insumo_id) : null,
          presentacion_id: it.tipo_item === 'presentacion' ? Number(it.presentacion_id) : null,
          cantidad: Number(it.cantidad),
          precio_unitario: Number(it.precio_unitario),
        })),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrar compra');
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-lg font-semibold text-slate-800">Nueva compra</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Proveedor</label>
                <select className={inputCls} value={proveedor_id} onChange={e => setProveedorId(e.target.value)}>
                  <option value="">— Sin proveedor —</option>
                  {proveedores.map(pv => <option key={pv.id} value={pv.id}>{pv.nombre}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Fecha</label>
                <input type="date" className={inputCls} value={fecha} onChange={e => setFecha(e.target.value)} />
              </div>
            </div>

            {/* Historial de precios del proveedor */}
            {preciosHist.length > 0 && (
              <div className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Últimos precios del proveedor</p>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {preciosHist.slice(0, 10).map((ph, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-slate-600">{ph.insumo_nombre ?? ph.presentacion_nombre ?? `Item #${ph.id}`}</span>
                      <span className="tabular-nums text-slate-700 font-medium">S/ {Number(ph.precio_unitario ?? 0).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ítems */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Ítems</p>
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div key={it.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500">Ítem {idx + 1}</span>
                      {items.length > 1 && (
                        <button type="button" onClick={() => removeItem(it.id)}
                          className="w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="col-span-2">
                        <select className={inputCls} value={it.tipo_item} onChange={e => updateItem(it.id, { tipo_item: e.target.value, insumo_id: '', presentacion_id: '' })}>
                          <option value="insumo">Insumo</option>
                          <option value="presentacion">Envase / presentación</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        {it.tipo_item === 'insumo' ? (
                          <select className={inputCls} value={it.insumo_id} onChange={e => updateItem(it.id, { insumo_id: e.target.value })} required>
                            <option value="">Seleccionar…</option>
                            {insumos.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                          </select>
                        ) : (
                          <select className={inputCls} value={it.presentacion_id} onChange={e => updateItem(it.id, { presentacion_id: e.target.value })} required>
                            <option value="">Seleccionar…</option>
                            {presentaciones.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                          </select>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-0.5">Cantidad</label>
                        <input type="number" min="0.01" step="0.01" className={inputCls} value={it.cantidad} onChange={e => updateItem(it.id, { cantidad: e.target.value })} placeholder="0" required />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-0.5">Precio unit. (S/)</label>
                        <input type="number" min="0" step="0.01" className={inputCls} value={it.precio_unitario} onChange={e => updateItem(it.id, { precio_unitario: e.target.value })} placeholder="0.00" />
                      </div>
                      <div className="flex items-end">
                        <div className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-right">
                          <div className="text-xs text-slate-400">Subtotal</div>
                          <div className="text-sm font-bold text-slate-800">
                            {formatS((Number(it.precio_unitario) || 0) * (Number(it.cantidad) || 0))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addItem}
                className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                Agregar ítem
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Notas (opcional)</label>
              <textarea rows={2} className={inputCls} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones de la compra…" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl shrink-0">
            <div className="text-right">
              <span className="text-xs text-slate-400">TOTAL COMPRA</span>
              <div className="text-xl font-bold text-slate-800">{formatS(total)}</div>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-white transition">Cancelar</button>
              <button type="submit" disabled={loading} className="px-6 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition">
                {loading ? 'Registrando…' : 'Registrar compra'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
