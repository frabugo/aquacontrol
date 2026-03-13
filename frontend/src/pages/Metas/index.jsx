import { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { listarMetas, resumenMetas, crearMeta, actualizarMeta, eliminarMeta } from '../../services/metasService';
import api from '../../services/api';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

function mesActual() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/* ── Modal Crear/Editar Meta ── */
function MetaModal({ isOpen, onClose, onSaved, meta, usuarios }) {
  const [form, setForm] = useState({ usuario_id: '', meta_soles: '', meta_bidones: '', comision_pct: '', bono_cumplido: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && meta) {
      setForm({
        usuario_id: meta.usuario_id,
        meta_soles: meta.meta_soles,
        meta_bidones: meta.meta_bidones || '',
        comision_pct: meta.comision_pct,
        bono_cumplido: meta.bono_cumplido,
      });
    } else if (isOpen) {
      setForm({ usuario_id: '', meta_soles: '', meta_bidones: '', comision_pct: '', bono_cumplido: '' });
    }
    setError('');
  }, [isOpen, meta]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.usuario_id || !form.meta_soles) return setError('Usuario y meta en soles son obligatorios');
    setLoading(true);
    setError('');
    try {
      if (meta) {
        await actualizarMeta(meta.id, form);
      } else {
        await crearMeta(form);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error guardando meta');
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">{meta ? 'Editar Meta' : 'Nueva Meta'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
          {!meta && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Usuario</label>
              <select className={inputCls} value={form.usuario_id} onChange={e => setForm(f => ({ ...f, usuario_id: e.target.value }))} required>
                <option value="">Seleccionar…</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre} ({u.rol})</option>)}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Meta S/.</label>
              <input type="number" step="0.01" min="0" required className={inputCls} value={form.meta_soles}
                onChange={e => setForm(f => ({ ...f, meta_soles: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Meta bidones</label>
              <input type="number" min="0" className={inputCls} value={form.meta_bidones}
                onChange={e => setForm(f => ({ ...f, meta_bidones: e.target.value }))} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Comision %</label>
              <input type="number" step="0.01" min="0" max="100" className={inputCls} value={form.comision_pct}
                onChange={e => setForm(f => ({ ...f, comision_pct: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Bono cumplido S/.</label>
              <input type="number" step="0.01" min="0" className={inputCls} value={form.bono_cumplido}
                onChange={e => setForm(f => ({ ...f, bono_cumplido: e.target.value }))} />
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

export default function Metas() {
  const [mes, setMes] = useState(mesActual());
  const [metas, setMetas] = useState([]);
  const [resumen, setResumen] = useState({ total_metas: 0, cumplidas: 0, total_comisiones: 0 });
  const [usuarios, setUsuarios] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editMeta, setEditMeta] = useState(null);
  const [loading, setLoading] = useState(false);

  const mesFmt = mes + '-01';

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const [m, r] = await Promise.all([
        listarMetas({ mes: mesFmt }),
        resumenMetas({ mes: mesFmt }),
      ]);
      setMetas(m);
      setResumen(r);
    } catch (err) {
      console.error(err);
    } finally { setLoading(false); }
  }, [mesFmt]);

  useEffect(() => { cargar(); }, [cargar]);

  useEffect(() => {
    api.get('/usuarios', { params: { limit: 200 } })
      .then(r => setUsuarios(r.data?.data || r.data || []))
      .catch(() => {});
  }, []);

  function handleEdit(m) { setEditMeta(m); setModalOpen(true); }
  function handleNew() { setEditMeta(null); setModalOpen(true); }

  async function handleDelete(id) {
    if (!confirm('Eliminar esta meta?')) return;
    try { await eliminarMeta(id); cargar(); } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  function badgeColor(pct) {
    if (pct >= 100) return 'bg-green-100 text-green-700';
    if (pct >= 50) return 'bg-yellow-100 text-yellow-700';
    return 'bg-red-100 text-red-700';
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Metas y Comisiones</h1>
            <p className="text-sm text-slate-500">Objetivos de venta por usuario</p>
          </div>
          <div className="flex items-center gap-3">
            <input type="month" className={inputCls + ' !w-auto'} value={mes} onChange={e => setMes(e.target.value)} />
            <button onClick={handleNew} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition">
              + Nueva Meta
            </button>
          </div>
        </div>

        {/* Cards resumen */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Metas activas</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{resumen.total_metas}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Cumplidas</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{resumen.cumplidas}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Total comisiones</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">S/. {Number(resumen.total_comisiones).toFixed(2)}</p>
          </div>
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">Usuario</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Rol</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Meta S/.</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Vendido S/.</th>
                <th className="px-4 py-3 font-medium text-slate-600">Avance</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Bidones</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Comision</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Bono</th>
                <th className="px-4 py-3 font-medium text-slate-600">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} className="text-center py-8 text-slate-400">Cargando…</td></tr>
              )}
              {!loading && metas.length === 0 && (
                <tr><td colSpan={9} className="text-center py-8 text-slate-400">Sin metas para este mes</td></tr>
              )}
              {!loading && metas.map(m => (
                <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-medium text-slate-800">{m.usuario_nombre}</td>
                  <td className="px-4 py-3 text-slate-500 capitalize">{m.rol}</td>
                  <td className="px-4 py-3 text-right">{Number(m.meta_soles).toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">{Number(m.vendido_soles).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${Math.min(m.avance_pct, 100)}%` }} />
                      </div>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${badgeColor(m.avance_pct)}`}>
                        {m.avance_pct}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">{m.vendido_bidones}</td>
                  <td className="px-4 py-3 text-right">S/. {m.comision_ganada.toFixed(2)}</td>
                  <td className="px-4 py-3 text-right">
                    {m.bono_aplica
                      ? <span className="text-green-600 font-medium">S/. {Number(m.bono_cumplido).toFixed(2)}</span>
                      : <span className="text-slate-300">—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleEdit(m)} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition" title="Editar">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => handleDelete(m.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition" title="Eliminar">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <MetaModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={cargar}
        meta={editMeta}
        usuarios={usuarios}
      />
    </Layout>
  );
}
