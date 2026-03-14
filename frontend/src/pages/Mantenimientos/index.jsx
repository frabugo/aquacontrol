import { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { listarMantenimientos, obtenerAlertas, crearMantenimiento, actualizarMantenimiento, eliminarMantenimiento, obtenerProximos } from '../../services/mantenimientosService';
import { listarProgramaciones, obtenerAlertasProgramadas, crearProgramacion, actualizarProgramacion, eliminarProgramacion } from '../../services/programacionMantService';
import api from '../../services/api';
import useMetodosPago from '../../hooks/useMetodosPago';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const TIPOS = { preventivo: 'Preventivo', correctivo: 'Correctivo', revision: 'Revisión' };
const TIPO_COLORS = { preventivo: 'bg-blue-100 text-blue-700', correctivo: 'bg-red-100 text-red-700', revision: 'bg-yellow-100 text-yellow-700' };
const ESTADO_COLORS = { pendiente: 'bg-yellow-100 text-yellow-700', completado: 'bg-green-100 text-green-700', cancelado: 'bg-slate-100 text-slate-500' };

const CATEGORIAS = [
  { value: 'motor', label: 'Motor' },
  { value: 'frenos', label: 'Frenos' },
  { value: 'llantas', label: 'Llantas' },
  { value: 'electrico', label: 'Electrico' },
  { value: 'transmision', label: 'Transmision' },
  { value: 'suspension', label: 'Suspension' },
  { value: 'carroceria', label: 'Carroceria' },
  { value: 'general', label: 'General' },
];
const CAT_COLORS = {
  motor: 'bg-red-100 text-red-700', frenos: 'bg-orange-100 text-orange-700',
  llantas: 'bg-amber-100 text-amber-700', electrico: 'bg-yellow-100 text-yellow-700',
  transmision: 'bg-purple-100 text-purple-700', suspension: 'bg-indigo-100 text-indigo-700',
  carroceria: 'bg-cyan-100 text-cyan-700', general: 'bg-slate-100 text-slate-600',
};

/* ══════════════════════════════════════════════════════════════════
   Modal Nuevo Registro de Historial
   - Selecciona vehiculo → carga programaciones pendientes
   - Al elegir una programación, pre-llena tipo y descripción
   - Al guardar con programacion_id, el backend recalcula próximo km
   ══════════════════════════════════════════════════════════════════ */
function MantModal({ isOpen, onClose, onSaved, mant, vehiculos, allProgs }) {
  const { metodos: metodosPagoDyn } = useMetodosPago();
  const [form, setForm] = useState({
    vehiculo_id: '', programacion_id: '', tipo: 'preventivo', descripcion: '',
    kilometraje: '', costo: '', proveedor: '', fecha: today(),
    proximo_km: '', proximo_fecha: '', estado: 'completado',
    registrar_en_caja: false, metodo_pago: 'efectivo',
  });
  const [vehProgs, setVehProgs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cajaAbierta, setCajaAbierta] = useState(false);

  useEffect(() => {
    if (isOpen && mant) {
      setForm({
        vehiculo_id: mant.vehiculo_id, programacion_id: '', tipo: mant.tipo,
        descripcion: mant.descripcion, kilometraje: mant.kilometraje || '',
        costo: mant.costo || '', proveedor: mant.proveedor || '',
        fecha: mant.fecha?.slice(0, 10) || today(),
        proximo_km: mant.proximo_km || '', proximo_fecha: mant.proximo_fecha?.slice(0, 10) || '',
        estado: mant.estado,
        registrar_en_caja: false, metodo_pago: 'efectivo',
      });
      setVehProgs([]);
      setCajaAbierta(false);
    } else if (isOpen) {
      setForm({
        vehiculo_id: '', programacion_id: '', tipo: 'preventivo', descripcion: '',
        kilometraje: '', costo: '', proveedor: '', fecha: today(),
        proximo_km: '', proximo_fecha: '', estado: 'completado',
        registrar_en_caja: false, metodo_pago: 'efectivo',
      });
      setVehProgs([]);
      // Verificar si hay caja abierta (solo al crear)
      api.get('/caja').then(r => setCajaAbierta(!!r.data?.id)).catch(() => setCajaAbierta(false));
    }
    setError('');
  }, [isOpen, mant]);

  // Cuando cambia el vehículo, cargar sus programaciones
  useEffect(() => {
    if (!form.vehiculo_id || mant) { setVehProgs([]); return; }
    const filtered = allProgs.filter(p => String(p.vehiculo_id) === String(form.vehiculo_id));
    setVehProgs(filtered);
  }, [form.vehiculo_id, allProgs, mant]);

  if (!isOpen) return null;

  function handleSelectProg(progId) {
    if (!progId) {
      setForm(f => ({ ...f, programacion_id: '', descripcion: '', tipo: 'preventivo' }));
      return;
    }
    const prog = vehProgs.find(p => String(p.id) === String(progId));
    if (prog) {
      setForm(f => ({
        ...f,
        programacion_id: progId,
        descripcion: prog.tipo_mantenimiento + (prog.descripcion ? ' - ' + prog.descripcion : ''),
        tipo: 'preventivo',
        kilometraje: f.kilometraje || prog.kilometraje_actual || '',
      }));
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.vehiculo_id || !form.descripcion) return setError('Vehiculo y descripcion son obligatorios');
    setLoading(true); setError('');
    try {
      const payload = { ...form };
      if (!payload.programacion_id) delete payload.programacion_id;
      if (payload.kilometraje) payload.kilometraje = Number(payload.kilometraje);
      if (mant) {
        delete payload.programacion_id;
        delete payload.registrar_en_caja;
        delete payload.metodo_pago;
        await actualizarMantenimiento(mant.id, payload);
      } else {
        if (!payload.registrar_en_caja) {
          delete payload.registrar_en_caja;
          delete payload.metodo_pago;
        }
        await crearMantenimiento(payload);
      }
      onSaved(); onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error guardando');
    } finally { setLoading(false); }
  }

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const selectedVeh = vehiculos.find(v => String(v.id) === String(form.vehiculo_id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">{mant ? 'Editar Registro' : 'Nuevo Registro'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

          {/* Vehiculo */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Vehiculo *</label>
            <select className={inputCls} value={form.vehiculo_id} onChange={e => { upd('vehiculo_id', e.target.value); upd('programacion_id', ''); }} required>
              <option value="">Seleccionar…</option>
              {vehiculos.map(v => (
                <option key={v.id} value={v.id}>{v.placa} {v.kilometraje_actual ? `(${v.kilometraje_actual.toLocaleString()} km)` : ''}</option>
              ))}
            </select>
          </div>

          {/* Programacion vinculada — solo en crear */}
          {!mant && vehProgs.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Vincular a programacion</label>
              <select className={inputCls} value={form.programacion_id} onChange={e => handleSelectProg(e.target.value)}>
                <option value="">— Sin vincular (registro libre) —</option>
                {vehProgs.map(p => {
                  const restante = p.km_restante;
                  const tag = restante <= 0 ? ' [VENCIDO]' : restante <= 500 ? ' [PROXIMO]' : '';
                  return (
                    <option key={p.id} value={p.id}>
                      {p.tipo_mantenimiento} — cada {p.cada_km?.toLocaleString()} km{tag}
                    </option>
                  );
                })}
              </select>
              {form.programacion_id && (
                <p className="text-xs text-blue-600 mt-1">Al guardar se recalculara cuando toca el proximo</p>
              )}
            </div>
          )}

          {/* Km actual info */}
          {selectedVeh && selectedVeh.kilometraje_actual > 0 && (
            <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-500">
              Km actual del vehiculo: <strong className="text-slate-700">{selectedVeh.kilometraje_actual.toLocaleString()} km</strong>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
              <select className={inputCls} value={form.tipo} onChange={e => upd('tipo', e.target.value)}>
                {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Fecha *</label>
              <input type="date" className={inputCls} value={form.fecha} onChange={e => upd('fecha', e.target.value)} required />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Descripcion *</label>
            <textarea className={inputCls} rows={2} value={form.descripcion} onChange={e => upd('descripcion', e.target.value)} required />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Km al realizar</label>
              <input type="number" min="0" className={inputCls} value={form.kilometraje} onChange={e => upd('kilometraje', e.target.value)} placeholder="Odometro" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Costo S/.</label>
              <input type="number" step="0.000001" min="0" className={inputCls} value={form.costo} onChange={e => upd('costo', e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Proveedor</label>
              <input className={inputCls} value={form.proveedor} onChange={e => upd('proveedor', e.target.value)} placeholder="Opcional" />
            </div>
          </div>

          {/* Registrar en caja — solo al crear, con caja abierta y costo > 0 */}
          {!mant && cajaAbierta && Number(form.costo) > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.registrar_en_caja} onChange={e => upd('registrar_en_caja', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" />
                <span className="text-sm font-medium text-slate-700">Registrar gasto en caja</span>
              </label>
              {form.registrar_en_caja && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Metodo de pago</label>
                  <select className={inputCls} value={form.metodo_pago} onChange={e => upd('metodo_pago', e.target.value)}>
                    {metodosPagoDyn.filter(m => m.nombre !== 'credito').map(m => (
                      <option key={m.nombre} value={m.nombre}>{m.etiqueta}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Proximo — solo si NO está vinculado a programación (la programación calcula solo) */}
          {!form.programacion_id && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Proximo km</label>
                <input type="number" min="0" className={inputCls} value={form.proximo_km} onChange={e => upd('proximo_km', e.target.value)} placeholder="Alerta al llegar" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Proxima fecha</label>
                <input type="date" className={inputCls} value={form.proximo_fecha} onChange={e => upd('proximo_fecha', e.target.value)} />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Estado</label>
            <select className={inputCls} value={form.estado} onChange={e => upd('estado', e.target.value)}>
              <option value="completado">Completado</option>
              <option value="pendiente">Pendiente</option>
              <option value="cancelado">Cancelado</option>
            </select>
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

/* ══════════════════════════════════════════════════════════════════
   Modal Nueva/Editar Programación
   ══════════════════════════════════════════════════════════════════ */
function ProgModal({ isOpen, onClose, onSaved, vehiculos, editProg }) {
  const [form, setForm] = useState({ vehiculo_id: '', tipo_mantenimiento: '', cada_km: '', categoria: 'general', descripcion: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && editProg) {
      setForm({
        vehiculo_id: editProg.vehiculo_id,
        tipo_mantenimiento: editProg.tipo_mantenimiento,
        cada_km: editProg.cada_km || '',
        categoria: editProg.categoria || 'general',
        descripcion: editProg.descripcion || '',
      });
    } else if (isOpen) {
      setForm({ vehiculo_id: '', tipo_mantenimiento: '', cada_km: '', categoria: 'general', descripcion: '' });
    }
    setError('');
  }, [isOpen, editProg]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.vehiculo_id || !form.tipo_mantenimiento || !form.cada_km) return setError('Vehiculo, tipo y cada_km son obligatorios');
    setLoading(true); setError('');
    try {
      if (editProg) {
        await actualizarProgramacion(editProg.id, {
          tipo_mantenimiento: form.tipo_mantenimiento,
          cada_km: Number(form.cada_km),
          categoria: form.categoria,
          descripcion: form.descripcion || null,
        });
      } else {
        await crearProgramacion({ ...form, cada_km: Number(form.cada_km) });
      }
      onSaved(); onClose();
    } catch (err) { setError(err.response?.data?.error || 'Error guardando'); }
    finally { setLoading(false); }
  }

  const upd = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">{editProg ? 'Editar Programacion' : 'Nueva Programacion'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Vehiculo *</label>
            <select className={inputCls} value={form.vehiculo_id} onChange={e => upd('vehiculo_id', e.target.value)} required disabled={!!editProg}>
              <option value="">Seleccionar…</option>
              {vehiculos.map(v => <option key={v.id} value={v.id}>{v.placa} ({v.kilometraje_actual?.toLocaleString() || 0} km)</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de mantenimiento *</label>
            <input className={inputCls} value={form.tipo_mantenimiento} onChange={e => upd('tipo_mantenimiento', e.target.value)} placeholder="Ej: Cambio de aceite, Rotacion llantas..." required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Cada cuantos km *</label>
              <input type="number" min="100" className={inputCls} value={form.cada_km} onChange={e => upd('cada_km', e.target.value)} placeholder="Ej: 5000" required />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Categoria</label>
              <select className={inputCls} value={form.categoria} onChange={e => upd('categoria', e.target.value)}>
                {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Descripcion</label>
            <textarea className={inputCls} rows={2} value={form.descripcion} onChange={e => upd('descripcion', e.target.value)} placeholder="Notas opcionales..." />
          </div>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">Cancelar</button>
            <button type="submit" disabled={loading} className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition">
              {loading ? 'Guardando…' : editProg ? 'Guardar cambios' : 'Crear Programacion'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════ */
export default function Mantenimientos() {
  const [tab, setTab] = useState('historial');

  // Historial state
  const [data, setData] = useState([]);
  const [alertas, setAlertas] = useState([]);
  const [vehiculos, setVehiculos] = useState([]);
  const [filtros, setFiltros] = useState({ vehiculo_id: '', tipo: '', fecha_inicio: '', fecha_fin: '' });
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editMant, setEditMant] = useState(null);

  // Programados state
  const [progs, setProgs] = useState([]);
  const [progAlertas, setProgAlertas] = useState([]);
  const [progLoading, setProgLoading] = useState(false);
  const [progModalOpen, setProgModalOpen] = useState(false);
  const [editProg, setEditProg] = useState(null);
  const [progFiltro, setProgFiltro] = useState('');

  // Proximos mantenimientos state
  const [proximos, setProximos] = useState([]);
  const [proximosOpen, setProximosOpen] = useState(true);

  const cargarHistorial = useCallback(async () => {
    setLoading(true);
    try {
      const params = { ...filtros, page, limit: 20 };
      Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });
      const [res, al] = await Promise.all([
        listarMantenimientos(params),
        obtenerAlertas(),
      ]);
      setData(res.data);
      setPages(res.pages);
      setAlertas(al);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [filtros, page]);

  const cargarProgramados = useCallback(async () => {
    setProgLoading(true);
    try {
      const params = {};
      if (progFiltro) params.vehiculo_id = progFiltro;
      const [res, al] = await Promise.all([
        listarProgramaciones(params),
        obtenerAlertasProgramadas(),
      ]);
      setProgs(res.data || []);
      setProgAlertas(al || []);
    } catch (err) { console.error(err); }
    finally { setProgLoading(false); }
  }, [progFiltro]);

  useEffect(() => { cargarHistorial(); }, [cargarHistorial]);
  useEffect(() => { cargarProgramados(); }, [cargarProgramados]);

  useEffect(() => {
    api.get('/vehiculos').then(r => setVehiculos(r.data?.data || r.data || [])).catch(() => {});
  }, []);

  const cargarProximos = useCallback(async () => {
    try {
      const res = await obtenerProximos();
      const rows = res.data || [];
      setProximos(rows);
      // Auto-open if there are overdue or soon items
      const hasUrgent = rows.some(r => r.km_restantes <= 500);
      setProximosOpen(hasUrgent);
    } catch (err) { console.error(err); }
  }, []);

  useEffect(() => { cargarProximos(); }, [cargarProximos]);

  function handleNew() { setEditMant(null); setModalOpen(true); }
  function handleEdit(m) { setEditMant(m); setModalOpen(true); }
  async function handleDelete(id) {
    if (!confirm('Eliminar este registro?')) return;
    try { await eliminarMantenimiento(id); cargarHistorial(); } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  function handleNewProg() { setEditProg(null); setProgModalOpen(true); }
  function handleEditProg(p) { setEditProg(p); setProgModalOpen(true); }
  async function handleDeleteProg(id) {
    if (!confirm('Desactivar esta programacion?')) return;
    try { await eliminarProgramacion(id); cargarProgramados(); } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  function onSaved() { cargarHistorial(); cargarProgramados(); cargarProximos(); }

  const updFiltro = (k, v) => { setFiltros(f => ({ ...f, [k]: v })); setPage(1); };

  // Alertas solo de programaciones (las alertas "manuales" de mantenimientos con proximo_km/fecha se mantienen)
  const allAlertas = [
    ...alertas.map(a => ({ ...a, source: 'mant' })),
    ...progAlertas.map(a => ({ ...a, source: 'prog', descripcion: a.tipo_mantenimiento })),
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Mantenimiento de Vehiculos</h1>
            <p className="text-sm text-slate-500">Programacion de alertas e historial de registros</p>
          </div>
          <div className="flex gap-2">
            {tab === 'historial' && (
              <button onClick={handleNew} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition">
                + Nuevo Registro
              </button>
            )}
            {tab === 'programados' && (
              <button onClick={handleNewProg} className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition">
                + Nueva Programacion
              </button>
            )}
          </div>
        </div>

        {/* Proximos mantenimientos */}
        {proximos.length > 0 && (() => {
          // Group by vehiculo
          const grouped = {};
          proximos.forEach(r => {
            if (!grouped[r.vehiculo_id]) {
              grouped[r.vehiculo_id] = { placa: r.placa, tipo_vehiculo: r.tipo_vehiculo, kilometraje_actual: r.kilometraje_actual, items: [] };
            }
            grouped[r.vehiculo_id].items.push(r);
          });
          const vehicles = Object.values(grouped);
          const hasAnyUrgent = proximos.some(r => r.km_restantes <= 500);

          return (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <button
                onClick={() => setProximosOpen(o => !o)}
                className="w-full flex items-center justify-between px-5 py-4 text-left"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${hasAnyUrgent ? 'bg-orange-100' : 'bg-green-100'}`}>
                    <svg className={`w-5 h-5 ${hasAnyUrgent ? 'text-orange-600' : 'text-green-600'}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-sm font-semibold text-slate-800">Proximos mantenimientos</h2>
                    <p className="text-xs text-slate-500">{proximos.length} mantenimiento{proximos.length !== 1 ? 's' : ''} programado{proximos.length !== 1 ? 's' : ''} en {vehicles.length} vehiculo{vehicles.length !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <svg className={`w-5 h-5 text-slate-400 transition-transform ${proximosOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {proximosOpen && (
                <div className="px-5 pb-5 space-y-4">
                  {vehicles.map(veh => {
                    const worstKm = Math.min(...veh.items.map(i => i.km_restantes));
                    const headerColor = worstKm <= 0 ? 'border-red-200 bg-red-50' : worstKm < 500 ? 'border-orange-200 bg-orange-50' : 'border-green-200 bg-green-50';

                    return (
                      <div key={veh.placa} className={`rounded-lg border ${headerColor}`}>
                        <div className="flex items-center gap-3 px-4 py-3">
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h8m-8 4h8m-4 4v-4" />
                            </svg>
                            <span className="text-sm font-bold text-slate-800">{veh.placa}</span>
                          </div>
                          {veh.tipo_vehiculo && (
                            <span className="text-xs bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full">{veh.tipo_vehiculo}</span>
                          )}
                          <span className="text-xs text-slate-500 ml-auto">{veh.kilometraje_actual?.toLocaleString()} km actuales</span>
                        </div>
                        <div className="px-4 pb-3 space-y-2">
                          {veh.items.map(item => {
                            const km = item.km_restantes;
                            const isOverdue = km <= 0;
                            const isSoon = km > 0 && km < 500;
                            const badgeColor = isOverdue ? 'bg-red-100 text-red-700 border-red-300' : isSoon ? 'bg-orange-100 text-orange-700 border-orange-300' : 'bg-green-100 text-green-700 border-green-300';
                            const badgeLabel = isOverdue ? 'Vencido' : isSoon ? 'Proximo' : 'OK';
                            const barColor = isOverdue ? 'bg-red-500' : isSoon ? 'bg-orange-400' : 'bg-green-500';
                            // Bar width: 100% if overdue, proportional otherwise (cap at frecuencia_km)
                            const barPct = isOverdue ? 100 : item.frecuencia_km > 0 ? Math.min(100, Math.round(((item.frecuencia_km - km) / item.frecuencia_km) * 100)) : 0;

                            return (
                              <div key={item.prog_id} className="bg-white rounded-lg border border-slate-100 px-3 py-2">
                                <div className="flex items-center justify-between gap-2 mb-1.5">
                                  <span className="text-sm font-medium text-slate-700 truncate">
                                    {item.tipo_mantenimiento}{item.descripcion ? ` — ${item.descripcion}` : ''}
                                  </span>
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${badgeColor}`}>
                                    {badgeLabel} {isOverdue ? '' : `${km.toLocaleString()} km`}
                                  </span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${barPct}%` }} />
                                  </div>
                                  <span className="text-xs text-slate-400 whitespace-nowrap tabular-nums">
                                    {item.frecuencia_km ? `cada ${item.frecuencia_km.toLocaleString()} km` : ''}
                                  </span>
                                </div>
                                {item.ultimo_fecha && (
                                  <p className="text-xs text-slate-400 mt-1">Ultimo: {item.ultimo_fecha.toString().slice(0, 10)} a {item.ultimo_km?.toLocaleString()} km</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        {/* Alertas unificadas */}
        {allAlertas.length > 0 && (
          <div className="space-y-2">
            {allAlertas.map((a, i) => (
              <div key={`${a.source}-${a.id}-${i}`} className={`rounded-lg px-4 py-3 text-sm flex items-start gap-3 ${a.nivel_alerta === 'vencido' ? 'bg-red-50 border border-red-200 text-red-700' : 'bg-yellow-50 border border-yellow-200 text-yellow-700'}`}>
                <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" /></svg>
                <div className="flex-1">
                  <span>
                    <strong>{a.placa}</strong> — {a.descripcion || a.tipo_mantenimiento}
                    {a.source === 'mant' && a.proximo_fecha && ` (fecha: ${a.proximo_fecha.slice(0, 10)})`}
                    {a.source === 'mant' && a.proximo_km && ` (km: ${a.proximo_km?.toLocaleString()}, actual: ${a.kilometraje_actual?.toLocaleString()})`}
                    {a.source === 'prog' && ` (cada ${a.cada_km?.toLocaleString()} km · restante: ${a.km_restante?.toLocaleString()} km)`}
                  </span>
                  {a.source === 'prog' && (
                    <button onClick={() => { setTab('historial'); setEditMant(null); setModalOpen(true); }}
                      className="ml-2 text-xs font-semibold underline hover:no-underline">
                      Registrar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex bg-slate-100 rounded-xl p-1 w-fit">
          {[
            { id: 'historial', label: 'Historial' },
            { id: 'programados', label: 'Programados' },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-5 py-2 text-sm font-semibold rounded-lg transition ${
                tab === t.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>
              {t.label}
              {t.id === 'programados' && progs.length > 0 && (
                <span className="ml-1.5 text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{progs.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* ═══ TAB HISTORIAL ═══ */}
        {tab === 'historial' && (
          <>
            <div className="flex flex-wrap gap-3">
              <select className={inputCls + ' !w-auto'} value={filtros.vehiculo_id} onChange={e => updFiltro('vehiculo_id', e.target.value)}>
                <option value="">Todos los vehiculos</option>
                {vehiculos.map(v => <option key={v.id} value={v.id}>{v.placa}</option>)}
              </select>
              <select className={inputCls + ' !w-auto'} value={filtros.tipo} onChange={e => updFiltro('tipo', e.target.value)}>
                <option value="">Todos los tipos</option>
                {Object.entries(TIPOS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <input type="date" className={inputCls + ' !w-auto'} value={filtros.fecha_inicio} onChange={e => updFiltro('fecha_inicio', e.target.value)} placeholder="Desde" />
              <input type="date" className={inputCls + ' !w-auto'} value={filtros.fecha_fin} onChange={e => updFiltro('fecha_fin', e.target.value)} placeholder="Hasta" />
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Fecha</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Vehiculo</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Tipo</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Descripcion</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Km</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Costo</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Estado</th>
                    <th className="px-4 py-3 font-medium text-slate-600">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={8} className="text-center py-8 text-slate-400">Cargando…</td></tr>}
                  {!loading && data.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-slate-400">Sin registros</td></tr>}
                  {!loading && data.map(m => (
                    <tr key={m.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                      <td className="px-4 py-3 text-slate-600">{m.fecha?.slice(0, 10)}</td>
                      <td className="px-4 py-3 font-medium text-slate-800">{m.placa}</td>
                      <td className="px-4 py-3"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TIPO_COLORS[m.tipo]}`}>{TIPOS[m.tipo]}</span></td>
                      <td className="px-4 py-3 text-slate-600 max-w-[200px] truncate">{m.descripcion}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{m.kilometraje ? m.kilometraje.toLocaleString() : '—'}</td>
                      <td className="px-4 py-3 text-right">{Number(m.costo) > 0 ? `S/. ${Number(m.costo).toFixed(6)}` : '—'}</td>
                      <td className="px-4 py-3"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${ESTADO_COLORS[m.estado]}`}>{m.estado}</span></td>
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
              {pages > 1 && (
                <div className="flex items-center justify-center gap-2 px-4 py-3 border-t border-slate-100">
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 text-sm rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40">Anterior</button>
                  <span className="text-sm text-slate-500">Pag {page} de {pages}</span>
                  <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 text-sm rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40">Siguiente</button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ═══ TAB PROGRAMADOS ═══ */}
        {tab === 'programados' && (
          <>
            <div className="flex flex-wrap gap-3">
              <select className={inputCls + ' !w-auto'} value={progFiltro} onChange={e => setProgFiltro(e.target.value)}>
                <option value="">Todos los vehiculos</option>
                {vehiculos.map(v => <option key={v.id} value={v.id}>{v.placa}</option>)}
              </select>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Vehiculo</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Tipo</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Categoria</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Cada</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Ultimo (km)</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Proximo (km)</th>
                    <th className="text-right px-4 py-3 font-medium text-slate-600">Restante</th>
                    <th className="text-left px-4 py-3 font-medium text-slate-600">Estado</th>
                    <th className="px-4 py-3 font-medium text-slate-600">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {progLoading && <tr><td colSpan={9} className="text-center py-8 text-slate-400">Cargando…</td></tr>}
                  {!progLoading && progs.length === 0 && <tr><td colSpan={9} className="text-center py-8 text-slate-400">Sin programaciones. Crea una para recibir alertas automaticas.</td></tr>}
                  {!progLoading && progs.map(p => {
                    const restante = p.km_restante;
                    const colorRestante = restante <= 0 ? 'text-red-600 font-bold' : restante <= 500 ? 'text-yellow-600 font-bold' : 'text-green-600 font-medium';
                    const estadoLabel = restante <= 0 ? 'Vencido' : restante <= 500 ? 'Proximo' : 'OK';
                    const estadoColor = restante <= 0 ? 'bg-red-100 text-red-700' : restante <= 500 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700';
                    const catColor = CAT_COLORS[p.categoria] || CAT_COLORS.general;
                    return (
                      <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                        <td className="px-4 py-3 font-medium text-slate-800">{p.placa}</td>
                        <td className="px-4 py-3 text-slate-600">{p.tipo_mantenimiento}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${catColor}`}>{p.categoria || 'general'}</span>
                        </td>
                        <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{p.cada_km?.toLocaleString()} km</td>
                        <td className="px-4 py-3 text-right text-slate-600 tabular-nums">{p.ultimo_km_realizado?.toLocaleString()}</td>
                        <td className="px-4 py-3 text-right text-slate-700 font-medium tabular-nums">{p.proximo_km?.toLocaleString()}</td>
                        <td className={`px-4 py-3 text-right tabular-nums ${colorRestante}`}>{restante?.toLocaleString()} km</td>
                        <td className="px-4 py-3"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${estadoColor}`}>{estadoLabel}</span></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => handleEditProg(p)} className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-600 transition" title="Editar">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                            </button>
                            <button onClick={() => handleDeleteProg(p.id)} className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition" title="Desactivar">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      <MantModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSaved={onSaved} mant={editMant} vehiculos={vehiculos} allProgs={progs} />
      <ProgModal isOpen={progModalOpen} onClose={() => { setProgModalOpen(false); setEditProg(null); }} onSaved={onSaved} vehiculos={vehiculos} editProg={editProg} />
    </Layout>
  );
}
