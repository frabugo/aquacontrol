import { useCallback, useEffect, useMemo, useState } from 'react';
import Layout from '../../components/Layout';
import AbrirCajaModal  from './AbrirCajaModal';
import CerrarCajaModal from './CerrarCajaModal';
import MovimientoModal from './MovimientoModal';
import TicketCierre    from './TicketCierre';
import ResumenBidones  from './ResumenBidones';
import { getCajaHoy, reabrirCaja, getMovimientos, anularMovimiento, getCajasRepartidores } from '../../services/cajaService';
import { entregarCaja } from '../../services/rutasService';
import useMetodosPago from '../../hooks/useMetodosPago';

/* ── Helpers ── */
function formatS(n) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);
}
function formatHora(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}
function formatFecha(d) {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d + 'T12:00:00') : new Date(d);
  return date.toLocaleDateString('es-PE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

/* ── Constantes de display ── */
const TIPO_MOV = {
  apertura:      { label: 'Apertura',      cls: 'bg-slate-100  text-slate-600',   sign: null },
  ingreso:       { label: 'Ingreso',        cls: 'bg-green-100  text-green-700',   sign: '+' },
  egreso:        { label: 'Egreso',         cls: 'bg-red-100    text-red-700',     sign: '-' },
  abono_cliente: { label: 'Abono cliente',  cls: 'bg-blue-100   text-blue-700',    sign: '+' },
  ajuste:        { label: 'Ajuste',         cls: 'bg-yellow-100 text-yellow-700',  sign: null },
};

const CARD_COLOR = {
  emerald: { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  purple:  { bg: 'bg-purple-50',  border: 'border-purple-200',  text: 'text-purple-700',  dot: 'bg-purple-500'  },
  blue:    { bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700',    dot: 'bg-blue-500'    },
  orange:  { bg: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-700',  dot: 'bg-orange-500'  },
  red:     { bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700',     dot: 'bg-red-500'     },
  amber:   { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   dot: 'bg-amber-500'   },
  cyan:    { bg: 'bg-cyan-50',    border: 'border-cyan-200',    text: 'text-cyan-700',    dot: 'bg-cyan-500'    },
  pink:    { bg: 'bg-pink-50',    border: 'border-pink-200',    text: 'text-pink-700',    dot: 'bg-pink-500'    },
  slate:   { bg: 'bg-slate-50',   border: 'border-slate-200',   text: 'text-slate-700',   dot: 'bg-slate-500'   },
};

/* ── Componente principal ── */
export default function Caja() {
  const { metodos } = useMetodosPago();
  const [caja,          setCaja]          = useState(undefined); // undefined=loading, null=no caja
  const [movimientos,   setMovimientos]   = useState([]);
  const [movTotal,      setMovTotal]      = useState(0);
  const [movPages,      setMovPages]      = useState(1);
  const [movPage,       setMovPage]       = useState(1);
  const [movLoading,    setMovLoading]    = useState(false);
  const [pageLoading,   setPageLoading]   = useState(true);
  const [error,         setError]         = useState('');

  /* Filtros movimientos */
  const [filtroOrigen, setFiltroOrigen] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');

  /* Repartidores */
  const [repartidores,  setRepartidores]  = useState([]);
  const [repLoading,    setRepLoading]    = useState(false);
  const [panelAbierto,  setPanelAbierto]  = useState(true);
  const [entregando,    setEntregando]    = useState(null); // ruta_id que se está entregando

  const [modalAbrir,   setModalAbrir]   = useState(false);
  const [modalCerrar,  setModalCerrar]  = useState(false);
  const [modalMov,     setModalMov]     = useState(false);
  const [modalReabrir, setModalReabrir] = useState(false);
  const [modalTicket,  setModalTicket]  = useState(false);
  const [motivoReabrir, setMotivoReabrir] = useState('');
  const [reabriendo,   setReabriendo]   = useState(false);
  const [errorReabrir, setErrorReabrir] = useState('');


  /* ── Fetch caja ── */
  const fetchCaja = useCallback(async () => {
    try {
      const data = await getCajaHoy();
      setCaja(data); // null si no hay caja hoy
    } catch {
      setCaja(null);
    } finally {
      setPageLoading(false);
    }
  }, []);

  /* ── Fetch movimientos ── */
  const fetchMovimientos = useCallback(async (p = 1, origen = '', estado = '') => {
    setMovLoading(true);
    try {
      const params = { page: p, limit: 30 };
      if (origen) params.origen = origen;
      if (estado) params.estado_entrega = estado;
      const res = await getMovimientos(params);
      setMovimientos(Array.isArray(res.data) ? res.data : []);
      setMovTotal(res.total ?? 0);
      setMovPages(res.pages ?? 1);
    } catch {
      setMovimientos([]);
    } finally {
      setMovLoading(false);
    }
  }, []);

  /* ── Fetch repartidores ── */
  const fetchRepartidores = useCallback(async () => {
    setRepLoading(true);
    try {
      const res = await getCajasRepartidores();
      setRepartidores(Array.isArray(res.data) ? res.data : []);
    } catch {
      setRepartidores([]);
    } finally {
      setRepLoading(false);
    }
  }, []);

  useEffect(() => { fetchCaja(); }, [fetchCaja]);

  useEffect(() => {
    if (caja) {
      fetchMovimientos(movPage, filtroOrigen, filtroEstado);
      fetchRepartidores();
    }
  }, [caja, movPage, filtroOrigen, filtroEstado, fetchMovimientos, fetchRepartidores]);

  /* ── Saldos calculados (dinámicos) ── */
  const saldos = useMemo(() => {
    if (!caja) return null;
    const saldosMap = caja.saldos_map || {};
    const metMov = caja.metodos_movimientos || {};
    const result = {};

    // Build from dynamic data if available
    for (const m of metodos) {
      const saldo = saldosMap[m.nombre] || {};
      const mov = metMov[m.nombre] || {};
      if (caja.estado === 'cerrada' && saldo.saldo_fin != null) {
        result[m.nombre] = Number(saldo.saldo_fin);
      } else {
        const ini = Number(saldo.saldo_ini) || 0;
        const ing = Number(mov.ing) || 0;
        const egr = m.nombre === 'credito' ? 0 : (Number(mov.egr) || 0);
        result[m.nombre] = ini + ing - egr;
      }
    }

    // Fallback for legacy data if saldos_map is empty
    if (Object.keys(saldosMap).length === 0 && caja.saldo_ini_efectivo != null) {
      if (caja.estado === 'cerrada' && caja.saldo_fin_efectivo != null) {
        result.efectivo = Number(caja.saldo_fin_efectivo);
        result.transferencia = Number(caja.saldo_fin_transferencia);
        result.tarjeta = Number(caja.saldo_fin_tarjeta);
        result.credito = Number(caja.saldo_fin_credito);
      } else {
        result.efectivo = Number(caja.saldo_ini_efectivo) + Number(caja.ing_efectivo) - Number(caja.egr_efectivo);
        result.transferencia = Number(caja.saldo_ini_transferencia) + Number(caja.ing_transferencia) - Number(caja.egr_transferencia);
        result.tarjeta = Number(caja.saldo_ini_tarjeta) + Number(caja.ing_tarjeta) - Number(caja.egr_tarjeta);
        result.credito = Number(caja.saldo_ini_credito) + Number(caja.ing_credito);
      }
    }

    return result;
  }, [caja, metodos]);

  /* ── Handlers ── */
  function handleOpened(newCaja) {
    setCaja(newCaja);
    fetchMovimientos(1);
    setMovPage(1);
  }

  function handleClosed(updatedCaja) {
    setCaja(updatedCaja);
    fetchMovimientos(1);
    setMovPage(1);
  }

  function handleMovSaved() {
    fetchCaja();
    fetchMovimientos(movPage, filtroOrigen, filtroEstado);
    fetchRepartidores();
  }

  async function handleEntregarCaja(rutaId) {
    setEntregando(rutaId);
    try {
      await entregarCaja(rutaId);
      fetchCaja();
      fetchMovimientos(movPage, filtroOrigen, filtroEstado);
      fetchRepartidores();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al recibir caja');
    } finally {
      setEntregando(null);
    }
  }

  function handleFilterChange(field, value) {
    if (field === 'origen') setFiltroOrigen(value);
    if (field === 'estado') setFiltroEstado(value);
    setMovPage(1);
  }

  async function handleAnular(movId) {
    if (!confirm('¿Anular este movimiento? Se revertira su efecto en la caja.')) return;
    try {
      await anularMovimiento(movId);
      fetchCaja();
      fetchMovimientos(movPage, filtroOrigen, filtroEstado);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al anular movimiento');
    }
  }

  async function handleReabrir() {
    if (!motivoReabrir.trim()) return setErrorReabrir('El motivo es requerido');
    setReabriendo(true);
    setErrorReabrir('');
    try {
      const updated = await reabrirCaja({ motivo: motivoReabrir.trim() });
      setCaja(updated);
      fetchMovimientos(1);
      setMovPage(1);
      setModalReabrir(false);
      setMotivoReabrir('');
    } catch (err) {
      setErrorReabrir(err.response?.data?.error || 'Error al reabrir');
    } finally {
      setReabriendo(false);
    }
  }

  const isCerrada  = caja?.estado === 'cerrada';
  const isAbierta  = caja?.estado === 'abierta' || caja?.estado === 'reabierta';

  /* ── Cajas de repartidores sin entregar → bloquea cierre ── */
  const cajasPendientes = useMemo(() =>
    repartidores.filter(r => r.caja_estado !== 'entregada'),
    [repartidores]
  );
  const hayPendientes = cajasPendientes.length > 0;

  /* ── Loading skeleton ── */
  if (pageLoading) {
    return (
      <Layout>
        <div className="space-y-4 animate-pulse">
          <div className="h-8 bg-slate-200 rounded-lg w-40" />
          <div className="grid grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-28 bg-slate-100 rounded-2xl" />)}
          </div>
          <div className="h-64 bg-slate-100 rounded-2xl" />
        </div>
      </Layout>
    );
  }

  /* ── VISTA A: Sin caja ── */
  if (!caja) {
    return (
      <Layout>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Caja</h1>
            <p className="text-sm text-slate-500 mt-0.5 capitalize">{formatFecha(new Date())}</p>
          </div>
        </div>

        <div className="flex items-center justify-center min-h-[calc(100vh-220px)]">
          <div className="text-center max-w-sm">
            <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-5">
              <svg className="w-10 h-10 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">No hay caja abierta</h2>
            <p className="text-slate-500 text-sm mb-6">
              Abre la caja para comenzar a registrar ventas y movimientos.
            </p>
            <button
              onClick={() => setModalAbrir(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm rounded-xl transition shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Abrir caja
            </button>
          </div>
        </div>

        <AbrirCajaModal isOpen={modalAbrir} onClose={() => setModalAbrir(false)} onOpened={handleOpened} />
      </Layout>
    );
  }

  /* ── VISTA B / C: Con caja ── */
  return (
    <Layout>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold text-slate-800">Caja</h1>
            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold
              ${isCerrada  ? 'bg-slate-100 text-slate-500' :
                caja.estado === 'reabierta' ? 'bg-yellow-100 text-yellow-700' :
                'bg-emerald-100 text-emerald-700'}`}>
              <span className={`w-1.5 h-1.5 rounded-full
                ${isCerrada ? 'bg-slate-400' :
                  caja.estado === 'reabierta' ? 'bg-yellow-500' :
                  'bg-emerald-500'}`} />
              {isCerrada ? 'Cerrada' : caja.estado === 'reabierta' ? 'Reabierta' : 'Abierta'}
            </span>
          </div>
          <p className="text-sm text-slate-500 capitalize">{formatFecha(caja.fecha)}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Abierta por <span className="font-medium text-slate-600">{caja.abierta_por_nombre}</span>
            {' '}a las {formatHora(caja.hora_apertura)}
            {isCerrada && caja.hora_cierre && (
              <> · Cerrada a las {formatHora(caja.hora_cierre)}</>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isAbierta && (
            <>
              <button onClick={() => setModalMov(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Movimiento
              </button>
              <button onClick={() => setModalCerrar(true)}
                disabled={hayPendientes}
                title={hayPendientes ? `No se puede cerrar: ${cajasPendientes.length} caja(s) de repartidor sin entregar` : ''}
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition ${
                  hayPendientes
                    ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                    : 'text-white bg-red-600 hover:bg-red-700'
                }`}>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Cerrar caja
              </button>
            </>
          )}
          {isCerrada && (
            <>
              <button onClick={() => setModalTicket(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Reimprimir ticket
              </button>
              <button onClick={() => setModalAbrir(true)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Abrir nueva caja
              </button>
              <button onClick={() => { setModalReabrir(true); setMotivoReabrir(''); setErrorReabrir(''); }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-yellow-600 hover:bg-yellow-700 rounded-lg transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
                Reabrir caja
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>
      )}

      {/* Advertencia: cajas de repartidores pendientes */}
      {isAbierta && hayPendientes && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-800">
              No puedes cerrar la caja
            </p>
            <p className="text-xs text-amber-700 mt-0.5">
              Hay {cajasPendientes.length} caja{cajasPendientes.length > 1 ? 's' : ''} de repartidor sin entregar:
              {' '}<span className="font-medium">{cajasPendientes.map(r => r.repartidor_nombre).join(', ')}</span>.
              Recibe todas las cajas antes de cerrar.
            </p>
          </div>
        </div>
      )}

      {/* ── Tarjetas de saldo ── */}
      <div className={`grid grid-cols-2 ${metodos.length > 4 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-4 mb-6`}>
        {metodos.map(m => {
          const c = CARD_COLOR[m.color] || CARD_COLOR.slate;
          const saldo = saldos?.[m.nombre] ?? 0;
          const isCredito = m.nombre === 'credito';
          const saldoData = caja?.saldos_map?.[m.nombre] || {};
          const movData = caja?.metodos_movimientos?.[m.nombre] || {};

          return (
            <div key={m.nombre} className={`${c.bg} ${c.border} border rounded-2xl p-4`}>
              <div className="flex items-center gap-2 mb-3">
                <div className={`w-2 h-2 rounded-full ${c.dot}`} />
                <span className={`text-xs font-semibold ${c.text}`}>{m.etiqueta}</span>
              </div>
              <p className={`text-2xl font-bold ${c.text} leading-none mb-2`}>
                {formatS(saldo)}
              </p>
              <p className={`text-xs ${c.text} opacity-60`}>
                {isCredito ? 'Por cobrar' : (isCerrada ? 'Balance final' : m.tipo === 'fisico' ? 'Dinero en caja' : 'Pagos digitales')}
              </p>
              {!isCerrada && !isCredito && (
                <div className={`mt-2 pt-2 border-t ${c.border} text-xs ${c.text} opacity-70 space-y-0.5`}>
                  <div className="flex justify-between">
                    <span>Ini</span>
                    <span>{formatS(saldoData.saldo_ini ?? caja[`saldo_ini_${m.nombre}`])}</span>
                  </div>
                  {Number(movData.ingresos ?? caja[`ing_${m.nombre}`]) > 0 && (
                    <div className="flex justify-between">
                      <span>+ Ing</span>
                      <span>{formatS(movData.ingresos ?? caja[`ing_${m.nombre}`])}</span>
                    </div>
                  )}
                  {Number(movData.egresos ?? caja[`egr_${m.nombre}`]) > 0 && (
                    <div className="flex justify-between">
                      <span>- Egr</span>
                      <span>{formatS(movData.egresos ?? caja[`egr_${m.nombre}`])}</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Desglose por origen ── */}
      {caja && (caja.totales_repartidores_entregado > 0 || caja.totales_repartidores_pendiente > 0 || caja.totales_directo > 0) && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-500 mb-0.5">Planta (directo)</p>
            <p className="text-lg font-bold text-slate-800">{formatS(caja.totales_directo)}</p>
          </div>
          <div className="bg-white border border-green-200 rounded-xl px-4 py-3">
            <p className="text-xs text-green-600 mb-0.5">Reparto entregado</p>
            <p className="text-lg font-bold text-green-700">{formatS(caja.totales_repartidores_entregado)}</p>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-xl px-4 py-3">
            <p className="text-xs text-yellow-600 mb-0.5">Reparto pendiente</p>
            <p className="text-lg font-bold text-yellow-600">{formatS(caja.totales_repartidores_pendiente)}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-500 mb-0.5">Total real</p>
            <p className="text-lg font-bold text-slate-800">{formatS(caja.total_real)}</p>
          </div>
          <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
            <p className="text-xs text-slate-400 mb-0.5">Total proyectado</p>
            <p className="text-lg font-bold text-slate-500">{formatS(caja.total_proyectado)}</p>
          </div>
        </div>
      )}

      {/* ── Resumen total ── */}
      <div className="bg-slate-800 rounded-2xl px-6 py-4 mb-6 flex flex-wrap items-center gap-x-8 gap-y-2">
        <div>
          <p className="text-xs text-slate-400 mb-0.5">Total cobrado</p>
          <p className="text-2xl font-bold text-white">
            {formatS(
              metodos
                .filter(m => m.nombre !== 'credito')
                .reduce((s, m) => s + (saldos?.[m.nombre] ?? 0), 0)
            )}
          </p>
        </div>
        <div className="h-10 w-px bg-slate-600 hidden sm:block" />
        {metodos.map(m => {
          const COLOR_TEXT = {
            emerald: 'text-emerald-400', purple: 'text-purple-400', blue: 'text-blue-400',
            orange: 'text-orange-400', red: 'text-red-400', amber: 'text-amber-400',
            cyan: 'text-cyan-400', pink: 'text-pink-400', slate: 'text-slate-400',
          };
          return (
            <div key={m.nombre}>
              <p className="text-xs text-slate-500 mb-0.5">{m.nombre === 'credito' ? 'Por cobrar' : m.etiqueta}</p>
              <p className={`text-sm font-semibold ${COLOR_TEXT[m.color] || 'text-slate-400'}`}>{formatS(saldos?.[m.nombre] ?? 0)}</p>
            </div>
          );
        })}
      </div>

      {/* ── Resumen bidones ── */}
      {caja && <ResumenBidones cajaId={caja.id} />}

      {/* ── Tabla de movimientos ── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between px-5 py-3.5 border-b border-slate-100 gap-3">
          <p className="text-sm font-semibold text-slate-700">
            Movimientos
            {movTotal > 0 && <span className="ml-2 text-xs font-normal text-slate-400">({movTotal})</span>}
          </p>
          <div className="flex items-center gap-2">
            <select value={filtroOrigen} onChange={e => handleFilterChange('origen', e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Todos los orígenes</option>
              <option value="directo">Planta</option>
              <option value="repartidor">Reparto</option>
            </select>
            <select value={filtroEstado} onChange={e => handleFilterChange('estado', e.target.value)}
              className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">Todos los estados</option>
              <option value="pendiente">Pendiente</option>
              <option value="entregado">Entregado</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-left">
                {['Fecha / Hora', 'Origen', 'Tipo', 'Método', 'Descripción / Ref.', 'Estado', 'Monto', ''].map((h, i) => (
                  <th key={i} className="px-4 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {movLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {[1,2,3,4,5,6,7,8].map(j => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 animate-pulse rounded" style={{ width: j === 5 ? '160px' : '70px' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : movimientos.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400 text-sm">
                    Sin movimientos registrados
                  </td>
                </tr>
              ) : (
                movimientos.map(m => {
                  const tipoInfo   = TIPO_MOV[m.tipo]   ?? TIPO_MOV.ajuste;
                  const COLOR_MAP = { blue: 'bg-blue-100 text-blue-700', green: 'bg-green-100 text-green-700', emerald: 'bg-emerald-100 text-emerald-700', purple: 'bg-purple-100 text-purple-700', amber: 'bg-amber-100 text-amber-700', red: 'bg-red-100 text-red-700', rose: 'bg-rose-100 text-rose-700', slate: 'bg-slate-100 text-slate-700', indigo: 'bg-indigo-100 text-indigo-700', cyan: 'bg-cyan-100 text-cyan-700', yellow: 'bg-yellow-100 text-yellow-700', orange: 'bg-orange-100 text-orange-700', teal: 'bg-teal-100 text-teal-700', pink: 'bg-pink-100 text-pink-700' };
                  const metCfg = metodos.find(x => x.nombre === m.metodo_pago);
                  const metodoInfo = metCfg
                    ? { label: metCfg.etiqueta, cls: COLOR_MAP[metCfg.color] || 'bg-slate-100 text-slate-600' }
                    : { label: m.metodo_pago, cls: 'bg-slate-100 text-slate-600' };
                  const signo = tipoInfo.sign;
                  const isPendiente = m.origen === 'repartidor' && m.estado_entrega === 'pendiente';
                  const isAnulado = !!m.anulado;
                  const montoColor = isAnulado ? 'text-slate-400 line-through' :
                    isPendiente ? 'text-slate-400 font-semibold' :
                    signo === '+' ? 'text-emerald-600 font-semibold' :
                    signo === '-' ? 'text-red-600 font-semibold' :
                    'text-slate-700';

                  const ref = m.venta_folio    ? <span className="font-mono text-xs text-slate-500">{m.venta_folio}</span>
                            : m.cliente_nombre  ? <span className="text-xs text-blue-600">{m.cliente_nombre}</span>
                            : null;

                  // Anulable: movimiento manual (sin venta/pago/mantenimiento), tipo ingreso/egreso, caja abierta, no anulado
                  const esAnulable = isAbierta && !isAnulado
                    && !m.venta_id && !m.pago_id && !m.mantenimiento_id
                    && ['ingreso', 'egreso'].includes(m.tipo);

                  return (
                    <tr key={m.id} className={`hover:bg-slate-50 transition-colors ${isAnulado ? 'opacity-60 bg-slate-50' : isPendiente ? 'bg-yellow-50' : ''}`}>
                      <td className={`px-4 py-3 text-slate-500 whitespace-nowrap tabular-nums text-xs ${isAnulado ? 'line-through' : ''}`}>
                        <div>{m.fecha_hora ? new Date(m.fecha_hora).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit' }) : ''}</div>
                        <div className="text-slate-400">{formatHora(m.fecha_hora)}</div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                          m.origen === 'repartidor' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {m.origen === 'repartidor' ? 'Reparto' : 'Planta'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${isAnulado ? 'bg-slate-100 text-slate-400 line-through' : tipoInfo.cls}`}>
                          {tipoInfo.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${isAnulado ? 'bg-slate-100 text-slate-400' : metodoInfo.cls}`}>
                          {metodoInfo.label}
                        </span>
                      </td>
                      <td className={`px-4 py-3 max-w-xs ${isAnulado ? 'text-slate-400' : 'text-slate-700'}`}>
                        <div className={`truncate ${isAnulado ? 'line-through' : ''}`}>{m.descripcion}</div>
                        {isAnulado && (
                          <div className="mt-0.5">
                            <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-semibold">ANULADO</span>
                            {m.anulado_por_nombre && <span className="text-xs text-slate-400 ml-1">por {m.anulado_por_nombre}</span>}
                          </div>
                        )}
                        {!isAnulado && ref && <div className="mt-0.5">{ref}</div>}
                      </td>
                      <td className="px-4 py-3">
                        {m.origen === 'repartidor' && !isAnulado && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${
                            m.estado_entrega === 'entregado'
                              ? 'bg-green-100 text-green-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}>
                            {m.estado_entrega === 'entregado' ? 'Entregado' : 'Pendiente'}
                          </span>
                        )}
                      </td>
                      <td className={`px-4 py-3 tabular-nums text-right whitespace-nowrap ${montoColor}`}>
                        {signo}{formatS(m.monto)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {esAnulable && (
                          <button onClick={() => handleAnular(m.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition" title="Anular movimiento">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación movimientos */}
        {movPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
            <p className="text-xs text-slate-500">Página {movPage} de {movPages}</p>
            <div className="flex gap-2">
              <button disabled={movPage <= 1} onClick={() => setMovPage(p => p - 1)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-white transition">
                ← Anterior
              </button>
              <button disabled={movPage >= movPages} onClick={() => setMovPage(p => p + 1)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-white transition">
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Panel Cajas de Repartidores ── */}
      {repartidores.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mt-6">
          <button
            onClick={() => setPanelAbierto(p => !p)}
            className="flex items-center justify-between w-full px-5 py-3.5 border-b border-slate-100 hover:bg-slate-50 transition"
          >
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-slate-700">Cajas de Repartidores</p>
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">{repartidores.length}</span>
            </div>
            <svg className={`w-4 h-4 text-slate-400 transition-transform ${panelAbierto ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {panelAbierto && (
            <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {repartidores.map(rep => {
                const isEntregada = rep.caja_estado === 'entregada';
                return (
                  <div key={rep.caja_ruta_id}
                    className={`border rounded-xl p-4 ${isEntregada ? 'border-green-200 bg-green-50' : 'border-slate-200 bg-white'}`}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-slate-800 text-sm">{rep.repartidor_nombre}</p>
                        <p className="text-xs text-slate-500">{rep.ruta_numero} · {rep.vehiculo_placa}</p>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        isEntregada ? 'bg-green-100 text-green-700' :
                        rep.solicitada_entrega === 1 ? 'bg-amber-100 text-amber-700' :
                        rep.ruta_estado === 'en_ruta' ? 'bg-blue-100 text-blue-700' :
                        rep.ruta_estado === 'finalizada' ? 'bg-slate-100 text-slate-600' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {isEntregada ? 'Entregada' :
                         rep.solicitada_entrega === 1 ? 'Solicita entrega' :
                         rep.ruta_estado === 'en_ruta' ? 'En ruta' :
                         rep.ruta_estado === 'finalizada' ? 'Finalizada' : 'Preparando'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 text-center mb-3">
                      <div>
                        <p className="text-xs text-slate-500">Pedidos</p>
                        <p className="text-sm font-bold text-slate-800">
                          {rep.pedidos_entregados}/{rep.total_pedidos}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Cobrado</p>
                        <p className="text-sm font-bold text-emerald-600">{formatS(rep.total_cobrado)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Gastos</p>
                        <p className="text-sm font-bold text-red-600">{formatS(rep.total_gastos)}</p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                      <div>
                        <p className="text-xs text-slate-500">Neto a entregar</p>
                        <p className="text-base font-bold text-slate-800">{formatS(rep.neto_a_entregar)}</p>
                      </div>
                      {!isEntregada && rep.solicitada_entrega === 1 && (
                        <button
                          onClick={() => handleEntregarCaja(rep.ruta_id)}
                          disabled={entregando === rep.ruta_id}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 rounded-lg transition"
                        >
                          {entregando === rep.ruta_id ? (
                            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                          Recibir caja
                        </button>
                      )}
                      {!isEntregada && !rep.solicitada_entrega && (
                        <p className="text-xs text-slate-400">Esperando al repartidor</p>
                      )}
                      {isEntregada && rep.entregada_a_nombre && (
                        <p className="text-xs text-green-600">
                          Recibida por {rep.entregada_a_nombre}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Modales ── */}
      <AbrirCajaModal  isOpen={modalAbrir}  onClose={() => setModalAbrir(false)}  onOpened={handleOpened} />

      <CerrarCajaModal
        isOpen={modalCerrar}
        onClose={() => setModalCerrar(false)}
        saldos={saldos}
        caja={caja}
        onClosed={handleClosed}
        cajasPendientes={cajasPendientes}
      />

      <MovimientoModal
        isOpen={modalMov}
        onClose={() => setModalMov(false)}
        onSaved={handleMovSaved}
      />

      {/* Ticket de cierre (reimprimir) */}
      {modalTicket && (
        <TicketCierre caja={caja} saldos={saldos} onClose={() => setModalTicket(false)} />
      )}

      {/* Reabrir modal (inline) */}
      {modalReabrir && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setModalReabrir(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-yellow-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Reabrir caja</h3>
                <p className="text-xs text-slate-500">Se registrará el motivo de la reapertura</p>
              </div>
            </div>

            {errorReabrir && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm mb-3">{errorReabrir}</div>
            )}

            <div className="mb-4">
              <label className="block text-xs font-medium text-slate-600 mb-1">Motivo *</label>
              <textarea rows={3}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800 placeholder-slate-400
                  focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent transition"
                value={motivoReabrir}
                onChange={e => setMotivoReabrir(e.target.value)}
                placeholder="Razón para reabrir la caja…"
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button type="button" onClick={() => setModalReabrir(false)}
                className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">
                Cancelar
              </button>
              <button type="button" onClick={handleReabrir} disabled={reabriendo}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-yellow-600 hover:bg-yellow-700 disabled:bg-yellow-400 rounded-lg transition flex items-center justify-center gap-2">
                {reabriendo && (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                )}
                Reabrir
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
