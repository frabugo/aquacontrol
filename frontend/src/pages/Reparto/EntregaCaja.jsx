import { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { listarRutas, confirmarEntrega } from '../../services/rutasService';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const ESTADO_BADGE = {
  abierta:   'bg-yellow-100 text-yellow-700',
  entregada: 'bg-green-100 text-green-700',
  solicitada: 'bg-amber-100 text-amber-700',
};

function formatHora(dt) {
  if (!dt) return '--:--';
  return new Date(dt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

function CajaCard({ r, onConfirmar, tipo }) {
  const badgeLabel = tipo === 'solicitada' ? 'Solicita entrega'
                   : tipo === 'entregada' ? 'Confirmada'
                   : 'En ruta';
  const badgeCls = tipo === 'solicitada' ? ESTADO_BADGE.solicitada
                 : tipo === 'entregada' ? ESTADO_BADGE.entregada
                 : ESTADO_BADGE.abierta;
  const borderCls = tipo === 'solicitada' ? 'border-amber-300 bg-amber-50/30' : 'border-slate-200';

  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-5 ${borderCls}`}>
      <div className="flex items-center justify-between mb-3">
        <span className="font-bold text-slate-800">{r.numero}</span>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badgeCls}`}>
          {badgeLabel}
        </span>
      </div>
      <p className="text-sm text-slate-600 mb-3">{r.repartidor_nombre}</p>

      <div className="space-y-2 mb-4">
        {[
          { label: 'Efectivo',      val: r.cobrado_efectivo },
          { label: 'Transferencia', val: r.cobrado_transferencia },
          { label: 'Tarjeta',       val: r.cobrado_tarjeta },
          { label: 'Credito',       val: r.cobrado_credito },
        ].map(({ label, val }) => (
          <div key={label} className="flex justify-between text-sm">
            <span className="text-slate-500">{label}</span>
            <span className="font-medium text-slate-700">S/ {Number(val || 0).toFixed(2)}</span>
          </div>
        ))}
        <div className="border-t border-slate-200 pt-2 flex justify-between text-sm">
          <span className="text-slate-500">Gastos</span>
          <span className="font-medium text-red-600">- S/ {Number(r.total_gastos || 0).toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-sm font-bold">
          <span className="text-slate-700">Neto a entregar</span>
          <span className="text-blue-700">S/ {Number(r.neto_a_entregar || 0).toFixed(2)}</span>
        </div>
      </div>

      {tipo === 'solicitada' && onConfirmar && (
        <>
          <p className="text-xs text-amber-600 mb-3">
            Solicito a las {formatHora(r.solicitada_en)}
          </p>
          <button onClick={() => onConfirmar(r.id)}
            className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition">
            Confirmar Recepcion
          </button>
        </>
      )}
      {tipo === 'pendiente' && (
        <p className="text-xs text-slate-400 text-center">Repartidor aun no solicita entrega</p>
      )}
      {tipo === 'entregada' && (
        <p className="text-xs text-green-600 text-center">
          Confirmada a las {formatHora(r.confirmada_en)}
        </p>
      )}
    </div>
  );
}

export default function EntregaCaja() {
  const [rutas, setRutas]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [fechaIni, setFechaIni] = useState(today());
  const [fechaFin, setFechaFin] = useState(today());

  const fetchRutas = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Rutas del rango de fechas seleccionado
      const res = await listarRutas({
        fecha_inicio: fechaIni || undefined,
        fecha_fin: fechaFin || undefined,
      });
      const porFecha = (res.data || []).filter(r => r.caja_ruta_id);

      // 2. Siempre traer también las cajas abiertas (sin entregar) de cualquier fecha
      //    para no perder cajas pendientes de días anteriores
      const resTodas = await listarRutas({});
      const pendientesExtras = (resTodas.data || []).filter(
        r => r.caja_ruta_id && r.caja_estado !== 'entregada'
      );

      // Mergear sin duplicados (por ruta id)
      const mapa = new Map();
      for (const r of porFecha) mapa.set(r.id, r);
      for (const r of pendientesExtras) {
        if (!mapa.has(r.id)) mapa.set(r.id, r);
      }
      setRutas(Array.from(mapa.values()).sort((a, b) => (b.fecha > a.fecha ? 1 : -1)));
    } catch { setRutas([]); }
    setLoading(false);
  }, [fechaIni, fechaFin]);

  useEffect(() => { fetchRutas(); }, [fetchRutas]);

  function setRango(ini, fin) { setFechaIni(ini); setFechaFin(fin); }
  const hoy = today();
  const hace7 = (() => { const d = new Date(); d.setDate(d.getDate() - 6); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })();
  const inicioMes = hoy.slice(0, 8) + '01';

  async function handleConfirmarEntrega(rutaId) {
    if (!window.confirm('¿Confirmar recepción física de la caja? Los montos se transferirán a la caja principal.')) return;
    try {
      await confirmarEntrega(rutaId);
      fetchRutas();
    } catch (err) {
      alert(err.response?.data?.error || 'Error al confirmar entrega');
    }
  }

  return (
    <Layout>
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-slate-800">Entrega de Caja</h1>
        <p className="text-sm text-slate-500 mt-0.5">Recibir caja de repartidores y transferir a caja principal</p>
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
        <input type="date" value={fechaIni} onChange={e => setFechaIni(e.target.value)}
          className="px-2 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition w-[130px]" />
        <span className="text-xs text-slate-400">a</span>
        <input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)}
          className="px-2 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition w-[130px]" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : rutas.length === 0 ? (
        <div className="text-center py-12 text-slate-400">No hay rutas con caja para esta fecha</div>
      ) : (
        <>
        {/* Sección: Esperando entrega (repartidor ya solicitó) */}
        {(() => {
          const solicitadas = rutas.filter(r => r.caja_estado !== 'entregada' && r.solicitada_entrega === 1);
          if (solicitadas.length === 0) return null;
          return (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full bg-amber-400" style={{ animation: 'pulse-green 1.5s infinite' }} />
                <h2 className="text-sm font-bold text-amber-700 uppercase tracking-wider">
                  Esperando confirmacion ({solicitadas.length})
                </h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {solicitadas.map(r => (
                  <CajaCard key={r.id} r={r} onConfirmar={handleConfirmarEntrega} tipo="solicitada" />
                ))}
              </div>
            </div>
          );
        })()}

        {/* Sección: Pendientes (aún no solicitaron) */}
        {(() => {
          const pendientes = rutas.filter(r => r.caja_estado !== 'entregada' && !r.solicitada_entrega);
          if (pendientes.length === 0) return null;
          return (
            <div className="mb-6">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-3">
                Pendientes ({pendientes.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {pendientes.map(r => (
                  <CajaCard key={r.id} r={r} tipo="pendiente" />
                ))}
              </div>
            </div>
          );
        })()}

        {/* Sección: Entregadas */}
        {(() => {
          const entregadas = rutas.filter(r => r.caja_estado === 'entregada');
          if (entregadas.length === 0) return null;
          return (
            <div className="mb-6">
              <h2 className="text-sm font-bold text-green-600 uppercase tracking-wider mb-3">
                Confirmadas ({entregadas.length})
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {entregadas.map(r => (
                  <CajaCard key={r.id} r={r} tipo="entregada" />
                ))}
              </div>
            </div>
          );
        })()}
        </>
      )}
    </Layout>
  );
}
