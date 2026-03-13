import { useCallback, useEffect, useRef, useState } from 'react';
import { crearVenta, getPrecioSugerido } from '../../services/ventasService';
import { listarClientes } from '../../services/clientesService';
import { listarPresentaciones } from '../../services/presentacionesService';
import useMetodosPago from '../../hooks/useMetodosPago';
import BuscadorConCrear from '../../components/BuscadorConCrear';
import ClienteModal from '../Clientes/ClienteModal';

/* ── Constants ── */
const TIPO_LINEA_RETORNABLE = [
  { value: 'compra_bidon', label: 'Compra bidón',  hint: 'Venta definitiva' },
  { value: 'recarga',      label: 'Recarga',        hint: 'Trae vacío' },
  { value: 'prestamo',     label: 'Préstamo',       hint: 'Se lleva bidón' },
];
const TIPO_LINEA_NORMAL = [
  { value: 'producto', label: 'Producto', hint: 'Venta sin retorno' },
];
const ALL_TIPOS = [...TIPO_LINEA_RETORNABLE, TIPO_LINEA_NORMAL[0]];

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

/* ── Helpers ── */
function newLine(id) {
  return {
    id,
    presentacion: null,
    presInput: '',
    showSugg: false,
    tipo_linea: 'producto',
    cantidad: '1',
    vacios_recibidos: '0',
    precio_unitario: '',
    descuento_linea: '0',
    precio_origen: null,
  };
}

function lineSubtotal(l) {
  return Math.max(0, (Number(l.precio_unitario) || 0) - (Number(l.descuento_linea) || 0))
       * (Number(l.cantidad) || 0);
}

function tiposForPres(pres) {
  if (!pres) return ALL_TIPOS;
  return pres.es_retornable ? TIPO_LINEA_RETORNABLE : TIPO_LINEA_NORMAL;
}

function defaultTipoForPres(pres) {
  if (!pres) return 'producto';
  return pres.es_retornable ? 'recarga' : 'producto';
}

const needsVacios = t => t === 'recarga';

