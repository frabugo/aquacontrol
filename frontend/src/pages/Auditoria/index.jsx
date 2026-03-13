import { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import { getAuditLog } from '../../services/auditService';

const MODULOS = ['clientes', 'ventas', 'pedidos', 'caja', 'usuarios', 'mantenimientos', 'rutas', 'proveedores'];
const ACCIONES = ['crear', 'editar', 'eliminar', 'cancelar', 'abrir', 'cerrar', 'reabrir'];

const ACCION_COLORS = {
  crear:    'bg-green-100 text-green-700',
  editar:   'bg-blue-100 text-blue-700',
  eliminar: 'bg-red-100 text-red-700',
  cancelar: 'bg-orange-100 text-orange-700',
  abrir:    'bg-emerald-100 text-emerald-700',
  cerrar:   'bg-slate-100 text-slate-700',
  reabrir:  'bg-amber-100 text-amber-700',
};

const ROL_COLORS = {
  admin:     'bg-purple-100 text-purple-700',
  encargada: 'bg-blue-100 text-blue-700',
  vendedor:  'bg-green-100 text-green-700',
  operario:  'bg-slate-100 text-slate-700',
  chofer:    'bg-amber-100 text-amber-700',
};

export default function Auditoria() {
  const [data, setData] = useState([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const [filtros, setFiltros] = useState({
    q: '', modulo: '', accion: '', fecha_ini: '', fecha_fin: '', page: 1,
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = { limit: 30, ...filtros };
      Object.keys(params).forEach(k => { if (!params[k]) delete params[k]; });
      const res = await getAuditLog(params);
      setData(res.data);
      setTotal(res.total);
      setPages(res.pages);
    } catch (err) {
      console.error('Error cargando auditoría:', err);
    } finally {
      setLoading(false);
    }
  }, [filtros]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleFilter = (key, val) => {
    setFiltros(prev => ({ ...prev, [key]: val, page: 1 }));
  };

  const formatFecha = (d) => {
    if (!d) return '-';
    const dt = new Date(d);
    return dt.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      + ' ' + dt.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  };

  const renderDetalle = (detalle) => {
    if (!detalle) return <span className="text-slate-400 text-xs">-</span>;
    try {
      const obj = typeof detalle === 'string' ? JSON.parse(detalle) : detalle;
      return (
        <pre className="text-xs bg-slate-50 p-2 rounded max-w-md overflow-x-auto whitespace-pre-wrap">
          {JSON.stringify(obj, null, 2)}
        </pre>
      );
    } catch {
      return <span className="text-xs">{String(detalle)}</span>;
    }
  };

  return (
    <Layout>
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-slate-800">Auditoría</h1>

        {/* Filtros */}
        <div className="flex flex-wrap gap-2">
          <input
            type="text"
            placeholder="Buscar..."
            value={filtros.q}
            onChange={e => handleFilter('q', e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-48 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          <select
            value={filtros.modulo}
            onChange={e => handleFilter('modulo', e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todos los módulos</option>
            {MODULOS.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <select
            value={filtros.accion}
            onChange={e => handleFilter('accion', e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Todas las acciones</option>
            {ACCIONES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <input
            type="date"
            value={filtros.fecha_ini}
            onChange={e => handleFilter('fecha_ini', e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
          />
          <input
            type="date"
            value={filtros.fecha_fin}
            onChange={e => handleFilter('fecha_fin', e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                <th className="px-3 py-2 text-left font-medium">Fecha</th>
                <th className="px-3 py-2 text-left font-medium">Usuario</th>
                <th className="px-3 py-2 text-left font-medium">Módulo</th>
                <th className="px-3 py-2 text-left font-medium">Acción</th>
                <th className="px-3 py-2 text-left font-medium">Tabla</th>
                <th className="px-3 py-2 text-left font-medium">ID</th>
                <th className="px-3 py-2 text-left font-medium">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="text-center py-8 text-slate-400">Cargando...</td></tr>
              ) : data.length === 0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-slate-400">Sin registros</td></tr>
              ) : data.map(row => (
                <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-slate-500">{formatFecha(row.created_at)}</td>
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-700">{row.usuario_nombre}</span>
                    <span className={`ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${ROL_COLORS[row.usuario_rol] || 'bg-slate-100 text-slate-600'}`}>
                      {row.usuario_rol}
                    </span>
                  </td>
                  <td className="px-3 py-2 capitalize text-slate-600">{row.modulo}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ACCION_COLORS[row.accion] || 'bg-slate-100 text-slate-600'}`}>
                      {row.accion}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-500 font-mono text-xs">{row.tabla}</td>
                  <td className="px-3 py-2 text-slate-500">{row.registro_id || '-'}</td>
                  <td className="px-3 py-2">
                    {row.detalle ? (
                      <button
                        onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                        className="text-blue-600 hover:text-blue-800 text-xs underline"
                      >
                        {expanded === row.id ? 'Ocultar' : 'Ver'}
                      </button>
                    ) : (
                      <span className="text-slate-400 text-xs">-</span>
                    )}
                    {expanded === row.id && (
                      <div className="mt-1">{renderDetalle(row.detalle)}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {pages > 1 && (
          <div className="flex items-center justify-between text-sm text-slate-600">
            <span>{total} registros</span>
            <div className="flex gap-1">
              <button
                disabled={filtros.page <= 1}
                onClick={() => setFiltros(p => ({ ...p, page: p.page - 1 }))}
                className="px-3 py-1 rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-40"
              >
                Anterior
              </button>
              <span className="px-3 py-1">Pág {filtros.page} / {pages}</span>
              <button
                disabled={filtros.page >= pages}
                onClick={() => setFiltros(p => ({ ...p, page: p.page + 1 }))}
                className="px-3 py-1 rounded border border-slate-300 hover:bg-slate-50 disabled:opacity-40"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
