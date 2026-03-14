import { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import api from '../../services/api';

const inputCls = 'w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition';

export default function CategoriasCaja() {
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ nombre: '', tipo: 'egreso' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/config/categorias-caja');
      setCategorias(Array.isArray(res.data) ? res.data : []);
    } catch { setCategorias([]); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function openCrear() {
    setEditando(null);
    setForm({ nombre: '', tipo: 'egreso' });
    setError('');
    setShowModal(true);
  }

  function openEditar(cat) {
    setEditando(cat);
    setForm({ nombre: cat.nombre, tipo: cat.tipo });
    setError('');
    setShowModal(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nombre.trim()) return setError('El nombre es requerido');
    setSaving(true);
    setError('');
    try {
      if (editando) {
        await api.put(`/config/categorias-caja/${editando.id}`, form);
      } else {
        await api.post('/config/categorias-caja', form);
      }
      setShowModal(false);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar');
    }
    setSaving(false);
  }

  async function handleToggle(cat) {
    if (cat.es_sistema) return;
    const accion = cat.activo ? 'desactivar' : 'activar';
    if (!window.confirm(`${accion === 'desactivar' ? 'Desactivar' : 'Activar'} "${cat.nombre}"?`)) return;
    try {
      if (cat.activo) {
        await api.delete(`/config/categorias-caja/${cat.id}`);
      } else {
        await api.put(`/config/categorias-caja/${cat.id}`, { activo: 1 });
      }
      fetchData();
    } catch (err) {
      alert(err.response?.data?.error || 'Error');
    }
  }

  const ingresos = categorias.filter(c => c.tipo === 'ingreso');
  const egresos = categorias.filter(c => c.tipo === 'egreso');

  return (
    <Layout>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-lg font-bold text-slate-800">Categorias de Caja</h1>
            <p className="text-sm text-slate-400">Clasificacion de ingresos y egresos</p>
          </div>
          <button onClick={openCrear}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition">
            + Nueva categoria
          </button>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-6">
            <Section title="Ingresos" items={ingresos} onEdit={openEditar} onToggle={handleToggle} color="emerald" />
            <Section title="Egresos" items={egresos} onEdit={openEditar} onToggle={handleToggle} color="red" />
          </div>
        )}

        {showModal && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setShowModal(false)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-800">{editando ? 'Editar categoria' : 'Nueva categoria'}</h2>
                <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
              </div>
              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nombre</label>
                  <input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })}
                    className={inputCls} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
                  <select value={form.tipo} onChange={e => setForm({ ...form, tipo: e.target.value })}
                    className={inputCls} disabled={!!editando}>
                    <option value="ingreso">Ingreso</option>
                    <option value="egreso">Egreso</option>
                  </select>
                </div>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition">Cancelar</button>
                  <button type="submit" disabled={saving}
                    className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition">
                    {saving ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function Section({ title, items, onEdit, onToggle, color }) {
  const dotColor = color === 'emerald' ? 'bg-emerald-500' : 'bg-red-500';
  const headerColor = color === 'emerald' ? 'text-emerald-700' : 'text-red-700';
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
        <div className={`w-2.5 h-2.5 rounded-full ${dotColor}`} />
        <h2 className={`text-sm font-semibold ${headerColor}`}>{title} ({items.length})</h2>
      </div>
      <div className="divide-y divide-slate-50">
        {items.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-slate-400">Sin categorias</p>
        ) : items.map(cat => (
          <div key={cat.id} className={`flex items-center justify-between px-5 py-3 ${!cat.activo ? 'opacity-50' : ''}`}>
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-800">{cat.nombre}</span>
              {cat.es_sistema ? (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">Sistema</span>
              ) : null}
              {!cat.activo && (
                <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-600">Inactiva</span>
              )}
            </div>
            {!cat.es_sistema && (
              <div className="flex items-center gap-2">
                <button onClick={() => onEdit(cat)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800">Editar</button>
                <button onClick={() => onToggle(cat)}
                  className={`text-xs font-medium ${cat.activo ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}`}>
                  {cat.activo ? 'Desactivar' : 'Activar'}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
