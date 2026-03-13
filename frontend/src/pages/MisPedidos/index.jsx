import { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { misPedidos } from '../../services/pedidosService';
import VistaLista from './VistaLista';
import VistaMapa from './VistaMapa';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const BADGE = {
  pendiente:     'bg-yellow-100 text-yellow-700',
  en_camino:     'bg-blue-100 text-blue-700',
  entregado:     'bg-green-100 text-green-700',
  no_entregado:  'bg-red-100 text-red-700',
};

export default function MisPedidosPage() {
  const [pedidos, setPedidos]   = useState([]);
  const [resumen, setResumen]   = useState({});
  const [loading, setLoading]   = useState(true);
  const [fechaIni, setFechaIni] = useState(today());
  const [fechaFin, setFechaFin] = useState(today());
  const [tab, setTab]           = useState('lista');

  const fetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await misPedidos({
        fecha_inicio: fechaIni || undefined,
        fecha_fin: fechaFin || undefined,
      });
      setPedidos(Array.isArray(res.data) ? res.data : []);
      setResumen(res.resumen || {});
    } catch { setPedidos([]); setResumen({}); }
    finally { setLoading(false); }
  }, [fechaIni, fechaFin]);

  useEffect(() => { fetch(); }, [fetch]);

  function setRango(ini, fin) { setFechaIni(ini); setFechaFin(fin); }
  const hoy = today();
  const hace7 = (() => { const d = new Date(); d.setDate(d.getDate() - 6); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  const inicioMes = hoy.slice(0, 8) + '01';

  return (
    <Layout>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Mis Pedidos</h1>
        <p className="text-sm text-slate-500 mt-0.5">Tus entregas asignadas</p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Pendientes', val: resumen.pendientes, cls: BADGE.pendiente },
          { label: 'En camino',  val: resumen.en_camino,  cls: BADGE.en_camino },
          { label: 'Entregados', val: resumen.entregados,  cls: BADGE.entregado },
          { label: 'No entreg.', val: resumen.no_entregados, cls: BADGE.no_entregado },
        ].map(c => (
          <div key={c.label} className={`rounded-xl px-4 py-3 ${c.cls}`}>
            <p className="text-2xl font-bold">{c.val ?? 0}</p>
            <p className="text-xs font-medium opacity-80">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-5">
        <button onClick={() => setRango(hoy, hoy)}
          className={`px-3 py-2 text-xs border rounded-lg transition ${fechaIni === hoy && fechaFin === hoy ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-slate-300 hover:bg-slate-50 text-slate-600'}`}>Hoy</button>
        <button onClick={() => setRango(hace7, hoy)}
          className={`px-3 py-2 text-xs border rounded-lg transition ${fechaIni === hace7 && fechaFin === hoy ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-slate-300 hover:bg-slate-50 text-slate-600'}`}>7 dias</button>
        <button onClick={() => setRango(inicioMes, hoy)}
          className={`px-3 py-2 text-xs border rounded-lg transition ${fechaIni === inicioMes && fechaFin === hoy ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-slate-300 hover:bg-slate-50 text-slate-600'}`}>Mes</button>
        <button onClick={() => setRango('', '')}
          className={`px-3 py-2 text-xs border rounded-lg transition ${!fechaIni && !fechaFin ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-slate-300 hover:bg-slate-50 text-slate-600'}`}>Todas</button>
        <input type="date" value={fechaIni} onChange={e => setFechaIni(e.target.value)}
          className="px-2 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition w-[130px]" />
        <span className="text-xs text-slate-400">a</span>
        <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)}
          className="px-2 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition w-[130px]" />

        <div className="ml-auto flex gap-1 bg-slate-100 rounded-xl p-1">
          <button onClick={() => setTab('lista')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
              tab === 'lista' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            Lista
          </button>
          <button onClick={() => setTab('mapa')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
              tab === 'mapa' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}>
            Mapa
          </button>
        </div>
      </div>

      {tab === 'lista'
        ? <VistaLista pedidos={pedidos} loading={loading} onRefresh={fetch} />
        : <VistaMapa pedidos={pedidos} loading={loading} onRefresh={fetch} />
      }
    </Layout>
  );
}
