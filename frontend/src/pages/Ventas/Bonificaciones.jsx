import { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { getBonificaciones, getBonificacionesDetalle } from '../../services/ventasService';
import BonificacionesAnalytics from './BonificacionesAnalytics';

function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function hace30() { const d = new Date(); d.setDate(d.getDate()-30); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function fmtFecha(dt) { if (!dt) return '-'; return new Date(dt).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' }); }
function fmtHora(dt) { if (!dt) return ''; return new Date(dt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }); }

const inputCls = 'px-3 py-1.5 text-sm border border-slate-300 rounded-lg';

export default function Bonificaciones() {
  const [tab, setTab] = useState('listado');
  const [fi, setFi] = useState(hace30());
  const [ff, setFf] = useState(today());
  const [data, setData] = useState([]);
  const [totalGeneral, setTotalGeneral] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detalle, setDetalle] = useState(null);
  const [detalleData, setDetalleData] = useState([]);
  const [detalleLoading, setDetalleLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getBonificaciones({ fecha_inicio: fi, fecha_fin: ff });
      setData(res.data || []);
      setTotalGeneral(res.total_general || 0);
    } catch { setData([]); setTotalGeneral(0); }
    setLoading(false);
  }, [fi, ff]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function verDetalle(cliente) {
    setDetalle(cliente);
    setDetalleLoading(true);
    try {
      const res = await getBonificacionesDetalle(cliente.cliente_id, { fecha_inicio: fi, fecha_fin: ff });
      setDetalleData(res.data || []);
    } catch { setDetalleData([]); }
    setDetalleLoading(false);
  }

  return (
    <Layout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Bonificaciones</h1>
            <p className="text-sm text-slate-400">Control de productos entregados como cortesia</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-2 text-center">
            <p className="text-2xl font-bold text-blue-700">{totalGeneral}</p>
            <p className="text-xs text-blue-500">Total bonificadas</p>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2 flex-wrap">
          <input type="date" value={fi} onChange={e => setFi(e.target.value)} className={inputCls} />
          <span className="text-slate-400">-</span>
          <input type="date" value={ff} onChange={e => setFf(e.target.value)} className={inputCls} />
          {[
            { label: 'Hoy', fn: () => { setFi(today()); setFf(today()); } },
            { label: '7 dias', fn: () => { const d = new Date(); d.setDate(d.getDate()-7); setFi(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`); setFf(today()); } },
            { label: '30 dias', fn: () => { setFi(hace30()); setFf(today()); } },
          ].map(b => (
            <button key={b.label} onClick={b.fn}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition">{b.label}</button>
          ))}
        </div>

        {/* Tabla */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                {['Cliente', 'DNI/RUC', 'Tipo', 'Productos', 'Ventas', 'Total bonif.', ''].map(h => (
                  <th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-left whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 7 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 animate-pulse rounded w-16" /></td>)}</tr>
                ))
              ) : data.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Sin bonificaciones en este periodo</td></tr>
              ) : data.map(c => (
                <tr key={c.cliente_id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3 font-medium text-slate-800">{c.cliente_nombre}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{c.dni || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      c.tipo === 'mayoreo' ? 'bg-blue-100 text-blue-700' : c.tipo === 'especial' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
                    }`}>{c.tipo}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600 max-w-[200px] truncate">{c.productos}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{c.total_ventas}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-bold text-purple-700 text-lg">{c.total_bonificaciones}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => verDetalle(c)}
                      className="text-xs font-medium text-blue-600 hover:text-blue-800">Ver</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>


      {/* Modal detalle */}
        {detalle && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setDetalle(null)}>
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-lg font-bold text-slate-800">{detalle.cliente_nombre}</h2>
                  <p className="text-sm text-slate-400">Detalle de bonificaciones · {fmtFecha(fi)} - {fmtFecha(ff)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-2xl font-bold text-purple-700">{detalle.total_bonificaciones}</span>
                  <button onClick={() => setDetalle(null)} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
                </div>
              </div>
              <div className="overflow-y-auto flex-1 p-6">
                {detalleLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : detalleData.length === 0 ? (
                  <p className="text-center text-slate-400 py-8">Sin registros</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        {['Fecha', 'Hora', 'Venta', 'Origen', 'Producto', 'Cantidad', 'Vacios dev.', 'Vendedor'].map(h => (
                          <th key={h} className="px-3 py-2 text-xs font-semibold text-slate-500 text-left whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {detalleData.map((d, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-3 py-2 text-slate-700 whitespace-nowrap">{fmtFecha(d.fecha_hora)}</td>
                          <td className="px-3 py-2 text-slate-500 whitespace-nowrap">{fmtHora(d.fecha_hora)}</td>
                          <td className="px-3 py-2">
                            <span className="font-mono text-xs text-blue-600">{d.folio}</span>
                          </td>
                          <td className="px-3 py-2">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              d.origen === 'reparto' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                            }`}>{d.origen === 'reparto' ? 'Reparto' : 'Planta'}</span>
                          </td>
                          <td className="px-3 py-2 text-slate-700">{d.presentacion_nombre}</td>
                          <td className="px-3 py-2 text-center font-bold text-purple-700">{d.cantidad}</td>
                          <td className="px-3 py-2 text-center text-slate-500">{d.vacios_recibidos || 0}</td>
                          <td className="px-3 py-2 text-xs text-slate-500">{d.vendedor_nombre || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-50 font-semibold">
                        <td colSpan={5} className="px-3 py-2 text-right text-xs text-slate-500 uppercase">Total</td>
                        <td className="px-3 py-2 text-center text-purple-700 text-lg">{detalleData.reduce((s, d) => s + Number(d.cantidad), 0)}</td>
                        <td className="px-3 py-2 text-center text-slate-500">{detalleData.reduce((s, d) => s + Number(d.vacios_recibidos || 0), 0)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
