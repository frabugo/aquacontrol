import { useCallback, useEffect, useState } from 'react';
import { getBonificacionesAnalytics } from '../../services/ventasService';

function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function hace30() { const d = new Date(); d.setDate(d.getDate()-30); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function fS(n) { return 'S/ ' + Number(n||0).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2}); }

const inputCls = 'px-3 py-1.5 text-sm border border-slate-300 rounded-lg';

export default function BonificacionesAnalytics() {
  const [fi, setFi] = useState(hace30());
  const [ff, setFf] = useState(today());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBonificacionesAnalytics({ fecha_inicio: fi, fecha_fin: ff });
      setData(res);
    } catch { setData(null); }
    setLoading(false);
  }, [fi, ff]);

  useEffect(() => { fetch(); }, [fetch]);

  if (loading) return <div className="flex justify-center py-12"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>;
  if (!data) return <p className="text-center text-slate-400 py-8">Sin datos</p>;

  const { totales: t, ratio_por_cliente: clientes, tendencia_mensual: tendencia, por_producto: productos } = data;

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="flex items-center gap-2 flex-wrap">
        <input type="date" value={fi} onChange={e => setFi(e.target.value)} className={inputCls} />
        <span className="text-slate-400">-</span>
        <input type="date" value={ff} onChange={e => setFf(e.target.value)} className={inputCls} />
        {[
          { label: '7 dias', fn: () => { const d=new Date(); d.setDate(d.getDate()-7); setFi(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`); setFf(today()); }},
          { label: '30 dias', fn: () => { setFi(hace30()); setFf(today()); }},
          { label: '90 dias', fn: () => { const d=new Date(); d.setDate(d.getDate()-90); setFi(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`); setFf(today()); }},
        ].map(b => (
          <button key={b.label} onClick={b.fn} className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition">{b.label}</button>
        ))}
      </div>

      {/* Tarjetas resumen */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card label="Bonificados" value={t.bonificados} color="purple" />
        <Card label="Vendidos" value={t.vendidos} color="blue" />
        <Card label="Ratio" value={`${t.ratio_global_pct}%`} color={t.ratio_global_pct > 15 ? 'red' : t.ratio_global_pct > 8 ? 'amber' : 'green'} />
        <Card label="Facturado" value={fS(t.facturado)} color="emerald" />
        <Card label="Costo bonif." value={fS(t.costo_bonificaciones)} color="red" />
        <Card label="Rentabilidad" value={fS(t.rentabilidad)} color={t.rentabilidad > 0 ? 'green' : 'red'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Ratio por cliente */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">Ratio por cliente</h3>
            <p className="text-xs text-slate-400">Cada cuantos bidones vendidos regala 1</p>
          </div>
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 sticky top-0">
                <tr>
                  {['Cliente','Vendidos','Bonif.','Ratio','Cada','Facturado'].map(h => (
                    <th key={h} className="px-3 py-2 text-xs font-semibold text-slate-500 text-left whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {clientes.map(c => (
                  <tr key={c.cliente_id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-medium text-slate-800 truncate max-w-[150px]">{c.nombre}</td>
                    <td className="px-3 py-2 text-center text-blue-600 font-semibold">{c.vendidos}</td>
                    <td className="px-3 py-2 text-center text-purple-600 font-semibold">{c.bonificados}</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        c.ratio_pct > 15 ? 'bg-red-100 text-red-700' : c.ratio_pct > 8 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                      }`}>{c.ratio_pct}%</span>
                    </td>
                    <td className="px-3 py-2 text-center text-slate-600 text-xs">1 c/{c.cada_cuantos}</td>
                    <td className="px-3 py-2 text-right text-emerald-600 font-medium tabular-nums">{fS(c.facturado)}</td>
                  </tr>
                ))}
                {clientes.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-400">Sin bonificaciones</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Por producto + Tendencia */}
        <div className="space-y-6">
          {/* Por producto */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">Por producto</h3>
            </div>
            <div className="p-4 space-y-3">
              {productos.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Sin datos</p>
              ) : productos.map((p, i) => {
                const maxBonif = Math.max(...productos.map(x => x.bonificados), 1);
                const pct = Math.round(p.bonificados / maxBonif * 100);
                return (
                  <div key={i}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-700 font-medium">{p.producto}</span>
                      <span className="text-purple-700 font-bold">{p.bonificados}</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tendencia mensual */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-700">Tendencia mensual</h3>
            </div>
            <div className="p-4">
              {tendencia.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Sin datos</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500">
                      <th className="text-left py-1">Mes</th>
                      <th className="text-center py-1">Vendidos</th>
                      <th className="text-center py-1">Bonif.</th>
                      <th className="text-center py-1">Ratio</th>
                      <th className="text-right py-1">Facturado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {tendencia.map(t => {
                      const r = t.vendidos > 0 ? Math.round(t.bonificados / t.vendidos * 100 * 10) / 10 : 0;
                      return (
                        <tr key={t.mes}>
                          <td className="py-2 text-slate-700 font-medium">{t.mes}</td>
                          <td className="py-2 text-center text-blue-600">{t.vendidos}</td>
                          <td className="py-2 text-center text-purple-600 font-bold">{t.bonificados}</td>
                          <td className="py-2 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              r > 15 ? 'bg-red-100 text-red-700' : r > 8 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700'
                            }`}>{r}%</span>
                          </td>
                          <td className="py-2 text-right text-emerald-600 tabular-nums">{fS(t.facturado)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Card({ label, value, color }) {
  const c = {
    purple: 'bg-purple-50 text-purple-700 border-purple-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    green: 'bg-green-50 text-green-700 border-green-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
  };
  return (
    <div className={`rounded-xl border p-3 ${c[color]}`}>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs opacity-70">{label}</p>
    </div>
  );
}
