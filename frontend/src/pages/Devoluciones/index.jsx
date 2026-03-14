import { useCallback, useEffect, useRef, useState } from 'react';
import Layout from '../../components/Layout';
import {
  listarDevoluciones, crearDevolucion, anularDevolucion,
  clientesPrestamos, detallePrestamos, pendientesPorVenta,
} from '../../services/devolucionesService';
import { listarClientes } from '../../services/clientesService';
import { listarPresentaciones } from '../../services/presentacionesService';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatFechaHora(dt) {
  if (!dt) return '—';
  const d = new Date(dt);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

const TIPO_BADGE = {
  mayoreo:  'bg-blue-100 text-blue-700',
  menudeo:  'bg-slate-100 text-slate-600',
  especial: 'bg-purple-100 text-purple-700',
};

/* ══════════════════════════════════════════════════════════════════
   Modal — Registrar Devolución (con trazabilidad por venta)
   ══════════════════════════════════════════════════════════════════ */
function NuevaDevolucionModal({ isOpen, onClose, onSaved }) {
  const [clienteInput, setClienteInput] = useState('');
  const [clientes, setClientes]         = useState([]);
  const [cliente, setCliente]           = useState(null);
  const [showSugg, setShowSugg]         = useState(false);

  const [pendientes, setPendientes] = useState([]);       // préstamos pendientes por venta
  const [loadingPend, setLoadingPend] = useState(false);
  const [selected, setSelected]     = useState(null);      // línea seleccionada
  const [cantidad, setCantidad]     = useState('');
  const [notas, setNotas]           = useState('');
  const [modoManual, setModoManual] = useState(false);
  const [presentaciones, setPresentaciones] = useState([]);
  const [presSeleccionada, setPresSeleccionada] = useState('');
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState('');
  const timer = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setClienteInput(''); setClientes([]); setCliente(null); setShowSugg(false);
      setPendientes([]); setSelected(null); setCantidad(''); setNotas(''); setError('');
      setModoManual(false); setPresSeleccionada('');
    }
  }, [isOpen]);

  // Cargar presentaciones retornables
  useEffect(() => {
    if (isOpen) {
      listarPresentaciones({ activo: 1, limit: 100 })
        .then(r => setPresentaciones((Array.isArray(r.data) ? r.data : []).filter(p => p.es_retornable)))
        .catch(() => setPresentaciones([]));
    }
  }, [isOpen]);

  // Al seleccionar cliente, cargar sus préstamos pendientes
  useEffect(() => {
    if (!cliente) { setPendientes([]); return; }
    setLoadingPend(true);
    pendientesPorVenta(cliente.id)
      .then(r => setPendientes(Array.isArray(r.data) ? r.data : []))
      .catch(() => setPendientes([]))
      .finally(() => setLoadingPend(false));
  }, [cliente]);

  function handleClienteSearch(val) {
    setClienteInput(val);
    setCliente(null); setSelected(null); setCantidad('');
    clearTimeout(timer.current);
    if (val.trim().length < 2) { setClientes([]); setShowSugg(false); return; }
    timer.current = setTimeout(async () => {
      try {
        const res = await listarClientes({ q: val.trim(), limit: 8 });
        setClientes(Array.isArray(res.data) ? res.data : []);
        setShowSugg(true);
      } catch { setClientes([]); }
    }, 300);
  }

  function selectCliente(c) {
    setCliente(c);
    setClienteInput(c.nombre);
    setShowSugg(false);
    setSelected(null);
    setCantidad('');
  }

  function selectLinea(linea) {
    setSelected(linea);
    setCantidad(String(linea.pendiente));
    setError('');
  }

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!cliente) return setError('Selecciona un cliente');
    if (!selected && !modoManual) return setError('Selecciona una venta con préstamo');
    if (modoManual && !presSeleccionada) return setError('Selecciona un producto');
    const qty = Number(cantidad);
    if (!qty || qty <= 0) return setError('La cantidad debe ser mayor a 0');
    if (selected && qty > selected.pendiente) return setError(`Máximo ${selected.pendiente} para esa venta`);
    if (modoManual && qty > Number(cliente.bidones_prestados)) return setError(`Máximo ${cliente.bidones_prestados} bidones prestados`);

    setError(''); setLoading(true);
    try {
      await crearDevolucion({
        cliente_id: cliente.id,
        presentacion_id: modoManual ? Number(presSeleccionada) : selected.presentacion_id,
        venta_id: selected?.venta_id || null,
        cantidad: qty,
        fecha: today(),
        notas: notas.trim() || null,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrar devolución');
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-base font-semibold text-slate-800">Registrar devolución</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

          {/* Buscar cliente */}
          <div className="relative">
            <label className="block text-xs font-medium text-slate-600 mb-1">Cliente <span className="text-red-400">*</span></label>
            <input
              className={inputCls}
              value={clienteInput}
              onChange={e => handleClienteSearch(e.target.value)}
              onFocus={() => clientes.length > 0 && setShowSugg(true)}
              placeholder="Buscar cliente..."
              autoFocus
            />
            {showSugg && clientes.length > 0 && (
              <ul className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                {clientes.map(c => (
                  <li key={c.id}
                    onClick={() => selectCliente(c)}
                    className="px-4 py-2.5 hover:bg-blue-50 cursor-pointer text-sm flex items-center justify-between">
                    <span className="font-medium text-slate-800">{c.nombre}</span>
                    {Number(c.bidones_prestados) > 0 && (
                      <span className="text-xs text-blue-600 font-medium">
                        {c.bidones_prestados} prestados
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Info cliente */}
          {cliente && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-800">{cliente.nombre}</p>
                <p className="text-xs text-slate-500 mt-0.5">{cliente.tipo} &middot; {cliente.telefono || 'Sin teléfono'}</p>
              </div>
              <div className="text-right">
                <span className="text-xs text-slate-500">Bidones pendientes</span>
                <p className={`text-lg font-bold tabular-nums ${Number(cliente.bidones_prestados) > 0 ? 'text-amber-700' : 'text-green-600'}`}>
                  {cliente.bidones_prestados ?? 0}
                </p>
              </div>
            </div>
          )}

          {/* Tabla de préstamos pendientes */}
          {cliente && (
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-2">
                Ventas con bidones prestados <span className="text-red-400">*</span>
              </label>

              {loadingPend ? (
                <div className="flex items-center justify-center py-6">
                  <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : pendientes.length === 0 ? (
                Number(cliente.bidones_prestados) > 0 ? (
                  <div className="space-y-3">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
                      Este cliente tiene {cliente.bidones_prestados} bidones prestados (carga inicial). Selecciona producto y cantidad para devolver.
                    </div>
                    {!modoManual ? (
                      <button type="button" onClick={() => setModoManual(true)}
                        className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition">
                        Registrar devolución manual
                      </button>
                    ) : (
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Producto</label>
                          <select value={presSeleccionada} onChange={e => { setPresSeleccionada(e.target.value); setError(''); }}
                            className={inputCls}>
                            <option value="">Seleccionar producto...</option>
                            {presentaciones.map(p => (
                              <option key={p.id} value={p.id}>{p.nombre}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">Cantidad a devolver</label>
                          <input type="number" min="1" max={cliente.bidones_prestados} value={cantidad}
                            onChange={e => setCantidad(e.target.value)} className={inputCls} placeholder="1" />
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-6 text-center text-sm text-slate-400">
                    No tiene préstamos pendientes de devolución
                  </div>
                )
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-left">
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500">Fecha</th>
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500">Folio</th>
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500">Producto</th>
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500 text-center">Prestados</th>
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500 text-center">Devueltos</th>
                        <th className="px-3 py-2 text-xs font-semibold text-slate-500 text-center">Pendiente</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {pendientes.map((l, i) => {
                        const isSelected = selected
                          && selected.venta_id === l.venta_id
                          && selected.presentacion_id === l.presentacion_id;
                        return (
                          <tr key={i}
                            onClick={() => selectLinea(l)}
                            className={`cursor-pointer transition-colors ${
                              isSelected
                                ? 'bg-blue-50 ring-1 ring-inset ring-blue-300'
                                : 'hover:bg-slate-50'
                            }`}>
                            <td className="px-3 py-2 text-xs text-slate-500 whitespace-nowrap">{formatFechaHora(l.fecha_hora)}</td>
                            <td className="px-3 py-2">
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">{l.folio}</span>
                            </td>
                            <td className="px-3 py-2 text-slate-700">{l.presentacion_nombre}</td>
                            <td className="px-3 py-2 text-center tabular-nums text-slate-600">{l.prestados}</td>
                            <td className="px-3 py-2 text-center tabular-nums text-green-600">{l.devueltos}</td>
                            <td className="px-3 py-2 text-center">
                              <span className="font-bold tabular-nums text-amber-700">{l.pendiente}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Cantidad + Notas (solo si hay línea seleccionada) */}
          {selected && (
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-500">Devolviendo de:</span>
                <span className="font-medium text-blue-700">{selected.folio}</span>
                <span className="text-slate-400">&middot;</span>
                <span className="text-slate-700">{selected.presentacion_nombre}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Cantidad <span className="text-red-400">*</span>
                    <span className="text-slate-400 ml-1">(máx. {selected.pendiente})</span>
                  </label>
                  <input type="number" min="1" max={selected.pendiente} step="1" required className={inputCls}
                    value={cantidad} onChange={e => setCantidad(e.target.value)} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Notas (opcional)</label>
                  <input className={inputCls} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones..." />
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">Cancelar</button>
            <button type="submit" disabled={loading || !selected}
              className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition">
              {loading ? 'Registrando...' : 'Registrar devolución'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Modal — Detalle de Préstamos por Cliente
   ══════════════════════════════════════════════════════════════════ */
function DetallePrestamosModal({ isOpen, onClose, cliente }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && cliente) {
      setLoading(true);
      detallePrestamos(cliente.id)
        .then(setData)
        .catch(() => setData(null))
        .finally(() => setLoading(false));
    }
  }, [isOpen, cliente]);

  if (!isOpen || !cliente) return null;

  const ventas      = data?.ventas ?? [];
  const devs        = data?.devoluciones ?? [];
  const info        = data?.cliente;
  const totalPrest  = ventas.reduce((s, v) => s + Number(v.cantidad), 0);
  const totalDevAct = devs.filter(d => d.estado === 'activa').reduce((s, d) => s + Number(d.cantidad), 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-base font-semibold text-slate-800">Trazabilidad de bidones</h2>
            <p className="text-sm text-slate-500 mt-0.5">{cliente.nombre}</p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto px-6 py-5 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {/* Resumen */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-500">Total prestados</p>
                  <p className="text-xl font-bold text-blue-700 tabular-nums">{totalPrest}</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-500">Total devueltos</p>
                  <p className="text-xl font-bold text-green-700 tabular-nums">{totalDevAct}</p>
                </div>
                <div className={`border rounded-xl p-3 text-center ${
                  Number(info?.bidones_prestados) > 0
                    ? 'bg-amber-50 border-amber-200'
                    : 'bg-slate-50 border-slate-200'
                }`}>
                  <p className="text-xs text-slate-500">Pendiente</p>
                  <p className={`text-xl font-bold tabular-nums ${
                    Number(info?.bidones_prestados) > 0 ? 'text-amber-700' : 'text-slate-600'
                  }`}>
                    {info?.bidones_prestados ?? 0}
                  </p>
                </div>
              </div>

              {/* Ventas con préstamo */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Ventas con préstamo de bidones</h3>
                {ventas.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center">No hay ventas con préstamo</p>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-left">
                          <th className="px-3 py-2 text-xs font-semibold text-slate-500">Fecha/Hora</th>
                          <th className="px-3 py-2 text-xs font-semibold text-slate-500">Folio</th>
                          <th className="px-3 py-2 text-xs font-semibold text-slate-500">Producto</th>
                          <th className="px-3 py-2 text-xs font-semibold text-slate-500 text-right">Cantidad</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ventas.map((v, i) => (
                          <tr key={i} className="hover:bg-slate-50">
                            <td className="px-3 py-2 text-slate-500 text-xs whitespace-nowrap">{formatFechaHora(v.fecha_hora)}</td>
                            <td className="px-3 py-2">
                              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">{v.folio}</span>
                            </td>
                            <td className="px-3 py-2 text-slate-700">{v.presentacion_nombre}</td>
                            <td className="px-3 py-2 text-right font-semibold tabular-nums text-slate-800">{v.cantidad}</td>
                          </tr>
                        ))}
                        <tr className="bg-slate-50 font-semibold">
                          <td colSpan={3} className="px-3 py-2 text-xs text-slate-600 text-right">Total prestados</td>
                          <td className="px-3 py-2 text-right tabular-nums text-blue-700">{totalPrest}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Devoluciones realizadas */}
              <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-2">Devoluciones realizadas</h3>
                {devs.length === 0 ? (
                  <p className="text-sm text-slate-400 py-4 text-center">No hay devoluciones registradas</p>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-left">
                          <th className="px-3 py-2 text-xs font-semibold text-slate-500">Fecha/Hora</th>
                          <th className="px-3 py-2 text-xs font-semibold text-slate-500">Producto</th>
                          <th className="px-3 py-2 text-xs font-semibold text-slate-500">Origen</th>
                          <th className="px-3 py-2 text-xs font-semibold text-slate-500">Estado</th>
                          <th className="px-3 py-2 text-xs font-semibold text-slate-500 text-right">Cantidad</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {devs.map(d => {
                          const anulada = d.estado === 'anulada';
                          return (
                            <tr key={d.id} className={anulada ? 'opacity-50' : 'hover:bg-slate-50'}>
                              <td className="px-3 py-2 text-slate-500 text-xs whitespace-nowrap">
                                {d.fecha}
                                {d.creado_en && <span className="text-slate-400 ml-1">{new Date(d.creado_en).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</span>}
                              </td>
                              <td className="px-3 py-2 text-slate-700">{d.presentacion_nombre}</td>
                              <td className="px-3 py-2">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  d.origen === 'venta'
                                    ? 'bg-purple-100 text-purple-700'
                                    : 'bg-slate-100 text-slate-600'
                                }`}>
                                  {d.origen === 'venta' ? `Venta ${d.venta_folio ?? ''}` : d.venta_folio ? `Manual (${d.venta_folio})` : 'Manual'}
                                </span>
                              </td>
                              <td className="px-3 py-2">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                  anulada ? 'bg-slate-100 text-slate-400' : 'bg-green-100 text-green-700'
                                }`}>
                                  {anulada ? 'Anulada' : 'Activa'}
                                </span>
                              </td>
                              <td className={`px-3 py-2 text-right font-semibold tabular-nums ${anulada ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                                {d.cantidad}
                              </td>
                            </tr>
                          );
                        })}
                        <tr className="bg-slate-50 font-semibold">
                          <td colSpan={4} className="px-3 py-2 text-xs text-slate-600 text-right">Total devueltos (activas)</td>
                          <td className="px-3 py-2 text-right tabular-nums text-green-700">{totalDevAct}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 shrink-0">
          <button onClick={onClose}
            className="w-full px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Tab — Registro de devoluciones
   ══════════════════════════════════════════════════════════════════ */
function TabRegistro({ onSaved }) {
  const [devoluciones, setDevoluciones] = useState([]);
  const [total, setTotal]   = useState(0);
  const [pages, setPages]   = useState(1);
  const [page, setPage]     = useState(1);
  const [fechaIni, setFechaIni] = useState(today());
  const [fechaFin, setFechaFin] = useState(today());
  const [filtroOrigen, setFiltroOrigen] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [loading, setLoading]   = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  const fetchDevoluciones = useCallback(async (fi, ff, p, ori, est) => {
    setLoading(true);
    try {
      const res = await listarDevoluciones({
        fecha_inicio: fi || undefined, fecha_fin: ff || undefined,
        origen: ori || undefined, estado: est || undefined,
        page: p, limit: 20,
      });
      setDevoluciones(Array.isArray(res.data) ? res.data : []);
      setTotal(res.total ?? 0);
      setPages(res.pages ?? 1);
    } catch { setDevoluciones([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchDevoluciones(fechaIni, fechaFin, page, filtroOrigen, filtroEstado); }, [fechaIni, fechaFin, page, filtroOrigen, filtroEstado, fetchDevoluciones]);

  function handleSaved() {
    fetchDevoluciones(fechaIni, fechaFin, 1, filtroOrigen, filtroEstado);
    setPage(1);
    onSaved();
  }

  // --- Client-side stats from current page data ---
  const statsActivas = devoluciones.filter(d => d.estado === 'activa').length;
  const statsTotalBidones = devoluciones.reduce((s, d) => s + Number(d.cantidad), 0);
  const statsVenta = devoluciones.filter(d => d.origen === 'venta').length;
  const statsManual = devoluciones.filter(d => d.origen === 'manual').length;
  const statsReparto = devoluciones.filter(d => d.origen === 'reparto').length;

  return (
    <>
      {/* Resumen estadístico */}
      {!loading && devoluciones.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Devoluciones activas</p>
            <p className="text-xl font-bold text-slate-800 tabular-nums">{statsActivas}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Bidones devueltos</p>
            <p className="text-xl font-bold text-blue-700 tabular-nums">{statsTotalBidones}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Por origen</p>
            <div className="flex items-center gap-2 mt-0.5">
              {statsVenta > 0 && <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">Venta {statsVenta}</span>}
              {statsManual > 0 && <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">Manual {statsManual}</span>}
              {statsReparto > 0 && <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">Reparto {statsReparto}</span>}
            </div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-3">
            <p className="text-xs text-slate-500">Total en página</p>
            <p className="text-xl font-bold text-slate-800 tabular-nums">{devoluciones.length} <span className="text-sm font-normal text-slate-400">/ {total}</span></p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400">Desde</span>
          <input type="date" value={fechaIni} onChange={e => { setFechaIni(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
          <span className="text-xs text-slate-400">Hasta</span>
          <input type="date" value={fechaFin} onChange={e => { setFechaFin(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
        </div>
        <button onClick={() => { setFechaIni(today()); setFechaFin(today()); setPage(1); }}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">Hoy</button>
        <button onClick={() => {
            const d = new Date(); d.setDate(d.getDate() - 6);
            setFechaIni(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
            setFechaFin(today()); setPage(1);
          }}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">7 días</button>
        <button onClick={() => {
            const d = new Date();
            setFechaIni(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`);
            setFechaFin(today()); setPage(1);
          }}
          className="px-3 py-2 text-xs border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">Mes</button>
        <button onClick={() => { setFechaIni(''); setFechaFin(''); setPage(1); }}
          className={`px-3 py-2 text-xs border rounded-lg transition ${!fechaIni && !fechaFin ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-slate-300 hover:bg-slate-50 text-slate-600'}`}>Todas</button>

        <select value={filtroOrigen} onChange={e => { setFiltroOrigen(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-white">
          <option value="">Origen: Todos</option>
          <option value="venta">Venta</option>
          <option value="manual">Manual</option>
          <option value="reparto">Reparto</option>
        </select>

        <select value={filtroEstado} onChange={e => { setFiltroEstado(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-white">
          <option value="">Estado: Todos</option>
          <option value="activa">Activa</option>
          <option value="anulada">Anulada</option>
        </select>

        <div className="ml-auto">
          <button onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Nueva devolución
          </button>
        </div>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                {['Fecha/Hora', 'Cliente', 'Producto', 'Cant.', 'Venta', 'Origen', 'Estado', 'Registrado por', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 9 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 animate-pulse rounded" style={{ width: j === 1 ? '120px' : '60px' }} /></td>
                  ))}</tr>
                ))
              ) : devoluciones.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400">No hay devoluciones registradas</td></tr>
              ) : devoluciones.map(d => {
                const anulada = d.estado === 'anulada';
                return (
                  <tr key={d.id} className={`transition-colors ${anulada ? 'opacity-50' : 'hover:bg-slate-50'}`}>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs">
                      {d.fecha}
                      {d.creado_en && <span className="text-slate-400 ml-1">{new Date(d.creado_en).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}</span>}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800">{d.cliente_nombre}</td>
                    <td className="px-4 py-3 text-slate-600">{d.presentacion_nombre}</td>
                    <td className="px-4 py-3 tabular-nums font-semibold text-slate-800">{d.cantidad}</td>
                    <td className="px-4 py-3">
                      {d.venta_folio
                        ? <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">{d.venta_folio}</span>
                        : <span className="text-slate-300">—</span>
                      }
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        d.origen === 'venta'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {d.origen === 'venta' ? 'Auto (venta)' : 'Manual'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        anulada ? 'bg-slate-100 text-slate-400' : 'bg-green-100 text-green-700'
                      }`}>
                        {anulada ? 'Anulada' : 'Activa'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{d.registrado_por_nombre ?? '—'}</td>
                    <td className="px-4 py-3">
                      {!anulada && d.origen === 'manual' && (
                        <button onClick={async () => {
                          if (!window.confirm('¿Anular esta devolución? Se revertirán los bidones prestados y el stock.')) return;
                          try {
                            await anularDevolucion(d.id);
                            fetchDevoluciones(fechaIni, fechaFin, page, filtroOrigen, filtroEstado);
                          } catch (err) { alert(err.response?.data?.error || 'Error al anular'); }
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

        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-white">
            <p className="text-xs text-slate-500">Página {page} de {pages} &middot; {total} resultado{total !== 1 ? 's' : ''}</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">Anterior</button>
              <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">Siguiente</button>
            </div>
          </div>
        )}
      </div>

      <NuevaDevolucionModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSaved={handleSaved} />
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Tab — Bidones prestados (trazabilidad)
   ══════════════════════════════════════════════════════════════════ */
function TabPrestamos() {
  const [clientes, setClientes]   = useState([]);
  const [total, setTotal]         = useState(0);
  const [pages, setPages]         = useState(1);
  const [page, setPage]           = useState(1);
  const [loading, setLoading]     = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch]       = useState('');
  const [selectedCliente, setSelectedCliente] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setSearch(searchInput); setPage(1); }, 350);
    return () => clearTimeout(timer.current);
  }, [searchInput]);

  const fetchClientes = useCallback(async (q, p) => {
    setLoading(true);
    try {
      const res = await clientesPrestamos({ q: q || undefined, page: p, limit: 20 });
      setClientes(Array.isArray(res.data) ? res.data : []);
      setTotal(res.total ?? 0);
      setPages(res.pages ?? 1);
    } catch { setClientes([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchClientes(search, page); }, [search, page, fetchClientes]);

  const totalBidones = clientes.reduce((s, c) => s + Number(c.bidones_prestados), 0);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
          <input
            className="pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition w-64"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Buscar cliente..."
          />
        </div>
        {!loading && total > 0 && (
          <div className="ml-auto flex items-center gap-4">
            <span className="text-sm text-slate-500">{total} cliente{total !== 1 ? 's' : ''} con bidones</span>
            <span className="px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-lg text-sm font-semibold text-amber-700 tabular-nums">
              {totalBidones} bidones en préstamo
            </span>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Cliente</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Tipo</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Teléfono</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Prestados</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Devueltos</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Pendiente</th>
                <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 animate-pulse rounded" style={{ width: j === 0 ? '140px' : '60px' }} /></td>
                  ))}</tr>
                ))
              ) : clientes.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">No hay clientes con bidones prestados</td></tr>
              ) : clientes.map(c => (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{c.nombre}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_BADGE[c.tipo] || 'bg-slate-100 text-slate-600'}`}>
                      {c.tipo}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-500">{c.telefono || '—'}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-blue-700">{c.total_prestados}</td>
                  <td className="px-4 py-3 text-right tabular-nums font-medium text-green-700">{c.total_devueltos}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`font-bold tabular-nums ${Number(c.bidones_prestados) > 0 ? 'text-amber-700' : 'text-green-600'}`}>
                      {c.bidones_prestados}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => setSelectedCliente(c)}
                      className="px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-lg transition">
                      Ver detalle
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-white">
            <p className="text-xs text-slate-500">Página {page} de {pages}</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">Anterior</button>
              <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">Siguiente</button>
            </div>
          </div>
        )}
      </div>

      <DetallePrestamosModal
        isOpen={!!selectedCliente}
        onClose={() => setSelectedCliente(null)}
        cliente={selectedCliente}
      />
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════
   Página principal — Devoluciones
   ══════════════════════════════════════════════════════════════════ */
export default function Devoluciones() {
  const [tab, setTab] = useState('registro');
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <Layout>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Devoluciones</h1>
        <p className="text-sm text-slate-500 mt-0.5">Registro de devoluciones y trazabilidad de bidones prestados</p>
      </div>

      <div className="flex gap-1 mb-5 bg-slate-100 rounded-xl p-1 w-fit">
        <button
          onClick={() => setTab('registro')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
            tab === 'registro'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}>
          Registro
        </button>
        <button
          onClick={() => setTab('prestamos')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
            tab === 'prestamos'
              ? 'bg-white text-slate-800 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}>
          Bidones prestados
        </button>
      </div>

      {tab === 'registro'
        ? <TabRegistro key={refreshKey} onSaved={() => setRefreshKey(k => k + 1)} />
        : <TabPrestamos key={refreshKey} />
      }
    </Layout>
  );
}
