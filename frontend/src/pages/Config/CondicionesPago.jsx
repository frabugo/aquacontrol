import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { listarTodasCondiciones, crearCondicion, actualizarCondicion, desactivarCondicion } from '../../services/condicionesPagoService';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

const selectCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition bg-white`;

export default function CondicionesPago() {
  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem]   = useState(null);

  // Form state
  const [form, setForm] = useState({ nombre: '', descripcion: '', tipo: 'contado', num_cuotas: 1, dias_entre_cuotas: 30 });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function fetchItems() {
    setLoading(true);
    try {
      const data = await listarTodasCondiciones();
      setItems(Array.isArray(data) ? data : []);
    } catch { setItems([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchItems(); }, []);

  function openNew() {
    setEditItem(null);
    setForm({ nombre: '', descripcion: '', tipo: 'contado', num_cuotas: 1, dias_entre_cuotas: 30 });
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(item) {
    setEditItem(item);
    setForm({
      nombre: item.nombre,
      descripcion: item.descripcion || '',
      tipo: item.tipo,
      num_cuotas: item.num_cuotas,
      dias_entre_cuotas: item.dias_entre_cuotas,
    });
    setFormError('');
    setModalOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    if (!form.nombre.trim()) return setFormError('El nombre es requerido');
    setSaving(true);
    try {
      if (editItem) {
        await actualizarCondicion(editItem.id, {
          nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim(),
          tipo: form.tipo,
          num_cuotas: form.tipo === 'contado' ? 1 : form.num_cuotas,
          dias_entre_cuotas: form.tipo === 'contado' ? 0 : form.dias_entre_cuotas,
        });
      } else {
        await crearCondicion({
          nombre: form.nombre.trim(),
          descripcion: form.descripcion.trim(),
          tipo: form.tipo,
          num_cuotas: form.tipo === 'contado' ? 1 : form.num_cuotas,
          dias_entre_cuotas: form.tipo === 'contado' ? 0 : form.dias_entre_cuotas,
        });
      }
      setModalOpen(false);
      fetchItems();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Error al guardar');
    } finally { setSaving(false); }
  }

  async function handleToggleActivo(item) {
    if (item.es_sistema) return;
    setError('');
    try {
      if (item.activo) {
        await desactivarCondicion(item.id);
      } else {
        await actualizarCondicion(item.id, { activo: true });
      }
      fetchItems();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cambiar estado');
    }
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Condiciones de Pago</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Configura las condiciones de pago disponibles en facturación
          </p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Nueva condición
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>
      )}

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                {['Orden', 'Nombre', 'Descripción', 'Tipo', 'Cuotas', 'Días', 'Estado', 'Acciones'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 animate-pulse rounded w-16" /></td>
                  ))}</tr>
                ))
              ) : items.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Sin condiciones configuradas</td></tr>
              ) : items.map(item => (
                <tr key={item.id} className={`transition-colors ${!item.activo ? 'opacity-50 bg-slate-50' : 'hover:bg-slate-50'}`}>
                  <td className="px-4 py-3 text-center text-slate-500 tabular-nums">{item.orden}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">{item.nombre}</span>
                      {item.es_sistema ? (
                        <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full font-semibold">Sistema</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{item.descripcion || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                      item.tipo === 'contado' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                    }`}>{item.tipo}</span>
                  </td>
                  <td className="px-4 py-3 text-center tabular-nums">{item.num_cuotas}</td>
                  <td className="px-4 py-3 text-center tabular-nums">{item.dias_entre_cuotas > 0 ? `${item.dias_entre_cuotas}d` : '—'}</td>
                  <td className="px-4 py-3">
                    {item.es_sistema ? (
                      <span className="text-xs text-green-600 font-medium">Siempre activo</span>
                    ) : (
                      <button onClick={() => handleToggleActivo(item)}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium transition ${
                          item.activo ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}>
                        {item.activo ? 'Activo' : 'Inactivo'}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!item.es_sistema && (
                      <button onClick={() => openEdit(item)}
                        className="px-2.5 py-1 text-xs text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-lg transition font-medium">
                        Editar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal crear/editar */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800">
                {editItem ? 'Editar condición' : 'Nueva condición de pago'}
              </h2>
              <button onClick={() => setModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{formError}</div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Nombre *</label>
                <input className={inputCls} value={form.nombre}
                  onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                  placeholder="ej. Crédito 30 días" autoFocus />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Descripción</label>
                <input className={inputCls} value={form.descripcion}
                  onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                  placeholder="ej. Pago a 30 días de la emisión" />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
                <select className={selectCls} value={form.tipo}
                  onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                  <option value="contado">Contado</option>
                  <option value="credito">Crédito</option>
                </select>
              </div>

              {form.tipo === 'credito' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Nº Cuotas</label>
                    <input type="number" min="1" max="24" className={inputCls} value={form.num_cuotas}
                      onChange={e => setForm(f => ({ ...f, num_cuotas: Number(e.target.value) || 1 }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Días entre cuotas</label>
                    <input type="number" min="1" max="365" className={inputCls} value={form.dias_entre_cuotas}
                      onChange={e => setForm(f => ({ ...f, dias_entre_cuotas: Number(e.target.value) || 30 }))} />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setModalOpen(false)}
                  className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition">
                  {saving ? 'Guardando...' : editItem ? 'Guardar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
