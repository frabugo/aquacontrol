import { useCallback, useEffect, useRef, useState } from 'react';
import Layout from '../../components/Layout';
import {
  listarPedidos, crearPedido, asignarRuta, listarRepartidores,
} from '../../services/pedidosService';
import useCajaAbierta from '../../hooks/useCajaAbierta';
import { listarRutas } from '../../services/rutasService';
import { listarClientes } from '../../services/clientesService';
import { listarPresentaciones } from '../../services/presentacionesService';
import MapaMini from '../../components/Mapa/MapaMini';
import BuscadorConCrear from '../../components/BuscadorConCrear';
import ClienteModal from '../Clientes/ClienteModal';
import api from '../../services/api';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const ESTADO_BADGE = {
  pendiente:     'bg-yellow-100 text-yellow-700',
  en_camino:     'bg-blue-100 text-blue-700',
  entregado:     'bg-green-100 text-green-700',
  no_entregado:  'bg-red-100 text-red-700',
  reasignado:    'bg-slate-100 text-slate-500',
};
const ESTADO_LABEL = {
  pendiente: 'Pendiente', en_camino: 'En camino', entregado: 'Entregado',
  no_entregado: 'No entregado', reasignado: 'Reasignado',
};
const TIPOS_LINEA = [
  { value: 'compra_bidon', label: 'Compra bidón' },
  { value: 'recarga', label: 'Recarga' },
  { value: 'prestamo', label: 'Préstamo' },
  { value: 'producto', label: 'Producto' },
];

