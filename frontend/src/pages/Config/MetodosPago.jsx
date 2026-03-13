import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { listarTodosMetodos, crearMetodo, actualizarMetodo, desactivarMetodo } from '../../services/metodosPagoService';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

const COLORES = [
  { value: 'emerald', label: 'Verde',    cls: 'bg-emerald-100 text-emerald-700' },
  { value: 'purple',  label: 'Morado',   cls: 'bg-purple-100 text-purple-700' },
  { value: 'blue',    label: 'Azul',     cls: 'bg-blue-100 text-blue-700' },
  { value: 'orange',  label: 'Naranja',  cls: 'bg-orange-100 text-orange-700' },
  { value: 'red',     label: 'Rojo',     cls: 'bg-red-100 text-red-700' },
  { value: 'amber',   label: 'Ámbar',    cls: 'bg-amber-100 text-amber-700' },
  { value: 'cyan',    label: 'Cian',     cls: 'bg-cyan-100 text-cyan-700' },
  { value: 'pink',    label: 'Rosa',     cls: 'bg-pink-100 text-pink-700' },
  { value: 'slate',   label: 'Gris',     cls: 'bg-slate-100 text-slate-700' },
];

const COLOR_MAP = Object.fromEntries(COLORES.map(c => [c.value, c]));

function Badge({ color, label }) {
  const c = COLOR_MAP[color] || COLOR_MAP.slate;
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${c.cls}`}>{label}</span>;
}

export default function MetodosPago() {
  const [metodos, setMetodos]     = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem]   = useState(null);

  // Form state
  const [form, setForm] = useState({ etiqueta: '', color: 'blue', arrastra_saldo: false });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function fetchMetodos() {
    setLoading(true);
    try {
      const data = await listarTodosMetodos();
      setMetodos(Array.isArray(data) ? data : []);
    } catch { setMetodos([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { fetchMetodos(); }, []);

  function openNew() {
    setEditItem(null);
    setForm({ etiqueta: '', color: 'blue', arrastra_saldo: false });
    setFormError('');
    setModalOpen(true);
  }

  function openEdit(m) {
    setEditItem(m);
    setForm({ etiqueta: m.etiqueta, color: m.color || 'slate', arrastra_saldo: !!m.arrastra_saldo });
    setFormError('');
    setModalOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    if (!form.etiqueta.trim()) return setFormError('La etiqueta es requerida');
    setSaving(true);
    try {
      if (editItem) {
        await actualizarMetodo(editItem.id, {
          etiqueta: form.etiqueta.trim(),
          color: form.color,
          arrastra_saldo: form.arrastra_saldo,
        });
      } else {
        await crearMetodo({
          etiqueta: form.etiqueta.trim(),
          color: form.color,
          arrastra_saldo: form.arrastra_saldo,
        });
      }
      setModalOpen(false);
      fetchMetodos();
    } catch (err) {
      setFormError(err.response?.data?.error || 'Error al guardar');
    } finally { setSaving(false); }
  }

  async function handleToggleActivo(m) {
    if (m.es_sistema) return;
    setError('');
    try {
      if (m.activo) {
        await desactivarMetodo(m.id);
      } else {
        await actualizarMetodo(m.id, { activo: true });
      }
      fetchMetodos();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cambiar estado');
    }
  }

  async function handleToggleArrastra(m) {
    setError('');
    try {
      await actualizarMetodo(m.id, { arrastra_saldo: !m.arrastra_saldo });
      fetchMetodos();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al actualizar');
    }
  }

  return (
    <Layout>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Métodos de Pago</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Configura los métodos de pago disponibles en ventas y caja
          </p>
        </div>
        <button onClick={openNew}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Nuevo método
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
                {['Orden', 'Método', 'Tipo', 'Color', 'Arrastra saldo', 'Estado', 'Acciones'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 animate-pulse rounded w-16" /></td>
                  ))}</tr>
                ))
              ) : metodos.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Sin métodos configurados</td></tr>
              ) : metodos.map(m => (
                <tr key={m.id} className={`transition-colors ${!m.activo ? 'opacity-50 bg-slate-50' : 'hover:bg-slate-50'}`}>
                  <td className="px-4 py-3 text-center text-slate-500 tabular-nums">{m.orden}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">{m.etiqueta}</span>
                      {m.es_sistema ? (
                        <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-full font-semibold">Sistema</span>
                      ) : null}
                    </div>
                    <span className="text-xs text-slate-400">{m.nombre}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                      m.tipo === 'fisico' ? 'bg-green-100 text-green-700' :
                      m.tipo === 'credito' ? 'bg-orange-100 text-orange-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>{m.tipo}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge color={m.color} label={m.color} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button onClick={() => handleToggleArrastra(m)}
                      className={`w-10 h-5 rounded-full transition-colors relative ${m.arrastra_saldo ? 'bg-blue-500' : 'bg-slate-300'}`}>
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${m.arrastra_saldo ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    {m.es_sistema ? (
                      <span className="text-xs text-green-600 font-medium">Siempre activo</span>
                    ) : (
                      <button onClick={() => handleToggleActivo(m)}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium transition ${
                          m.activo ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}>
                        {m.activo ? 'Activo' : 'Inactivo'}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!m.es_sistema && (
                      <button onClick={() => openEdit(m)}
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
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-semibold text-slate-800">
                {editItem ? 'Editar método' : 'Nuevo método de pago'}
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
                <label className="block text-xs font-medium text-slate-600 mb-1">Nombre / Etiqueta *</label>
                <input className={inputCls} value={form.etiqueta}
                  onChange={e => setForm(f => ({ ...f, etiqueta: e.target.value }))}
                  placeholder="ej. BCP, Yape, Interbank..." autoFocus />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Color</label>
                <div className="flex flex-wrap gap-2">
                  {COLORES.map(c => (
                    <button key={c.value} type="button"
                      onClick={() => setForm(f => ({ ...f, color: c.value }))}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${c.cls} ${
                        form.color === c.value ? 'ring-2 ring-blue-500 ring-offset-1' : 'opacity-60 hover:opacity-100'
                      }`}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, arrastra_saldo: !f.arrastra_saldo }))}
                  className={`w-10 h-5 rounded-full transition-colors relative ${form.arrastra_saldo ? 'bg-blue-500' : 'bg-slate-300'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${form.arrastra_saldo ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
                <div>
                  <p className="text-sm text-slate-700 font-medium">Arrastra saldo</p>
                  <p className="text-xs text-slate-400">El saldo final se copia como inicial al abrir nueva caja</p>
                </div>
              </div>

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
