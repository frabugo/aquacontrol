import { useCallback, useEffect, useState } from 'react';
import { getKardex, registrarMovimiento } from '../../services/presentacionesService';

/* ── Definición de movimientos disponibles ── */
const MOVIMIENTOS = [
  { tipo: 'rotura',           label: 'Rotura',              hint: 'Registrar bidón roto (elegir si estaba lleno o vacío)',  origenOpts: ['lleno','vacio'] },
  { tipo: 'baja',             label: 'Dar de baja',         hint: 'Retirar bidón roto definitivamente',                    origenOpts: null },
  { tipo: 'reparacion_inicio',label: 'Iniciar reparación',  hint: 'Enviar bidón roto a reparación',                        origenOpts: null },
  { tipo: 'reparacion_fin',   label: 'Fin de reparación',   hint: 'Bidón reparado vuelve como vacío',                      origenOpts: null },
  { tipo: 'lavado_inicio',    label: 'Iniciar lavado',      hint: 'Enviar bidón vacío a lavado',                           origenOpts: null },
  { tipo: 'lavado_fin',       label: 'Fin de lavado',       hint: 'Bidón lavado vuelve como vacío limpio',                 origenOpts: null },
  { tipo: 'llenado',          label: 'Llenado',             hint: 'Llenar bidón vacío (producción)',                        origenOpts: null },
  { tipo: 'compra_empresa',   label: 'Compra empresa',      hint: 'Ingreso de bidones nuevos (entran a lavado)',            origenOpts: null },
  { tipo: 'perdida',          label: 'Pérdida / Extravío',  hint: 'Bidón perdido (elegir si estaba lleno o vacío)',         origenOpts: ['lleno','vacio'] },
  { tipo: 'ajuste',           label: 'Ajuste manual',       hint: 'Corrección de inventario',                              origenOpts: null },
];

const ESTADOS_LABEL = {
  lleno: 'Llenos', vacio: 'Vacíos', roto: 'Rotos',
  en_lavado: 'En lavado', en_reparacion: 'En reparación',
  perdido: 'Perdidos', baja: 'Baja',
};

/* ── Cards de stock ── */
const STOCK_CARDS_RETORNABLE = [
  { key: 'stock_llenos',        label: 'Llenos',        color: 'blue',   dot: 'bg-blue-500' },
  { key: 'stock_vacios',        label: 'Vacíos',        color: 'slate',  dot: 'bg-slate-400' },
  { key: 'stock_rotos',         label: 'Rotos',         color: 'red',    dot: 'bg-red-500' },
  { key: 'stock_en_lavado',     label: 'En lavado',     color: 'yellow', dot: 'bg-yellow-400' },
  { key: 'stock_en_reparacion', label: 'En reparación', color: 'orange', dot: 'bg-orange-500' },
  { key: 'stock_perdidos',      label: 'Perdidos',      color: 'zinc',   dot: 'bg-zinc-500' },
  { key: 'stock_baja',          label: 'Dados de baja', color: 'stone',  dot: 'bg-stone-700' },
];

const STOCK_CARDS_SIMPLE = [
  { key: 'stock_llenos',   label: 'Disponible',    color: 'blue',  dot: 'bg-blue-500' },
  { key: 'stock_rotos',    label: 'Rotos',         color: 'red',   dot: 'bg-red-500' },
  { key: 'stock_baja',     label: 'Dados de baja', color: 'stone', dot: 'bg-stone-700' },
];

const CARD_BG = {
  blue:   'bg-blue-50   border-blue-200   text-blue-800',
  slate:  'bg-slate-50  border-slate-200  text-slate-700',
  red:    'bg-red-50    border-red-200    text-red-800',
  yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  orange: 'bg-orange-50 border-orange-200 text-orange-800',
  zinc:   'bg-zinc-50   border-zinc-200   text-zinc-700',
  stone:  'bg-stone-50  border-stone-200  text-stone-700',
};

