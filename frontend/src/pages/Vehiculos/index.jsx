import { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import {
  listarVehiculos, crearVehiculo, actualizarVehiculo, desactivarVehiculo, historialKm,
} from '../../services/vehiculosService';
import { listarRepartidores } from '../../services/pedidosService';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

/* ═══ Modal Crear/Editar Vehículo ═══ */
function VehiculoModal({ isOpen, onClose, onSaved, editVehiculo, repartidores }) {
  const [placa, setPlaca]       = useState('');
  const [marca, setMarca]       = useState('');
  const [modelo, setModelo]     = useState('');
  const [color, setColor]       = useState('');
  const [capacidad, setCapacidad] = useState('');
  const [repartidorId, setRepartidorId] = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    if (isOpen) {
      if (editVehiculo) {
        setPlaca(editVehiculo.placa || '');
        setMarca(editVehiculo.marca || '');
        setModelo(editVehiculo.modelo || '');
        setColor(editVehiculo.color || '');
        setCapacidad(editVehiculo.capacidad_notas || '');
        setRepartidorId(editVehiculo.repartidor_id || '');
      } else {
        setPlaca(''); setMarca(''); setModelo(''); setColor('');
        setCapacidad(''); setRepartidorId('');
      }
      setError('');
    }
  }, [isOpen, editVehiculo]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!placa.trim()) return setError('La placa es requerida');

    setError(''); setLoading(true);
    try {
      const data = {
        placa: placa.trim(),
        marca: marca.trim() || null,
        modelo: modelo.trim() || null,
        color: color.trim() || null,
        capacidad_notas: capacidad.trim() || null,
        repartidor_id: repartidorId || null,
      };

      if (editVehiculo) {
        await actualizarVehiculo(editVehiculo.id, data);
      } else {
        await crearVehiculo(data);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar');
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-base font-semibold text-slate-800">
            {editVehiculo ? 'Editar vehículo' : 'Nuevo vehículo'}
          </h2>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Placa <span className="text-red-400">*</span></label>
              <input className={inputCls} value={placa} onChange={e => setPlaca(e.target.value.toUpperCase())} placeholder="ABC-123" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Marca</label>
              <input className={inputCls} value={marca} onChange={e => setMarca(e.target.value)} placeholder="Toyota, Hyundai..." />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Modelo</label>
              <input className={inputCls} value={modelo} onChange={e => setModelo(e.target.value)} placeholder="Hilux, Porter..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Color</label>
              <input className={inputCls} value={color} onChange={e => setColor(e.target.value)} placeholder="Blanco, azul..." />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Capacidad / Notas</label>
            <input className={inputCls} value={capacidad} onChange={e => setCapacidad(e.target.value)} placeholder="Ej: 200 bidones, carga pesada..." />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Repartidor asignado</label>
            <select className={inputCls} value={repartidorId} onChange={e => setRepartidorId(e.target.value)}>
              <option value="">Sin asignar</option>
              {repartidores.map(r => <option key={r.id} value={r.id}>{r.nombre}</option>)}
            </select>
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">Cancelar</button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition">
              {loading ? 'Guardando...' : editVehiculo ? 'Guardar cambios' : 'Crear vehículo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ═══ Modal Historial KM ═══ */
function KmModal({ isOpen, onClose, vehiculo }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen && vehiculo) {
      setLoading(true);
      historialKm(vehiculo.id).then(r => setData(r.data || [])).catch(() => setData([])).finally(() => setLoading(false));
    }
  }, [isOpen, vehiculo]);

  if (!isOpen || !vehiculo) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Historial KM — {vehiculo.placa}</h2>
            <p className="text-xs text-slate-400">Km actual: {(vehiculo.kilometraje_actual || 0).toLocaleString()} km</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-4">
          {loading ? (
            <p className="text-center text-slate-400 py-8">Cargando…</p>
          ) : data.length === 0 ? (
            <p className="text-center text-slate-400 py-8">Sin historial de km</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left py-2 text-xs font-medium text-slate-500">Fecha</th>
                  <th className="text-right py-2 text-xs font-medium text-slate-500">Inicio</th>
                  <th className="text-right py-2 text-xs font-medium text-slate-500">Fin</th>
                  <th className="text-right py-2 text-xs font-medium text-slate-500">Recorrido</th>
                  <th className="text-left py-2 text-xs font-medium text-slate-500">Repartidor</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td className="py-2 text-slate-600">{r.fecha?.slice(0, 10)}</td>
                    <td className="py-2 text-right text-slate-600">{r.km_inicio?.toLocaleString()}</td>
                    <td className="py-2 text-right text-slate-600">{r.km_fin?.toLocaleString()}</td>
                    <td className="py-2 text-right font-medium text-blue-600">{r.recorrido?.toLocaleString()} km</td>
                    <td className="py-2 text-slate-500">{r.repartidor_nombre}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══ Página principal ═══ */
export default function Vehiculos() {
  const [vehiculos, setVehiculos] = useState([]);
  const [repartidores, setRepartidores] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editVehiculo, setEditVehiculo] = useState(null);
  const [kmVehiculo, setKmVehiculo] = useState(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [vRes, rRes] = await Promise.all([
        listarVehiculos(),
        listarRepartidores(),
      ]);
      setVehiculos(Array.isArray(vRes.data) ? vRes.data : []);
      setRepartidores(Array.isArray(rRes.data) ? rRes.data : []);
    } catch { setVehiculos([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = vehiculos.filter(v => {
    if (!searchInput.trim()) return true;
    const q = searchInput.toLowerCase();
    return (v.placa || '').toLowerCase().includes(q)
      || (v.marca || '').toLowerCase().includes(q)
      || (v.modelo || '').toLowerCase().includes(q)
      || (v.repartidor_nombre || '').toLowerCase().includes(q);
  });

  function openEdit(v) { setEditVehiculo(v); setModalOpen(true); }
  function openCreate() { setEditVehiculo(null); setModalOpen(true); }

  async function handleDeactivate(v) {
    if (!window.confirm(`¿Desactivar el vehículo "${v.placa}"?`)) return;
    try {
      await desactivarVehiculo(v.id);
      fetchData();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Vehículos</h1>
          <p className="text-sm text-slate-500 mt-0.5">{loading ? '...' : `${filtered.length} vehículo${filtered.length !== 1 ? 's' : ''}`}</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition shadow-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Nuevo vehículo
        </button>
      </div>

      {/* Filtro búsqueda */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
          <input className="pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition w-64"
            value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Buscar por placa, marca, repartidor..." />
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                {['Placa', 'Marca', 'Modelo', 'Color', 'KM', 'Repartidor', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 animate-pulse rounded" style={{ width: j === 0 ? '100px' : '80px' }} /></td>
                  ))}</tr>
                ))
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">No hay vehículos</td></tr>
              ) : filtered.map(v => (
                <tr key={v.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{v.placa}</td>
                  <td className="px-4 py-3 text-slate-600">{v.marca || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{v.modelo || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{v.color || '—'}</td>
                  <td className="px-4 py-3 text-slate-600 tabular-nums">{(v.kilometraje_actual || 0).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {v.repartidor_nombre ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">{v.repartidor_nombre}</span>
                    ) : (
                      <span className="text-slate-400 text-xs">Sin asignar</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => setKmVehiculo(v)}
                        className="px-2 py-1 text-xs text-slate-600 hover:bg-slate-50 border border-slate-200 rounded-lg transition font-medium">
                        KM
                      </button>
                      <button onClick={() => openEdit(v)}
                        className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-lg transition font-medium">
                        Editar
                      </button>
                      <button onClick={() => handleDeactivate(v)}
                        className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition font-medium">
                        Desactivar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <VehiculoModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditVehiculo(null); }}
        onSaved={fetchData} editVehiculo={editVehiculo} repartidores={repartidores} />
      <KmModal isOpen={!!kmVehiculo} onClose={() => setKmVehiculo(null)} vehiculo={kmVehiculo} />
    </Layout>
  );
}
