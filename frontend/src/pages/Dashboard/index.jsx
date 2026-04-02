import { useEffect, useState, useCallback } from 'react';
import Layout from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';
import { getIndicadores } from '../../services/dashboardService';

/* ── Helpers ── */
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };

function saludo() {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos dias';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

function fechaLarga() {
  return new Date().toLocaleDateString('es-PE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function formatSoles(n) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(n);
}

function hace7dias() {
  const d = new Date(); d.setDate(d.getDate() - 7);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function inicioMes() {
  const d = new Date(); d.setDate(1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/* ── Color map for cards ── */
const colorMap = {
  green:   { bg: 'bg-green-50',   icon: 'bg-green-100 text-green-600',   val: 'text-green-700'   },
  emerald: { bg: 'bg-emerald-50', icon: 'bg-emerald-100 text-emerald-600', val: 'text-emerald-700' },
  blue:    { bg: 'bg-blue-50',    icon: 'bg-blue-100 text-blue-600',     val: 'text-blue-700'    },
  sky:     { bg: 'bg-sky-50',     icon: 'bg-sky-100 text-sky-600',       val: 'text-sky-700'     },
  orange:  { bg: 'bg-orange-50',  icon: 'bg-orange-100 text-orange-600', val: 'text-orange-700'  },
  purple:  { bg: 'bg-purple-50',  icon: 'bg-purple-100 text-purple-600', val: 'text-purple-700'  },
  amber:   { bg: 'bg-amber-50',   icon: 'bg-amber-100 text-amber-600',   val: 'text-amber-700'   },
  cyan:    { bg: 'bg-cyan-50',    icon: 'bg-cyan-100 text-cyan-600',     val: 'text-cyan-700'    },
  pink:    { bg: 'bg-pink-50',    icon: 'bg-pink-100 text-pink-600',     val: 'text-pink-700'    },
  red:     { bg: 'bg-red-50',     icon: 'bg-red-100 text-red-600',       val: 'text-red-700'     },
  slate:   { bg: 'bg-slate-50',   icon: 'bg-slate-100 text-slate-600',   val: 'text-slate-700'   },
};

/* ── Icons for payment methods ── */
const metodoIcon = {
  efectivo: <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2" /><path d="M12 12m-3 0a3 3 0 106 0 3 3 0 10-6 0" /></svg>,
  credito:  <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
};
const defaultMetodoIcon = <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M3 14h18M5 6h14a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" /></svg>;

/* ── Card component ── */
function Card({ titulo, valor, subtitulo, color, icon }) {
  const c = colorMap[color] || colorMap.blue;
  return (
    <div className={`${c.bg} rounded-2xl p-5 flex flex-col gap-3 border border-white shadow-sm`}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-600">{titulo}</p>
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${c.icon}`}>
          {icon}
        </div>
      </div>
      <p className={`text-3xl font-bold ${c.val} tabular-nums`}>{valor}</p>
      <p className="text-xs text-slate-500">{subtitulo}</p>
    </div>
  );
}

/* ── Tipo badge ── */
const tipoBadge = {
  mayoreo:  'bg-blue-100 text-blue-700',
  menudeo:  'bg-slate-100 text-slate-700',
  especial: 'bg-purple-100 text-purple-700',
};

/* ── Component ── */
export default function Dashboard() {
  const { user } = useAuth();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');
  const [hora,    setHora]    = useState(new Date());
  const [fechaIni, setFechaIni] = useState(hoy());
  const [fechaFin, setFechaFin] = useState(hoy());

  const fetchData = useCallback(() => {
    setLoading(true);
    setError('');
    getIndicadores({ fecha_inicio: fechaIni, fecha_fin: fechaFin })
      .then(setData)
      .catch(() => setError('No se pudo cargar el resumen'))
      .finally(() => setLoading(false));
  }, [fechaIni, fechaFin]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Clock
  useEffect(() => {
    const id = setInterval(() => setHora(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const setRango = (fi, ff) => { setFechaIni(fi); setFechaFin(ff); };

  const v = data?.ventas || {};
  const d = data?.devoluciones || {};

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {saludo()}, {user?.nombre?.split(' ')[0]}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5 capitalize">{fechaLarga()}</p>
        </div>
        <div className="text-right hidden sm:block">
          <p className="text-2xl font-semibold text-slate-700 tabular-nums">
            {hora.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className="text-xs text-slate-400">Hora actual</p>
        </div>
      </div>

      {/* Date range filter */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <label className="text-sm text-slate-600">Desde</label>
        <input type="date" value={fechaIni} onChange={e => setFechaIni(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
        <label className="text-sm text-slate-600">Hasta</label>
        <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
        {[
          { label: 'Hoy',    fn: () => setRango(hoy(), hoy()) },
          { label: '7 dias', fn: () => setRango(hace7dias(), hoy()) },
          { label: 'Mes',    fn: () => setRango(inicioMes(), hoy()) },
        ].map(b => (
          <button key={b.label} onClick={b.fn}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors">
            {b.label}
          </button>
        ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-6">
          {error}
        </div>
      )}

      {/* KPI Cards row 1: Ventas + métodos de pago dinámicos */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
        <Card titulo="Total ventas" color="green"
          valor={loading ? '...' : formatSoles(v.total || 0)}
          subtitulo={`${v.cantidad || 0} ventas en el periodo`}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-2.21 0-4 .895-4 2s1.79 2 4 2 4 .895 4 2-1.79 2-4 2m0-8v1m0 9v1M6 12H4m16 0h-2" />
            <circle cx="12" cy="12" r="9" /></svg>}
        />
        {(data?.metodos_pago || []).map(m => (
          <Card key={m.nombre} titulo={m.etiqueta} color={m.color || 'slate'}
            valor={loading ? '...' : formatSoles(m.total || 0)}
            subtitulo={m.tipo === 'credito' ? 'Vendido al fiado' : `Cobrado en ${m.etiqueta.toLowerCase()}`}
            icon={metodoIcon[m.nombre] || defaultMetodoIcon}
          />
        ))}
      </div>

      {/* KPI Cards row 2: Stock & operations */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
        <Card titulo="Clientes activos" color="blue"
          valor={loading ? '...' : (data?.clientes_activos || 0).toLocaleString('es-PE')}
          subtitulo="Total registrados"
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>}
        />
        <Card titulo="Bidones disponibles" color="sky"
          valor={loading ? '...' : (data?.bidones_llenos || 0).toLocaleString('es-PE')}
          subtitulo="Llenos en almacen"
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 2C12 2 4 10.5 4 15a8 8 0 0016 0C20 10.5 12 2 12 2z" /></svg>}
        />
        <Card titulo="Vacíos limpios" color="amber"
          valor={loading ? '...' : (data?.vacios_disponibles || 0).toLocaleString('es-PE')}
          subtitulo="Listos para produccion"
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <Card titulo="Bidones prestados" color="orange"
          valor={loading ? '...' : (data?.bidones_prestados || 0).toLocaleString('es-PE')}
          subtitulo="En manos de clientes"
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8" /></svg>}
        />
        <Card titulo="Pendientes lavado" color="purple"
          valor={loading ? '...' : (data?.pendientes_lavado || 0).toLocaleString('es-PE')}
          subtitulo={`${d.bidones || 0} devueltos en el periodo`}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
        />
      </div>

      {/* KPI Cards row 3: Financial */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <Card titulo="Produccion" color="cyan"
          valor={loading ? '...' : `${data?.produccion?.unidades || 0} uds`}
          subtitulo={`${data?.produccion?.lotes || 0} lotes en el periodo`}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" /></svg>}
        />
        <Card titulo="Deuda clientes" color="red"
          valor={loading ? '...' : formatSoles(data?.deuda_clientes || 0)}
          subtitulo="Saldo pendiente total"
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
        />
        <Card titulo="Deuda a proveedores" color="pink"
          valor={loading ? '...' : formatSoles(data?.deuda_proveedores || 0)}
          subtitulo="Por pagar a proveedores"
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0H5m14 0h2M5 21H3M9 7h1m-1 4h1m4-4h1m-1 4h1M9 21v-3a3 3 0 016 0v3" /></svg>}
        />
        <Card titulo="Devoluciones" color="slate"
          valor={loading ? '...' : `${data?.devoluciones?.cantidad || 0}`}
          subtitulo={`${data?.devoluciones?.bidones || 0} bidones devueltos en periodo`}
          icon={<svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" /></svg>}
        />
      </div>

      {/* Alertas de stock bajo */}
      {!loading && data?.stock_bajo && (data.stock_bajo.presentaciones?.length > 0 || data.stock_bajo.insumos?.length > 0) && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
            </svg>
            <h3 className="text-sm font-semibold text-amber-800">Stock bajo</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {data.stock_bajo.presentaciones?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-amber-700 mb-2">Presentaciones</p>
                <div className="space-y-1">
                  {data.stock_bajo.presentaciones.map(p => (
                    <div key={p.id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{p.nombre}</span>
                      <span className={`font-bold tabular-nums ${p.stock === 0 ? 'text-red-600' : 'text-amber-600'}`}>{p.stock} uds</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {data.stock_bajo.insumos?.length > 0 && (
              <div>
                <p className="text-xs font-medium text-amber-700 mb-2">Insumos bajo minimo</p>
                <div className="space-y-1">
                  {data.stock_bajo.insumos.map(i => (
                    <div key={i.id} className="flex items-center justify-between text-sm">
                      <span className="text-slate-700">{i.nombre}</span>
                      <span className="text-red-600 font-bold tabular-nums">{i.stock} / {i.minimo}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Ranking clientes */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800">Top clientes</h2>
          <p className="text-xs text-slate-500">Ranking por monto de compras en el periodo</p>
        </div>
        {loading ? (
          <div className="px-6 py-8 text-center text-sm text-slate-400">Cargando...</div>
        ) : !data?.ranking_clientes?.length ? (
          <div className="px-6 py-8 text-center text-sm text-slate-400">Sin ventas en este periodo</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
                <th className="px-6 py-3 w-10">#</th>
                <th className="px-6 py-3">Cliente</th>
                <th className="px-6 py-3">Tipo</th>
                <th className="px-6 py-3 text-right">Ventas</th>
                <th className="px-6 py-3 text-right">Monto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.ranking_clientes.map((c, i) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-6 py-3 font-bold text-slate-400">{i + 1}</td>
                  <td className="px-6 py-3 font-medium text-slate-800">{c.nombre}</td>
                  <td className="px-6 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tipoBadge[c.tipo] || 'bg-slate-100 text-slate-600'}`}>
                      {c.tipo}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-right tabular-nums text-slate-600">{c.num_ventas}</td>
                  <td className="px-6 py-3 text-right tabular-nums font-semibold text-slate-800">{formatSoles(c.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {/* Clientes que dejaron de comprar */}
      {!loading && data?.clientes_inactivos?.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="text-lg font-semibold text-slate-800">Clientes que dejaron de comprar</h2>
            <p className="text-xs text-slate-500">Clientes que llevan mas tiempo sin comprar de lo habitual</p>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3 text-center">Dias sin comprar</th>
                <th className="px-4 py-3 text-center">Frecuencia habitual</th>
                <th className="px-4 py-3 text-center">Ultima compra</th>
                <th className="px-4 py-3 text-right">Deuda</th>
                <th className="px-4 py-3 text-center">Bidones</th>
                <th className="px-4 py-3">Telefono</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.clientes_inactivos.map(c => {
                const urgencia = c.dias_sin_comprar > (c.frecuencia_dias || 7) * 3 ? 'text-red-600 bg-red-50'
                  : c.dias_sin_comprar > (c.frecuencia_dias || 7) * 2 ? 'text-orange-600 bg-orange-50'
                  : 'text-yellow-700 bg-yellow-50';
                return (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{c.nombre}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tipoBadge[c.tipo] || 'bg-slate-100 text-slate-600'}`}>
                        {c.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold ${urgencia}`}>
                        {c.dias_sin_comprar}d
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center text-slate-500">
                      {c.frecuencia_dias ? `cada ${c.frecuencia_dias}d` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-slate-500">
                      {c.ultima_compra ? new Date(c.ultima_compra).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {c.saldo_dinero > 0
                        ? <span className="text-red-600 font-medium">{formatSoles(c.saldo_dinero)}</span>
                        : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {c.bidones_prestados > 0
                        ? <span className="font-semibold text-orange-600">{c.bidones_prestados}</span>
                        : <span className="text-slate-400">0</span>}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs">
                      {c.telefono
                        ? <a href={`https://wa.me/51${c.telefono.replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                            className="text-green-600 hover:text-green-700 hover:underline">{c.telefono}</a>
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
