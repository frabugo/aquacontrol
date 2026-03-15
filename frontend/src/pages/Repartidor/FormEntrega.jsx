import { useEffect, useState } from 'react';
import { obtenerPedido, entregarPedido } from '../../services/pedidosService';
import api from '../../services/api';
import useCajaAbierta from '../../hooks/useCajaAbierta';
import useMetodosPago from '../../hooks/useMetodosPago';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

export default function FormEntrega({ pedido, ruta, onBack, onSaved }) {
  const { cajaAbierta } = useCajaAbierta();
  const { metodos } = useMetodosPago();
  const [detalle, setDetalle]   = useState(null);
  const [lineas, setLineas]     = useState([]);
  const [pagos, setPagos]       = useState({});
  const [notas, setNotas]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [paso, setPaso]         = useState(1);

  useEffect(() => {
    obtenerPedido(pedido.id).then(data => {
      setDetalle(data);
      const mapped = (data.detalle || []).map(d => ({
        presentacion_id: d.presentacion_id,
        presentacion_nombre: d.presentacion_nombre,
        tipo_linea: d.tipo_linea,
        cantidad: d.cantidad,
        vacios_recibidos: d.vacios_esperados || 0,
          garantia: '',
          garantia_metodo: 'efectivo',
        precio_unitario: d.precio_unitario,
        es_retornable: d.es_retornable,
        precio_origen: null,
      }));
      setLineas(mapped);
      // Fetch precio sugerido para cada línea (para mostrar badge)
      mapped.forEach((d, idx) => {
        fetchPrecioLinea(data.cliente_id, d.presentacion_id, d.tipo_linea, idx, d.precio_unitario);
      });
    }).catch(() => {});
  }, [pedido.id]);

  async function fetchPrecioLinea(clienteId, presentacionId, tipoLinea, idx, precioActual) {
    try {
      const params = new URLSearchParams({
        presentacion_id: String(presentacionId),
        tipo_linea: tipoLinea || 'producto',
      });
      if (clienteId) params.append('cliente_id', String(clienteId));
      const res = await api.get(`/pedidos/precio-sugerido?${params}`);
      const { precio, origen } = res.data;
      setLineas(prev => prev.map((l, i) => {
        if (i !== idx) return l;
        // Solo actualizar origen (el precio ya viene del pedido)
        // Si el precio actual coincide con el sugerido, marcar origen
        const mismo = Math.abs(Number(precioActual) - Number(precio)) < 0.01;
        return { ...l, precio_origen: mismo ? origen : null };
      }));
    } catch { /* ignore */ }
  }

  if (!detalle) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const totalCalc = lineas.reduce((s, l) => s + (Number(l.precio_unitario) || 0) * (Number(l.cantidad) || 0), 0);
  const sumPagos = metodos.reduce((s, m) => s + (Number(pagos[m.nombre]) || 0), 0);
  const pendiente = +(totalCalc - sumPagos).toFixed(2);
  const cubierto = Math.abs(pendiente) <= 0.02;

  function updateLinea(i, field, val) {
    setLineas(prev => prev.map((l, idx) => {
      if (idx !== i) return l;
      const nueva = { ...l, [field]: val };
      // Si cambia cantidad y es recarga → sincronizar vacíos
      if (field === 'cantidad' && nueva.tipo_linea === 'recarga') {
        nueva.vacios_recibidos = val;
      }
      // Si edita precio manualmente → limpiar badge
      if (field === 'precio_unitario') {
        nueva.precio_origen = null;
      }
      return nueva;
    }));
  }

  function todoPorMetodo(key) {
    const reset = Object.fromEntries(metodos.map(m => [m.nombre, '0']));
    setPagos({ ...reset, [key]: totalCalc.toFixed(2) });
  }

  async function handleSubmit() {
    setError('');
    if (!cubierto && pendiente > 0.02) return setError(`Faltan S/ ${pendiente.toFixed(2)} por asignar`);
    setLoading(true);
    try {
      const pagosArray = metodos
        .filter(m => Number(pagos[m.nombre]) > 0)
        .map(m => ({ metodo: m.nombre, monto: Number(pagos[m.nombre]) }));

      await entregarPedido(pedido.id, {
        lineas: lineas.map(l => ({
          presentacion_id: l.presentacion_id,
          tipo_linea: l.tipo_linea,
          cantidad: Number(l.cantidad) || 1,
          vacios_recibidos: Number(l.vacios_recibidos) || 0,
          precio_unitario: Number(l.precio_unitario),
            garantia: Number(l.garantia) || 0,
            garantia_metodo: l.garantia_metodo || 'efectivo' || 0,
        })),
        pagos: pagosArray,
        notas_repartidor: notas.trim() || null,
      });
      window.dispatchEvent(new Event('pedido:estado-cambiado'));
      onSaved();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al entregar');
    } finally { setLoading(false); }
  }

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-700 mb-4">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
        Volver a pedidos
      </button>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4">
        <h2 className="text-base font-bold text-slate-800 mb-1">Entrega: {pedido.numero}</h2>
        <p className="text-sm text-slate-500">{detalle.cliente_nombre}</p>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>}

      {/* Paso 1: Productos */}
      {paso === 1 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Confirmar productos</p>
          <div className="space-y-3">
            {lineas.map((l, i) => (
              <div key={i} className="border border-slate-200 rounded-xl p-3 bg-white">
                <p className="text-sm font-medium text-slate-700 mb-2">{l.presentacion_nombre} — {l.tipo_linea}</p>

                {/* Cantidad + Vacíos (si recarga) */}
                <div className={`grid gap-2 mb-2 ${l.tipo_linea === 'recarga' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <div>
                    <label className="block text-xs text-slate-500 mb-0.5">Cantidad</label>
                    <input type="number" inputMode="numeric" min="0"
                      className={`${inputCls} text-center text-lg font-bold`}
                      value={l.cantidad}
                      onChange={e => updateLinea(i, 'cantidad', e.target.value)} />
                  </div>
                  {l.tipo_linea === 'recarga' && (
                    <div>
                      <label className="block text-xs text-indigo-600 font-medium mb-0.5">Vacios recibidos</label>
                      <input type="number" inputMode="numeric" min="0" max={l.cantidad}
                        className={`${inputCls} text-center text-lg font-bold border-indigo-300 bg-indigo-50 text-indigo-700`}
                        value={l.vacios_recibidos}
                        onChange={e => {
                          const v = Math.min(Number(e.target.value) || 0, Number(l.cantidad) || 0);
                          updateLinea(i, 'vacios_recibidos', v);
                        }} />
                      {String(l.vacios_recibidos) !== String(l.cantidad) && (
                        <p className="text-xs text-amber-500 mt-0.5">Difiere de la cantidad</p>
                      )}
                    </div>
                  )}
                </div>

                {/* Precio con badge */}
                <div>
                  <label className="block text-xs text-slate-500 mb-0.5">
                    Precio unitario
                    {l.precio_origen === 'especial' && (
                      <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">Precio especial</span>
                    )}
                    {l.precio_origen === 'base' && (
                      <span className="ml-1.5 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-medium">Precio base</span>
                    )}
                  </label>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-slate-400">S/</span>
                    <input type="number" inputMode="decimal" min="0" step="0.000001"
                      className={`${inputCls} flex-1 text-right text-lg font-bold ${
                        l.precio_origen === 'especial' ? 'border-amber-300 bg-amber-50' : ''
                      }`}
                      value={l.precio_unitario}
                      onChange={e => updateLinea(i, 'precio_unitario', e.target.value)} />
                  </div>
                  <p className="text-right text-xs text-slate-400 mt-1 font-semibold">
                    Subtotal: S/ {((Number(l.precio_unitario) || 0) * (Number(l.cantidad) || 0)).toFixed(2)}
                  </p>
                  {(l.tipo_linea === 'prestamo' || ((l.tipo_linea === 'recarga' || l.tipo_linea === 'bonificacion') && Number(l.cantidad) > Number(l.vacios_recibidos || 0))) && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-amber-600">Garantia</span>
                      <input type="number" min="0" step="0.01"
                        className="w-20 px-2 py-1 text-xs border border-amber-300 rounded-lg text-right bg-amber-50"
                        value={l.garantia} onChange={e => updateLinea(i, 'garantia', e.target.value)} placeholder="0" />
                      <select value={l.garantia_metodo} onChange={e => updateLinea(i, 'garantia_metodo', e.target.value)}
                        className="px-2 py-1 text-xs border border-amber-300 rounded-lg bg-amber-50 text-amber-700">
                        <option value="efectivo">Efectivo</option>
                        <option value="yape">Yape</option>
                      </select>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex justify-between items-center">
            <p className="text-lg font-bold text-slate-800">Total: S/ {totalCalc.toFixed(2)}</p>
            <button onClick={() => setPaso(2)} disabled={totalCalc <= 0 && !lineas.every(l => l.tipo_linea === 'bonificacion')}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition">
              Siguiente: Cobro
            </button>
          </div>
        </div>
      )}

      {/* Paso 2: Cobro */}
      {paso === 2 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Forma de pago</p>

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
            <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg mb-3">No hay caja abierta</div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setPaso(1)}
              className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600">
              Atrás
            </button>
            <button onClick={handleSubmit} disabled={loading || !cubierto || !cajaAbierta}
              title={!cajaAbierta ? 'Abre la caja primero' : undefined}
              className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:bg-green-300 rounded-lg transition">
              {loading ? 'Registrando...' : 'Registrar Entrega'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