/* ═══ Modal Nuevo Pedido ═══ */
function NuevoPedidoModal({ isOpen, onClose, onSaved }) {
  const [rutas, setRutas]               = useState([]);
  const [rutaId, setRutaId]             = useState('');
  const [cliente, setCliente]           = useState(null);
  const [fecha, setFecha]               = useState(today());
  const [orden, setOrden]               = useState('1');
  const [notas, setNotas]               = useState('');
  const [presentaciones, setPresentaciones] = useState([]);
  const [lineas, setLineas]             = useState([]);
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState('');
  const clienteIdRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setRutaId(''); setCliente(null); setFecha(today()); setOrden('1'); setNotas('');
      setLineas([]); setError('');
      clienteIdRef.current = null;
      listarRutas({ fecha: today() }).then(r => setRutas(r.data || [])).catch(() => {});
      listarPresentaciones({ activo: 1, limit: 100 })
        .then(r => setPresentaciones(Array.isArray(r.data) ? r.data : []))
        .catch(() => {});
    }
  }, [isOpen]);

  function selectCliente(c) {
    setCliente(c);
    clienteIdRef.current = c?.id || null;
    if (c) {
      lineas.forEach((l, idx) => {
        if (l.presentacion_id) {
          fetchPrecioSugerido(l.presentacion_id, l.tipo_linea, idx, c.id);
        }
      });
    }
  }

  const lineaVacia = () => ({
    presentacion_id: '', tipo_linea: 'producto', cantidad: 1,
    vacios_esperados: 0, precio_unitario: 0,
    precio_origen: null, precio_mensaje: null,
  });

  function addLinea() { setLineas(prev => [...prev, lineaVacia()]); }
  function removeLinea(i) { setLineas(prev => prev.filter((_, idx) => idx !== i)); }

  async function fetchPrecioSugerido(presentacion_id, tipo_linea, lineaIdx, cId) {
    if (!presentacion_id) return;
    try {
      const params = new URLSearchParams({
        presentacion_id: String(presentacion_id),
        tipo_linea: tipo_linea || 'producto',
      });
      const clienteId = cId ?? clienteIdRef.current;
      if (clienteId) params.append('cliente_id', String(clienteId));

      const res = await api.get(`/pedidos/precio-sugerido?${params}`);
      const { precio, origen, mensaje } = res.data;
      setLineas(prev => prev.map((l, i) => i !== lineaIdx ? l : {
        ...l,
        precio_unitario: Number(precio),
        precio_origen: origen,
        precio_mensaje: mensaje,
      }));
    } catch (e) {
      console.warn('No se pudo obtener precio:', e);
    }
  }

  function updateLinea(idx, campo, valor) {
    setLineas(prev => prev.map((linea, i) => {
      if (i !== idx) return linea;
      const nueva = { ...linea, [campo]: valor };

      // Si cambia presentación → buscar precio
      if (campo === 'presentacion_id' && valor) {
        fetchPrecioSugerido(valor, nueva.tipo_linea, idx);
      }

      // Si cambia tipo_linea → actualizar precio + lógica vacíos
      if (campo === 'tipo_linea') {
        if (nueva.presentacion_id) {
          fetchPrecioSugerido(nueva.presentacion_id, valor, idx);
        }
        if (valor === 'recarga') {
          nueva.vacios_esperados = nueva.cantidad;
        } else {
          nueva.vacios_esperados = 0;
        }
      }

      // Si cambia cantidad y es recarga → sincronizar vacíos
      if (campo === 'cantidad' && nueva.tipo_linea === 'recarga') {
        nueva.vacios_esperados = valor;
      }

      return nueva;
    }));
  }

  if (!isOpen) return null;

  const totalPedido = lineas.reduce((s, l) => s + (Number(l.precio_unitario) || 0) * (Number(l.cantidad) || 0), 0);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!cliente) return setError('Selecciona un cliente');
    if (lineas.length === 0) return setError('Agrega al menos un producto');
    if (lineas.some(l => !l.presentacion_id)) return setError('Completa todos los productos');
    setError(''); setLoading(true);
    try {
      await crearPedido({
        ruta_id: rutaId ? Number(rutaId) : null,
        cliente_id: cliente.id,
        fecha,
        notas_encargada: notas.trim() || null,
        latitud: cliente.latitud || null,
        longitud: cliente.longitud || null,
        orden_entrega: Number(orden) || 1,
        detalle: lineas.map(l => ({
          presentacion_id: Number(l.presentacion_id),
          tipo_linea: l.tipo_linea,
          cantidad: Number(l.cantidad) || 1,
          vacios_esperados: Number(l.vacios_esperados) || 0,
          precio_unitario: Number(l.precio_unitario) || 0,
        })),
      });
      onSaved(); onClose();
    } catch (err) { setError(err.response?.data?.error || 'Error al crear pedido'); }
    finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-base font-semibold text-slate-800">Nuevo pedido</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Ruta (opcional)</label>
              <select className={inputCls} value={rutaId} onChange={e => setRutaId(e.target.value)}>
                <option value="">Sin asignar</option>
                {rutas.map(r => <option key={r.id} value={r.id}>{r.numero} - {r.repartidor_nombre}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Fecha</label>
              <input type="date" className={inputCls} value={fecha} onChange={e => setFecha(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Orden</label>
              <input type="number" min="1" className={inputCls} value={orden} onChange={e => setOrden(e.target.value)} />
            </div>
          </div>

          {/* Cliente */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Cliente <span className="text-red-400">*</span></label>
            <BuscadorConCrear
              placeholder="Buscar cliente…"
              value={cliente}
              onChange={selectCliente}
              onSearch={q => listarClientes({ q, limit: 8 }).then(r => r.data)}
              onNewClick={() => setShowClienteModal(true)}
              renderOption={c => (
                <>
                  <div style={{ minWidth: 0 }}>
                    <span style={{ fontWeight: 500, color: '#1e293b', fontSize: '14px' }}>{c.nombre}</span>
                    {c.direccion && <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.direccion}</p>}
                  </div>
                </>
              )}
            />
          </div>

          {cliente && (cliente.latitud || cliente.longitud) && (
            <MapaMini lat={cliente.latitud} lng={cliente.longitud} height={150} />
          )}

          {/* Detalle */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-600">Productos <span className="text-red-400">*</span></label>
              <button type="button" onClick={addLinea}
                className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                Agregar
              </button>
            </div>
            {lineas.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-3 bg-slate-50 rounded-lg border border-slate-200">Sin productos</p>
            ) : (
              <div className="space-y-3">
                {lineas.map((l, i) => (
                  <div key={i} className="border border-slate-200 rounded-xl p-3 space-y-3 bg-white">
                    {/* Fila 1: Producto + Tipo */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-slate-500 mb-0.5">Producto</label>
                        <select className={`${inputCls}`} value={l.presentacion_id}
                          onChange={e => updateLinea(i, 'presentacion_id', e.target.value)}>
                          <option value="">Seleccionar...</option>
                          {presentaciones.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-0.5">Tipo</label>
                        <select className={inputCls} value={l.tipo_linea}
                          onChange={e => updateLinea(i, 'tipo_linea', e.target.value)}>
                          {TIPOS_LINEA.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Fila 2: Cantidad + Vacíos (si recarga) */}
                    <div className={`grid gap-2 ${l.tipo_linea === 'recarga' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                      <div>
                        <label className="block text-xs text-slate-500 mb-0.5">Cantidad</label>
                        <input type="number" inputMode="numeric" min="1" className={`${inputCls} text-center text-lg font-bold`}
                          value={l.cantidad} onChange={e => updateLinea(i, 'cantidad', parseInt(e.target.value) || 1)} />
                      </div>
                      {l.tipo_linea === 'recarga' && (
                        <div>
                          <label className="block text-xs text-indigo-600 font-medium mb-0.5">Vacios a devolver</label>
                          <input type="number" inputMode="numeric" min="0"
                            className={`${inputCls} text-center text-lg font-bold border-indigo-300 bg-indigo-50 text-indigo-700`}
                            value={l.vacios_esperados} onChange={e => updateLinea(i, 'vacios_esperados', parseInt(e.target.value) || 0)} />
                          {l.vacios_esperados !== l.cantidad && (
                            <p className="text-xs text-amber-500 mt-0.5">Difiere de la cantidad</p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Fila 3: Precio con badge origen */}
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
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-400">S/</span>
                        <input type="number" inputMode="decimal" min="0" step="0.000001"
                          className={`${inputCls} flex-1 text-right text-lg font-bold ${
                            l.precio_origen === 'especial' ? 'border-amber-300 bg-amber-50' : ''
                          }`}
                          value={l.precio_unitario}
                          onChange={e => updateLinea(i, 'precio_unitario', parseFloat(e.target.value) || 0)} />
                      </div>
                      <p className="text-right text-xs text-slate-400 mt-1 font-semibold">
                        Subtotal: S/ {((l.precio_unitario || 0) * (l.cantidad || 0)).toFixed(2)}
                      </p>
                    </div>

                    {/* Quitar línea */}
                    {lineas.length > 1 && (
                      <button type="button" onClick={() => removeLinea(i)}
                        className="w-full text-xs text-red-400 hover:text-red-600 py-1 transition">
                        Quitar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {lineas.length > 0 && (
              <div className="mt-3 text-right text-base font-bold text-slate-800">
                Total: S/ {totalPedido.toFixed(2)}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notas para repartidor</label>
            <input className={inputCls} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Instrucciones..." />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 text-slate-600">Cancelar</button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition">
              {loading ? 'Creando...' : 'Crear pedido'}
            </button>
          </div>
        </form>
      </div>

      <ClienteModal
        isOpen={showClienteModal}
        onClose={() => setShowClienteModal(false)}
        onSaved={(saved) => { selectCliente(saved); setShowClienteModal(false); }}
      />
    </div>
  );
}

/* ═══ Página principal ═══ */
export default function GestionPedidos() {
  const [pedidos, setPedidos]   = useState([]);
  const [total, setTotal]       = useState(0);
  const [pages, setPages]       = useState(1);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const [fechaIni, setFechaIni] = useState(today());
  const [fechaFin, setFechaFin] = useState(today());
  const [filtroEstado, setFiltroEstado] = useState('');
  const [rutas, setRutas]       = useState([]);
  const [filtroRuta, setFiltroRuta] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [showClienteModal, setShowClienteModal] = useState(false);
  const [asignando, setAsignando] = useState(null);
  const { cajaAbierta } = useCajaAbierta();

  useEffect(() => {
    listarRutas({ fecha: today() }).then(r => setRutas(r.data || [])).catch(() => {});
  }, []);

  const fetchPedidos = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listarPedidos({
        fecha_inicio: fechaIni || undefined,
        fecha_fin: fechaFin || undefined,
        ruta_id: filtroRuta || undefined,
        estado: filtroEstado || undefined,
        page, limit: 30,
      });
      setPedidos(Array.isArray(res.data) ? res.data : []);
      setTotal(res.total ?? 0);
      setPages(res.pages ?? 1);
    } catch { setPedidos([]); }
    setLoading(false);
  }, [fechaIni, fechaFin, filtroRuta, filtroEstado, page]);

  useEffect(() => { fetchPedidos(); }, [fetchPedidos]);

  function setRango(ini, fin) { setFechaIni(ini); setFechaFin(fin); setPage(1); }
  const hoy = today();
  const hace7 = (() => { const d = new Date(); d.setDate(d.getDate() - 6); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  const inicioMes = hoy.slice(0, 8) + '01';

  async function handleAsignar(pedidoId, rutaId) {
    try {
      await asignarRuta(pedidoId, { ruta_id: rutaId ? Number(rutaId) : null });
      setAsignando(null);
      fetchPedidos();
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  return (
    <Layout>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Gestión de Pedidos</h1>
        <p className="text-sm text-slate-500 mt-0.5">Crear pedidos y asignarlos a rutas</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
        <button onClick={() => setRango(hoy, hoy)}
          className={`px-3 py-2 text-xs border rounded-lg transition ${fechaIni === hoy && fechaFin === hoy ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-slate-300 hover:bg-slate-50 text-slate-600'}`}>Hoy</button>
        <button onClick={() => setRango(hace7, hoy)}
          className={`px-3 py-2 text-xs border rounded-lg transition ${fechaIni === hace7 && fechaFin === hoy ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-slate-300 hover:bg-slate-50 text-slate-600'}`}>7 dias</button>
        <button onClick={() => setRango(inicioMes, hoy)}
          className={`px-3 py-2 text-xs border rounded-lg transition ${fechaIni === inicioMes && fechaFin === hoy ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-slate-300 hover:bg-slate-50 text-slate-600'}`}>Mes</button>
        <button onClick={() => setRango('', '')}
          className={`px-3 py-2 text-xs border rounded-lg transition ${!fechaIni && !fechaFin ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-slate-300 hover:bg-slate-50 text-slate-600'}`}>Todas</button>
        <input type="date" value={fechaIni} onChange={e => { setFechaIni(e.target.value); setPage(1); }}
          className="px-2 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition w-[130px]" />
        <span className="text-xs text-slate-400">a</span>
        <input type="date" value={fechaFin} onChange={e => { setFechaFin(e.target.value); setPage(1); }}
          className="px-2 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition w-[130px]" />
        <select value={filtroRuta} onChange={e => { setFiltroRuta(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition">
          <option value="">Todas las rutas</option>
          {rutas.map(r => <option key={r.id} value={r.id}>{r.numero} - {r.repartidor_nombre}</option>)}
        </select>
        <select value={filtroEstado} onChange={e => { setFiltroEstado(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition">
          <option value="">Todos los estados</option>
          {Object.entries(ESTADO_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <div className="ml-auto flex items-center gap-3">
          {!cajaAbierta && (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">Abre la caja para crear pedidos</span>
          )}
          <button onClick={() => setModalOpen(true)} disabled={!cajaAbierta}
            title={!cajaAbierta ? 'Abre la caja primero' : undefined}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
            Nuevo pedido
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                {['#', 'Folio', 'Cliente', 'Ruta', 'Productos', 'Estado', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 animate-pulse rounded" style={{ width: 80 }} /></td>
                  ))}</tr>
                ))
              ) : pedidos.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">No hay pedidos</td></tr>
              ) : pedidos.map(p => (
                <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-400 tabular-nums">{p.orden_entrega}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded text-xs font-medium">{p.numero}</span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-800">{p.cliente_nombre}</td>
                  <td className="px-4 py-3 text-xs">
                    {asignando === p.id ? (
                      <select className="px-2 py-1 text-xs border border-blue-300 rounded" autoFocus
                        defaultValue={p.ruta_id || ''} onChange={e => handleAsignar(p.id, e.target.value)}
                        onBlur={() => setAsignando(null)}>
                        <option value="">Sin ruta</option>
                        {rutas.map(r => <option key={r.id} value={r.id}>{r.numero}</option>)}
                      </select>
                    ) : (
                      <button onClick={() => p.estado === 'pendiente' && setAsignando(p.id)}
                        className={`text-xs ${p.ruta_numero ? 'text-blue-600 font-medium' : 'text-slate-400'} ${p.estado === 'pendiente' ? 'hover:underline cursor-pointer' : ''}`}>
                        {p.ruta_numero || 'Sin ruta'}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500 max-w-[200px] truncate">{p.productos_resumen || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_BADGE[p.estado] || ''}`}>
                      {ESTADO_LABEL[p.estado] || p.estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-400">{p.repartidor_nombre || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">Página {page} de {pages} &middot; {total} pedido{total !== 1 ? 's' : ''}</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">Anterior</button>
              <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">Siguiente</button>
            </div>
          </div>
        )}
      </div>

      <NuevoPedidoModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSaved={fetchPedidos} />
    </Layout>
  );
}
