import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { misPedidos } from '../../services/pedidosService';
import FormEntrega from './FormEntrega';
import VistaLista from '../MisPedidos/VistaLista';
import VistaMapa from '../MisPedidos/VistaMapa';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function Repartidor() {
  const navigate = useNavigate();
  const [pedidos, setPedidos]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [tab, setTab]           = useState('mapa');
  const [entregando, setEntregando] = useState(null);

  const fetchPedidos = useCallback(async () => {
    setLoading(true);
    try {
      // Sin fecha — el backend busca pedidos de la ruta activa (no importa si pasó medianoche)
      const res = await misPedidos({});
      setPedidos(res.data || []);
    } catch {
      setPedidos([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPedidos(); }, [fetchPedidos]);

  // Refrescar lista cuando llega un nuevo pedido o cambia estado
  useEffect(() => {
    const handler = () => fetchPedidos();
    window.addEventListener('pedido:nuevo-recibido', handler);
    window.addEventListener('pedido:estado-cambiado', handler);
    return () => {
      window.removeEventListener('pedido:nuevo-recibido', handler);
      window.removeEventListener('pedido:estado-cambiado', handler);
    };
  }, [fetchPedidos]);

  // Refrescar al volver a esta pestaña
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') fetchPedidos();
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [fetchPedidos]);

  // Escuchar navegación desde Service Worker
  useEffect(() => {
    const handler = (e) => {
      if (e.data?.tipo === 'navegar') {
        navigate(e.data.url);
      }
    };
    navigator.serviceWorker?.addEventListener('message', handler);
    return () => navigator.serviceWorker?.removeEventListener('message', handler);
  }, [navigate]);

  // Calcular resumen directamente desde pedidos
  const totalCount      = pedidos.length;
  const pendientesCount = pedidos.filter(p => p.estado === 'pendiente').length;
  const enCaminoCount   = pedidos.filter(p => p.estado === 'en_camino').length;
  const entregadosCount = pedidos.filter(p => p.estado === 'entregado').length;
  const noEntregadosCount = pedidos.filter(p => p.estado === 'no_entregado').length;

  return (
    <Layout>
      {/* Header resumen */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-lg font-bold text-slate-800">Mis Pedidos</h1>
            <p className="text-xs text-slate-400">{today()}</p>
          </div>
          <button onClick={fetchPedidos}
            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
            </svg>
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-slate-50 rounded-lg px-3 py-2 text-center">
            <p className="text-xl font-bold text-slate-700">{totalCount}</p>
            <p className="text-xs text-slate-400">Total</p>
          </div>
          <div className="bg-yellow-50 rounded-lg px-3 py-2 text-center">
            <p className="text-xl font-bold text-yellow-600">{pendientesCount}</p>
            <p className="text-xs text-yellow-600">Pendientes</p>
          </div>
          <div className="bg-blue-50 rounded-lg px-3 py-2 text-center">
            <p className="text-xl font-bold text-blue-600">{enCaminoCount}</p>
            <p className="text-xs text-blue-600">En camino</p>
          </div>
          <div className="bg-green-50 rounded-lg px-3 py-2 text-center">
            <p className="text-xl font-bold text-green-600">{entregadosCount}</p>
            <p className="text-xs text-green-600">Entregados</p>
          </div>
        </div>
        {noEntregadosCount > 0 && (
          <p className="text-xs text-red-500 font-medium mt-2 text-center">{noEntregadosCount} no entregado{noEntregadosCount > 1 ? 's' : ''}</p>
        )}
      </div>

      {/* Tabs: Mapa (default) | Lista */}
      <div className="flex gap-1 mb-4 bg-slate-100 rounded-xl p-1 w-fit">
        {[
          { key: 'mapa', label: 'Mapa', icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
            </svg>
          )},
          { key: 'lista', label: 'Lista', icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          )},
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg transition ${
              tab === t.key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {entregando ? (
        <FormEntrega
          pedido={entregando}
          ruta={null}
          onBack={() => setEntregando(null)}
          onSaved={() => { setEntregando(null); fetchPedidos(); }}
        />
      ) : tab === 'mapa' ? (
        <VistaMapa pedidos={pedidos} loading={loading} onRefresh={fetchPedidos} onEntregar={setEntregando} />
      ) : (
        <VistaLista pedidos={pedidos} loading={loading} onRefresh={fetchPedidos} />
      )}
    </Layout>
  );
}
