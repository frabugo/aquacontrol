import { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import FormVenta from './FormVenta';
import DetalleVenta from './DetalleVenta';
import ComprobanteModal from './ComprobanteModal';
import { listarVentas, cancelarVenta, obtenerVenta } from '../../services/ventasService';
import useMetodosPago from '../../hooks/useMetodosPago';
import useCajaAbierta from '../../hooks/useCajaAbierta';

const ESTADO_BADGE = {
  pagada:    { cls: 'bg-green-100 text-green-700',   label: 'Pagada'    },
  pendiente: { cls: 'bg-yellow-100 text-yellow-700', label: 'Pendiente' },
  cancelada: { cls: 'bg-slate-100 text-slate-400',   label: 'Anulada' },
};

function formatSoles(n) {
  const num = Number(n);
  if (num === 0) return '—';
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(num);
}

function formatFechaHora(dt) {
  if (!dt) return '—';
  const d = new Date(dt);
  const fecha = d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' });
  const hora  = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
  return `${fecha} ${hora}`;
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ── Componente principal ── */
export default function Ventas() {
  const { metodos } = useMetodosPago();
  const [ventas,   setVentas]   = useState([]);
  const [total,    setTotal]    = useState(0);
  const [pages,    setPages]    = useState(1);
  const [totales,  setTotales]  = useState({});
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [search,      setSearch]      = useState('');
  const [estado,      setEstado]      = useState('');
  const [fechaIni,    setFechaIni]    = useState(today());
  const [fechaFin,    setFechaFin]    = useState(today());
  const [page,        setPage]        = useState(1);

  const [formOpen,    setFormOpen]    = useState(false);
  const [detailId,    setDetailId]    = useState(null);
  const [confirmId,   setConfirmId]   = useState(null);
  const [cancelling,  setCancelling]  = useState(false);
  const [comprobanteVenta, setComprobanteVenta] = useState(null);
  const [pagosOpenId, setPagosOpenId] = useState(null);

  /* ── Fetch ventas ── */
  const fetchVentas = useCallback(async (q, est, fi, ff, p) => {
    setLoading(true);
    setError('');
    try {
      const res = await listarVentas({
        q, estado: est,
        fecha_inicio: fi || undefined,
        fecha_fin:    ff || undefined,
        page: p, limit: 30,
      });
      setVentas(Array.isArray(res.data) ? res.data : []);
      setTotal(res.total  ?? 0);
      setPages(res.pages  ?? 1);
      setTotales(res.totales ?? {});
    } catch {
      setError('No se pudo cargar las ventas');
      setVentas([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── Debounce search ── */
  useEffect(() => {
    const id = setTimeout(() => { setSearch(searchInput); setPage(1); }, 350);
    return () => clearTimeout(id);
  }, [searchInput]);

  /* ── Efecto único de carga ── */
  useEffect(() => {
    fetchVentas(search, estado, fechaIni, fechaFin, page);
  }, [search, estado, fechaIni, fechaFin, page, fetchVentas]);

  /* ── Acciones ── */
  function handleSaved() {
    fetchVentas(search, estado, fechaIni, fechaFin, 1);
    setPage(1);
  }

  async function handleCancelar() {
    if (!confirmId) return;
    setCancelling(true);
    try {
      await cancelarVenta(confirmId);
      setVentas(prev => prev.map(v => v.id === confirmId ? { ...v, estado: 'cancelada' } : v));
      fetchVentas(search, estado, fechaIni, fechaFin, page);
      setConfirmId(null);
    } catch (err) {
      alert(err.response?.data?.error || 'Error al cancelar');
    } finally {
      setCancelling(false);
    }
  }

  async function handleOpenComprobante(ventaId) {
    try {
      const data = await obtenerVenta(ventaId);
      setComprobanteVenta(data);
    } catch {
      alert('No se pudo cargar la venta');
    }
  }

  const canPrev = page > 1;
  const canNext = page < pages;

  /* ── Render ── */
  return (
    <Layout>
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Ventas</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '...' : `${total} venta${total !== 1 ? 's' : ''}`}
            {fechaIni && fechaIni === fechaFin
              ? ` — ${new Date(fechaIni + 'T12:00:00').toLocaleDateString('es-PE', { weekday: 'long', day: '2-digit', month: 'long' })}`
              : fechaIni && fechaFin
                ? ` — ${new Date(fechaIni + 'T12:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })} al ${new Date(fechaFin + 'T12:00:00').toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}`
                : ''}
          </p>
        </div>
        <button
          onClick={() => setFormOpen(true)}
          disabled={!cajaAbierta}
          title={!cajaAbierta ? 'Abre la caja primero' : undefined}
          className={`flex items-center gap-2 px-4 py-2 text-white text-sm font-semibold rounded-lg transition shadow-sm ${cajaAbierta ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-300 cursor-not-allowed'}`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Nueva venta
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
            fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Folio o cliente…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400">Desde</span>
          <input type="date" value={fechaIni}
            onChange={e => { setFechaIni(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700
              focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
          <span className="text-xs text-slate-400">Hasta</span>
          <input type="date" value={fechaFin}
            onChange={e => { setFechaFin(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700
              focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
        </div>
        <button
          onClick={() => { setFechaIni(today()); setFechaFin(today()); setPage(1); }}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600"
        >
          Hoy
        </button>
        <button
          onClick={() => {
            const d = new Date(); d.setDate(d.getDate() - 6);
            setFechaIni(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
            setFechaFin(today()); setPage(1);
          }}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600"
        >
          7 días
        </button>
        <button
          onClick={() => {
            const d = new Date();
            setFechaIni(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`);
            setFechaFin(today()); setPage(1);
          }}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600"
        >
          Mes
        </button>
        <button
          onClick={() => { setFechaIni(''); setFechaFin(''); setPage(1); }}
          className={`px-3 py-2 text-xs border rounded-lg transition ${!fechaIni && !fechaFin ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-slate-300 hover:bg-slate-50 text-slate-600'}`}
        >
          Todas
        </button>

        <select
          value={estado}
          onChange={e => { setEstado(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700
            focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-white"
        >
          <option value="">Todos los estados</option>
          <option value="pagada">Pagada</option>
          <option value="pendiente">Pendiente</option>
          <option value="cancelada">Anulada</option>
        </select>
      </div>

      {/* Resumen del día */}
      {!loading && (
        <div className={`grid grid-cols-2 sm:grid-cols-${Math.min(metodos.length + 1, 6)} gap-3 mb-4`}>
          {metodos.map(m => {
            const BORDER_CLS = {
              emerald: 'border-green-200 bg-green-50', purple: 'border-purple-200 bg-purple-50',
              blue: 'border-blue-200 bg-blue-50', orange: 'border-orange-200 bg-orange-50',
              red: 'border-red-200 bg-red-50', amber: 'border-amber-200 bg-amber-50',
              cyan: 'border-cyan-200 bg-cyan-50', pink: 'border-pink-200 bg-pink-50', slate: 'border-slate-200 bg-slate-50',
            };
            const VAL_CLS = {
              emerald: 'text-green-700', purple: 'text-purple-700', blue: 'text-blue-700',
              orange: 'text-orange-600', red: 'text-red-700', amber: 'text-amber-700',
              cyan: 'text-cyan-700', pink: 'text-pink-700', slate: 'text-slate-700',
            };
            return (
              <div key={m.nombre} className={`border rounded-xl px-4 py-3 ${BORDER_CLS[m.color] || 'border-slate-200 bg-slate-50'}`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-xs font-medium text-slate-500">{m.etiqueta}</span>
                </div>
                <div className={`text-lg font-bold tabular-nums ${VAL_CLS[m.color] || 'text-slate-700'}`}>
                  {new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(totales[m.nombre]) || 0)}
                </div>
              </div>
            );
          })}
          <div className="border rounded-xl px-4 py-3 border-slate-300 bg-white">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs font-medium text-slate-500">Total</span>
            </div>
            <div className="text-lg font-bold tabular-nums text-slate-800">
              {new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(totales.suma_total) || 0)}
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                {['Folio', 'Fecha/Hora', 'Cliente', 'Origen', 'Líneas', 'Pagos', 'Total', 'Estado', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 animate-pulse rounded" style={{ width: j === 2 ? '120px' : '60px' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : ventas.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                    {search || estado ? 'No hay ventas con esos filtros' : 'No hay ventas registradas'}
                  </td>
                </tr>
              ) : (
                ventas.map(v => {
                  const cancelada = v.estado === 'cancelada';
                  const badge = ESTADO_BADGE[v.estado] ?? ESTADO_BADGE.pagada;

                  // Build pagos list from venta_pagos or legacy columns
                  const pagosArr = v.pagos || [];
                  const pagosDisplay = pagosArr.length > 0
                    ? pagosArr.filter(p => Number(p.monto) > 0).map(p => {
                        return { label: p.metodo_etiqueta || p.metodo_pago || p.metodo, monto: Number(p.monto), color: p.metodo_color };
                      })
                    : metodos.map(m => {
                        const val = Number(v[`pagado_${m.nombre}`]) || 0;
                        return val > 0 ? { label: m.etiqueta, monto: val, color: m.color } : null;
                      }).filter(Boolean);

                  return (
                    <tr key={v.id} className={`transition-colors ${cancelada ? 'opacity-50' : 'hover:bg-slate-50'}`}>
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                        <button onClick={() => setDetailId(v.id)}
                          className="text-blue-600 hover:text-blue-800 hover:underline transition font-medium">
                          {v.folio}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap tabular-nums text-xs">{formatFechaHora(v.fecha_hora)}</td>
                      <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                        {v.cliente_nombre ?? <span className="text-slate-400 text-xs">Sin cliente</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium
                          ${v.origen === 'reparto'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-slate-100 text-slate-600'}`}>
                          {v.origen === 'reparto' ? '🚚 Reparto' : '🏪 Presencial'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center text-slate-600 tabular-nums">
                        {v.num_lineas ?? 0}
                      </td>
                      {/* Pagos — popover */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="relative">
                          <button
                            onClick={() => setPagosOpenId(pagosOpenId === v.id ? null : v.id)}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-xs border border-slate-200 rounded-lg hover:bg-slate-50 transition text-slate-600"
                          >
                            {pagosDisplay.length === 1
                              ? <span className="tabular-nums">{pagosDisplay[0].label} {formatSoles(pagosDisplay[0].monto)}</span>
                              : <span>{pagosDisplay.length} metodo{pagosDisplay.length !== 1 ? 's' : ''}</span>
                            }
                            <svg className={`w-3 h-3 text-slate-400 transition-transform ${pagosOpenId === v.id ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          {pagosOpenId === v.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setPagosOpenId(null)} />
                              <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-xl border border-slate-200 shadow-lg p-3 min-w-[180px]">
                                <div className="space-y-1.5">
                                  {pagosDisplay.map((p, i) => {
                                    const VAL_CLS = {
                                      emerald: 'text-green-700', purple: 'text-purple-700', blue: 'text-blue-700',
                                      orange: 'text-orange-600', red: 'text-red-700', amber: 'text-amber-700',
                                      cyan: 'text-cyan-700', pink: 'text-pink-700', slate: 'text-slate-700',
                                    };
                                    return (
                                      <div key={i} className="flex justify-between text-xs">
                                        <span className="text-slate-500">{p.label}</span>
                                        <span className={`tabular-nums font-medium ${VAL_CLS[p.color] || 'text-slate-700'}`}>{formatSoles(p.monto)}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-right font-semibold text-slate-800 whitespace-nowrap">
                        {formatSoles(v.total)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => setDetailId(v.id)} title="Ver detalle"
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                          {!cancelada && v.comprobante_id ? (
                            /* Ya tiene comprobante — mostrar links */
                            <div className="flex items-center gap-0.5">
                              <span className="text-[10px] font-medium text-emerald-600 mr-0.5">{v.comprobante_serie}-{v.comprobante_numero}</span>
                              {v.comprobante_pdf && (
                                <a href={v.comprobante_pdf} target="_blank" rel="noopener noreferrer" title="PDF"
                                  className="w-6 h-6 rounded flex items-center justify-center text-red-500 hover:bg-red-50 transition text-[10px] font-bold">
                                  PDF
                                </a>
                              )}
                              {v.comprobante_xml && (
                                <a href={v.comprobante_xml} target="_blank" rel="noopener noreferrer" title="XML"
                                  className="w-6 h-6 rounded flex items-center justify-center text-blue-500 hover:bg-blue-50 transition text-[10px] font-bold">
                                  XML
                                </a>
                              )}
                              {v.comprobante_cdr && (
                                <a href={v.comprobante_cdr} target="_blank" rel="noopener noreferrer" title="CDR"
                                  className="w-6 h-6 rounded flex items-center justify-center text-purple-500 hover:bg-purple-50 transition text-[10px] font-bold">
                                  CDR
                                </a>
                              )}
                            </div>
                          ) : !cancelada ? (
                            <button onClick={() => handleOpenComprobante(v.id)} title="Emitir comprobante"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-emerald-50 hover:text-emerald-600 transition">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </button>
                          ) : null}
                          {!cancelada && (
                            <button onClick={() => setConfirmId(v.id)} title="Anular venta"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round"
                                  d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Totales */}
        {!loading && ventas.length > 0 && (
          <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Totales:</span>
              {metodos.map(m => {
                const val = Number(totales[m.nombre]) || 0;
                if (val <= 0) return null;
                const VAL_CLS = {
                  emerald: 'text-slate-700', purple: 'text-purple-700', blue: 'text-blue-700',
                  orange: 'text-orange-600', red: 'text-red-700', amber: 'text-amber-700',
                  cyan: 'text-cyan-700', pink: 'text-pink-700', slate: 'text-slate-700',
                };
                return (
                  <span key={m.nombre} className="flex items-center gap-1">
                    <span className="text-xs text-slate-400">{m.etiqueta}</span>
                    <span className={`font-semibold tabular-nums ${VAL_CLS[m.color] || 'text-slate-700'}`}>
                      {new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(val)}
                    </span>
                  </span>
                );
              })}
              <span className="ml-auto flex items-center gap-1 font-bold text-slate-800">
                <span className="text-xs font-normal text-slate-400">TOTAL</span>
                {new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(totales.suma_total)}
              </span>
            </div>
          </div>
        )}

        {/* Paginación */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-white">
            <p className="text-xs text-slate-500">Página {page} de {pages}</p>
            <div className="flex gap-2">
              <button disabled={!canPrev} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">
                ← Anterior
              </button>
              <button disabled={!canNext} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal nueva venta */}
      <FormVenta
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        onSaved={handleSaved}
      />

      {/* Modal detalle venta */}
      {detailId && (
        <DetalleVenta
          ventaId={detailId}
          onClose={() => setDetailId(null)}
          onCancelled={(id) => { setDetailId(null); setConfirmId(id); }}
        />
      )}

      {/* Confirm cancelar */}
      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Anular venta</h3>
                <p className="text-sm text-slate-500">Se revertirá el stock y la deuda generada.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={() => setConfirmId(null)}
                className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition">
                No, volver
              </button>
              <button type="button" onClick={handleCancelar} disabled={cancelling}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded-lg transition">
                {cancelling ? 'Anulando…' : 'Sí, anular'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Modal comprobante desde la tabla */}
      {comprobanteVenta && (
        <ComprobanteModal
          venta={comprobanteVenta}
          onClose={() => setComprobanteVenta(null)}
          onEmitido={() => fetchVentas(search, estado, fechaIni, fechaFin, page)}
        />
      )}
    </Layout>
  );
}
