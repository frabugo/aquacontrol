import { useState, useEffect } from 'react';
import Layout from '../../components/Layout';
import api from '../../services/api';

const TIPO_BADGE = {
  compra_empresa:     { label: 'Compra',         color: 'bg-blue-100 text-blue-700' },
  llenado:            { label: 'Producción',      color: 'bg-green-100 text-green-700' },
  carga_salida:       { label: 'Carga vehículo',  color: 'bg-indigo-100 text-indigo-700' },
  venta:              { label: 'Venta',            color: 'bg-emerald-100 text-emerald-700' },
  devolucion_cliente: { label: 'Dev. cliente',     color: 'bg-amber-100 text-amber-700' },
  devolucion_ruta:    { label: 'Dev. ruta',        color: 'bg-purple-100 text-purple-700' },
  lavado_fin:         { label: 'Lavado',           color: 'bg-cyan-100 text-cyan-700' },
  ajuste:             { label: 'Ajuste',           color: 'bg-slate-100 text-slate-700' },
};

const RESUMEN_ORDER = [
  'compra_empresa', 'llenado', 'carga_salida', 'venta',
  'devolucion_cliente', 'devolucion_ruta', 'lavado_fin', 'ajuste',
];

function fechaHoy() {
  return new Date().toISOString().slice(0, 10);
}
function fecha30() {
  return new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
}

export default function Trazabilidad() {
  const [presentaciones, setPresentaciones] = useState([]);
  const [presId, setPresId]       = useState('');
  const [fechaIni, setFechaIni]   = useState(fecha30);
  const [fechaFin, setFechaFin]   = useState(fechaHoy);
  const [movimientos, setMovimientos] = useState([]);
  const [resumen, setResumen]     = useState({});
  const [loading, setLoading]     = useState(false);

  useEffect(() => {
    api.get('/presentaciones?limit=200&activo=1')
      .then(r => {
        const list = r.data.data || r.data;
        setPresentaciones(list);
        if (list.length > 0 && !presId) setPresId(String(list[0].id));
      })
      .catch(() => {});
  }, []);

  async function buscar() {
    if (!presId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/presentaciones/${presId}/trazabilidad`, {
        params: { fecha_inicio: fechaIni, fecha_fin: fechaFin },
      });
      setMovimientos(data.data || []);
      setResumen(data.resumen || {});
    } catch {
      setMovimientos([]);
      setResumen({});
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (presId) buscar();
  }, [presId]);

  function formatFecha(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' })
      + ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  }

  function badge(tipo) {
    const b = TIPO_BADGE[tipo] || { label: tipo, color: 'bg-gray-100 text-gray-600' };
    return (
      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${b.color}`}>
        {b.label}
      </span>
    );
  }

  function detalle(m) {
    const parts = [];
    if (m.cliente_nombre)     parts.push(m.cliente_nombre);
    if (m.repartidor_nombre)  parts.push(`Rep: ${m.repartidor_nombre}`);
    if (m.venta_folio)        parts.push(`Folio: ${m.venta_folio}`);
    if (m.motivo)             parts.push(m.motivo);
    return parts.join(' | ') || '-';
  }

  return (
    <Layout>
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-slate-800">Trazabilidad de Presentaciones</h1>

        {/* Filtros */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Presentación</label>
            <select
              value={presId}
              onChange={e => setPresId(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Seleccionar...</option>
              {presentaciones.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Desde</label>
            <input type="date" value={fechaIni} onChange={e => setFechaIni(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Hasta</label>
            <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
          </div>
          <button
            onClick={buscar}
            disabled={!presId || loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </div>

        {/* Cards resumen */}
        {Object.keys(resumen).length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8 gap-3">
            {RESUMEN_ORDER.filter(t => resumen[t]).map(tipo => {
              const b = TIPO_BADGE[tipo] || { label: tipo, color: '' };
              return (
                <div key={tipo} className="bg-white rounded-xl border border-slate-200 p-3 text-center">
                  <p className="text-xs text-slate-500">{b.label}</p>
                  <p className="text-lg font-bold text-slate-800">{resumen[tipo]}</p>
                </div>
              );
            })}
          </div>
        )}

        {/* Tabla */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-left">
                <th className="px-4 py-3 font-medium">Fecha/Hora</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium text-right">Cantidad</th>
                <th className="px-4 py-3 font-medium">Origen → Destino</th>
                <th className="px-4 py-3 font-medium">Usuario</th>
                <th className="px-4 py-3 font-medium">Detalle</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {movimientos.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                    {loading ? 'Cargando...' : 'No hay movimientos en el periodo seleccionado'}
                  </td>
                </tr>
              ) : movimientos.map(m => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2.5 whitespace-nowrap text-slate-600">{formatFecha(m.fecha_hora)}</td>
                  <td className="px-4 py-2.5">{badge(m.tipo)}</td>
                  <td className="px-4 py-2.5 text-right font-medium tabular-nums">
                    {['venta', 'carga_salida', 'rotura', 'baja', 'perdida'].includes(m.tipo)
                      ? <span className="text-red-600">-{m.cantidad}</span>
                      : <span className="text-green-600">+{m.cantidad}</span>
                    }
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">
                    {m.estado_origen || '—'} → {m.estado_destino || '—'}
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">{m.usuario_nombre || '-'}</td>
                  <td className="px-4 py-2.5 text-slate-500 text-xs max-w-[300px] truncate" title={detalle(m)}>
                    {detalle(m)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
