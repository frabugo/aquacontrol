import { useState, useEffect, useCallback } from 'react';
import Layout from '../../components/Layout';
import { exportarVentas, exportarCaja, exportarProduccion, exportarDeudas, obtenerGraficos, obtenerEntregas } from '../../services/reportesService';
import RentabilidadClientes from './RentabilidadClientes';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';

const ESTADO_COLORS = {
  entregado: '#22c55e', no_entregado: '#ef4444', pendiente: '#f59e0b',
  en_camino: '#3b82f6', reasignado: '#94a3b8',
};
const ESTADO_LABELS = {
  entregado: 'Entregado', no_entregado: 'No entregado', pendiente: 'Pendiente',
  en_camino: 'En camino', reasignado: 'Reasignado',
};

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function ReporteCard({ title, description, icon, children, onExport, loading }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
            {icon}
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{title}</h3>
            <p className="text-xs text-slate-400">{description}</p>
          </div>
        </div>
      </div>
      <div className="px-5 py-4 space-y-3">
        {children}
        <button
          onClick={onExport}
          disabled={loading}
          className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-green-400 rounded-lg transition flex items-center justify-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {loading ? 'Generando…' : 'Descargar Excel'}
        </button>
      </div>
    </div>
  );
}

function formatSoles(n) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(n);
}