/* ── Componente ── */
export default function FormVenta({ isOpen, onClose, onSaved }) {
  const { metodos } = useMetodosPago();

  // Cliente
  const [cliente,      setCliente]      = useState(null);

  // Origen
  const [origen, setOrigen] = useState('presencial');

  // Líneas de venta
  const [lineas, setLineas] = useState(() => [newLine(1)]);
  const nextId = useRef(2);

  // Presentaciones disponibles
  const [presentaciones, setPresentaciones] = useState([]);

  // Pago global
  const [descuento, setDescuento] = useState('');
  const [pagos,     setPagos]     = useState({});
  const [notas,     setNotas]     = useState('');

  const [loading, setLoading] = useState(false);
  const [showClienteModal, setShowClienteModal] = useState(false);
  const [error,   setError]   = useState('');

  const lineRefs     = useRef({});   // { lineId: domRef }

  /* ── Reset al abrir ── */
  useEffect(() => {
    if (!isOpen) return;
    setCliente(null);
    setOrigen('presencial');
    setLineas([newLine(1)]); nextId.current = 2;
    setDescuento(''); setPagos({}); setNotas(''); setError('');

    listarPresentaciones({ activo: 1, limit: 100 })
      .then(res => setPresentaciones(Array.isArray(res.data) ? res.data : []))
      .catch(() => {});
  }, [isOpen]);

  /* ── Click fuera cierra dropdowns de líneas ── */
  useEffect(() => {
    function handler(e) {
      setLineas(prev => prev.map(l => {
        const ref = lineRefs.current[l.id];
        if (ref && !ref.contains(e.target)) return { ...l, showSugg: false };
        return l;
      }));
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!isOpen) return null;

  /* ── Cálculos ── */
  const subtotalLineas = lineas.reduce((s, l) => s + lineSubtotal(l), 0);
  const totalCalc      = Math.max(0, subtotalLineas - (Number(descuento) || 0));
  const sumPagos       = metodos.reduce((s, m) => s + (Number(pagos[m.nombre]) || 0), 0);
  const pendiente      = +(totalCalc - sumPagos).toFixed(2);
  const cubierto       = Math.abs(pendiente) <= 0.02;

  /* ── Cliente seleccionado ── */
  function seleccionarCliente(c) {
    setCliente(c);
    if (c) {
      lineas.forEach(l => {
        if (l.presentacion) fetchPrecio(l.id, c.id, l.presentacion, l.tipo_linea);
      });
    }
  }

  /* ── Líneas helpers ── */
  function updateLine(id, patch) {
    setLineas(prev => prev.map(l => {
      if (l.id !== id) return l;
      const nueva = { ...l, ...patch };
      // Si cambia cantidad y es recarga → sincronizar vacíos
      if ('cantidad' in patch && nueva.tipo_linea === 'recarga') {
        nueva.vacios_recibidos = patch.cantidad;
      }
      return nueva;
    }));
  }

  function addLine() {
    const id = nextId.current++;
    setLineas(prev => [...prev, newLine(id)]);
  }

  function removeLine(id) {
    setLineas(prev => prev.length > 1 ? prev.filter(l => l.id !== id) : prev);
  }

  async function fetchPrecio(lineId, clienteId, presentacion, tipoLinea) {
    if (!presentacion || !tipoLinea) return;
    try {
      const res = await getPrecioSugerido({
        cliente_id:      clienteId || undefined,
        presentacion_id: presentacion.id,
        tipo_linea:      tipoLinea,
      });
      updateLine(lineId, {
        precio_unitario: String(res.precio),
        precio_origen: res.origen || 'base',
      });
    } catch { /* silently ignore */ }
  }

  function onLinePresSelect(lineId, pres) {
    const tipo = defaultTipoForPres(pres);
    const linea = lineas.find(l => l.id === lineId);
    const cant = linea ? linea.cantidad : '1';
    updateLine(lineId, {
      presentacion: pres, presInput: pres.nombre, showSugg: false,
      tipo_linea: tipo,
      vacios_recibidos: tipo === 'recarga' ? cant : '0',
    });
    fetchPrecio(lineId, cliente?.id, pres, tipo);
  }

  function onLineTipoChange(lineId, newTipo, pres) {
    const linea = lineas.find(l => l.id === lineId);
    const cant = linea ? linea.cantidad : '1';
    updateLine(lineId, {
      tipo_linea: newTipo,
      vacios_recibidos: newTipo === 'recarga' ? cant : '0',
    });
    fetchPrecio(lineId, cliente?.id, pres, newTipo);
  }

  /* ── Payment helpers ── */
  function todoPorMetodo(key) {
    const reset = Object.fromEntries(metodos.map(m => [m.nombre, '0']));
    setPagos({ ...reset, [key]: totalCalc.toFixed(2) });
  }

  function distribuirResto(key) {
    const resto = Math.max(0, +(totalCalc - sumPagos + (Number(pagos[key]) || 0)).toFixed(2));
    setPagos(prev => ({ ...prev, [key]: resto > 0 ? String(resto) : '' }));
  }

  /* ── Submit ── */
  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!cliente) return setError('Se requiere seleccionar un cliente');
    if (lineas.some(l => !l.presentacion)) return setError('Cada línea requiere un producto');
    if (totalCalc <= 0) return setError('El total debe ser mayor a 0');
    if (pendiente > 0.02) return setError(`Faltan S/ ${pendiente.toFixed(2)} por asignar`);
    if (Number(pagos.credito) > 0 && !cliente) return setError('Se requiere un cliente para registrar crédito');

    setLoading(true);
    try {
      const pagosArray = metodos
        .filter(m => Number(pagos[m.nombre]) > 0)
        .map(m => ({ metodo: m.nombre, monto: Number(pagos[m.nombre]) }));

      const payload = {
        cliente_id:           cliente?.id || null,
        origen,
        descuento:            Number(descuento) || 0,
        pagos:                pagosArray,
        notas:                notas.trim() || null,
        lineas: lineas.map(l => ({
          presentacion_id:  l.presentacion.id,
          tipo_linea:       l.tipo_linea,
          cantidad:         Number(l.cantidad) || 1,
          vacios_recibidos: Number(l.vacios_recibidos) || 0,
          precio_unitario:  Number(l.precio_unitario) || 0,
          descuento_linea:  Number(l.descuento_linea) || 0,
        })),
      };
      const venta = await crearVenta(payload);
      onSaved(venta);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrar la venta');
    } finally {
      setLoading(false);
    }
  }

  /* ── Render ── */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-lg font-semibold text-slate-800">Nueva venta</h2>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
            )}

            {/* ── Cliente ── */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Cliente <span className="text-red-400">*</span></p>
              <BuscadorConCrear
                placeholder="Buscar por nombre o DNI…"
                value={cliente}
                onChange={seleccionarCliente}
                onSearch={q => listarClientes({ q, limit: 8 }).then(r => r.data)}
                onNewClick={() => setShowClienteModal(true)}
                renderOption={c => (
                  <>
                    <span style={{ fontWeight: 500, color: '#1e293b', fontSize: '14px' }}>
                      {c.nombre}
                      {c.dni && <span style={{ color: '#94a3b8', fontSize: '12px', marginLeft: '8px' }}>{c.dni}</span>}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full capitalize
                      ${c.tipo === 'mayoreo' ? 'bg-blue-100 text-blue-700' :
                        c.tipo === 'especial' ? 'bg-purple-100 text-purple-700' :
                        'bg-slate-100 text-slate-500'}`}>{c.tipo}</span>
                  </>
                )}
              />
              {cliente && (
                <div className="flex flex-wrap gap-3 mt-1.5">
                  {Number(cliente.saldo_dinero) > 0 && (
                    <p className="text-xs text-orange-600">
                      Deuda actual: S/ {Number(cliente.saldo_dinero).toFixed(2)}
                    </p>
                  )}
                  {Number(cliente.bidones_prestados) > 0 && (
                    <p className="text-xs text-blue-600">
                      Bidones prestados: {cliente.bidones_prestados}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* ── Origen ── */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Origen</p>
              <div className="flex gap-2">
                {['presencial', 'reparto'].map(o => (
                  <button key={o} type="button" onClick={() => setOrigen(o)}
                    className={`px-4 py-2 rounded-xl border text-sm font-medium transition capitalize
                      ${origen === o
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                    {o === 'presencial' ? '🏪 Presencial' : '🚚 Reparto'}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Líneas de venta ── */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Líneas de venta
              </p>
              <div className="space-y-3">
                {lineas.map((l, idx) => {
                  const tipos = tiposForPres(l.presentacion);
                  const presFiltradas = presentaciones.filter(p =>
                    !l.presInput || p.nombre.toLowerCase().includes(l.presInput.toLowerCase())
                  );
                  const sub = lineSubtotal(l);

                  return (
                    <div key={l.id} className="border border-slate-200 rounded-xl p-3 space-y-2 bg-slate-50/50">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-slate-500">Línea {idx + 1}</span>
                        {lineas.length > 1 && (
                          <button type="button" onClick={() => removeLine(l.id)}
                            className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* Presentación */}
                      <div
                        className="relative"
                        ref={el => { if (el) lineRefs.current[l.id] = el; }}
                      >
                        {l.presentacion ? (
                          <div className="flex items-center gap-2 px-3 py-2 border border-green-400 bg-green-50 rounded-lg">
                            <span className="text-sm font-medium text-slate-800 flex-1 truncate">{l.presentacion.nombre}</span>
                            <span className="text-xs text-slate-500 shrink-0">
                              {l.presentacion.es_retornable ? 'Retornable' : l.presentacion.tipo}
                            </span>
                            <button type="button"
                              onClick={() => updateLine(l.id, { presentacion: null, presInput: '', tipo_linea: 'producto', precio_unitario: '', precio_origen: null })}
                              className="text-xs text-slate-400 hover:text-red-500 transition px-1.5 py-0.5 rounded border border-slate-200 bg-white shrink-0">
                              ×
                            </button>
                          </div>
                        ) : (
                          <>
                            <input
                              value={l.presInput}
                              onChange={e => updateLine(l.id, { presInput: e.target.value, showSugg: true })}
                              onFocus={() => updateLine(l.id, { showSugg: true })}
                              placeholder="Buscar producto…"
                              className={inputCls}
                            />
                            {l.showSugg && (presFiltradas.length > 0 || l.presInput) && (
                              <ul className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-44 overflow-y-auto">
                                {presFiltradas.length > 0 ? presFiltradas.map(p => (
                                  <li key={p.id}>
                                    <button type="button" onMouseDown={() => onLinePresSelect(l.id, p)}
                                      className="w-full text-left px-3 py-2 hover:bg-blue-50 transition flex items-center justify-between gap-2">
                                      <div className="min-w-0">
                                        <span className="text-sm font-medium text-slate-800 block truncate">{p.nombre}</span>
                                        <span className="text-xs text-slate-400">{p.tipo} · {p.unidad}</span>
                                      </div>
                                      <div className="shrink-0 flex items-center gap-1.5">
                                        {p.es_retornable && (
                                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Retornable</span>
                                        )}
                                        <span className="text-xs font-medium text-slate-600">S/ {Number(p.precio_base).toFixed(2)}</span>
                                      </div>
                                    </button>
                                  </li>
                                )) : (
                                  <li className="px-3 py-2 text-sm text-slate-400 text-center">Sin resultados</li>
                                )}
                              </ul>
                            )}
                          </>
                        )}
                      </div>

                      {/* Tipo de línea */}
                      {l.presentacion && (
                        <div className="flex flex-wrap gap-1.5">
                          {tipos.map(t => (
                            <button key={t.value} type="button"
                              onClick={() => onLineTipoChange(l.id, t.value, l.presentacion)}
                              className={`px-2.5 py-1 rounded-lg border text-xs font-medium transition
                                ${l.tipo_linea === t.value
                                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                                  : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                              {t.label}
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Cantidad + Vacíos (si recarga) */}
                      <div className={`grid gap-2 mb-2 ${needsVacios(l.tipo_linea) ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        <div>
                          <label className="block text-xs text-slate-500 mb-0.5">Cantidad</label>
                          <input type="number" inputMode="numeric" min="1" step="1"
                            className={`${inputCls} text-center text-lg font-bold`}
                            value={l.cantidad}
                            onChange={e => updateLine(l.id, { cantidad: e.target.value })} />
                        </div>
                        {needsVacios(l.tipo_linea) && (
                          <div>
                            <label className="block text-xs text-indigo-600 font-medium mb-0.5">Vacios recibidos</label>
                            <input type="number" inputMode="numeric" min="0" max={l.cantidad} step="1"
                              className={`${inputCls} text-center text-lg font-bold border-indigo-300 bg-indigo-50 text-indigo-700`}
                              value={l.vacios_recibidos}
                              onChange={e => {
                                const v = Math.min(Number(e.target.value) || 0, Number(l.cantidad) || 0);
                                updateLine(l.id, { vacios_recibidos: v });
                              }} />
                            {String(l.vacios_recibidos) !== String(l.cantidad) && (
                              <p className="text-xs text-amber-500 mt-0.5">Difiere de la cantidad</p>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Precio + Descuento + Subtotal */}
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-xs text-slate-500 mb-0.5">
                            Precio unit.
                            {l.precio_origen === 'especial' && (
                              <span className="ml-1 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">Especial</span>
                            )}
                            {l.precio_origen === 'base' && (
                              <span className="ml-1 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-medium">Base</span>
                            )}
                          </label>
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-semibold text-slate-400">S/</span>
                            <input type="number" inputMode="decimal" min="0" step="0.50"
                              className={`${inputCls} flex-1 text-right font-bold ${
                                l.precio_origen === 'especial' ? 'border-amber-300 bg-amber-50' : ''
                              }`}
                              value={l.precio_unitario}
                              onChange={e => updateLine(l.id, { precio_unitario: e.target.value, precio_origen: null })}
                              placeholder="0.00" />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-0.5">Desc. linea</label>
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-semibold text-slate-400">S/</span>
                            <input type="number" inputMode="decimal" min="0" step="0.01"
                              className={`${inputCls} flex-1 text-right`}
                              value={l.descuento_linea}
                              onChange={e => updateLine(l.id, { descuento_linea: e.target.value })} />
                          </div>
                        </div>
                        <div className="flex items-end">
                          <div className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-right">
                            <div className="text-xs text-slate-400">Subtotal</div>
                            <div className="text-sm font-bold text-slate-800">S/ {sub.toFixed(2)}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button type="button" onClick={addLine}
                className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Agregar línea
              </button>
            </div>

            {/* ── Pago ── */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Forma de pago</p>
                <div className="flex gap-1 flex-wrap">
                  {metodos.map(m => (
                    <button key={m.nombre} type="button" onClick={() => todoPorMetodo(m.nombre)}
                      className="text-xs px-2 py-1 rounded-lg border border-slate-200 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition text-slate-500">
                      Todo {m.etiqueta.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Descuento global */}
              <div className="flex items-center gap-3 mb-3">
                <label className="text-xs text-slate-600 whitespace-nowrap">Descuento global (S/)</label>
                <div className="relative w-32">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">S/</span>
                  <input type="number" min="0" step="0.01" className={`${inputCls} pl-8`}
                    value={descuento}
                    onChange={e => setDescuento(e.target.value)}
                    placeholder="0.00" />
                </div>
                <div className="ml-auto text-right">
                  <div className="text-xs text-slate-400">Total venta</div>
                  <div className="text-xl font-bold text-slate-800">S/ {totalCalc.toFixed(2)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {metodos.map(m => (
                  <div key={m.nombre}>
                    <label className="block text-xs font-medium text-slate-600 mb-1">{m.etiqueta}</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">S/</span>
                      <input type="number" min="0" step="0.01"
                        className={`${inputCls} pl-8 ${m.nombre === 'credito' && Number(pagos.credito) > 0 ? 'border-orange-400 bg-orange-50' : ''}`}
                        value={pagos[m.nombre] || ''}
                        onChange={e => setPagos(prev => ({ ...prev, [m.nombre]: e.target.value }))}
                        onFocus={() => distribuirResto(m.nombre)}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className={`mt-3 px-4 py-2.5 rounded-xl flex items-center justify-between text-sm
                ${cubierto
                  ? 'bg-green-50 border border-green-200'
                  : pendiente < 0
                    ? 'bg-blue-50 border border-blue-200'
                    : 'bg-amber-50 border border-amber-200'}`}>
                <span className={cubierto ? 'text-green-700' : pendiente < 0 ? 'text-blue-700' : 'text-amber-700'}>
                  {cubierto ? 'Cobro completo' : pendiente < 0 ? 'Vuelto' : 'Pendiente por asignar'}
                </span>
                <span className={`font-bold ${cubierto ? 'text-green-700' : pendiente < 0 ? 'text-blue-700' : 'text-amber-600'}`}>
                  {cubierto
                    ? `S/ ${totalCalc.toFixed(2)}`
                    : pendiente < 0
                      ? `S/ ${Math.abs(pendiente).toFixed(2)}`
                      : `S/ ${pendiente.toFixed(2)}`}
                </span>
              </div>
              {Number(pagos.credito) > 0 && !cliente && (
                <p className="text-xs text-red-600 mt-1.5">
                  Se requiere un cliente para registrar crédito
                </p>
              )}
              {Number(pagos.credito) > 0 && cliente && (
                <p className="text-xs text-orange-600 mt-1.5">
                  S/ {Number(pagos.credito).toFixed(2)} se registrarán como deuda de {cliente.nombre}
                </p>
              )}
            </div>

            {/* ── Notas ── */}
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Notas (opcional)</label>
              <textarea rows={2} className={inputCls}
                value={notas} onChange={e => setNotas(e.target.value)}
                placeholder="Observaciones de la entrega…" />
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl shrink-0">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-100 transition">
              Cancelar
            </button>
            <button type="submit" disabled={loading || totalCalc <= 0 || !cubierto}
              className="px-6 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition flex items-center gap-2">
              {loading && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              Registrar venta
            </button>
          </div>
        </form>
      </div>

      <ClienteModal
        isOpen={showClienteModal}
        onClose={() => setShowClienteModal(false)}
        onSaved={(saved) => { seleccionarCliente(saved); setShowClienteModal(false); }}
      />
    </div>
  );
}
