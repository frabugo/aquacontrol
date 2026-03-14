import { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { miRuta, getMovimientosRuta, registrarGasto, solicitarEntrega } from '../../services/rutasService';
import api from '../../services/api';
import useMetodosPago from '../../hooks/useMetodosPago';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

function formatS(n) {
  return `S/ ${Number(n || 0).toFixed(2)}`;
}
function formatHora(dt) {
  if (!dt) return '';
  return new Date(dt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

const TIPO_BADGE = {
  cobro_venta: { label: 'Cobro',  cls: 'bg-green-100 text-green-700',  sign: '+' },
  gasto:       { label: 'Gasto',  cls: 'bg-red-100 text-red-700',      sign: '-' },
  ajuste:      { label: 'Ajuste', cls: 'bg-yellow-100 text-yellow-700', sign: '' },
};


export default function MiCaja() {
  const { metodos, metodosPago } = useMetodosPago();
  const [ruta, setRuta]           = useState(null);
  const [movimientos, setMovimientos] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [movLoading, setMovLoading] = useState(false);

  // Gasto form
  const [gastoOpen, setGastoOpen]     = useState(false);
  const [tipoGasto, setTipoGasto]     = useState('egreso');
  const [montoGasto, setMontoGasto]   = useState('');
  const [descGasto, setDescGasto]     = useState('');
  const [metodoGasto, setMetodoGasto] = useState('efectivo');
  const [loadingGasto, setLoadingGasto] = useState(false);
  const [categorias, setCategorias]     = useState([]);
  const [catGasto, setCatGasto]         = useState('');
  const [loadingEntrega, setLoadingEntrega] = useState(false);
  const [error, setError]             = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await miRuta();
      const r = res.data || null;
      setRuta(r);
      if (r) {
        setMovLoading(true);
        const movRes = await getMovimientosRuta(r.id);
        setMovimientos(movRes.data || []);
        setMovLoading(false);
      }
    } catch {
      setRuta(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    api.get('/config/categorias-caja').then(r => setCategorias(Array.isArray(r.data?.data) ? r.data.data : Array.isArray(r.data) ? r.data : [])).catch(() => []);
  }, []);

  async function handleGasto(e) {
    e.preventDefault();
    if (!montoGasto || Number(montoGasto) <= 0) return;
    setLoadingGasto(true);
    setError('');
    try {
      await registrarGasto(ruta.id, {
        clasificacion: tipoGasto === 'ingreso' ? 'ingreso' : 'egreso',
        monto: Number(montoGasto),
        descripcion: descGasto.trim() || null,
        metodo_pago: metodoGasto,
        categoria_id: catGasto ? Number(catGasto) : null,
      });
      setGastoOpen(false);
      setCatGasto('');
      setMontoGasto('');
      setDescGasto('');
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrar gasto');
    } finally {
      setLoadingGasto(false);
    }
  }

  async function handleSolicitarEntrega() {
    if (!window.confirm('¿Confirmas que ya estás en planta y vas a entregar tu caja físicamente?')) return;
    setLoadingEntrega(true);
    setError('');
    try {
      await solicitarEntrega(ruta.id);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al solicitar entrega');
    } finally {
      setLoadingEntrega(false);
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!ruta) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto text-center py-16">
          <div className="w-16 h-16 mx-auto bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round"
                d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-800 mb-2">Sin ruta activa</h2>
          <p className="text-sm text-slate-500">Inicia tu ruta desde "Mi Vehiculo" para ver tu caja.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h1 className="text-lg font-bold text-slate-800">Mi Caja</h1>
            <p className="text-xs text-slate-400">Ruta {ruta.numero} · {ruta.vehiculo_placa}</p>
          </div>
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${
            ruta.caja_estado === 'entregada' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
          }`}>
            {ruta.caja_estado === 'entregada' ? 'Entregada' : 'Abierta'}
          </span>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>
        )}

        {/* ── Resumen de cobros ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Resumen de cobros</p>
          <div className="space-y-2">
            {metodos.map(m => {
              const COLOR_CLS = {
                emerald: 'text-emerald-600', purple: 'text-purple-600', blue: 'text-blue-600',
                orange: 'text-orange-600', red: 'text-red-600', amber: 'text-amber-600',
                cyan: 'text-cyan-600', pink: 'text-pink-600', slate: 'text-slate-600',
              };
              const val = ruta[`cobrado_${m.nombre}`] ?? 0;
              return (
                <div key={m.nombre} className="flex justify-between text-sm">
                  <span className="text-slate-500">{m.etiqueta}</span>
                  <span className={`font-medium ${COLOR_CLS[m.color] || 'text-slate-600'}`}>{formatS(val)}</span>
                </div>
              );
            })}
            <div className="border-t border-slate-200 pt-2 flex justify-between text-sm font-bold">
              <span className="text-slate-700">Total cobrado</span>
              <span className="text-green-700">{formatS(ruta.total_cobrado)}</span>
            </div>
          </div>
        </div>

        {/* ── Gastos ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Gastos</p>
            {ruta.caja_estado !== 'entregada' && !ruta.solicitada_entrega && (
              <button onClick={() => setGastoOpen(!gastoOpen)}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium">
                {gastoOpen ? 'Cancelar' : '+ Registrar gasto'}
              </button>
            )}
          </div>

          <div className="flex justify-between text-sm font-bold mb-3">
            <span className="text-slate-700">Total gastos</span>
            <span className="text-red-700">{formatS(ruta.total_gastos)}</span>
          </div>

          {gastoOpen && (
            <form onSubmit={handleGasto} className="bg-slate-50 rounded-xl p-3 space-y-2 border border-slate-200">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-0.5">Tipo</label>
                  <select className={inputCls} value={tipoGasto} onChange={e => setTipoGasto(e.target.value)}>
                    <option value="egreso">Egreso</option>
                    <option value="ingreso">Ingreso</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-0.5">Categoría</label>
                  <select className={inputCls} value={catGasto} onChange={e => setCatGasto(e.target.value)} required>
                    <option value="">Seleccionar...</option>
                    {categorias.filter(cat => cat.tipo === tipoGasto && cat.activo).map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-0.5">Monto (S/)</label>
                  <input type="number" min="0.01" step="0.000001" className={inputCls} value={montoGasto}
                    onChange={e => setMontoGasto(e.target.value)} placeholder="0.00" required />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-slate-500 mb-0.5">Método de pago</label>
                  <select className={inputCls} value={metodoGasto} onChange={e => setMetodoGasto(e.target.value)}>
                    {metodosPago.map(m => (
                      <option key={m.nombre} value={m.nombre}>{m.etiqueta}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-0.5">Descripción</label>
                  <input className={inputCls} value={descGasto} onChange={e => setDescGasto(e.target.value)} placeholder="Opcional..." />
                </div>
              </div>
              <button type="submit" disabled={loadingGasto}
                className="w-full px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded-lg transition">
                {loadingGasto ? 'Registrando...' : 'Registrar gasto'}
              </button>
            </form>
          )}
        </div>

        {/* ── Neto a entregar ── */}
        <div className="bg-blue-50 rounded-2xl border border-blue-200 p-5 text-center mb-4">
          <p className="text-xs text-blue-600 uppercase tracking-wider font-semibold">Neto a entregar</p>
          <p className="text-3xl font-bold text-blue-700 mt-1">{formatS(ruta.neto_a_entregar)}</p>
        </div>

        {/* ── Entrega de caja — flujo solicitar → confirmar ── */}
        {ruta.caja_estado !== 'entregada' && (ruta.estado === 'finalizada' || ruta.estado === 'en_ruta' || ruta.estado === 'regresando') && (
          <div className={`rounded-2xl p-5 mb-6 ${
            ruta.solicitada_entrega ? 'bg-amber-50 border border-amber-200' : 'bg-green-50 border border-green-200'
          }`}>
            {/* Estado: AÚN NO solicitó */}
            {!ruta.solicitada_entrega && (
              <>
                <p className="font-bold text-green-800 mb-1">Ya llegaste a planta?</p>
                <p className="text-sm text-green-700 mb-4">
                  Al solicitar entrega, el cajero vera tu caja para confirmar la recepcion fisica.
                  Solo hazlo cuando estes fisicamente en planta.
                </p>
                <button onClick={handleSolicitarEntrega} disabled={loadingEntrega}
                  className="w-full px-5 py-3.5 text-sm font-bold text-white bg-green-600 hover:bg-green-700 disabled:bg-green-400 rounded-xl transition shadow-sm flex items-center justify-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round"
                      d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                  </svg>
                  {loadingEntrega ? 'Solicitando...' : 'Entregar mi caja al cajero'}
                </button>
              </>
            )}

            {/* Estado: YA solicitó, esperando cajero */}
            {ruta.solicitada_entrega === 1 && (
              <>
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-4 h-4 rounded-full bg-amber-400 shrink-0" style={{ animation: 'pulse-green 1.5s infinite' }} />
                  <p className="font-bold text-amber-800">Esperando confirmacion del cajero...</p>
                </div>
                <p className="text-sm text-amber-700">
                  Solicitaste la entrega a las {ruta.solicitada_en ? new Date(ruta.solicitada_en).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : '--:--'}.
                  El cajero debe confirmar la recepcion.
                </p>
                <div className="mt-3 px-4 py-2.5 bg-amber-100 rounded-lg text-sm font-semibold text-amber-800">
                  Neto a entregar: S/ {Number(ruta.neto_a_entregar || 0).toFixed(2)}
                </div>
              </>
            )}
          </div>
        )}

        {/* Estado: ENTREGADO y confirmado */}
        {ruta.caja_estado === 'entregada' && (
          <div className="bg-green-50 border border-green-200 rounded-2xl px-5 py-5 text-center mb-6">
            <div className="w-12 h-12 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <p className="text-base font-bold text-green-700">Caja entregada y confirmada</p>
            {ruta.confirmada_en && (
              <p className="text-xs text-green-600 mt-1">
                Confirmado a las {new Date(ruta.confirmada_en).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
        )}

        {/* ── Historial de movimientos ── */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-100">
            <p className="text-sm font-semibold text-slate-700">
              Historial de movimientos
              {movimientos.length > 0 && (
                <span className="ml-2 text-xs font-normal text-slate-400">({movimientos.length})</span>
              )}
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-left">
                  {['Hora', 'Tipo', 'Método', 'Descripción', 'Monto'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {movLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>
                      {[1,2,3,4,5].map(j => (
                        <td key={j} className="px-4 py-3">
                          <div className="h-4 bg-slate-100 animate-pulse rounded" style={{ width: j === 4 ? '140px' : '60px' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : movimientos.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-slate-400 text-sm">
                      Sin movimientos registrados
                    </td>
                  </tr>
                ) : (
                  movimientos.map(m => {
                    const tipo = TIPO_BADGE[m.tipo] ?? TIPO_BADGE.ajuste;
                    const COLOR_MAP = { blue: 'bg-blue-100 text-blue-700', green: 'bg-green-100 text-green-700', emerald: 'bg-emerald-100 text-emerald-700', purple: 'bg-purple-100 text-purple-700', amber: 'bg-amber-100 text-amber-700', red: 'bg-red-100 text-red-700', rose: 'bg-rose-100 text-rose-700', slate: 'bg-slate-100 text-slate-700', indigo: 'bg-indigo-100 text-indigo-700', cyan: 'bg-cyan-100 text-cyan-700', yellow: 'bg-yellow-100 text-yellow-700', orange: 'bg-orange-100 text-orange-700', teal: 'bg-teal-100 text-teal-700', pink: 'bg-pink-100 text-pink-700' };
                    const metCfg = metodos.find(x => x.nombre === m.metodo_pago);
                    const metodo = metCfg
                      ? { label: metCfg.etiqueta, cls: COLOR_MAP[metCfg.color] || 'bg-slate-100 text-slate-600' }
                      : { label: m.metodo_pago, cls: 'bg-slate-100 text-slate-600' };
                    const montoColor = tipo.sign === '+' ? 'text-emerald-600 font-semibold'
                                     : tipo.sign === '-' ? 'text-red-600 font-semibold'
                                     : 'text-slate-700';
                    return (
                      <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap tabular-nums text-xs">
                          {formatHora(m.fecha_hora)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${tipo.cls}`}>
                            {tipo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${metodo.cls}`}>
                            {metodo.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700 max-w-xs">
                          <div className="truncate">{m.descripcion}</div>
                          {m.venta_folio && (
                            <div className="mt-0.5">
                              <span className="font-mono text-xs text-slate-500">{m.venta_folio}</span>
                            </div>
                          )}
                        </td>
                        <td className={`px-4 py-3 tabular-nums text-right whitespace-nowrap ${montoColor}`}>
                          {tipo.sign}{formatS(m.monto)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Layout>
  );
}