function hace7dias() {
  const d = new Date(); d.setDate(d.getDate() - 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function hace30dias() {
  const d = new Date(); d.setDate(d.getDate() - 30);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function inicioMes() {
  const d = new Date(); d.setDate(1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDia(str) {
  if (!str) return '';
  const parts = str.split('-');
  return `${parts[2]}/${parts[1]}`;
}

const chartCardCls = 'bg-white rounded-xl border border-slate-200 shadow-sm p-5';

export default function Reportes() {
  const [loading, setLoading] = useState({});
  const [tabActiva, setTabActiva] = useState('graficos');
  const [filtros, setFiltros] = useState({
    ventas: { fecha_inicio: today(), fecha_fin: today() },
    caja: { fecha_inicio: today(), fecha_fin: today() },
    produccion: { fecha_inicio: '', fecha_fin: '', estado: '' },
  });

  /* ── Chart state ── */
  const [chartFechaIni, setChartFechaIni] = useState(hace7dias());
  const [chartFechaFin, setChartFechaFin] = useState(today());
  const [chartData, setChartData] = useState({ ventas_por_dia: [], top_productos: [], top_clientes: [] });
  const [entregasData, setEntregasData] = useState({ por_estado: [], motivos: [] });
  const [chartLoading, setChartLoading] = useState(false);

  const fetchGraficos = useCallback(() => {
    setChartLoading(true);
    const params = { fecha_inicio: chartFechaIni, fecha_fin: chartFechaFin };
    Promise.all([
      obtenerGraficos(params).then(data => setChartData(data)),
      obtenerEntregas(params).then(data => setEntregasData(data)),
    ])
      .catch(() => {})
      .finally(() => setChartLoading(false));
  }, [chartFechaIni, chartFechaFin]);

  useEffect(() => { fetchGraficos(); }, [fetchGraficos]);

  const setChartRango = (fi, ff) => { setChartFechaIni(fi); setChartFechaFin(ff); };

  function updateFiltro(tipo, campo, valor) {
    setFiltros(prev => ({ ...prev, [tipo]: { ...prev[tipo], [campo]: valor } }));
  }

  async function handleExport(tipo, fn, params) {
    setLoading(prev => ({ ...prev, [tipo]: true }));
    try {
      await fn(params);
    } catch (err) {
      alert(err.response?.data?.error || 'Error generando reporte');
    } finally {
      setLoading(prev => ({ ...prev, [tipo]: false }));
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Reportes</h1>
          <p className="text-sm text-slate-500">Exportar datos a Excel</p>
        </div>

        {/* ── Chart date filters ── */}
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-slate-600">Desde</label>
          <input type="date" value={chartFechaIni} onChange={e => setChartFechaIni(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
          <label className="text-sm text-slate-600">Hasta</label>
          <input type="date" value={chartFechaFin} onChange={e => setChartFechaFin(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
          {[
            { label: 'Hoy',     fn: () => setChartRango(today(), today()) },
            { label: '7 dias',  fn: () => setChartRango(hace7dias(), today()) },
            { label: 'Mes',     fn: () => setChartRango(inicioMes(), today()) },
            { label: '30 dias', fn: () => setChartRango(hace30dias(), today()) },
          ].map(b => (
            <button key={b.label} onClick={b.fn}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors">
              {b.label}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex bg-slate-100 rounded-xl p-1">
          {[
            { id: 'graficos', label: 'Graficos' },
            { id: 'rentabilidad', label: 'Rentabilidad Clientes' },
          ].map(tab => (
            <button key={tab.id} onClick={() => setTabActiva(tab.id)}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition ${
                tabActiva === tab.id ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}>{tab.label}</button>
          ))}
        </div>

        {tabActiva === 'rentabilidad' && <RentabilidadClientes />}

        {tabActiva === 'graficos' && <>
        {/* ── Charts grid ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {/* Ventas por dia - LineChart (full width) */}
          <div className={`${chartCardCls} xl:col-span-2`}>
            <h3 className="text-sm font-semibold text-slate-800 mb-1">Ventas por dia</h3>
            <p className="text-xs text-slate-400 mb-4">Monto total de ventas por cada dia del periodo</p>
            {chartLoading ? (
              <div className="h-64 flex items-center justify-center text-sm text-slate-400">Cargando...</div>
            ) : !chartData.ventas_por_dia?.length ? (
              <div className="h-64 flex items-center justify-center text-sm text-slate-400">Sin datos en este periodo</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData.ventas_por_dia}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="dia" tickFormatter={formatDia} tick={{ fontSize: 12 }} stroke="#94a3b8" />
                  <YAxis tickFormatter={v => `S/ ${v}`} tick={{ fontSize: 12 }} stroke="#94a3b8" width={80} />
                  <Tooltip
                    formatter={(value) => [formatSoles(Number(value)), 'Total']}
                    labelFormatter={formatDia}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="total" name="Monto (S/)" stroke="#2563eb" strokeWidth={2} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                  <Line type="monotone" dataKey="cantidad" name="Cantidad" stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Top productos - BarChart horizontal */}
          <div className={chartCardCls}>
            <h3 className="text-sm font-semibold text-slate-800 mb-1">Top 10 productos</h3>
            <p className="text-xs text-slate-400 mb-4">Productos mas vendidos por monto</p>
            {chartLoading ? (
              <div className="h-72 flex items-center justify-center text-sm text-slate-400">Cargando...</div>
            ) : !chartData.top_productos?.length ? (
              <div className="h-72 flex items-center justify-center text-sm text-slate-400">Sin datos en este periodo</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(280, chartData.top_productos.length * 36)}>
                <BarChart data={chartData.top_productos} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tickFormatter={v => `S/ ${v}`} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis type="category" dataKey="nombre" width={130} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <Tooltip
                    formatter={(value) => [formatSoles(Number(value)), 'Total']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
                  />
                  <Bar dataKey="total" name="Monto (S/)" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Top clientes - BarChart horizontal */}
          <div className={chartCardCls}>
            <h3 className="text-sm font-semibold text-slate-800 mb-1">Top 10 clientes</h3>
            <p className="text-xs text-slate-400 mb-4">Clientes con mayor monto de compras</p>
            {chartLoading ? (
              <div className="h-72 flex items-center justify-center text-sm text-slate-400">Cargando...</div>
            ) : !chartData.top_clientes?.length ? (
              <div className="h-72 flex items-center justify-center text-sm text-slate-400">Sin datos en este periodo</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(280, chartData.top_clientes.length * 36)}>
                <BarChart data={chartData.top_clientes} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tickFormatter={v => `S/ ${v}`} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis type="category" dataKey="nombre" width={130} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <Tooltip
                    formatter={(value) => [formatSoles(Number(value)), 'Total']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
                  />
                  <Bar dataKey="total" name="Monto (S/)" fill="#f59e0b" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Pedidos por estado - PieChart */}
          <div className={chartCardCls}>
            <h3 className="text-sm font-semibold text-slate-800 mb-1">Pedidos por estado</h3>
            <p className="text-xs text-slate-400 mb-4">Distribucion de estados de pedidos en el periodo</p>
            {chartLoading ? (
              <div className="h-72 flex items-center justify-center text-sm text-slate-400">Cargando...</div>
            ) : !entregasData.por_estado?.length ? (
              <div className="h-72 flex items-center justify-center text-sm text-slate-400">Sin pedidos en este periodo</div>
            ) : (() => {
              const total = entregasData.por_estado.reduce((s, e) => s + Number(e.cantidad), 0);
              return (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={entregasData.por_estado}
                      dataKey="cantidad"
                      nameKey="estado"
                      cx="50%" cy="45%"
                      outerRadius={100}
                      label={({ estado, cantidad }) => `${ESTADO_LABELS[estado] || estado}: ${cantidad}`}
                    >
                      {entregasData.por_estado.map((e, i) => (
                        <Cell key={i} fill={ESTADO_COLORS[e.estado] || '#94a3b8'} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value, name) => [`${value} (${(value / total * 100).toFixed(1)}%)`, ESTADO_LABELS[name] || name]}
                      contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
                    />
                    <Legend formatter={(v) => ESTADO_LABELS[v] || v} />
                  </PieChart>
                </ResponsiveContainer>
              );
            })()}
          </div>

          {/* Motivos de no entrega - BarChart horizontal */}
          <div className={chartCardCls}>
            <h3 className="text-sm font-semibold text-slate-800 mb-1">Motivos de no entrega</h3>
            <p className="text-xs text-slate-400 mb-4">Top 10 motivos mas frecuentes</p>
            {chartLoading ? (
              <div className="h-72 flex items-center justify-center text-sm text-slate-400">Cargando...</div>
            ) : !entregasData.motivos?.length ? (
              <div className="h-72 flex items-center justify-center text-sm text-slate-400">Sin pedidos no entregados en este periodo</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(280, entregasData.motivos.length * 36)}>
                <BarChart data={entregasData.motivos} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <YAxis type="category" dataKey="motivo" width={160} tick={{ fontSize: 11 }} stroke="#94a3b8" />
                  <Tooltip
                    formatter={(value) => [value, 'Cantidad']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
                  />
                  <Bar dataKey="cantidad" name="Cantidad" fill="#f43f5e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        </>}

        {/* ── Section separator ── */}
        <div>
          <h2 className="text-lg font-bold text-slate-800">Exportar datos</h2>
          <p className="text-sm text-slate-500">Descargar reportes en formato Excel</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Ventas */}
          <ReporteCard
            title="Ventas"
            description="Exportar registro de ventas"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2 9m12-9l2 9M9 21h6" /></svg>}
            onExport={() => handleExport('ventas', exportarVentas, filtros.ventas)}
            loading={loading.ventas}
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Desde</label>
                <input type="date" className={inputCls} value={filtros.ventas.fecha_inicio}
                  onChange={e => updateFiltro('ventas', 'fecha_inicio', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Hasta</label>
                <input type="date" className={inputCls} value={filtros.ventas.fecha_fin}
                  onChange={e => updateFiltro('ventas', 'fecha_fin', e.target.value)} />
              </div>
            </div>
          </ReporteCard>

          {/* Caja */}
          <ReporteCard
            title="Caja"
            description="Resumen y detalle de movimientos"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
            onExport={() => handleExport('caja', exportarCaja, filtros.caja)}
            loading={loading.caja}
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Desde</label>
                <input type="date" className={inputCls} value={filtros.caja.fecha_inicio}
                  onChange={e => updateFiltro('caja', 'fecha_inicio', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Hasta</label>
                <input type="date" className={inputCls} value={filtros.caja.fecha_fin}
                  onChange={e => updateFiltro('caja', 'fecha_fin', e.target.value)} />
              </div>
            </div>
          </ReporteCard>

          {/* Producción */}
          <ReporteCard
            title="Producción"
            description="Lotes de producción"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>}
            onExport={() => handleExport('produccion', exportarProduccion, filtros.produccion)}
            loading={loading.produccion}
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Desde</label>
                <input type="date" className={inputCls} value={filtros.produccion.fecha_inicio}
                  onChange={e => updateFiltro('produccion', 'fecha_inicio', e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Hasta</label>
                <input type="date" className={inputCls} value={filtros.produccion.fecha_fin}
                  onChange={e => updateFiltro('produccion', 'fecha_fin', e.target.value)} />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Estado</label>
              <select className={inputCls} value={filtros.produccion.estado}
                onChange={e => updateFiltro('produccion', 'estado', e.target.value)}>
                <option value="">Todos</option>
                <option value="en_proceso">En proceso</option>
                <option value="completado">Completado</option>
                <option value="cancelado">Cancelado</option>
              </select>
            </div>
          </ReporteCard>

          {/* Deudas */}
          <ReporteCard
            title="Deudas de Clientes"
            description="Clientes con saldo pendiente"
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            onExport={() => handleExport('deudas', exportarDeudas, {})}
            loading={loading.deudas}
          >
            <p className="text-xs text-slate-400">Sin filtros adicionales — exporta todos los clientes con deuda activa.</p>
          </ReporteCard>
        </div>
      </div>
    </Layout>
  );
}
