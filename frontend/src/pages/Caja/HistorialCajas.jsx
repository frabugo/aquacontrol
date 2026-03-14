import { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import ResumenBidones from './ResumenBidones';
import { getHistorial, getMovimientosCaja, getCajaById } from '../../services/cajaService';
import useMetodosPago from '../../hooks/useMetodosPago';
import TicketCierre from './TicketCierre';

function formatS(n) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);
}
function formatHora(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}
function formatFechaCorta(d) {
  if (!d) return '';
  return new Date(d + 'T12:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

const TIPO_MOV = {
  apertura:      { label: 'Apertura',      cls: 'bg-slate-100  text-slate-600',  sign: null },
  ingreso:       { label: 'Ingreso',       cls: 'bg-green-100  text-green-700',  sign: '+' },
  egreso:        { label: 'Egreso',        cls: 'bg-red-100    text-red-700',    sign: '-' },
  abono_cliente: { label: 'Abono cliente', cls: 'bg-blue-100   text-blue-700',   sign: '+' },
  ajuste:        { label: 'Ajuste',        cls: 'bg-yellow-100 text-yellow-700', sign: null },
};

const inputCls = `px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

export default function HistorialCajas() {
  const { metodos } = useMetodosPago();
  const [cajas, setCajas]       = useState([]);
  const [page, setPage]         = useState(1);
  const [pages, setPages]       = useState(1);
  const [total, setTotal]       = useState(0);
  const [loading, setLoading]   = useState(true);
  const [fechaIni, setFechaIni] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [fechaFin, setFechaFin] = useState(() => new Date().toISOString().slice(0, 10));

  /* Ticket */
  const [ticketCaja, setTicketCaja]     = useState(null);
  const [reporteCaja, setReporteCaja]   = useState(null);

  /* Modal */
  const [selCaja, setSelCaja]           = useState(null);
  const [movs, setMovs]                 = useState([]);
  const [movPage, setMovPage]           = useState(1);
  const [movPages, setMovPages]         = useState(1);
  const [movLoading, setMovLoading]     = useState(false);

  const fetchCajas = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 15 };
      if (fechaIni) params.fecha_inicio = fechaIni;
      if (fechaFin) params.fecha_fin = fechaFin;
      const res = await getHistorial(params);
      setCajas(res.data || []);
      setPages(res.pages ?? 1);
      setTotal(res.total ?? 0);
    } catch { setCajas([]); }
    finally { setLoading(false); }
  }, [page, fechaIni, fechaFin]);

  useEffect(() => { fetchCajas(); }, [fetchCajas]);

  async function handleVer(caja) {
    setSelCaja(caja);
    setMovPage(1);
    fetchMovs(caja.id, 1);
  }

  async function fetchMovs(cajaId, p) {
    setMovLoading(true);
    try {
      const res = await getMovimientosCaja(cajaId, { page: p, limit: 30 });
      setMovs(res.data || []);
      setMovPages(res.pages ?? 1);
    } catch { setMovs([]); }
    finally { setMovLoading(false); }
  }

  function handleMovPageChange(p) {
    setMovPage(p);
    if (selCaja) fetchMovs(selCaja.id, p);
  }

  function handleFiltrar(ini, fin) {
    setFechaIni(ini);
    setFechaFin(fin);
    setPage(1);
  }

  async function handleTicket(c) {
    try {
      const full = await getCajaById(c.id);
      const saldosMap = full.saldos_map || {};
      const saldosFin = {};
      for (const m of metodos) {
        const sd = saldosMap[m.nombre] || {};
        saldosFin[m.nombre] = Number(sd.saldo_fin ?? full[`saldo_fin_${m.nombre}`]) || 0;
      }
      setTicketCaja({ caja: full, saldos: saldosFin });
    } catch {
      setTicketCaja(null);
    }
  }

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-slate-800">Historial de Cajas</h1>
            <p className="text-sm text-slate-500">Listado de cajas cerradas con sus saldos finales</p>
          </div>
        </div>

        {/* Filtros fecha */}
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Desde</label>
            <input type="date" className={inputCls} value={fechaIni} onChange={e => handleFiltrar(e.target.value, fechaFin)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Hasta</label>
            <input type="date" className={inputCls} value={fechaFin} onChange={e => handleFiltrar(fechaIni, e.target.value)} />
          </div>
          {(fechaIni || fechaFin) && (
            <button onClick={() => handleFiltrar('', '')}
              className="px-3 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition">
              Limpiar
            </button>
          )}
          {total > 0 && <span className="text-xs text-slate-400 self-center">{total} cajas encontradas</span>}
        </div>

        {/* Tabla cajas */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-left">
                {['Fecha', 'Abierta por', 'Cerrada por', ...metodos.map(m => m.etiqueta), 'Total', ''].map((h, i) => (
                  <th key={i} className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 9 }).map((_, j) => <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 animate-pulse rounded w-16" /></td>)}</tr>
                ))
              ) : cajas.length === 0 ? (
                <tr><td colSpan={metodos.length + 5} className="px-4 py-10 text-center text-slate-400">Sin cajas cerradas en el rango seleccionado</td></tr>
              ) : cajas.map(c => {
                const saldosMap = c.saldos_map || {};
                const totalFin = metodos
                  .filter(m => m.nombre !== 'credito')
                  .reduce((s, m) => {
                    const sf = saldosMap[m.nombre]?.saldo_fin ?? c[`saldo_fin_${m.nombre}`];
                    return s + (Number(sf) || 0);
                  }, 0);
                return (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 text-slate-700 font-medium whitespace-nowrap">{formatFechaCorta(c.fecha?.slice(0, 10))}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{c.abierta_por_nombre}</td>
                    <td className="px-4 py-3 text-slate-600 text-xs">{c.cerrada_por_nombre}</td>
                    {metodos.map(m => {
                      const val = saldosMap[m.nombre]?.saldo_fin ?? c[`saldo_fin_${m.nombre}`];
                      const COLOR_CLS = {
                        emerald: 'text-emerald-600', purple: 'text-purple-600', blue: 'text-blue-600',
                        orange: 'text-orange-600', red: 'text-red-600', amber: 'text-amber-600',
                        cyan: 'text-cyan-600', pink: 'text-pink-600', slate: 'text-slate-600',
                      };
                      return (
                        <td key={m.nombre} className={`px-4 py-3 text-right tabular-nums font-medium ${COLOR_CLS[m.color] || 'text-slate-600'}`}>
                          {formatS(val)}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-800">{formatS(totalFin)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleVer(c)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition whitespace-nowrap">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          Ver
                        </button>
                        <button onClick={() => handleTicket(c)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 rounded-lg transition whitespace-nowrap"
                          title="Imprimir ticket de cierre">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                          </svg>
                          Ticket
                        </button>
                        <button onClick={() => setReporteCaja(c)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-600 hover:bg-emerald-50 rounded-lg transition whitespace-nowrap"
                          title="Resumen de bidones">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                          </svg>
                          Reporte
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
              <p className="text-xs text-slate-500">Pag {page} de {pages}</p>
              <div className="flex gap-2">
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                  className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-white transition">Anterior</button>
                <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
                  className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-white transition">Siguiente</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Ticket cierre */}
      {/* Modal Reporte Bidones */}
      {reporteCaja && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={() => setReporteCaja(null)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-800">Reporte de bidones</h2>
                <p className="text-sm text-slate-400">
                  {formatFechaCorta(reporteCaja.fecha?.slice(0, 10))}
                  {' · '}
                  {reporteCaja.hora_apertura ? new Date(reporteCaja.hora_apertura).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' }) : ''}
                  {reporteCaja.cerrada_en ? (' - ' + new Date(reporteCaja.cerrada_en).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })) : ' - Abierta'}
                </p>
              </div>
              <button onClick={() => setReporteCaja(null)} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
            </div>
            <div className="p-2">
              <ResumenBidones cajaId={reporteCaja.id} autoOpen />
            </div>
          </div>
        </div>
      )}

      {ticketCaja && (
        <TicketCierre caja={ticketCaja.caja} saldos={ticketCaja.saldos} onClose={() => setTicketCaja(null)} />
      )}

      {/* Modal movimientos */}
      {selCaja && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setSelCaja(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div>
                <h2 className="text-base font-semibold text-slate-800">
                  Movimientos — {formatFechaCorta(selCaja.fecha?.slice(0, 10))}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selCaja.abierta_por_nombre} · Cerrada por {selCaja.cerrada_por_nombre}
                </p>
              </div>
              <button onClick={() => setSelCaja(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Saldos finales */}
            <div className={`grid gap-3 px-6 py-3 bg-slate-50 border-b border-slate-100 shrink-0`}
              style={{ gridTemplateColumns: `repeat(${metodos.length}, minmax(0, 1fr))` }}>
              {metodos.map(m => {
                const sm = selCaja.saldos_map?.[m.nombre];
                const val = sm?.saldo_fin ?? selCaja[`saldo_fin_${m.nombre}`];
                const COLOR_CLS = {
                  emerald: 'text-emerald-600', purple: 'text-purple-600', blue: 'text-blue-600',
                  orange: 'text-orange-600', red: 'text-red-600', amber: 'text-amber-600',
                  cyan: 'text-cyan-600', pink: 'text-pink-600', slate: 'text-slate-600',
                };
                return (
                  <div key={m.nombre} className="text-center">
                    <p className="text-xs text-slate-500">{m.etiqueta}</p>
                    <p className={`text-sm font-bold ${COLOR_CLS[m.color] || 'text-slate-600'}`}>{formatS(val)}</p>
                  </div>
                );
              })}
            </div>

            {/* Tabla */}
            <div className="overflow-y-auto flex-1">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="bg-slate-50 border-b border-slate-100 text-left">
                    {['Fecha / Hora', 'Origen', 'Tipo', 'Metodo', 'Descripcion', 'Monto'].map(h => (
                      <th key={h} className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {movLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>{[1,2,3,4,5,6].map(j => <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 animate-pulse rounded w-16" /></td>)}</tr>
                    ))
                  ) : movs.length === 0 ? (
                    <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Sin movimientos</td></tr>
                  ) : movs.map(m => {
                    const tipoInfo   = TIPO_MOV[m.tipo]   ?? TIPO_MOV.ajuste;
                    const metCfg = metodos.find(x => x.nombre === m.metodo_pago);
                    const metodoInfo = metCfg
                      ? { label: metCfg.etiqueta, cls: `bg-${metCfg.color}-100 text-${metCfg.color}-700` }
                      : { label: m.metodo_pago, cls: 'bg-slate-100 text-slate-600' };
                    const signo = tipoInfo.sign;
                    const isAnulado = !!m.anulado;
                    const montoColor = isAnulado ? 'text-slate-400 line-through' :
                      signo === '+' ? 'text-emerald-600 font-semibold' :
                      signo === '-' ? 'text-red-600 font-semibold' : 'text-slate-700';

                    return (
                      <tr key={m.id} className={isAnulado ? 'opacity-60 bg-slate-50' : 'hover:bg-slate-50'}>
                        <td className={`px-4 py-2.5 text-slate-500 text-xs tabular-nums whitespace-nowrap ${isAnulado ? 'line-through' : ''}`}>
                          <div>{m.fecha_hora ? new Date(m.fecha_hora).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' }) : ''}</div>
                          <div className="text-slate-400">{formatHora(m.fecha_hora)}</div>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${m.origen === 'repartidor' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
                            {m.origen === 'repartidor' ? 'Reparto' : 'Planta'}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isAnulado ? 'bg-slate-100 text-slate-400 line-through' : tipoInfo.cls}`}>{tipoInfo.label}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isAnulado ? 'bg-slate-100 text-slate-400' : metodoInfo.cls}`}>{metodoInfo.label}</span>
                        </td>
                        <td className={`px-4 py-2.5 max-w-xs ${isAnulado ? 'text-slate-400' : 'text-slate-700'}`}>
                          <div className={`truncate ${isAnulado ? 'line-through' : ''}`}>{m.descripcion}</div>
                          {isAnulado && (
                            <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-semibold">ANULADO</span>
                          )}
                        </td>
                        <td className={`px-4 py-2.5 tabular-nums text-right whitespace-nowrap ${montoColor}`}>
                          {signo}{formatS(m.monto)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {movPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50 shrink-0">
                <p className="text-xs text-slate-500">Pag {movPage} de {movPages}</p>
                <div className="flex gap-2">
                  <button disabled={movPage <= 1} onClick={() => handleMovPageChange(movPage - 1)}
                    className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-white transition">Anterior</button>
                  <button disabled={movPage >= movPages} onClick={() => handleMovPageChange(movPage + 1)}
                    className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-white transition">Siguiente</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Layout>
  );
}
