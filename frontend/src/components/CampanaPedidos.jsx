import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { misPedidos } from '../services/pedidosService';

const STORAGE_KEY = 'pedidos_vistos';

function getVistos() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
}
function setVistos(ids) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); } catch {}
}

const ESTADO_CLS = {
  pendiente:  'bg-yellow-100 text-yellow-700',
  asignado:   'bg-blue-100 text-blue-700',
  en_camino:  'bg-purple-100 text-purple-700',
};

export default function CampanaPedidos() {
  const { user } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const [pedidos, setPedidos] = useState([]);
  const [open, setOpen] = useState(false);
  const [vistos, setVistosState] = useState(getVistos);
  const ref = useRef(null);

  // Solo chofer con notif_pedidos activo
  if (!user || user.rol !== 'chofer') return null;

  const fetchPedidos = useCallback(async () => {
    try {
      const res = await misPedidos({});
      const pendientes = (Array.isArray(res.data) ? res.data : [])
        .filter(p => !['entregado', 'no_entregado', 'cancelado', 'reasignado'].includes(p.estado));
      setPedidos(pendientes);
    } catch { /* silenciar */ }
  }, []);

  // Fetch inicial + polling cada 2 min
  useEffect(() => {
    fetchPedidos();
    const interval = setInterval(fetchPedidos, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchPedidos]);

  // Asegurar que el socket esté en el room del repartidor (independiente de RepartidorContext)
  useEffect(() => {
    if (!socket || !user?.id) return;
    if (!socket.connected) socket.connect();
    socket.emit('repartidor:join', { repartidor_id: user.id });
  }, [socket, user?.id]);

  // Socket: nuevo pedido
  useEffect(() => {
    if (!socket) return;
    const handler = () => fetchPedidos();
    socket.on('pedido:nuevo', handler);
    return () => socket.off('pedido:nuevo', handler);
  }, [socket, fetchPedidos]);

  // Limpiar vistos viejos que ya no existen
  useEffect(() => {
    const idsActuales = new Set(pedidos.map(p => p.id));
    const vistosLimpios = vistos.filter(id => idsActuales.has(id));
    if (vistosLimpios.length !== vistos.length) {
      setVistos(vistosLimpios);
      setVistosState(vistosLimpios);
    }
  }, [pedidos]);

  // Click fuera cierra dropdown
  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const noVistos = pedidos.filter(p => !vistos.includes(p.id));

  function marcarVistos() {
    const ids = pedidos.map(p => p.id);
    setVistos(ids);
    setVistosState(ids);
  }

  function handleClickPedido() {
    marcarVistos();
    setOpen(false);
    navigate('/mis-pedidos');
  }

  return (
    <div className="relative" ref={ref}>
      {/* Campana */}
      <button
        onClick={() => setOpen(prev => !prev)}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 transition"
        title="Mis pedidos"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {/* Badge */}
        {noVistos.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-blue-500 text-white text-[10px] font-bold leading-none animate-pulse">
            {noVistos.length > 99 ? '99+' : noVistos.length}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-700">Mis pedidos pendientes</span>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Lista */}
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
            {pedidos.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-400">
                Sin pedidos pendientes
              </div>
            ) : (
              pedidos.map(p => {
                const esNuevo = !vistos.includes(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={handleClickPedido}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${esNuevo ? 'bg-blue-50' : ''}`}
                  >
                    <div className="flex items-start gap-2.5">
                      {esNuevo && <span className="mt-1.5 w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-slate-800">#{p.numero}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${ESTADO_CLS[p.estado] || 'bg-slate-100 text-slate-600'}`}>
                            {p.estado}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">
                          {p.cliente_nombre || 'Sin cliente'}
                          {p.productos_resumen ? ` — ${p.productos_resumen}` : ''}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          {pedidos.length > 0 && (
            <div className="border-t border-slate-100">
              <button
                onClick={handleClickPedido}
                className="w-full px-4 py-2.5 text-sm text-blue-600 font-medium hover:bg-blue-50 transition-colors text-center"
              >
                Ver todos mis pedidos
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