function formatFechaHora(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

/* Movimientos solo para no retornables (sin lavado/reparacion/llenado/compra_empresa) */
const MOVIMIENTOS_SIMPLE = MOVIMIENTOS.filter(m =>
  ['rotura', 'baja', 'perdida', 'ajuste'].includes(m.tipo)
);

/* ── Modal de movimiento ── */
function ModalMovimiento({ presentacion, onClose, onSaved }) {
  const isRetornable = !!presentacion.es_retornable;
  const movOptions = isRetornable ? MOVIMIENTOS : MOVIMIENTOS_SIMPLE;

  const [tipo,       setTipo]       = useState(movOptions[0].tipo);
  const [origen,     setOrigen]     = useState('lleno');
  const [ajustCol,   setAjustCol]   = useState('lleno');
  const [ajustDir,   setAjustDir]   = useState('agregar');
  const [cantidad,   setCantidad]   = useState('1');
  const [motivo,     setMotivo]     = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  const tipoInfo = MOVIMIENTOS.find(m => m.tipo === tipo);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = {
        tipo,
        cantidad: Number(cantidad),
        motivo,
        estado_origen: tipo === 'rotura' || tipo === 'perdida' ? origen
                     : tipo === 'ajuste' && ajustDir === 'reducir' ? ajustCol
                     : undefined,
        estado_destino: tipo === 'ajuste' ? ajustCol : undefined,
      };
      const updated = await registrarMovimiento(presentacion.id, payload);
      onSaved(updated);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="font-semibold text-slate-800">Registrar movimiento</h3>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
          )}

          {/* Tipo */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de movimiento</label>
            <select className={inputCls} value={tipo} onChange={e => { setTipo(e.target.value); setOrigen('lleno'); }}>
              {movOptions.map(m => (
                <option key={m.tipo} value={m.tipo}>{m.label} — {m.hint}</option>
              ))}
            </select>
          </div>

          {/* Estado origen para rotura/pérdida */}
          {tipoInfo?.origenOpts && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                {tipo === 'rotura' ? '¿El bidón estaba lleno o vacío?' : '¿Qué tipo de bidón se perdió?'}
              </label>
              <div className="flex gap-2">
                {tipoInfo.origenOpts.map(o => (
                  <button key={o} type="button" onClick={() => setOrigen(o)}
                    className={`flex-1 py-2.5 text-sm rounded-lg border font-medium transition
                      ${origen === o
                        ? o === 'lleno' ? 'bg-blue-50 border-blue-400 text-blue-700' : 'bg-slate-100 border-slate-400 text-slate-700'
                        : 'border-slate-300 text-slate-500 hover:bg-slate-50'}`}>
                    {o === 'lleno' ? 'Bidón lleno' : 'Bidón vacío'}
                    <span className="block text-xs font-normal mt-0.5 opacity-70">
                      {o === 'lleno' ? `Resta de ${presentacion?.stock_llenos ?? 0} llenos` : `Resta de ${presentacion?.stock_vacios ?? 0} vacíos`}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Campos para ajuste */}
          {tipo === 'ajuste' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Estado a ajustar</label>
                <select className={inputCls} value={ajustCol} onChange={e => setAjustCol(e.target.value)}>
                  {Object.entries(ESTADOS_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Dirección</label>
                <div className="flex gap-2">
                  {[['agregar','+ Agregar'],['reducir','− Reducir']].map(([val, lbl]) => (
                    <button key={val} type="button" onClick={() => setAjustDir(val)}
                      className={`flex-1 py-2 text-sm rounded-lg border font-medium transition
                        ${ajustDir === val
                          ? val === 'agregar' ? 'bg-green-50 border-green-400 text-green-700' : 'bg-red-50 border-red-400 text-red-700'
                          : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Cantidad */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Cantidad</label>
            <input type="number" min="1" step="1" required className={inputCls}
              value={cantidad} onChange={e => setCantidad(e.target.value)} />
          </div>

          {/* Motivo */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Motivo (opcional)</label>
            <input className={inputCls} value={motivo} onChange={e => setMotivo(e.target.value)}
              placeholder="Descripción del movimiento…" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition flex items-center gap-2">
              {loading && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              Registrar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Componente principal ── */
export default function StockRetornable({ presentacion: initialPresentacion, onClose, onUpdated }) {
  const [pres,      setPres]      = useState(initialPresentacion);
  const [movs,      setMovs]      = useState([]);
  const [totalMovs, setTotalMovs] = useState(0);
  const [paginas,   setPaginas]   = useState(1);
  const [pagina,    setPagina]    = useState(1);
  const [loadingM,  setLoadingM]  = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  // Filtros de fecha — por defecto hoy (hora Perú)
  const now = new Date();
  const hoy = [now.getFullYear(), String(now.getMonth()+1).padStart(2,'0'), String(now.getDate()).padStart(2,'0')].join('-');
  const [fechaInicio, setFechaInicio] = useState(hoy);
  const [fechaFin,    setFechaFin]    = useState(hoy);

  const fetchMovimientos = useCallback(async () => {
    setLoadingM(true);
    try {
      const params = { page: pagina, limit: 50 };
      if (fechaInicio) params.fecha_inicio = fechaInicio;
      if (fechaFin)    params.fecha_fin    = fechaFin;
      const res = await getKardex(pres.id, params);
      setMovs(Array.isArray(res.data) ? res.data : []);
      setTotalMovs(res.total || 0);
      setPaginas(res.pages || 1);
    } catch {
      setMovs([]);
    } finally {
      setLoadingM(false);
    }
  }, [pres.id, fechaInicio, fechaFin, pagina]);

  useEffect(() => { fetchMovimientos(); }, [fetchMovimientos]);

  // Reset página al cambiar fechas
  useEffect(() => { setPagina(1); }, [fechaInicio, fechaFin]);

  function handleMovSaved(updatedPres) {
    setPres(updatedPres);
    fetchMovimientos();
    if (onUpdated) onUpdated(updatedPres);
  }

  const isRetornable = !!pres.es_retornable;
  const stockCards = isRetornable ? STOCK_CARDS_RETORNABLE : STOCK_CARDS_SIMPLE;
  const total = stockCards.reduce((s, c) => s + (Number(pres[c.key]) || 0), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">{pres.nombre}</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              {isRetornable ? 'Stock retornable' : 'Stock de producto'} — Total en sistema: {total}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setModalOpen(true)}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              Registrar movimiento
            </button>
            <button type="button" onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Cards de stock */}
          <div className="px-6 pt-5 pb-4">
            <div className={`grid gap-3 ${isRetornable ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
              {stockCards.map(({ key, label, color, dot }) => {
                const val = Number(pres[key]) || 0;
                return (
                  <div key={key} className={`border rounded-xl px-4 py-3 ${CARD_BG[color]}`}>
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`w-2 h-2 rounded-full ${dot}`} />
                      <span className="text-xs font-medium opacity-80">{label}</span>
                    </div>
                    <div className="text-2xl font-bold">{val}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Kardex */}
          <div className="px-6 pb-6">
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Kardex de movimientos</p>
              <div className="flex items-center gap-2 ml-auto">
                <input type="date" className="px-2 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} />
                <span className="text-xs text-slate-400">a</span>
                <input type="date" className="px-2 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
                <button onClick={() => { setFechaInicio(''); setFechaFin(''); }}
                  className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                  title="Ver todo">Todo</button>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              {loadingM ? (
                <div className="p-6 text-center text-slate-400 text-sm">Cargando…</div>
              ) : movs.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-sm">Sin movimientos registrados</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="px-2 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap">Fecha</th>
                        <th className="px-2 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap">Movimiento</th>
                        <th className="px-2 py-2 text-center text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap">Cant.</th>
                        <th className="px-2 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap">Ubicación</th>
                        {isRetornable && <>
                          <th className="px-2 py-2 text-center text-[10px] font-semibold text-blue-600 uppercase whitespace-nowrap bg-blue-50/50">Llenos</th>
                          <th className="px-2 py-2 text-center text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap bg-slate-50/80">Vacíos</th>
                          <th className="px-2 py-2 text-center text-[10px] font-semibold text-yellow-600 uppercase whitespace-nowrap bg-yellow-50/50">Lavado</th>
                          <th className="px-2 py-2 text-center text-[10px] font-semibold text-red-500 uppercase whitespace-nowrap bg-red-50/50">Rotos</th>
                        </>}
                        {!isRetornable && <>
                          <th className="px-2 py-2 text-center text-[10px] font-semibold text-blue-600 uppercase whitespace-nowrap bg-blue-50/50">Stock</th>
                          <th className="px-2 py-2 text-center text-[10px] font-semibold text-red-500 uppercase whitespace-nowrap bg-red-50/50">Rotos</th>
                        </>}
                        <th className="px-2 py-2 text-left text-[10px] font-semibold text-slate-500 uppercase whitespace-nowrap">Detalle</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {movs.map(m => {
                        const movLabel = MOVIMIENTOS.find(x => x.tipo === m.tipo)?.label ?? m.tipo;
                        const isEntrada = ['compra_empresa','llenado','lavado_fin','reparacion_fin','devolucion_cliente','devolucion_ruta','descarga_retorno'].includes(m.tipo);
                        const isSalida = ['venta','prestamo','rotura','baja','perdida','carga_salida'].includes(m.tipo);
                        return (
                          <tr key={m.id} className="hover:bg-slate-50">
                            <td className="px-2 py-2 text-slate-500 whitespace-nowrap tabular-nums">{formatFechaHora(m.fecha_hora)}</td>
                            <td className="px-2 py-2 whitespace-nowrap">
                              <span className={`font-medium ${isEntrada ? 'text-green-700' : isSalida ? 'text-red-600' : 'text-slate-700'}`}>
                                {movLabel}
                              </span>
                              {m.estado_origen && m.estado_destino && (
                                <span className="text-slate-400 ml-1">
                                  {ESTADOS_LABEL[m.estado_origen]} → {ESTADOS_LABEL[m.estado_destino]}
                                </span>
                              )}
                            </td>
                            <td className={`px-2 py-2 text-center font-bold tabular-nums ${isEntrada ? 'text-green-600' : isSalida ? 'text-red-600' : 'text-slate-700'}`}>
                              {isEntrada ? '+' : isSalida ? '-' : ''}{m.cantidad}
                            </td>
                            <td className="px-2 py-2 whitespace-nowrap">
                              {m.repartidor
                                ? <span className="inline-flex items-center gap-1 text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded font-medium">{m.repartidor}</span>
                                : <span className="text-slate-500">Planta</span>}
                            </td>
                            {isRetornable && m.saldo && <>
                              <td className="px-2 py-2 text-center tabular-nums font-semibold text-blue-700 bg-blue-50/30">{m.saldo.llenos}</td>
                              <td className="px-2 py-2 text-center tabular-nums font-semibold text-slate-600 bg-slate-50/50">{m.saldo.vacios}</td>
                              <td className="px-2 py-2 text-center tabular-nums text-yellow-700 bg-yellow-50/30">{m.saldo.en_lavado}</td>
                              <td className="px-2 py-2 text-center tabular-nums text-red-500 bg-red-50/30">{m.saldo.rotos}</td>
                            </>}
                            {!isRetornable && m.saldo && <>
                              <td className="px-2 py-2 text-center tabular-nums font-semibold text-blue-700 bg-blue-50/30">{m.saldo.llenos}</td>
                              <td className="px-2 py-2 text-center tabular-nums text-red-500 bg-red-50/30">{m.saldo.rotos}</td>
                            </>}
                            <td className="px-2 py-2 text-slate-400 max-w-[120px] truncate">
                              {m.motivo || m.registrado_por || '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Paginación */}
            {paginas > 1 && (
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-slate-500">{totalMovs} movimientos — Pág. {pagina} de {paginas}</p>
                <div className="flex gap-2">
                  <button disabled={pagina <= 1} onClick={() => setPagina(p => p - 1)}
                    className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">Anterior</button>
                  <button disabled={pagina >= paginas} onClick={() => setPagina(p => p + 1)}
                    className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">Siguiente</button>
                </div>
              </div>
            )}
            {paginas <= 1 && totalMovs > 0 && (
              <p className="text-xs text-slate-400 mt-2">{totalMovs} movimientos</p>
            )}
          </div>
        </div>
      </div>

      {modalOpen && (
        <ModalMovimiento
          presentacion={pres}
          onClose={() => setModalOpen(false)}
          onSaved={handleMovSaved}
        />
      )}
    </div>
  );
}
