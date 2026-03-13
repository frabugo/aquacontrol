import { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { listarComprobantes } from '../../services/facturacionService';
import { exportarComprobantes } from '../../services/reportesService';
import DetalleVenta from '../Ventas/DetalleVenta';

const TIPO_BADGE = {
  boleta:        { cls: 'bg-green-100 text-green-700',  label: 'Boleta' },
  factura:       { cls: 'bg-blue-100 text-blue-700',    label: 'Factura' },
  guia_remision: { cls: 'bg-purple-100 text-purple-700', label: 'Guia R.' },
};

const ESTADO_BADGE = {
  emitido: { cls: 'bg-green-100 text-green-700',  label: 'Emitido' },
  error:   { cls: 'bg-red-100 text-red-700',      label: 'Error' },
  anulado: { cls: 'bg-slate-100 text-slate-500',  label: 'Anulado' },
};

const SUNAT_BADGE = {
  '01': { cls: 'bg-slate-100 text-slate-600',   label: 'Registrado' },
  '05': { cls: 'bg-green-100 text-green-700',   label: 'Aceptado' },
  '07': { cls: 'bg-yellow-100 text-yellow-700', label: 'Observado' },
  '09': { cls: 'bg-red-100 text-red-700',       label: 'Rechazado' },
  '11': { cls: 'bg-slate-200 text-slate-500',   label: 'Anulado' },
  '13': { cls: 'bg-orange-100 text-orange-600',  label: 'Por anular' },
};

function formatSoles(n) {
  const num = Number(n);
  if (num === 0) return '\u2014';
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(num);
}

function formatFechaHora(dt) {
  if (!dt) return '\u2014';
  const d = new Date(dt);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

export default function Comprobantes() {
  const [rows, setRows]     = useState([]);
  const [total, setTotal]   = useState(0);
  const [pages, setPages]   = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [tipoComprobante, setTipoComprobante] = useState('');
  const [estado, setEstado] = useState('');
  const [fechaIni, setFechaIni] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [page, setPage]     = useState(1);

  const [detailVentaId, setDetailVentaId] = useState(null);

  /* ── Fetch ── */
  const fetchData = useCallback(async (q, tipo, est, fi, ff, p) => {
    setLoading(true);
    setError('');
    try {
      const res = await listarComprobantes({
        q: q || undefined,
        tipo_comprobante: tipo || undefined,
        estado: est || undefined,
        fecha_inicio: fi || undefined,
        fecha_fin: ff || undefined,
        page: p,
        limit: 20,
      });
      setRows(Array.isArray(res.data) ? res.data : []);
      setTotal(res.total ?? 0);
      setPages(res.pages ?? 1);
    } catch {
      setError('No se pudo cargar los comprobantes');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── Debounce ── */
  useEffect(() => {
    const id = setTimeout(() => { setSearch(searchInput); setPage(1); }, 350);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    fetchData(search, tipoComprobante, estado, fechaIni, fechaFin, page);
  }, [search, tipoComprobante, estado, fechaIni, fechaFin, page, fetchData]);

  const canPrev = page > 1;
  const canNext = page < pages;

  return (
    <Layout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Comprobantes</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '...' : `${total} comprobante${total !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button
          onClick={() => exportarComprobantes({
            q: search || undefined,
            tipo_comprobante: tipoComprobante || undefined,
            estado: estado || undefined,
            fecha_inicio: fechaIni || undefined,
            fecha_fin: fechaFin || undefined,
          }).catch(() => {})}
          className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" />
          </svg>
          Exportar
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row flex-wrap gap-3 mb-4">
        {/* Busqueda */}
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
            fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Cliente, serie, documento..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
        </div>

        {/* Tipo */}
        <select
          value={tipoComprobante}
          onChange={e => { setTipoComprobante(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700
            focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-white"
        >
          <option value="">Todos los tipos</option>
          <option value="boleta">Boleta</option>
          <option value="factura">Factura</option>
          <option value="guia_remision">Guia de Remision</option>
        </select>

        {/* Estado */}
        <select
          value={estado}
          onChange={e => { setEstado(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700
            focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-white"
        >
          <option value="">Todos los estados</option>
          <option value="emitido">Emitido</option>
          <option value="error">Error</option>
          <option value="anulado">Anulado</option>
        </select>

        {/* Fechas */}
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
        {(fechaIni || fechaFin) && (
          <button
            onClick={() => { setFechaIni(''); setFechaFin(''); setPage(1); }}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600"
          >
            Limpiar fechas
          </button>
        )}
      </div>

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
                {['Tipo', 'Serie-Numero', 'Cliente', 'Total', 'Estado', 'SUNAT', 'Fecha', 'Acciones'].map(h => (
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
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 animate-pulse rounded" style={{ width: j === 2 ? '120px' : '60px' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-slate-400">
                    {search || tipoComprobante || estado ? 'No hay comprobantes con esos filtros' : 'No hay comprobantes emitidos'}
                  </td>
                </tr>
              ) : (
                rows.map(c => {
                  const tipoBadge   = TIPO_BADGE[c.tipo_comprobante]   ?? { cls: 'bg-slate-100 text-slate-600', label: c.tipo_comprobante };
                  const estadoBadge = ESTADO_BADGE[c.estado]           ?? { cls: 'bg-slate-100 text-slate-600', label: c.estado };
                  const sunatBadge  = c.estado_sunat ? (SUNAT_BADGE[c.estado_sunat] ?? { cls: 'bg-slate-100 text-slate-500', label: c.estado_sunat }) : null;

                  return (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      {/* Tipo */}
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tipoBadge.cls}`}>
                          {tipoBadge.label}
                        </span>
                      </td>
                      {/* Serie-Numero */}
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap text-slate-800 font-medium">
                        {c.serie}{c.numero ? `-${c.numero}` : ''}
                      </td>
                      {/* Cliente */}
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-medium text-slate-800 text-sm">{c.razon_social || '\u2014'}</div>
                        {c.numero_documento && (
                          <div className="text-xs text-slate-400">{c.numero_documento}</div>
                        )}
                      </td>
                      {/* Total */}
                      <td className="px-4 py-3 tabular-nums text-right font-semibold text-slate-800 whitespace-nowrap">
                        {c.tipo_comprobante === 'guia_remision' ? '\u2014' : formatSoles(c.total)}
                      </td>
                      {/* Estado */}
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${estadoBadge.cls}`}>
                          {estadoBadge.label}
                        </span>
                      </td>
                      {/* SUNAT */}
                      <td className="px-4 py-3">
                        {sunatBadge ? (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sunatBadge.cls}`}>
                            {sunatBadge.label}
                          </span>
                        ) : (
                          <span className="text-xs text-slate-300">\u2014</span>
                        )}
                      </td>
                      {/* Fecha */}
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap tabular-nums text-xs">
                        {formatFechaHora(c.creado_en)}
                      </td>
                      {/* Acciones */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-0.5">
                          {c.pdf_url && (
                            <a href={c.pdf_url} target="_blank" rel="noopener noreferrer" title="PDF"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-red-500 hover:bg-red-50 transition text-[10px] font-bold">
                              PDF
                            </a>
                          )}
                          {c.xml_url && (
                            <a href={c.xml_url} target="_blank" rel="noopener noreferrer" title="XML"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-blue-500 hover:bg-blue-50 transition text-[10px] font-bold">
                              XML
                            </a>
                          )}
                          {c.cdr_url && (
                            <a href={c.cdr_url} target="_blank" rel="noopener noreferrer" title="CDR"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-purple-500 hover:bg-purple-50 transition text-[10px] font-bold">
                              CDR
                            </a>
                          )}
                          {c.venta_id && (
                            <button onClick={() => setDetailVentaId(c.venta_id)} title="Ver venta"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
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
            {!loading && rows.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-300">
                  <td colSpan={3} className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Total página</td>
                  <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-800">
                    {formatSoles(rows.filter(c => c.tipo_comprobante !== 'guia_remision' && c.estado !== 'anulado').reduce((s, c) => s + Number(c.total || 0), 0))}
                  </td>
                  <td colSpan={4}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Paginacion */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-white">
            <p className="text-xs text-slate-500">
              Pagina {page} de {pages} &middot; {total} resultado{total !== 1 ? 's' : ''}
            </p>
            <div className="flex gap-2">
              <button disabled={!canPrev} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">
                &larr; Anterior
              </button>
              <button disabled={!canNext} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">
                Siguiente &rarr;
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal detalle venta */}
      {detailVentaId && (
        <DetalleVenta
          ventaId={detailVentaId}
          onClose={() => setDetailVentaId(null)}
          onCancelled={() => setDetailVentaId(null)}
        />
      )}
    </Layout>
  );
}
