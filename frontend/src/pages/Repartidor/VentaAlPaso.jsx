import { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { miRuta, getStockVehiculo, ventaRapida, getVentasAlPaso, anularVentaAlPaso } from '../../services/rutasService';
import { listarClientes } from '../../services/clientesService';
import useMetodosPago from '../../hooks/useMetodosPago';
import useCajaAbierta from '../../hooks/useCajaAbierta';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

export default function VentaAlPaso() {
  const { metodos } = useMetodosPago();
  const { cajaAbierta } = useCajaAbierta();

  const [ruta, setRuta]           = useState(null);
  const [stock, setStock]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState('');
  const [exito, setExito]         = useState(false);

  // Form
  const [lineas, setLineas]       = useState([]);
  const [pagos, setPagos]         = useState({});
  const [notas, setNotas]         = useState('');
  const [paso, setPaso]           = useState(1);
  const [saving, setSaving]       = useState(false);
  const [historial, setHistorial] = useState([]);
  const [anulando, setAnulando]   = useState(null);

  // Cliente (optional)
  const [clienteId, setClienteId]       = useState(null);
  const [clienteNombre, setClienteNombre] = useState('');
  const [clienteSearch, setClienteSearch] = useState('');
  const [clienteResults, setClienteResults] = useState([]);
  const [showClienteSearch, setShowClienteSearch] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const rutaRes = await miRuta().catch(() => ({ data: null }));
      const r = rutaRes.data || rutaRes || null;
      setRuta(r);
      if (r && (r.estado === 'en_ruta' || r.estado === 'regresando')) {
        const stockRes = await getStockVehiculo(r.id);
        const items = (stockRes.data || stockRes || []).filter(s => {
          const disp = (s.llenos_cargados || 0) - (s.llenos_entregados || 0) - (s.llenos_sobrantes || 0);
          return disp > 0;
        });
        setStock(items);
        const ventas = await getVentasAlPaso(r.id).catch(() => []);
        setHistorial(ventas);
      }
    } catch { setRuta(null); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Buscar clientes con debounce
  useEffect(() => {
    if (!clienteSearch.trim()) { setClienteResults([]); return; }
    const t = setTimeout(() => {
      listarClientes({ q: clienteSearch, limit: 8 })
        .then(r => setClienteResults(r.data || []))
        .catch(() => setClienteResults([]));
    }, 300);
    return () => clearTimeout(t);
  }, [clienteSearch]);

  const rutaActiva = ruta && (ruta.estado === 'en_ruta' || ruta.estado === 'regresando');

  function getDisponibles(s) {
    return Math.max(0, (s.llenos_cargados || 0) - (s.llenos_entregados || 0) - (s.llenos_sobrantes || 0));
  }

  function agregarLinea(item) {
    if (lineas.find(l => l.presentacion_id === item.presentacion_id)) return;
    setLineas(prev => [...prev, {
      presentacion_id: item.presentacion_id,
      nombre: item.presentacion_nombre,
      es_retornable: item.es_retornable,
      tipo_linea: item.es_retornable ? 'recarga' : 'producto',
      cantidad: 1,
      vacios_recibidos: 0,
      precio_unitario: Number(item.precio_base) || '',
      max_disponible: getDisponibles(item),
    }]);
  }

  function quitarLinea(idx) {
    setLineas(prev => prev.filter((_, i) => i !== idx));
  }

  function updateLinea(idx, field, val) {
    setLineas(prev => prev.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [field]: val };
      if (field === 'tipo_linea' && val === 'recarga') {
        updated.vacios_recibidos = updated.cantidad;
      }
      return updated;
    }));
  }

  const totalCalc = lineas.reduce((s, l) => s + (Number(l.precio_unitario) || 0) * (Number(l.cantidad) || 0), 0);
  const sumPagos  = metodos.reduce((s, m) => s + (Number(pagos[m.nombre]) || 0), 0);
  const pendiente = +(totalCalc - sumPagos).toFixed(2);
  const cubierto  = Math.abs(pendiente) <= 0.02;

  function todoPorMetodo(key) {
    const reset = Object.fromEntries(metodos.map(m => [m.nombre, '0']));
    setPagos({ ...reset, [key]: totalCalc.toFixed(2) });
  }

  async function handleSubmit() {
    setError('');
    if (!cubierto && pendiente > 0.02) return setError(`Faltan S/ ${pendiente.toFixed(2)} por asignar`);
    setSaving(true);
    try {
      const pagosArray = metodos
        .filter(m => Number(pagos[m.nombre]) > 0)
        .map(m => ({ metodo: m.nombre, monto: Number(pagos[m.nombre]) }));

      await ventaRapida(ruta.id, {
        lineas: lineas.map(l => ({
          presentacion_id: l.presentacion_id,
          tipo_linea: l.tipo_linea,
          cantidad: Number(l.cantidad) || 1,
          vacios_recibidos: Number(l.vacios_recibidos) || 0,
          precio_unitario: Number(l.precio_unitario) || 0,
        })),
        pagos: pagosArray,
        cliente_id: clienteId || null,
        notas: notas.trim() || null,
      });
      setExito(true);
      setLineas([]);
      setPagos({});
      setNotas('');
      setClienteId(null);
      setClienteNombre('');
      setPaso(1);
      fetchData();
      setTimeout(() => setExito(false), 4000);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrar venta');
    } finally { setSaving(false); }
  }

  async function handleAnular(ventaId) {
    if (!window.confirm('¿Anular esta venta al paso? Se revertirá el dinero y el stock.')) return;
    setAnulando(ventaId);
    setError('');
    try {
      await anularVentaAlPaso(ruta.id, ventaId);
      // Recargar solo historial
      const ventas = await getVentasAlPaso(ruta.id).catch(() => []);
      setHistorial(ventas);
      // Recargar stock
      const stockRes = await getStockVehiculo(ruta.id);
      const items = (stockRes.data || stockRes || []).filter(s => {
        const disp = (s.llenos_cargados || 0) - (s.llenos_entregados || 0) - (s.llenos_sobrantes || 0);
        return disp > 0;
      });
      setStock(items);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Error al anular venta');
    } finally { setAnulando(null); }
  }

  // Productos disponibles que NO están en lineas
  const stockDisponible = stock.filter(s => !lineas.find(l => l.presentacion_id === s.presentacion_id));

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
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-700 mb-1">Sin ruta activa</h2>
          <p className="text-sm text-slate-400">Inicia tu ruta desde "Mi Vehiculo" para vender al paso</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        <div className="mb-5">
          <h1 className="text-lg font-bold text-slate-800">Venta al paso</h1>
          <p className="text-sm text-slate-400">Venta directa sin pedido previo</p>
        </div>

        {exito && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm mb-4 font-semibold flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Venta registrada correctamente
          </div>
        )}

        {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>}

        {/* Paso 1: Productos */}
        {paso === 1 && (
          <div className="space-y-4">
            {/* Cliente (opcional) */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Cliente (opcional)</p>
              {clienteId ? (
                <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-blue-800">{clienteNombre}</p>
                  </div>
                  <button onClick={() => { setClienteId(null); setClienteNombre(''); }}
                    className="text-blue-400 hover:text-blue-600 transition text-lg">✕</button>
                </div>
              ) : showClienteSearch ? (
                <div>
                  <div className="flex gap-2 mb-2">
                    <input className={inputCls} value={clienteSearch} autoFocus
                      onChange={e => setClienteSearch(e.target.value)}
                      placeholder="Buscar por nombre o DNI..." />
                    <button onClick={() => { setShowClienteSearch(false); setClienteSearch(''); setClienteResults([]); }}
                      className="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-500">
                      Cancelar
                    </button>
                  </div>
                  {clienteResults.length > 0 && (
                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-48 overflow-y-auto">
                      {clienteResults.map(c => (
                        <button key={c.id} onClick={() => {
                          setClienteId(c.id);
                          setClienteNombre(c.nombre);
                          setShowClienteSearch(false);
                          setClienteSearch('');
                          setClienteResults([]);
                        }}
                          className="w-full px-4 py-2.5 text-left hover:bg-slate-50 border-b border-slate-100 last:border-0 transition">
                          <p className="text-sm font-medium text-slate-800">{c.nombre}</p>
                          <p className="text-xs text-slate-400">{c.dni_ruc || 'Sin DNI'} {c.telefono ? `· ${c.telefono}` : ''}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <button onClick={() => setShowClienteSearch(true)}
                  className="w-full px-4 py-3 text-sm text-slate-500 border-2 border-dashed border-slate-200 rounded-xl hover:border-blue-300 hover:text-blue-600 transition">
                  + Buscar cliente
                </button>
              )}
            </div>

            {/* Lineas agregadas */}
            {lineas.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Productos a vender</p>
                <div className="space-y-3">
                  {lineas.map((l, i) => (
                    <div key={l.presentacion_id} className="border border-slate-200 rounded-xl p-3">
                      <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-medium text-slate-700">{l.nombre}</p>
                        <button onClick={() => quitarLinea(i)} className="text-slate-300 hover:text-red-500 text-lg transition">✕</button>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mb-2">
                        <div>
                          <label className="block text-xs text-slate-500 mb-0.5">Tipo</label>
                          {l.es_retornable ? (
                            <select className={inputCls} value={l.tipo_linea} onChange={e => updateLinea(i, 'tipo_linea', e.target.value)}>
                              <option value="recarga">Recarga</option>
                              <option value="compra_bidon">Compra bidón</option>
                              <option value="prestamo">Préstamo</option>
                            </select>
                          ) : (
                            <div className={`${inputCls} bg-slate-50 text-slate-600`}>Producto</div>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs text-slate-500 mb-0.5">
                            Cantidad <span className="text-slate-300">(max {l.max_disponible})</span>
                          </label>
                          <input type="number" inputMode="numeric" min="1" max={l.max_disponible}
                            className={`${inputCls} text-center font-bold`} value={l.cantidad}
                            onChange={e => updateLinea(i, 'cantidad', Math.min(l.max_disponible, Math.max(1, Number(e.target.value) || 1)))} />
                        </div>
                      </div>

                      <div className={`grid gap-2 ${l.tipo_linea === 'recarga' && l.es_retornable ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        <div>
                          <label className="block text-xs text-slate-500 mb-0.5">Precio unitario</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">S/</span>
                            <input type="number" inputMode="decimal" min="0" step="0.000001"
                              className={`${inputCls} pl-8 text-right font-bold`} value={l.precio_unitario}
                              onChange={e => updateLinea(i, 'precio_unitario', e.target.value)}
                              placeholder="0.00" />
                          </div>
                        </div>
                        {l.tipo_linea === 'recarga' && l.es_retornable && (
                          <div>
                            <label className="block text-xs text-indigo-600 font-medium mb-0.5">Vacíos recibidos</label>
                            <input type="number" inputMode="numeric" min="0" max={l.cantidad}
                              className={`${inputCls} text-center font-bold border-indigo-300 bg-indigo-50 text-indigo-700`}
                              value={l.vacios_recibidos}
                              onChange={e => {
                                const v = Math.min(Number(e.target.value) || 0, Number(l.cantidad) || 0);
                                updateLinea(i, 'vacios_recibidos', v);
                              }} />
                          </div>
                        )}
                      </div>

                      <p className="text-right text-xs text-slate-400 mt-1.5 font-semibold">
                        Subtotal: S/ {((Number(l.precio_unitario) || 0) * (Number(l.cantidad) || 0)).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-lg font-bold text-slate-800">Total: S/ {totalCalc.toFixed(2)}</p>
                  <button onClick={() => setPaso(2)} disabled={totalCalc <= 0 || lineas.some(l => !Number(l.precio_unitario))}
                    className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition">
                    Siguiente: Cobro
                  </button>
                </div>
              </div>
            )}

            {/* Stock disponible para agregar */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Stock en tu vehículo
              </p>
              {stockDisponible.length === 0 && lineas.length === 0 && (
                <p className="text-sm text-slate-400 text-center py-4">No tienes stock disponible</p>
              )}
              {stockDisponible.length === 0 && lineas.length > 0 && (
                <p className="text-sm text-slate-400 text-center py-2">Todos los productos fueron agregados</p>
              )}
              <div className="space-y-1.5">
                {stockDisponible.map(s => {
                  const disp = getDisponibles(s);
                  return (
                    <button key={s.presentacion_id} onClick={() => agregarLinea(s)}
                      className="w-full flex items-center justify-between px-4 py-3 border border-slate-200 rounded-xl hover:bg-blue-50 hover:border-blue-300 transition text-left">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{s.presentacion_nombre}</p>
                        <p className="text-xs text-slate-400">
                          {s.es_retornable ? '♻️ Retornable' : '📦 No retorna'}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-lg">
                          {disp} disp.
                        </span>
                        <span className="text-blue-400 text-lg">+</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Historial de ventas al paso */}
        {paso === 1 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mt-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Ventas al paso de hoy {historial.length > 0 && `(${historial.length})`}
            </p>
            {historial.length === 0 ? (
              <p className="text-sm text-slate-400 text-center py-4">Aún no hay ventas al paso en esta ruta</p>
            ) : (
              <div className="space-y-2">
                {historial.map(v => {
                  const d = new Date(v.fecha_hora);
                  const fecha = d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' });
                  const hora  = d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', hour12: true });
                  return (
                    <div key={v.id} className={`border rounded-xl px-4 py-3 transition ${
                      v.estado === 'cancelada' ? 'border-red-200 bg-red-50/50 opacity-70' : 'border-slate-100 hover:bg-slate-50'
                    }`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-sm font-semibold ${v.estado === 'cancelada' ? 'text-red-400 line-through' : 'text-slate-700'}`}>
                          Venta #{v.id}
                        </span>
                        <span className={`text-sm font-bold ${v.estado === 'cancelada' ? 'text-red-400 line-through' : 'text-green-700'}`}>
                          S/ {Number(v.total).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">{fecha} — {hora}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          v.estado === 'cancelada' ? 'bg-red-100 text-red-600'
                          : v.estado === 'pagada' ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                        }`}>{v.estado === 'cancelada' ? 'Anulada' : v.estado === 'pagada' ? 'Pagada' : 'Pendiente'}</span>
                      </div>
                      {v.cliente_nombre && (
                        <p className="text-xs text-blue-600 mt-1">{v.cliente_nombre}</p>
                      )}
                      {v.detalle && (
                        <p className="text-xs text-slate-400 mt-0.5">{v.detalle}</p>
                      )}
                      {v.estado !== 'anulada' && (
                        <button onClick={() => handleAnular(v.id)} disabled={anulando === v.id}
                          className="mt-2 text-xs text-red-500 hover:text-red-700 font-medium transition disabled:opacity-50">
                          {anulando === v.id ? 'Anulando...' : 'Anular venta'}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Paso 2: Cobro */}
        {paso === 2 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Forma de pago</p>

            {/* Resumen rápido */}
            <div className="bg-slate-50 rounded-xl p-3 mb-4">
              <p className="text-xs text-slate-500 mb-1">Resumen</p>
              {lineas.map(l => (
                <div key={l.presentacion_id} className="flex justify-between text-sm">
                  <span className="text-slate-600">{l.nombre} x{l.cantidad}</span>
                  <span className="font-medium text-slate-800">S/ {((Number(l.precio_unitario) || 0) * (Number(l.cantidad) || 0)).toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm font-bold text-slate-800 mt-1.5 pt-1.5 border-t border-slate-200">
                <span>Total</span>
                <span>S/ {totalCalc.toFixed(2)}</span>
              </div>
              {clienteNombre && <p className="text-xs text-blue-600 mt-1">Cliente: {clienteNombre}</p>}
            </div>

            <div className="flex gap-1 mb-3 flex-wrap">
              {metodos.map(m => (
                <button key={m.nombre} type="button" onClick={() => todoPorMetodo(m.nombre)}
                  className="text-xs px-2 py-1 rounded-lg border border-slate-200 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition text-slate-500">
                  Todo {m.etiqueta.split(' ')[0]}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              {metodos.map(m => (
                <div key={m.nombre}>
                  <label className="block text-xs font-medium text-slate-600 mb-1">{m.etiqueta}</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">S/</span>
                    <input type="number" min="0" step="0.000001" className={`${inputCls} pl-8`}
                      value={pagos[m.nombre] || ''} onChange={e => setPagos(prev => ({ ...prev, [m.nombre]: e.target.value }))}
                      placeholder="0.00" />
                  </div>
                </div>
              ))}
            </div>

            <div className={`px-4 py-2.5 rounded-xl flex items-center justify-between text-sm mb-3
              ${cubierto ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
              <span className={cubierto ? 'text-green-700' : 'text-amber-700'}>
                {cubierto ? 'Cobro completo' : 'Pendiente por asignar'}
              </span>
              <span className={`font-bold ${cubierto ? 'text-green-700' : 'text-amber-600'}`}>
                S/ {cubierto ? totalCalc.toFixed(2) : pendiente.toFixed(2)}
              </span>
            </div>

            <div className="mb-3">
              <label className="block text-xs font-medium text-slate-600 mb-1">Notas (opcional)</label>
              <input className={inputCls} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones..." />
            </div>

            {!cajaAbierta && (
              <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg mb-3">
                No hay caja de planta abierta
              </div>
            )}

            <div className="flex gap-3">
              <button onClick={() => setPaso(1)}
                className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600">
                Atrás
              </button>
              <button onClick={handleSubmit} disabled={saving || !cubierto || !cajaAbierta}
                className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-green-300 rounded-lg transition">
                {saving ? 'Registrando...' : 'Registrar Venta'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
