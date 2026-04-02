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
const DIAS_SEMANA_FULL = ['', 'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
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
  const [modoUnidades, setModoUnidades] = useState(false);

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

  /* ── Predicción en UNIDADES ── */
  const predUnidades = useMemo(() => {
    if (!data?.ventas_unidades || data.ventas_unidades.length < 7) return null;
    const datos = data.ventas_unidades.map(d => Number(d.unidades));
    const n = datos.length;
    const promDiario = datos.reduce((a, b) => a + b, 0) / n;
    const ma7 = [];
    for (let i = 0; i < n; i++) {
      if (i < 6) { ma7.push(null); continue; }
      ma7.push(datos.slice(i - 6, i + 1).reduce((a, b) => a + b, 0) / 7);
    }
    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    for (let i = 0; i < n; i++) { sumX += i; sumY += datos[i]; sumXY += i * datos[i]; sumX2 += i * i; }
    const b = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const a = (sumY - b * sumX) / n;
    const tendencia = [];
    for (let i = 0; i < n; i++) tendencia.push(a + b * i);
    return { promDiario, ma7, tendencia, b };
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

  /* ── Datos para gráfico en UNIDADES ── */
  const chartDataUnidades = useMemo(() => {
    if (!data?.ventas_unidades || !predUnidades) return [];
    const rows = data.ventas_unidades.map((d, i) => ({
      fecha: d.fecha?.slice(5),
      unidades: Number(d.unidades),
      ma7: predUnidades.ma7[i],
      tendencia: predUnidades.tendencia[i],
    }));
    const lastDate = data.ventas_unidades.length
      ? new Date(data.ventas_unidades[data.ventas_unidades.length - 1].fecha + 'T12:00:00')
      : new Date();
    const n = data.ventas_unidades.length;
    for (let i = 1; i <= 7; i++) {
      const d = new Date(lastDate);
      d.setDate(d.getDate() + i);
      const label = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      rows.push({
        fecha: label, unidades: null, ma7: null, tendencia: null,
        proyeccion: Math.max(0, Math.round(predUnidades.tendencia[n - 1] + predUnidades.b * i)),
      });
    }
    return rows;
  }, [data, predUnidades]);

  /* ── Datos patrón semanal ── */
  const semanalData = useMemo(() => {
    if (!data) return [];
    return data.patron_semanal.map(d => ({
      dia: DIAS_SEMANA[d.dia_semana] || d.dia_semana,
      promedio: Math.round(Number(d.promedio_total)),
      cantidad: Math.round(Number(d.promedio_cantidad) * 10) / 10,
    }));
  }, [data]);

  /* ── Plan de producción: próximos 7 días ── */
  const planProduccion = useMemo(() => {
    if (!data?.demanda_semanal?.length || !data?.stock_actual?.length) return null;

    // Agrupar demanda por presentación → día_semana → promedio
    const demandaMap = {};
    for (const d of data.demanda_semanal) {
      if (!demandaMap[d.presentacion_id]) {
        demandaMap[d.presentacion_id] = { nombre: d.presentacion, porDia: {} };
      }
      demandaMap[d.presentacion_id].porDia[d.dia_semana] = Number(d.promedio_unidades);
    }

    // Stock actual indexado
    const stockMap = {};
    for (const s of data.stock_actual) {
      stockMap[s.presentacion_id] = s;
    }

    // Generar próximos 7 días
    const hoy = new Date();
    const dias = [];
    for (let i = 1; i <= 7; i++) {
      const d = new Date(hoy);
      d.setDate(d.getDate() + i);
      const dow = d.getDay() + 1; // DAYOFWEEK: 1=Dom...7=Sáb
      dias.push({
        fecha: d,
        label: DIAS_SEMANA_FULL[dow],
        fechaCorta: `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`,
        dow,
      });
    }

    // Por cada presentación, calcular demanda acumulada y si necesita producción
    const productos = Object.entries(demandaMap).map(([presId, info]) => {
      const stock = stockMap[presId];
      const stockLlenos = stock ? Number(stock.stock_llenos) : 0;

      let acumulado = 0;
      const porDia = dias.map(dia => {
        const demanda = Math.round(info.porDia[dia.dow] || 0);
        acumulado += demanda;
        return { ...dia, demanda, acumulado };
      });

      const totalDemanda7d = acumulado;
      const necesitaProducir = Math.max(0, totalDemanda7d - stockLlenos);
      const diasCubiertos = porDia.findIndex(d => d.acumulado > stockLlenos);

      return {
        presentacion_id: Number(presId),
        nombre: info.nombre,
        stockLlenos,
        stockVacios: stock ? Number(stock.stock_vacios) : 0,
        stockEnLavado: stock ? Number(stock.stock_en_lavado) : 0,
        totalDemanda7d,
        necesitaProducir,
        diasCubiertos: diasCubiertos === -1 ? 7 : diasCubiertos,
        porDia,
      };
    }).filter(p => p.totalDemanda7d > 0).sort((a, b) => b.totalDemanda7d - a.totalDemanda7d);

    return { productos, dias };
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-700">
              {modoUnidades ? 'Unidades vendidas por dia' : 'Ventas diarias (S/.)'}, media movil (7d) y proyeccion
            </h2>
            <div className="flex bg-slate-100 rounded-lg p-0.5">
              <button onClick={() => setModoUnidades(false)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition ${!modoUnidades ? 'bg-white shadow text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}>
                Soles
              </button>
              <button onClick={() => setModoUnidades(true)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition ${modoUnidades ? 'bg-white shadow text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}>
                Unidades
              </button>
            </div>
          </div>
          <div className="h-72 sm:h-80">
            <ResponsiveContainer width="100%" height="100%">
              {!modoUnidades ? (
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
              ) : (
                <ComposedChart data={chartDataUnidades} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="fecha" tick={{ fontSize: 11 }} tickLine={false} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                  <Tooltip
                    formatter={(v, name) => [v != null ? `${Math.round(v)} uds` : '—', name]}
                    labelFormatter={l => `Fecha: ${l}`}
                    contentStyle={{ fontSize: 12, borderRadius: 8 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="unidades" name="Unidades vendidas" fill="#93c5fd" radius={[2, 2, 0, 0]} barSize={8} />
                  <Line dataKey="ma7" name="Media movil 7d" stroke="#2563eb" strokeWidth={2} dot={false} connectNulls />
                  <Line dataKey="tendencia" name="Tendencia" stroke="#64748b" strokeWidth={1.5} strokeDasharray="6 3" dot={false} />
                  <Area dataKey="proyeccion" name="Proyeccion" fill="#d1fae5" stroke="#10b981" strokeWidth={2} fillOpacity={0.4} connectNulls />
                </ComposedChart>
              )}
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

        {/* Plan de producción */}
        {planProduccion && planProduccion.productos.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 sm:px-6 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-700">Plan de produccion — Proximos 7 dias</h2>
              <p className="text-xs text-slate-400 mt-0.5">Basado en el promedio de ventas por dia de semana. Demanda estimada vs stock disponible.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-3 py-2.5 text-xs font-semibold text-slate-500 whitespace-nowrap sticky left-0 bg-slate-50">Producto</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-blue-600 whitespace-nowrap">Stock actual</th>
                    {planProduccion.dias.map((d, i) => (
                      <th key={i} className="text-center px-2 py-2.5 text-xs font-semibold text-slate-500 whitespace-nowrap">
                        <div>{d.label.slice(0, 3)}</div>
                        <div className="text-[10px] font-normal text-slate-400">{d.fechaCorta}</div>
                      </th>
                    ))}
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-slate-700 whitespace-nowrap bg-slate-100">Total 7d</th>
                    <th className="text-center px-3 py-2.5 text-xs font-semibold text-orange-600 whitespace-nowrap bg-orange-50">Producir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {planProduccion.productos.map(p => (
                    <tr key={p.presentacion_id} className="hover:bg-slate-50">
                      <td className="px-3 py-2.5 font-medium text-slate-700 whitespace-nowrap sticky left-0 bg-white">
                        {p.nombre}
                        {p.diasCubiertos <= 2 && (
                          <span className="ml-2 text-[10px] font-semibold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">
                            {p.diasCubiertos === 0 ? 'SIN STOCK' : `${p.diasCubiertos}d de stock`}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className="font-bold text-blue-600">{p.stockLlenos}</span>
                        <span className="text-[10px] text-slate-400 ml-1">llenos</span>
                      </td>
                      {p.porDia.map((d, i) => {
                        const superaStock = d.acumulado > p.stockLlenos;
                        return (
                          <td key={i} className={`px-2 py-2.5 text-center tabular-nums text-xs ${superaStock ? 'bg-red-50 text-red-700 font-semibold' : 'text-slate-600'}`}>
                            {d.demanda}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-center font-bold text-slate-700 bg-slate-50 tabular-nums">{p.totalDemanda7d}</td>
                      <td className={`px-3 py-2.5 text-center font-bold tabular-nums ${p.necesitaProducir > 0 ? 'text-orange-700 bg-orange-50' : 'text-green-600 bg-green-50'}`}>
                        {p.necesitaProducir > 0 ? p.necesitaProducir : 'OK'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-4 sm:px-6 py-3 bg-slate-50 border-t border-slate-100 flex flex-wrap gap-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded bg-red-50 border border-red-200" /> Demanda supera stock disponible
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block px-1.5 py-0.5 bg-red-50 text-red-600 text-[10px] font-semibold rounded">SIN STOCK</span> Stock no cubre ni el primer dia
              </span>
            </div>
          </div>
        )}

        {/* ═══ Alertas de producción ═══ */}
        {planProduccion && planProduccion.productos.some(p => p.diasCubiertos <= 3) && (
          <div className="space-y-2">
            {planProduccion.productos.filter(p => p.diasCubiertos <= 3).map(p => (
              <div key={p.presentacion_id}
                className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
                  p.diasCubiertos === 0
                    ? 'bg-red-50 border-red-200 text-red-800'
                    : p.diasCubiertos <= 1
                    ? 'bg-orange-50 border-orange-200 text-orange-800'
                    : 'bg-yellow-50 border-yellow-200 text-yellow-800'
                }`}>
                <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
                <div className="text-sm">
                  <span className="font-semibold">{p.nombre}:</span>{' '}
                  {p.diasCubiertos === 0
                    ? 'Sin stock. Necesitas producir HOY.'
                    : `Stock cubre solo ${p.diasCubiertos} dia${p.diasCubiertos > 1 ? 's' : ''}. `}
                  {p.necesitaProducir > 0 && (
                    <span>Producir al menos <strong>{p.necesitaProducir} unidades</strong> para cubrir la semana.</span>
                  )}
                  {p.stockLlenos > 0 && p.stockVacios + p.stockEnLavado > 0 && (
                    <span className="block text-xs opacity-80 mt-1">
                      Cadena: {p.stockLlenos} llenos + {p.stockVacios} vacios + {p.stockEnLavado} en lavado = {p.stockLlenos + p.stockVacios + p.stockEnLavado} total en sistema.
                      {p.stockVacios + p.stockEnLavado < p.necesitaProducir && p.necesitaProducir > 0 &&
                        ` Vacios disponibles (${p.stockVacios + p.stockEnLavado}) no alcanzan para producir ${p.necesitaProducir}.`}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ Cadena de producción ═══ */}
        {planProduccion && planProduccion.productos.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-4">Cadena de produccion — ¿Alcanza para producir?</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {planProduccion.productos.map(p => {
                const vaciosDisp = p.stockVacios + p.stockEnLavado;
                const puedeProducir = Math.min(vaciosDisp, p.necesitaProducir);
                const faltanVacios = Math.max(0, p.necesitaProducir - vaciosDisp);
                return (
                  <div key={p.presentacion_id} className="border border-slate-200 rounded-xl p-4">
                    <p className="font-semibold text-slate-700 text-sm mb-3">{p.nombre}</p>
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Llenos en stock</span>
                        <span className="font-bold text-blue-600">{p.stockLlenos}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Demanda 7 dias</span>
                        <span className="font-bold text-slate-700">{p.totalDemanda7d}</span>
                      </div>
                      <div className="flex justify-between border-t border-slate-100 pt-2">
                        <span className="text-slate-500">Necesita producir</span>
                        <span className={`font-bold ${p.necesitaProducir > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                          {p.necesitaProducir > 0 ? p.necesitaProducir : 'OK'}
                        </span>
                      </div>
                      {p.necesitaProducir > 0 && (<>
                        <div className="border-t border-slate-100 pt-2 mt-1">
                          <p className="text-[10px] font-semibold text-slate-400 uppercase mb-1.5">Disponible para producir</p>
                          <div className="flex justify-between">
                            <span className="text-slate-500">Vacios limpios</span>
                            <span className="font-semibold">{p.stockVacios}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-500">En lavado</span>
                            <span className="font-semibold">{p.stockEnLavado}</span>
                          </div>
                          <div className="flex justify-between border-t border-dashed border-slate-200 pt-1 mt-1">
                            <span className="text-slate-600 font-medium">Puede producir</span>
                            <span className={`font-bold ${puedeProducir >= p.necesitaProducir ? 'text-green-600' : 'text-orange-600'}`}>{puedeProducir}</span>
                          </div>
                          {faltanVacios > 0 && (
                            <div className="flex justify-between mt-1">
                              <span className="text-red-600 font-medium">Faltan vacios</span>
                              <span className="font-bold text-red-600">{faltanVacios}</span>
                            </div>
                          )}
                        </div>
                      </>)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* ═══ Patrón quincena ═══ */}
          {data?.patron_quincena?.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
              <h2 className="text-sm font-semibold text-slate-700 mb-4">Patron por quincena</h2>
              <div className="space-y-3">
                {data.patron_quincena.map(q => {
                  const label = q.quincena === 'primera' ? 'Dia 1 al 15' : 'Dia 16 al 31';
                  return (
                    <div key={q.quincena} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-slate-700">{label}</p>
                        <p className="text-xs text-slate-400">{q.dias_contados} dias analizados</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-800">{formatS(q.promedio_monto)}<span className="text-xs font-normal text-slate-400">/dia</span></p>
                        <p className="text-xs text-slate-500">{Math.round(Number(q.promedio_ventas))} ventas/dia</p>
                      </div>
                    </div>
                  );
                })}
                {data.patron_quincena.length === 2 && (() => {
                  const p = data.patron_quincena.find(q => q.quincena === 'primera');
                  const s = data.patron_quincena.find(q => q.quincena === 'segunda');
                  if (!p || !s) return null;
                  const diff = Number(s.promedio_monto) - Number(p.promedio_monto);
                  const pct = Number(p.promedio_monto) > 0 ? (diff / Number(p.promedio_monto) * 100) : 0;
                  return (
                    <p className={`text-xs font-medium px-3 ${pct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      La 2da quincena vende {pct >= 0 ? `${pct.toFixed(0)}% mas` : `${Math.abs(pct).toFixed(0)}% menos`} que la 1ra
                    </p>
                  );
                })()}
              </div>
            </div>
          )}

          {/* ═══ Ventas por tipo de cliente ═══ */}
          {data?.ventas_por_tipo?.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
              <h2 className="text-sm font-semibold text-slate-700 mb-4">Demanda por tipo de cliente</h2>
              <div className="space-y-3">
                {data.ventas_por_tipo.map(t => {
                  const tipoCls = t.tipo === 'mayoreo' ? 'bg-blue-100 text-blue-700'
                    : t.tipo === 'especial' ? 'bg-purple-100 text-purple-700'
                    : 'bg-slate-100 text-slate-600';
                  return (
                    <div key={t.tipo} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${tipoCls}`}>{t.tipo}</span>
                        <span className="text-xs text-slate-400">{t.num_clientes} clientes</span>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-slate-800">{Math.round(Number(t.promedio_unidades_dia))} uds/dia</p>
                        <p className="text-xs text-slate-500">{Number(t.unidades_total).toLocaleString()} uds total · {formatS(t.monto_total)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ═══ Días sin actividad ═══ */}
        {data?.dias_sin_ventas?.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6">
            <h2 className="text-sm font-semibold text-slate-700 mb-2">Dias sin actividad detectados</h2>
            <p className="text-xs text-slate-400 mb-3">Dias de la semana donde no se registraron ventas. Se excluyen del calculo de promedios para no distorsionar la prediccion.</p>
            <div className="flex flex-wrap gap-2">
              {data.dias_sin_ventas.map(d => (
                <div key={d.dia_semana} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                  <span className="text-sm font-medium text-slate-700">{DIAS_SEMANA[d.dia_semana]}</span>
                  <span className="text-xs text-slate-400">{d.dias_sin_venta} dia{d.dias_sin_venta > 1 ? 's' : ''} sin ventas</span>
                </div>
              ))}
            </div>
          </div>
        )}

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
