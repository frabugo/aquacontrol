import { useCallback, useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import Layout from '../../components/Layout';
import { listarControles, resumenCalidad, tendenciaCalidad, obtenerParametros, actualizarParametros, crearControl, actualizarControl, eliminarControl } from '../../services/calidadService';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

const PUNTOS = { entrada: 'Entrada', osmosis: 'Osmosis', post_uv: 'Post UV', tanque: 'Tanque', envasado: 'Envasado' };

/* ── Modal Crear/Editar Control ── */
function ControlModal({ isOpen, onClose, onSaved, control }) {
  const [form, setForm] = useState({
    punto_muestreo: 'entrada', ph: '', cloro_residual: '', tds: '', turbidez: '', temperatura: '', observaciones: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && control) {
      setForm({
        punto_muestreo: control.punto_muestreo,
        ph: control.ph ?? '', cloro_residual: control.cloro_residual ?? '',
        tds: control.tds ?? '', turbidez: control.turbidez ?? '',
        temperatura: control.temperatura ?? '', observaciones: control.observaciones || '',
      });
    } else if (isOpen) {
      setForm({ punto_muestreo: 'entrada', ph: '', cloro_residual: '', tds: '', turbidez: '', temperatura: '', observaciones: '' });
    }
    setError('');
  }, [isOpen, control]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      if (control) { await actualizarControl(control.id, form); }
      else { await crearControl(form); }
      onSaved(); onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error guardando');
    } finally { setLoading(false); }
  }

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">{control ? 'Editar Control' : 'Nuevo Control'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Punto de muestreo</label>
            <select className={inputCls} value={form.punto_muestreo} onChange={e => upd('punto_muestreo', e.target.value)}>
              {Object.entries(PUNTOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">pH</label>
              <input type="number" step="0.01" className={inputCls} value={form.ph} onChange={e => upd('ph', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Cloro (mg/L)</label>
              <input type="number" step="0.001" className={inputCls} value={form.cloro_residual} onChange={e => upd('cloro_residual', e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">TDS (ppm)</label>
              <input type="number" className={inputCls} value={form.tds} onChange={e => upd('tds', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Turbidez (NTU)</label>
              <input type="number" step="0.01" className={inputCls} value={form.turbidez} onChange={e => upd('turbidez', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Temp (C)</label>
              <input type="number" step="0.1" className={inputCls} value={form.temperatura} onChange={e => upd('temperatura', e.target.value)} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Observaciones</label>
            <textarea className={inputCls} rows={2} value={form.observaciones} onChange={e => upd('observaciones', e.target.value)} />
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

/* ── Sección Parámetros ── */
function ParametrosSection() {
  const [params, setParams] = useState([]);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { obtenerParametros().then(setParams).catch(() => {}); }, []);

  async function handleSave() {
    setSaving(true);
    try {
      await actualizarParametros({ parametros: params });
      setEditing(false);
    } catch (err) { alert('Error guardando parametros'); }
    finally { setSaving(false); }
  }

  function updateParam(idx, field, val) {
    setParams(prev => prev.map((p, i) => i === idx ? { ...p, [field]: val } : p));
  }

  const labels = { ph: 'pH', cloro_residual: 'Cloro residual', tds: 'TDS', turbidez: 'Turbidez', temperatura: 'Temperatura' };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800">Parametros aceptables</h3>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Editar</button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="text-xs text-slate-500">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="text-xs text-blue-600 font-medium">{saving ? 'Guardando…' : 'Guardar'}</button>
          </div>
        )}
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            <th className="text-left px-4 py-2 font-medium text-slate-600">Parametro</th>
            <th className="text-right px-4 py-2 font-medium text-slate-600">Min</th>
            <th className="text-right px-4 py-2 font-medium text-slate-600">Max</th>
            <th className="text-left px-4 py-2 font-medium text-slate-600">Unidad</th>
          </tr>
        </thead>
        <tbody>
          {params.map((p, i) => (
            <tr key={p.parametro} className="border-b border-slate-50">
              <td className="px-4 py-2 font-medium text-slate-700">{labels[p.parametro] || p.parametro}</td>
              <td className="px-4 py-2 text-right">
                {editing
                  ? <input type="number" step="0.001" className="w-20 px-2 py-1 text-sm border rounded text-right" value={p.min_valor ?? ''} onChange={e => updateParam(i, 'min_valor', e.target.value)} />
                  : p.min_valor
                }
              </td>
              <td className="px-4 py-2 text-right">
                {editing
                  ? <input type="number" step="0.001" className="w-20 px-2 py-1 text-sm border rounded text-right" value={p.max_valor ?? ''} onChange={e => updateParam(i, 'max_valor', e.target.value)} />
                  : p.max_valor
                }
              </td>
              <td className="px-4 py-2 text-slate-500">{p.unidad}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Seccion Tendencia ── */
function TendenciaSection() {
  const [trendData, setTrendData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    tendenciaCalidad({ dias: 30 })
      .then(rows => {
        setTrendData(rows.map(r => ({
          ...r,
          dia: r.dia ? new Date(r.dia).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' }) : r.dia,
        })));
      })
      .catch(() => setTrendData([]))
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h3 className="text-sm font-semibold text-slate-800">Tendencia de parametros</h3>
        <button onClick={() => setOpen(o => !o)} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
          {open ? 'Ocultar tendencia' : 'Ver tendencia'}
        </button>
      </div>
      {open && (
        <div className="px-5 py-5">
          {loading ? (
            <p className="text-center text-sm text-slate-400 py-8">Cargando tendencia...</p>
          ) : trendData.length === 0 ? (
            <p className="text-center text-sm text-slate-400 py-8">Sin datos en los ultimos 30 dias</p>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="dia" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip
                  contentStyle={{ borderRadius: '0.5rem', border: '1px solid #e2e8f0', fontSize: '0.8rem' }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Legend wrapperStyle={{ fontSize: '0.8rem' }} />
                <Line yAxisId="left" type="monotone" dataKey="ph" name="pH" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line yAxisId="left" type="monotone" dataKey="cloro" name="Cloro (mg/L)" stroke="#22c55e" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line yAxisId="right" type="monotone" dataKey="tds" name="TDS (ppm)" stroke="#f97316" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line yAxisId="left" type="monotone" dataKey="turbidez" name="Turbidez (NTU)" stroke="#a855f7" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}

export default function Calidad() {
  const [data, setData] = useState([]);
  const [resumen, setResumen] = useState({ total_controles: 0, pct_cumplimiento: 0, alertas: 0 });
  const [parametros, setParametros] = useState([]);
  const [filtros, setFiltros] = useState({ fecha_inicio: '', fecha_fin: '', punto_muestreo: '', cumple: '' });
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editCtrl, setEditCtrl] = useState(null);
  const [showParams, setShowParams] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...filtros, page, limit: 20 };
      Object.keys(params).forEach(k => { if (params[k] === '') delete params[k]; });
      const [res, sum, prm] = await Promise.all([
        listarControles(params),
        resumenCalidad({ dias: 30 }),
        obtenerParametros(),
      ]);
      setData(res.data);
      setPages(res.pages);
      setResumen(sum);
      setParametros(prm);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [filtros, page]);

  useEffect(() => { cargar(); }, [cargar]);

  function handleNew() { setEditCtrl(null); setModalOpen(true); }
  function handleEdit(c) { setEditCtrl(c); setModalOpen(true); }
  async function handleDelete(id) {
    if (!confirm('Eliminar este control?')) return;
    try { await eliminarControl(id); cargar(); } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  // Check if a value is out of range
  function isOutOfRange(parametro, valor) {
    if (valor == null) return false;
    const p = parametros.find(x => x.parametro === parametro);
    if (!p) return false;
    const v = Number(valor);
    if (p.min_valor != null && v < Number(p.min_valor)) return true;
    if (p.max_valor != null && v > Number(p.max_valor)) return true;
    return false;
  }

  function valCls(parametro, valor) {
    return isOutOfRange(parametro, valor) ? 'text-red-600 font-bold' : '';
  }

  const upd = (k, v) => { setFiltros(f => ({ ...f, [k]: v })); setPage(1); };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Control de Calidad</h1>
            <p className="text-sm text-slate-500">Analisis de agua y parametros</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowParams(!showParams)} className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">
              {showParams ? 'Ocultar Parametros' : 'Ver Parametros'}
            </button>
            <button onClick={handleNew} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition">
              + Nuevo Control
            </button>
          </div>
        </div>

        {/* Cards resumen */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Controles (30d)</p>
            <p className="text-2xl font-bold text-slate-800 mt-1">{resumen.total_controles || 0}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Cumplimiento</p>
            <p className={`text-2xl font-bold mt-1 ${Number(resumen.pct_cumplimiento) >= 90 ? 'text-green-600' : Number(resumen.pct_cumplimiento) >= 70 ? 'text-yellow-600' : 'text-red-600'}`}>
              {resumen.pct_cumplimiento ?? 0}%
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <p className="text-xs text-slate-400 uppercase tracking-wide">Alertas</p>
            <p className={`text-2xl font-bold mt-1 ${Number(resumen.alertas) > 0 ? 'text-red-600' : 'text-green-600'}`}>{resumen.alertas || 0}</p>
          </div>
        </div>

        {/* Tendencia */}
        <TendenciaSection />

        {/* Parametros */}
        {showParams && <ParametrosSection />}

        {/* Filtros */}
        <div className="flex flex-wrap gap-3">
          <select className={inputCls + ' !w-auto'} value={filtros.punto_muestreo} onChange={e => upd('punto_muestreo', e.target.value)}>
            <option value="">Todos los puntos</option>
            {Object.entries(PUNTOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <select className={inputCls + ' !w-auto'} value={filtros.cumple} onChange={e => upd('cumple', e.target.value)}>
            <option value="">Todos</option>
            <option value="1">Cumple</option>
            <option value="0">No cumple</option>
          </select>
          <input type="date" className={inputCls + ' !w-auto'} value={filtros.fecha_inicio} onChange={e => upd('fecha_inicio', e.target.value)} />
          <input type="date" className={inputCls + ' !w-auto'} value={filtros.fecha_fin} onChange={e => upd('fecha_fin', e.target.value)} />
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 font-medium text-slate-600">Fecha</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Punto</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">pH</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Cloro</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">TDS</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Turbidez</th>
                <th className="text-right px-4 py-3 font-medium text-slate-600">Temp</th>
                <th className="text-center px-4 py-3 font-medium text-slate-600">Cumple</th>
                <th className="text-left px-4 py-3 font-medium text-slate-600">Registrado</th>
                <th className="px-4 py-3 font-medium text-slate-600">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={10} className="text-center py-8 text-slate-400">Cargando…</td></tr>}
              {!loading && data.length === 0 && <tr><td colSpan={10} className="text-center py-8 text-slate-400">Sin registros</td></tr>}
              {!loading && data.map(c => (
                <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                  <td className="px-4 py-3 text-slate-600">{new Date(c.fecha).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{PUNTOS[c.punto_muestreo]}</td>
                  <td className={`px-4 py-3 text-right ${valCls('ph', c.ph)}`}>{c.ph ?? '—'}</td>
                  <td className={`px-4 py-3 text-right ${valCls('cloro_residual', c.cloro_residual)}`}>{c.cloro_residual ?? '—'}</td>
                  <td className={`px-4 py-3 text-right ${valCls('tds', c.tds)}`}>{c.tds ?? '—'}</td>
                  <td className={`px-4 py-3 text-right ${valCls('turbidez', c.turbidez)}`}>{c.turbidez ?? '—'}</td>
                  <td className={`px-4 py-3 text-right ${valCls('temperatura', c.temperatura)}`}>{c.temperatura ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {c.cumple
                      ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">OK</span>
                      : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">No</span>
                    }
                  </td>
                  <td className="px-4 py-3 text-slate-500">{c.registrado_nombre}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => handleEdit(c)} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition" title="Editar">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                      </button>
                      <button onClick={() => handleDelete(c.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition" title="Eliminar">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {pages > 1 && (
            <div className="flex items-center justify-center gap-2 px-4 py-3 border-t border-slate-100">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 text-sm rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40">Anterior</button>
              <span className="text-sm text-slate-500">Pag {page} de {pages}</span>
              <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-sm rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40">Siguiente</button>
            </div>
          )}
        </div>
      </div>

      <ControlModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSaved={cargar} control={editCtrl} />
    </Layout>
  );
}
