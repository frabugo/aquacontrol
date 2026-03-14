import { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { miRuta, cobrarDeuda, getCobrosDeuda } from '../../services/rutasService';
import { listarClientes } from '../../services/clientesService';
import { ventasCredito } from '../../services/deudasService';
import useMetodosPago from '../../hooks/useMetodosPago';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

function fmtFecha(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function CobroDeuda() {
  const { metodos } = useMetodosPago();

  const [ruta, setRuta]           = useState(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [exito, setExito]         = useState('');
  const [saving, setSaving]       = useState(false);
  const [historial, setHistorial] = useState([]);

  // Cliente
  const [clienteId, setClienteId]       = useState(null);
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteDeuda, setClienteDeuda] = useState(0);
  const [clienteSearch, setClienteSearch] = useState('');
  const [clienteResults, setClienteResults] = useState([]);
  const [showSearch, setShowSearch]     = useState(false);

  // Ventas al crédito del cliente
  const [ventas, setVentas]       = useState([]);
  const [loadingVentas, setLoadingVentas] = useState(false);

  // Form pago
  const [ventaSelId, setVentaSelId] = useState(null);
  const [monto, setMonto]           = useState('');
  const [metodoPago, setMetodoPago] = useState('');
  const [notas, setNotas]           = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const rutaRes = await miRuta().catch(() => ({ data: null }));
      const r = rutaRes.data || rutaRes || null;
      setRuta(r);
      if (r && (r.estado === 'en_ruta' || r.estado === 'regresando')) {
        const cobros = await getCobrosDeuda(r.id).catch(() => []);
        setHistorial(cobros);
      }
    } catch { setRuta(null); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Buscar clientes con deuda
  useEffect(() => {
    if (!clienteSearch.trim()) { setClienteResults([]); return; }
    const t = setTimeout(() => {
      listarClientes({ q: clienteSearch, limit: 8 })
        .then(r => {
          const conDeuda = (r.data || []).filter(c => Number(c.saldo_dinero) > 0);
          setClienteResults(conDeuda);
        })
        .catch(() => setClienteResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [clienteSearch]);

  // Default metodo
  useEffect(() => {
    if (metodos.length > 0 && !metodoPago) {
      const sinCredito = metodos.find(m => m.nombre !== 'credito');
      if (sinCredito) setMetodoPago(sinCredito.nombre);
    }
  }, [metodos, metodoPago]);

  const rutaActiva = ruta && (ruta.estado === 'en_ruta' || ruta.estado === 'regresando');

  async function seleccionarCliente(c) {
    setClienteId(c.id);
    setClienteNombre(c.nombre);
    setClienteDeuda(Number(c.saldo_dinero));
    setShowSearch(false);
    setClienteSearch('');
    setClienteResults([]);
    setVentaSelId(null);
    setMonto('');
    // Cargar ventas al crédito
    setLoadingVentas(true);
    try {
      const res = await ventasCredito(c.id);
      setVentas((res.data || []).filter(v => v.saldo_pendiente > 0));
    } catch { setVentas([]); }
    setLoadingVentas(false);
  }

  function limpiarCliente() {
    setClienteId(null);
    setClienteNombre('');
    setClienteDeuda(0);
    setVentas([]);
    setVentaSelId(null);
    setMonto('');
    setNotas('');
  }

  function seleccionarVenta(v) {
    setVentaSelId(v.id);
    setMonto(v.saldo_pendiente.toFixed(6));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setExito('');
    const montoNum = Number(monto);
    if (!clienteId) return setError('Selecciona un cliente');
    if (!montoNum || montoNum <= 0) return setError('Ingresa un monto válido');
    if (montoNum > clienteDeuda) return setError(`El monto excede la deuda (S/ ${clienteDeuda.toFixed(6)})`);

    setSaving(true);
    try {
      const res = await cobrarDeuda(ruta.id, {
        cliente_id: clienteId,
        monto: montoNum,
        metodo_pago: metodoPago,
        venta_id: ventaSelId || null,
        notas: notas.trim() || undefined,
      });
      setExito(`Cobro registrado. Nueva deuda: S/ ${Number(res.saldo_actualizado).toFixed(6)}`);
      limpiarCliente();
      const cobros = await getCobrosDeuda(ruta.id).catch(() => []);
      setHistorial(cobros);
      setTimeout(() => setExito(''), 5000);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrar cobro');
    } finally { setSaving(false); }
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

  if (!rutaActiva) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto text-center py-16">
          <div className="w-16 h-16 mx-auto bg-slate-100 rounded-full flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-700 mb-1">Sin ruta activa</h2>
          <p className="text-sm text-slate-400">Inicia tu ruta para cobrar deudas</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-lg mx-auto">
        <div className="mb-5">
          <h1 className="text-lg font-bold text-slate-800">Cobro de deudas</h1>
          <p className="text-sm text-slate-400">Cobra deudas pendientes a clientes en ruta</p>
        </div>

        {exito && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm mb-4 font-semibold flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {exito}
          </div>
        )}
        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>}

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
          {/* Cliente */}
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Cliente con deuda</p>
            {clienteId ? (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-blue-800">{clienteNombre}</p>
                  <p className="text-xs text-amber-600 font-medium">Deuda total: S/ {clienteDeuda.toFixed(6)}</p>
                </div>
                <button type="button" onClick={limpiarCliente}
                  className="text-blue-400 hover:text-blue-600 transition text-lg">✕</button>
              </div>
            ) : showSearch ? (
              <div>
                <div className="flex gap-2 mb-2">
                  <input className={inputCls} value={clienteSearch} autoFocus
                    onChange={e => setClienteSearch(e.target.value)}
                    placeholder="Buscar cliente con deuda..." />
                  <button type="button" onClick={() => { setShowSearch(false); setClienteSearch(''); setClienteResults([]); }}
                    className="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-500">
                    Cancelar
                  </button>
                </div>
                {clienteResults.length > 0 && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                    {clienteResults.map(c => (
                      <button key={c.id} type="button" onClick={() => seleccionarCliente(c)}
                        className="w-full px-4 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100 last:border-0 transition">
                        <div className="flex justify-between items-center">
                          <p className="text-sm font-medium text-slate-800">{c.nombre}</p>
                          <span className="text-xs font-bold text-amber-600">S/ {Number(c.saldo_dinero).toFixed(6)}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {clienteSearch && clienteResults.length === 0 && (
                  <p className="text-xs text-slate-400 mt-1">Sin clientes con deuda encontrados</p>
                )}
              </div>
            ) : (
              <button type="button" onClick={() => setShowSearch(true)}
                className="w-full px-4 py-3 text-sm text-slate-500 border-2 border-dashed border-slate-200 rounded-xl hover:border-blue-300 hover:text-blue-600 transition">
                + Buscar cliente
              </button>
            )}
          </div>

          {/* Ventas al crédito */}
          {clienteId && (
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Ventas pendientes de pago</p>
              {loadingVentas ? (
                <div className="flex justify-center py-4">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : ventas.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-3">Sin ventas al crédito pendientes</p>
              ) : (
                <div className="space-y-2">
                  {ventas.map(v => {
                    const sel = ventaSelId === v.id;
                    return (
                      <button key={v.id} type="button" onClick={() => seleccionarVenta(v)}
                        className={`w-full text-left border rounded-xl px-4 py-3 transition ${
                          sel ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-slate-200 hover:border-blue-300 hover:bg-slate-50'
                        }`}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-slate-700">
                            {v.folio ? `#${v.folio}` : `Venta #${v.id}`}
                          </span>
                          <span className="text-sm font-bold text-red-600">S/ {v.saldo_pendiente.toFixed(6)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-slate-400">{fmtFecha(v.fecha_hora)}</span>
                          <span className="text-xs text-slate-400">
                            Total: S/ {Number(v.total).toFixed(6)}
                            {v.total_abonado > 0 && ` · Abonado: S/ ${v.total_abonado.toFixed(6)}`}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                  {/* Opción abono general */}
                  <button type="button" onClick={() => { setVentaSelId(null); setMonto(''); }}
                    className={`w-full text-left border rounded-xl px-4 py-3 transition ${
                      ventaSelId === null && monto ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500' : 'border-dashed border-slate-300 hover:border-blue-300'
                    }`}>
                    <p className="text-sm text-slate-500 text-center">Abono general (sin asignar a venta)</p>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Form pago */}
          {clienteId && (ventaSelId || ventas.length === 0) && (
            <form onSubmit={handleSubmit} className="space-y-4 border-t border-slate-100 pt-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Monto a cobrar
                  {ventaSelId && <span className="text-slate-400"> (pendiente de esta venta)</span>}
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">S/</span>
                  <input type="number" inputMode="decimal" min="0.01" max={clienteDeuda} step="0.000001"
                    className={`${inputCls} pl-8 text-right font-bold`} value={monto}
                    onChange={e => setMonto(e.target.value)} placeholder="0.00" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Método de pago</label>
                <div className="flex gap-2 flex-wrap">
                  {metodos.filter(m => m.nombre !== 'credito').map(m => (
                    <button key={m.nombre} type="button" onClick={() => setMetodoPago(m.nombre)}
                      className={`px-3 py-2 text-sm rounded-lg border transition font-medium ${
                        metodoPago === m.nombre
                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                          : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}>
                      {m.etiqueta}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Notas <span className="text-slate-400">(opcional)</span></label>
                <input className={inputCls} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones..." />
              </div>

              <button type="submit" disabled={saving || !monto || Number(monto) <= 0}
                className="w-full py-3 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-green-300 rounded-xl transition">
                {saving ? 'Registrando...' : 'Registrar cobro'}
              </button>
            </form>
          )}
        </div>

        {/* Historial de cobros */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mt-5">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Cobros de hoy {historial.length > 0 && `(${historial.length})`}
          </p>
          {historial.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-4">Aún no hay cobros de deuda en esta ruta</p>
          ) : (
            <div className="space-y-2">
              {historial.map(c => {
                const d = new Date(c.fecha_hora);
                const fecha = d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
                const hora  = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
                return (
                  <div key={c.id} className="border border-slate-100 rounded-xl px-4 py-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold text-slate-700">{c.cliente_nombre}</span>
                      <span className="text-sm font-bold text-green-700">S/ {Number(c.monto).toFixed(6)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400">{fecha} — {hora}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 font-medium">
                        {c.metodo_pago}
                      </span>
                    </div>
                    {Number(c.saldo_dinero) > 0 && (
                      <p className="text-xs text-amber-500 mt-1">Deuda restante: S/ {Number(c.saldo_dinero).toFixed(6)}</p>
                    )}
                    {Number(c.saldo_dinero) === 0 && (
                      <p className="text-xs text-green-600 mt-1">Deuda saldada</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
