import { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../../components/Layout';
import { getPrediccion } from '../../services/ventasService';
import {
  ResponsiveContainer, ComposedChart, Line, Bar, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, PieChart, Pie, Cell,
} from 'recharts';

/* ── helpers ── */
function formatS(n) {
  return 'S/. ' + Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const DIAS_SEMANA = ['', 'Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const PIE_COLORS  = ['#10b981', '#8b5cf6', '#3b82f6', '#f97316'];

const inputCls = `px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

/* ── Cálculos de predicción en el frontend ── */
function calcularPrediccion(ventasDiarias) {
  if (!ventasDiarias || ventasDiarias.length < 7) return null;

  const datos = ventasDiarias.map(d => Number(d.total));
  const n = datos.length;

  // Promedio diario
  const promDiario = datos.reduce((a, b) => a + b, 0) / n;

  // Media móvil 7 días
  const ma7 = [];
  for (let i = 0; i < n; i++) {
    if (i < 6) { ma7.push(null); continue; }
    const slice = datos.slice(i - 6, i + 1);
    ma7.push(slice.reduce((a, b) => a + b, 0) / 7);
  }

  // Regresión lineal simple (y = a + bx)
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX  += i;
    sumY  += datos[i];
    sumXY += i * datos[i];
    sumX2 += i * i;
  }
  const b = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const a = (sumY - b * sumX) / n;

  // Tendencia lineal para cada punto
  const tendencia = [];
  for (let i = 0; i < n; i++) tendencia.push(a + b * i);

  // Proyección 7 y 30 días
  const proy7 = [];
  const proy30 = [];
  for (let i = 1; i <= 30; i++) {
    const val = Math.max(0, a + b * (n - 1 + i));
    if (i <= 7) proy7.push(val);
    proy30.push(val);
  }

  const proyTotal7  = proy7.reduce((a, b) => a + b, 0);
  const proyTotal30 = proy30.reduce((a, b) => a + b, 0);

  // Crecimiento %
  const ultimos7    = datos.slice(-7).reduce((a, b) => a + b, 0);
  const previos7    = datos.slice(-14, -7).reduce((a, b) => a + b, 0);
  const crecimiento = previos7 > 0 ? ((ultimos7 - previos7) / previos7) * 100 : 0;

  return { promDiario, ma7, tendencia, proyTotal7, proyTotal30, crecimiento, b };
}

/* ══════════════════════════════════════════════════════════════════ */
export default function PrediccionVentas() {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [dias, setDias]       = useState(90);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getPrediccion({ dias });
      setData(res);
    } catch { setData(null); }
    finally { setLoading(false); }
  }, [dias]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const pred = useMemo(() => {
    if (!data) return null;
    return calcularPrediccion(data.ventas_diarias);
  }, [data]);

  /* ── Datos para gráfico principal (histórico + proyección) ── */
  const chartData = useMemo(() => {
    if (!data || !pred) return [];
    const rows = data.ventas_diarias.map((d, i) => ({
      fecha: d.fecha?.slice(5),
      total: Number(d.total),
      ma7: pred.ma7[i],
      tendencia: pred.tendencia[i],
    }));

    // Agregar 7 días de proyección
    const lastDate = data.ventas_diarias.length
      ? new Date(data.ventas_diarias[data.ventas_diarias.length - 1].fecha + 'T12:00:00')
      : new Date();
    const n = data.ventas_diarias.length;

    for (let i = 1; i <= 7; i++) {
      const d = new Date(lastDate);
      d.setDate(d.getDate() + i);
      const label = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      rows.push({
        fecha: label,
        total: null,
        ma7: null,
        tendencia: null,
        proyeccion: Math.max(0, pred.tendencia[n - 1] + pred.b * i),
      });
    }
    return rows;
  }, [data, pred]);

  /* ── Datos patrón semanal ── */
  const semanalData = useMemo(() => {
    if (!data) return [];
    return data.patron_semanal.map(d => ({
      dia: DIAS_SEMANA[d.dia_semana] || d.dia_semana,
      promedio: Math.round(Number(d.promedio_total)),
      cantidad: Math.round(Number(d.promedio_cantidad) * 10) / 10,
    }));
  }, [data]);

  /* ── Comparación períodos ── */
  const comp = data?.comparacion;
  const crecTotalPct = comp && Number(comp.anterior.total) > 0
    ? ((Number(comp.reciente.total) - Number(comp.anterior.total)) / Number(comp.anterior.total) * 100)
    : null;

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center gap-3 text-slate-400">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Analizando datos de ventas...
          </div>
        </div>
      </Layout>
    );
  }

  if (!data || !pred) {
    return (
      <Layout>
        <div className="text-center py-16 text-slate-400">
          <p className="text-lg">No hay datos suficientes para generar predicciones</p>
          <p className="text-sm mt-1">Se necesitan al menos 7 dias de ventas registradas</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Prediccion de Ventas</h1>
            <p className="text-sm text-slate-500">Analisis de tendencias y proyecciones basadas en datos historicos</p>
          </div>
          <select className={inputCls + ' !w-auto'} value={dias} onChange={e => setDias(Number(e.target.value))}>
            <option value={30}>Ultimos 30 dias</option>
            <option value={60}>Ultimos 60 dias</option>
            <option value={90}>Ultimos 90 dias</option>
            <option value={180}>Ultimos 180 dias</option>
          </select>
        </div>

        {/* Tarjetas resumen */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Card
            label="Promedio diario"
            value={formatS(pred.promDiario)}
            sub={`${data.ventas_diarias.length} dias analizados`}
            color="blue"
          />
          <Card
            label="Proyeccion 7 dias"
            value={formatS(pred.proyTotal7)}
            sub="Basado en tendencia lineal"
            color="emerald"
          />
          <Card
            label="Proyeccion 30 dias"
            value={formatS(pred.proyTotal30)}
            sub="Basado en tendencia lineal"
            color="purple"
          />
          <Card
            label="Tendencia semanal"
            value={`${pred.crecimiento >= 0 ? '+' : ''}${pred.crecimiento.toFixed(1)}%`}
            sub="vs 7 dias anteriores"
            color={pred.crecimiento >= 0 ? 'emerald' : 'red'}
            icon={pred.crecimiento >= 0 ? 'up' : 'down'}
          />
        </div>

        {/* Gráfico principal */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
          <h2 className="text-sm font-semibold text-slate-700 mb-4">Ventas diarias, media movil (7d) y proyeccion</h2>
          <div className="h-72 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="fecha" tick={{ fontSize: 11 }} tickLine={false} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
                  tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                <Tooltip
                  formatter={(v, name) => [v ? formatS(v) : '—', name]}
                  labelFormatter={l => `Fecha: ${l}`}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="total" name="Venta real" fill="#93c5fd" radius={[2, 2, 0, 0]} barSize={8} />
                <Line dataKey="ma7" name="Media movil 7d" stroke="#2563eb" strokeWidth={2} dot={false} connectNulls />
                <Line dataKey="tendencia" name="Tendencia" stroke="#64748b" strokeWidth={1.5} strokeDasharray="6 3" dot={false} />
                <Area dataKey="proyeccion" name="Proyeccion" fill="#d1fae5" stroke="#10b981" strokeWidth={2} fillOpacity={0.4} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Patrón semanal */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Patron por dia de semana (promedio)</h2>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={semanalData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="dia" tick={{ fontSize: 12 }} tickLine={false} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false}
                    tickFormatter={v => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v} />
                  <Tooltip
                    formatter={(v, name) => [name === 'promedio' ? formatS(v) : v, name === 'promedio' ? 'Promedio S/.' : 'Ventas/dia']}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Bar dataKey="promedio" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Mejor dia: <strong className="text-slate-600">{getBestDay(semanalData)}</strong>
            </p>
          </div>

          {/* Comparación períodos */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Comparacion: periodo reciente vs anterior</h2>
            <div className="space-y-4 mt-6">
              <CompBar label={`Ultimos ${Math.floor(dias / 2)} dias`} value={Number(comp.reciente.total)} cant={comp.reciente.cantidad} color="blue" />
              <CompBar label={`${Math.floor(dias / 2)} dias previos`} value={Number(comp.anterior.total)} cant={comp.anterior.cantidad} color="slate" />
              <div className="pt-3 border-t border-slate-100">
                {crecTotalPct !== null ? (
                  <div className={`flex items-center gap-2 text-sm font-semibold ${crecTotalPct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {crecTotalPct >= 0 ? (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" /></svg>
                    )}
                    {crecTotalPct >= 0 ? '+' : ''}{crecTotalPct.toFixed(1)}% en monto total
                  </div>
                ) : (
                  <p className="text-xs text-slate-400">Sin datos del periodo anterior para comparar</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Top productos */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700">Top productos ({dias}d)</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Producto</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-500">Unidades</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-500">Monto</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-500">Prom/dia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(data.top_productos || []).map((p, i) => (
                  <tr key={p.presentacion_id} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5">
                      <span className="inline-flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                        <span className="text-slate-700 truncate max-w-[160px]">{p.nombre}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{Number(p.unidades).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums font-medium text-slate-800">{formatS(p.monto)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                      {p.dias_con_venta > 0 ? (Number(p.unidades) / p.dias_con_venta).toFixed(1) : '—'}
                    </td>
                  </tr>
                ))}
                {(!data.top_productos || data.top_productos.length === 0) && (
                  <tr><td colSpan={4} className="text-center py-6 text-slate-400">Sin datos</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Top clientes */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700">Top clientes ({dias}d)</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Cliente</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-slate-500">Tipo</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-500">Ventas</th>
                  <th className="text-right px-4 py-2 text-xs font-medium text-slate-500">Monto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(data.top_clientes || []).map((c, i) => {
                  const tipoCls = c.tipo === 'mayoreo' ? 'bg-blue-100 text-blue-700'
                    : c.tipo === 'especial' ? 'bg-purple-100 text-purple-700'
                    : 'bg-slate-100 text-slate-600';
                  return (
                    <tr key={c.cliente_id} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                          <span className="text-slate-700 truncate max-w-[140px]">{c.nombre}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${tipoCls}`}>{c.tipo}</span>
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">{c.num_ventas}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums font-medium text-slate-800">{formatS(c.monto)}</td>
                    </tr>
                  );
                })}
                {(!data.top_clientes || data.top_clientes.length === 0) && (
                  <tr><td colSpan={4} className="text-center py-6 text-slate-400">Sin datos</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}

/* ── Componentes auxiliares ── */

function Card({ label, value, sub, color, icon }) {
  const colorMap = {
    blue:    'bg-blue-50 border-blue-200 text-blue-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    purple:  'bg-purple-50 border-purple-200 text-purple-700',
    red:     'bg-red-50 border-red-200 text-red-700',
  };
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color] || colorMap.blue}`}>
      <p className="text-xs font-medium opacity-70">{label}</p>
      <div className="flex items-center gap-2 mt-1">
        {icon === 'up' && (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
        )}
        {icon === 'down' && (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 17h8m0 0v-8m0 8l-8-8-4 4-6-6" />
          </svg>
        )}
        <p className="text-lg font-bold">{value}</p>
      </div>
      <p className="text-xs opacity-60 mt-0.5">{sub}</p>
    </div>
  );
}

function CompBar({ label, value, cant, color }) {
  const maxVal = 1; // se normaliza en render
  const bgCls = color === 'blue' ? 'bg-blue-500' : 'bg-slate-300';
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-slate-600 font-medium">{label}</span>
        <span className="text-slate-800 font-bold">{formatS(value)}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${bgCls}`} style={{ width: '100%' }} />
        </div>
        <span className="text-xs text-slate-400 whitespace-nowrap">{cant} ventas</span>
      </div>
    </div>
  );
}

function getBestDay(semanalData) {
  if (!semanalData.length) return '—';
  const best = semanalData.reduce((a, b) => a.promedio > b.promedio ? a : b);
  return best.dia;
}
