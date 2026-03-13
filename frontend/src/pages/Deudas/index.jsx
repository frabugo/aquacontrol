import { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { listarDeudas, ventasCredito, historialPagos, registrarPago, anularPago } from '../../services/deudasService';
import useMetodosPago from '../../hooks/useMetodosPago';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

function formatSoles(n) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);
}

function formatFechaHora(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

const TIPO_BADGE = {
  mayoreo:  'bg-blue-100 text-blue-700',
  menudeo:  'bg-slate-100 text-slate-600',
  especial: 'bg-purple-100 text-purple-700',
};

/* ── Modal pagar deuda ── */
function PagarModal({ cliente, onClose, onPaid }) {
  const { metodosAbono } = useMetodosPago();
  const [ventas, setVentas]   = useState([]);
  const [pagos, setPagos]     = useState([]);
  const [loading, setLoading] = useState(true);

  // Form
  const [monto, setMonto]       = useState('');
  const [metodo, setMetodo]     = useState('efectivo');
  const [ventaId, setVentaId]   = useState('');
  const [notas, setNotas]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState('');
  const [saldoActual, setSaldoActual] = useState(Number(cliente.saldo_dinero));

  useEffect(() => {
    Promise.all([
      ventasCredito(cliente.id),
      historialPagos(cliente.id),
    ]).then(([v, p]) => {
      setVentas(v.data || []);
      setPagos(p.data || []);
    }).catch(() => {})
      .finally(() => setLoading(false));
  }, [cliente.id]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!monto || Number(monto) <= 0) return setError('Ingrese un monto valido');
    setError(''); setSubmitting(true);
    try {
      const res = await registrarPago(cliente.id, {
        monto: Number(monto),
        metodo_pago: metodo,
        venta_id: ventaId || null,
        notas: notas.trim() || null,
      });
      setSaldoActual(res.saldo_actualizado);
      setPagos(prev => [res.pago, ...prev]);
      // Refresh ventas to update abonado
      const v = await ventasCredito(cliente.id);
      setVentas(v.data || []);
      setMonto(''); setNotas(''); setVentaId('');
      onPaid(res.saldo_actualizado);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrar pago');
    } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Cobrar deuda — {cliente.nombre}</h2>
            <p className="text-sm text-slate-500">
              Saldo pendiente: <span className="font-bold text-red-600">{formatSoles(saldoActual)}</span>
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

          {/* Form registrar pago */}
          <form onSubmit={handleSubmit} className="bg-green-50 border border-green-200 rounded-xl p-4">
            <p className="text-sm font-semibold text-green-800 mb-3">Registrar pago</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs text-slate-600 mb-1">Monto (S/) *</label>
                <input type="number" min="0.01" step="0.01" required className={inputCls}
                  value={monto} onChange={e => setMonto(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Metodo *</label>
                <select className={inputCls} value={metodo} onChange={e => setMetodo(e.target.value)}>
                  {metodosAbono.map(m => (
                    <option key={m.nombre} value={m.nombre}>{m.etiqueta}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-600 mb-1">Venta (opcional)</label>
                <select className={inputCls} value={ventaId} onChange={e => setVentaId(e.target.value)}>
                  <option value="">Abono general</option>
                  {ventas.filter(v => v.saldo_pendiente > 0).map(v => (
                    <option key={v.id} value={v.id}>{v.folio} — {formatSoles(v.saldo_pendiente)}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <button type="submit" disabled={submitting}
                  className="w-full px-4 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-green-400 rounded-lg transition">
                  {submitting ? 'Registrando...' : 'Registrar pago'}
                </button>
              </div>
            </div>
            <div className="mt-2">
              <input className={`${inputCls} text-xs`} value={notas} onChange={e => setNotas(e.target.value)}
                placeholder="Notas del pago (opcional)" />
            </div>
          </form>

          {/* Ventas al credito */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Ventas al credito</h3>
            {loading ? (
              <p className="text-sm text-slate-400">Cargando...</p>
            ) : ventas.length === 0 ? (
              <p className="text-sm text-slate-400">Sin ventas al credito</p>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
                      <th className="px-4 py-2">Folio</th>
                      <th className="px-4 py-2">Fecha</th>
                      <th className="px-4 py-2 text-right">Total venta</th>
                      <th className="px-4 py-2 text-right">Credito</th>
                      <th className="px-4 py-2 text-right">Abonado</th>
                      <th className="px-4 py-2 text-right">Pendiente</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {ventas.map(v => (
                      <tr key={v.id} className={v.saldo_pendiente <= 0 ? 'opacity-50' : 'hover:bg-slate-50'}>
                        <td className="px-4 py-2 font-mono text-xs">{v.folio}</td>
                        <td className="px-4 py-2 text-xs text-slate-500">{formatFechaHora(v.fecha_hora)}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatSoles(v.total)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-orange-600">{formatSoles(v.pagado_credito)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-green-600">{formatSoles(v.total_abonado)}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-bold">
                          {v.saldo_pendiente > 0
                            ? <span className="text-red-600">{formatSoles(v.saldo_pendiente)}</span>
                            : <span className="text-green-600">Pagado</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Historial de pagos */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Historial de pagos</h3>
            {loading ? (
              <p className="text-sm text-slate-400">Cargando...</p>
            ) : pagos.length === 0 ? (
              <p className="text-sm text-slate-400">Sin pagos registrados</p>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
                      <th className="px-4 py-2">Fecha</th>
                      <th className="px-4 py-2">Metodo</th>
                      <th className="px-4 py-2 text-right">Monto</th>
                      <th className="px-4 py-2">Venta</th>
                      <th className="px-4 py-2">Estado</th>
                      <th className="px-4 py-2">Registrado por</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagos.map(p => {
                      const anulado = p.estado === 'anulado';
                      return (
                        <tr key={p.id} className={anulado ? 'opacity-50' : 'hover:bg-slate-50'}>
                          <td className="px-4 py-2 text-xs text-slate-500">{formatFechaHora(p.fecha_hora)}</td>
                          <td className="px-4 py-2">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 capitalize">{p.metodo_pago}</span>
                          </td>
                          <td className={`px-4 py-2 text-right tabular-nums font-semibold ${anulado ? 'text-slate-400 line-through' : 'text-green-700'}`}>
                            {formatSoles(p.monto)}
                          </td>
                          <td className="px-4 py-2 text-xs font-mono">{p.venta_folio || '—'}</td>
                          <td className="px-4 py-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              anulado ? 'bg-slate-100 text-slate-400' : 'bg-green-100 text-green-700'
                            }`}>{anulado ? 'Anulado' : 'Activo'}</span>
                          </td>
                          <td className="px-4 py-2 text-xs text-slate-500">{p.registrado_por_nombre || '—'}</td>
                          <td className="px-4 py-2">
                            {!anulado && (
                              <button onClick={async () => {
                                if (!window.confirm('¿Anular este pago? La deuda del cliente volverá a subir.')) return;
                                try {
                                  const res = await anularPago(p.id);
                                  setSaldoActual(res.saldo_actualizado);
                                  setPagos(prev => prev.map(x => x.id === p.id ? { ...x, estado: 'anulado' } : x));
                                  const v = await ventasCredito(cliente.id);
                                  setVentas(v.data || []);
                                  onPaid(res.saldo_actualizado);
                                } catch (err) { alert(err.response?.data?.error || 'Error al anular pago'); }
                              }}
                                className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition font-medium">
                                Anular
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-100 transition text-slate-600">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Pagina principal ── */
export default function Deudas() {
  const [deudas, setDeudas]     = useState([]);
  const [total, setTotal]       = useState(0);
  const [pages, setPages]       = useState(1);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch]     = useState('');
  const [selectedCliente, setSelectedCliente] = useState(null);

  const fetchDeudas = useCallback(async (q, p) => {
    setLoading(true);
    try {
      const res = await listarDeudas({ q: q || undefined, page: p, limit: 30 });
      setDeudas(res.data || []);
      setTotal(res.total ?? 0);
      setPages(res.pages ?? 1);
    } catch { setDeudas([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => { setSearch(searchInput); setPage(1); }, 350);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => { fetchDeudas(search, page); }, [search, page, fetchDeudas]);

  function handlePaid(clienteId, nuevoSaldo) {
    setDeudas(prev => prev.map(d =>
      d.id === clienteId ? { ...d, saldo_dinero: nuevoSaldo } : d
    ).filter(d => Number(d.saldo_dinero) > 0));
  }

  const totalDeuda = deudas.reduce((s, d) => s + Number(d.saldo_dinero), 0);

  return (
    <Layout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Deudas por cobrar</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '...' : `${total} cliente${total !== 1 ? 's' : ''} con deuda`}
            {!loading && totalDeuda > 0 && (
              <span className="ml-2 font-semibold text-red-600">Total: {formatSoles(totalDeuda)}</span>
            )}
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
            fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
            placeholder="Buscar cliente..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                {['Cliente', 'Tipo', 'Telefono', 'Bidones', 'Deuda', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 animate-pulse rounded" style={{ width: '80px' }} /></td>
                  ))}</tr>
                ))
              ) : deudas.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                  {search ? 'No hay clientes con ese nombre' : 'No hay clientes con deuda pendiente'}
                </td></tr>
              ) : deudas.map(d => (
                <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{d.nombre}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${TIPO_BADGE[d.tipo] || ''}`}>{d.tipo}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{d.telefono || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {d.bidones_prestados > 0
                      ? <span className="font-semibold text-orange-600">{d.bidones_prestados}</span>
                      : <span className="text-slate-400">0</span>}
                  </td>
                  <td className="px-4 py-3 tabular-nums">
                    <span className="text-red-600 font-bold">{formatSoles(d.saldo_dinero)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setSelectedCliente(d)}
                      className="px-3 py-1.5 text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 border border-green-200 rounded-lg transition">
                      Cobrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-white">
            <p className="text-xs text-slate-500">Pagina {page} de {pages}</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">Anterior</button>
              <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">Siguiente</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal cobrar */}
      {selectedCliente && (
        <PagarModal
          cliente={selectedCliente}
          onClose={() => setSelectedCliente(null)}
          onPaid={(nuevoSaldo) => handlePaid(selectedCliente.id, nuevoSaldo)}
        />
      )}
    </Layout>
  );
}
