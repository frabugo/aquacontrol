import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { useAuth } from '../../context/AuthContext';
import { useRepartidor } from '../../context/RepartidorContext';
import { miRuta } from '../../services/rutasService';
import { misPedidos } from '../../services/pedidosService';

function formatS(n) {
  return 'S/. ' + Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const ESTADO_RUTA = {
  preparando: { label: 'Preparando', cls: 'bg-yellow-100 text-yellow-700', icon: '⏳' },
  en_ruta:    { label: 'En ruta',    cls: 'bg-blue-100 text-blue-700',     icon: '🚛' },
  regresando: { label: 'Regresando', cls: 'bg-purple-100 text-purple-700', icon: '↩️' },
};

const ESTADO_PEDIDO = {
  pendiente:     { label: 'Pendiente',     cls: 'bg-yellow-100 text-yellow-700' },
  en_camino:     { label: 'En camino',     cls: 'bg-blue-100 text-blue-700' },
  entregado:     { label: 'Entregado',     cls: 'bg-green-100 text-green-700' },
  no_entregado:  { label: 'No entregado',  cls: 'bg-red-100 text-red-700' },
};

export default function RepartidorDashboard() {
  const { user } = useAuth();
  const { rutaActiva, gpsActivo, ubicacion } = useRepartidor();
  const navigate = useNavigate();

  const [ruta, setRuta]         = useState(null);
  const [pedidos, setPedidos]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [hora, setHora]         = useState(new Date());

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [rutaRes, pedRes] = await Promise.all([
        miRuta().catch(() => ({ data: null })),
        misPedidos({}).catch(() => ({ data: [] })),
      ]);
      setRuta(rutaRes.data || null);
      setPedidos(pedRes.data || []);
    } catch { /* handled */ }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Reloj
  useEffect(() => {
    const t = setInterval(() => setHora(new Date()), 30000);
    return () => clearInterval(t);
  }, []);

  // Refrescar cuando llega pedido nuevo o cambia estado
  useEffect(() => {
    const handler = () => fetchData();
    window.addEventListener('pedido:nuevo-recibido', handler);
    window.addEventListener('pedido:estado-cambiado', handler);
    return () => {
      window.removeEventListener('pedido:nuevo-recibido', handler);
      window.removeEventListener('pedido:estado-cambiado', handler);
    };
  }, [fetchData]);

  // Refrescar al volver a la pestaña/pagina (ej. despues de entregar en /repartidor)
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') fetchData();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [fetchData]);

  const estadoInfo = ruta ? ESTADO_RUTA[ruta.estado] : null;

  // Próximo pedido pendiente
  const proximoPedido = pedidos.find(p => p.estado === 'pendiente' || p.estado === 'en_camino');

  // Stock del vehículo
  const stock = ruta?.stock || [];
  const totalLlenos = stock.reduce((s, x) => s + (Number(x.llenos_disponibles) || 0), 0);
  const totalVacios = stock.reduce((s, x) => s + (Number(x.vacios_en_vehiculo) || 0), 0);

  // Caja
  const totalCobrado = Number(ruta?.total_cobrado) || 0;
  const totalGastos  = Number(ruta?.total_gastos) || 0;
  const neto         = Number(ruta?.neto_a_entregar) || 0;

  // % progreso entregas — entregados / total
  const totalPedidos  = pedidos.length;
  const entregados    = pedidos.filter(p => p.estado === 'entregado').length;
  const noEntregados  = pedidos.filter(p => p.estado === 'no_entregado').length;
  const porAtender    = totalPedidos - entregados - noEntregados;
  const pctEntregas   = totalPedidos > 0 ? Math.round((entregados / totalPedidos) * 100) : 0;

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center gap-3 text-slate-400">
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Cargando...
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="space-y-4">

        {/* ── Header: saludo + hora ── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">
              Hola, {user?.nombre?.split(' ')[0]}
            </h1>
            <p className="text-sm text-slate-400">
              {hora.toLocaleDateString('es-PE', { weekday: 'long', day: 'numeric', month: 'long' })}
              {' · '}
              {hora.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <button onClick={fetchData}
            className="p-2.5 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-400 transition shadow-sm">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
          </button>
        </div>

        {/* ── Estado de ruta (banner principal) ── */}
        {!ruta ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-3 rounded-2xl bg-slate-100 flex items-center justify-center">
              <svg className="w-8 h-8 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
              </svg>
            </div>
            <p className="text-slate-500 font-medium">Sin ruta activa</p>
            <p className="text-xs text-slate-400 mt-1">Selecciona un vehiculo para iniciar tu jornada</p>
            <button onClick={() => navigate('/mi-vehiculo')}
              className="mt-4 px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition shadow-sm">
              Iniciar jornada
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Barra de estado */}
            <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{estadoInfo?.icon}</span>
                <div>
                  <span className="text-white font-bold text-sm">{estadoInfo?.label}</span>
                  <p className="text-blue-200 text-xs">Ruta #{ruta.numero} · {ruta.vehiculo_placa}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {/* GPS indicator */}
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                  gpsActivo ? 'bg-green-500/20 text-green-200' : 'bg-red-500/20 text-red-200'
                }`}>
                  <div className={`w-2 h-2 rounded-full ${gpsActivo ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                  GPS {gpsActivo ? 'ON' : 'OFF'}
                </div>
              </div>
            </div>

            {/* Progreso de entregas */}
            <div className="px-4 py-3">
              <div className="flex items-center justify-between text-sm mb-2">
                <span className="text-slate-800 font-bold">{entregados}/{totalPedidos}</span>
                <span className="text-slate-600 font-medium">Progreso de entregas</span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all duration-500 ${
                  entregados === totalPedidos && totalPedidos > 0
                    ? 'bg-emerald-500'
                    : 'bg-gradient-to-r from-blue-500 to-blue-400'
                }`}
                  style={{ width: `${pctEntregas}%` }} />
              </div>
              <div className="flex items-center justify-between mt-2">
                {porAtender > 0 ? (
                  <span className="text-xs text-amber-600 font-medium">{porAtender} por atender</span>
                ) : (
                  <span className="text-xs text-emerald-600 font-medium">Ruta completada</span>
                )}
                {noEntregados > 0 && (
                  <span className="text-xs text-red-500 font-medium">{noEntregados} no entregado{noEntregados > 1 ? 's' : ''}</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Alerta km diferencia ── */}
        {ruta && Number(ruta.km_diferencia_inicio) > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <div>
              <p className="text-sm font-semibold text-amber-800">
                +{Number(ruta.km_diferencia_inicio).toLocaleString()} km de diferencia al iniciar
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                El vehiculo fue usado fuera de ruta desde la ultima jornada
              </p>
            </div>
          </div>
        )}

        {/* ── 4 tarjetas métricas ── */}
        {ruta && (
          <div className="grid grid-cols-2 gap-3">
            <MiniCard
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>}
              label="Llenos en vehiculo"
              value={totalLlenos}
              color="blue"
            />
            <MiniCard
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
              label="Vacios recogidos"
              value={totalVacios}
              color="amber"
            />
            <MiniCard
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>}
              label="Cobrado hoy"
              value={formatS(totalCobrado)}
              color="emerald"
            />
            <MiniCard
              icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v12m-3-2.818l.879.659c1.171.879 3.07.879 4.242 0 1.172-.879 1.172-2.303 0-3.182C13.536 12.219 12.768 12 12 12c-.725 0-1.45-.22-2.003-.659-1.106-.879-1.106-2.303 0-3.182s2.9-.879 4.006 0l.415.33M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
              label="Neto a entregar"
              value={formatS(neto)}
              color="purple"
            />
          </div>
        )}

        {/* ── Próxima entrega ── */}
        {ruta && proximoPedido && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-700">Proxima entrega</h2>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${ESTADO_PEDIDO[proximoPedido.estado]?.cls}`}>
                {ESTADO_PEDIDO[proximoPedido.estado]?.label}
              </span>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-slate-800 truncate">{proximoPedido.cliente_nombre}</p>
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{proximoPedido.cliente_direccion || 'Sin direccion'}</p>
                <p className="text-xs text-slate-400 mt-1">{proximoPedido.productos_resumen}</p>
                {proximoPedido.notas_encargada && (
                  <p className="text-xs text-amber-600 mt-1 italic">Nota: {proximoPedido.notas_encargada}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2 mt-3">
              {proximoPedido.cliente_lat && proximoPedido.cliente_lng && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${proximoPedido.cliente_lat},${proximoPedido.cliente_lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                  Navegar
                </a>
              )}
              {proximoPedido.cliente_telefono && (
                <a
                  href={`tel:${proximoPedido.cliente_telefono}`}
                  className="flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
                  </svg>
                  Llamar
                </a>
              )}
            </div>
          </div>
        )}

        {/* ── Desglose caja rápido ── */}
        {ruta && totalCobrado > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-700">Cobranza del dia</h2>
              <button onClick={() => navigate('/mi-caja')}
                className="text-xs text-blue-600 font-medium hover:underline">Ver detalle</button>
            </div>
            <div className="space-y-2">
              <CajaRow label="Efectivo" value={ruta.cobrado_efectivo} color="emerald" />
              <CajaRow label="Yape/Transferencia" value={ruta.cobrado_transferencia} color="purple" />
              <CajaRow label="Tarjeta" value={ruta.cobrado_tarjeta} color="blue" />
              <CajaRow label="Credito" value={ruta.cobrado_credito} color="orange" />
              {totalGastos > 0 && (
                <>
                  <div className="border-t border-slate-100 pt-2">
                    <CajaRow label="Gastos" value={-totalGastos} color="red" />
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Stock en vehículo ── */}
        {ruta && stock.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-700">Stock en vehiculo</h2>
              <button onClick={() => navigate('/mi-vehiculo')}
                className="text-xs text-blue-600 font-medium hover:underline">Ver vehiculo</button>
            </div>
            <div className="space-y-2">
              {stock.map(s => {
                const llenos = Number(s.llenos_disponibles) || 0;
                const vacios = Number(s.vacios_en_vehiculo) || 0;
                const cargados = Number(s.llenos_cargados) || 0;
                const pct = cargados > 0 ? Math.round((llenos / cargados) * 100) : 0;
                const low = cargados > 0 && pct < 20;
                return (
                  <div key={s.presentacion_id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className={`text-sm truncate ${low ? 'text-red-600 font-semibold' : 'text-slate-700'}`}>
                          {s.presentacion_nombre}
                        </span>
                        <div className="flex items-center gap-3 text-xs tabular-nums shrink-0">
                          <span className={`font-bold ${low ? 'text-red-600' : 'text-blue-600'}`}>{llenos} llenos</span>
                          {vacios > 0 && <span className="text-amber-600">{vacios} vacios</span>}
                        </div>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${low ? 'bg-red-400' : 'bg-blue-400'}`}
                          style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Accesos rápidos ── */}
        <div className="grid grid-cols-2 gap-3">
          <QuickAction
            onClick={() => navigate('/repartidor')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" /></svg>}
            label="Mis pedidos"
            sub="Mapa y lista"
            color="blue"
          />
          <QuickAction
            onClick={() => navigate('/mi-vehiculo')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" /></svg>}
            label="Mi vehiculo"
            sub="Stock y carga"
            color="slate"
          />
          <QuickAction
            onClick={() => navigate('/mi-caja')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>}
            label="Mi caja"
            sub="Cobros y gastos"
            color="emerald"
          />
          <QuickAction
            onClick={() => navigate('/repartidor/devoluciones')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
            label="Devoluciones"
            sub="Vacios de clientes"
            color="amber"
          />
          <QuickAction
            onClick={() => navigate('/mis-pedidos')}
            icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            label="Historial"
            sub="Pedidos anteriores"
            color="purple"
          />
        </div>

      </div>
    </Layout>
  );
}

/* ── Componentes auxiliares ── */

function MiniCard({ icon, label, value, color }) {
  const colors = {
    blue:    'bg-blue-50 text-blue-600 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100',
    amber:   'bg-amber-50 text-amber-600 border-amber-100',
    purple:  'bg-purple-50 text-purple-600 border-purple-100',
  };
  const iconColors = {
    blue: 'bg-blue-100 text-blue-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    amber: 'bg-amber-100 text-amber-600',
    purple: 'bg-purple-100 text-purple-600',
  };
  return (
    <div className={`rounded-2xl border p-3 ${colors[color]}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${iconColors[color]}`}>
        {icon}
      </div>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs opacity-70">{label}</p>
    </div>
  );
}

function CajaRow({ label, value, color }) {
  const val = Number(value) || 0;
  if (val === 0) return null;
  const colorCls = {
    emerald: 'text-emerald-600',
    purple:  'text-purple-600',
    blue:    'text-blue-600',
    orange:  'text-orange-600',
    red:     'text-red-600',
  };
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-500">{label}</span>
      <span className={`font-semibold tabular-nums ${colorCls[color]}`}>
        {formatS(Math.abs(val))}
      </span>
    </div>
  );
}

function QuickAction({ onClick, icon, label, sub, color }) {
  const colorCls = {
    blue:    'bg-blue-50 hover:bg-blue-100 text-blue-600 border-blue-100',
    slate:   'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200',
    emerald: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border-emerald-100',
    purple:  'bg-purple-50 hover:bg-purple-100 text-purple-600 border-purple-100',
    amber:   'bg-amber-50 hover:bg-amber-100 text-amber-600 border-amber-100',
  };
  return (
    <button onClick={onClick}
      className={`flex items-center gap-3 p-3 rounded-2xl border transition text-left ${colorCls[color]}`}>
      <div className="shrink-0">{icon}</div>
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs opacity-60">{sub}</p>
      </div>
    </button>
  );
}
