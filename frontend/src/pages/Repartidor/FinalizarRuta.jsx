import { useState, useEffect } from 'react';
import { finalizarRuta, getStockVehiculo } from '../../services/rutasService';
import { useRepartidor } from '../../context/RepartidorContext';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

function buildStock(rows) {
  return rows.map(s => {
    const llenosRestantes = Math.max(0, (s.llenos_cargados || 0) - (s.llenos_entregados || 0) - (s.llenos_sobrantes || 0));
    const vaciosRestantes = Math.max(0, (s.vacios_recogidos || 0) - (s.vacios_devueltos || 0));
    return {
      presentacion_id: s.presentacion_id,
      presentacion_nombre: s.presentacion_nombre,
      llenos_cargados: s.llenos_cargados,
      llenos_entregados: s.llenos_entregados,
      llenos_sobrantes_previos: s.llenos_sobrantes || 0,
      llenos_sobrantes: llenosRestantes,
      vacios_recogidos: s.vacios_recogidos,
      vacios_devueltos_previos: s.vacios_devueltos || 0,
      vacios_a_planta: vaciosRestantes,
    };
  });
}

export default function FinalizarRuta({ ruta, onRefresh }) {
  const { finalizarRutaCtx } = useRepartidor();
  const [stock, setStock] = useState(() => buildStock(ruta.stock || []));

  // Cargar stock fresco al montar (el prop puede estar desactualizado tras visita planta)
  useEffect(() => {
    getStockVehiculo(ruta.id)
      .then(res => { if (res.data?.length) setStock(buildStock(res.data)); })
      .catch(() => {});
  }, [ruta.id]);
  const [kmFin, setKmFin]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const [done, setDone]       = useState(ruta.estado === 'finalizada');

  function updateStock(idx, field, val) {
    setStock(prev => prev.map((s, i) => i === idx ? { ...s, [field]: Math.max(0, Number(val) || 0) } : s));
  }

  async function handleFinalizar() {
    if (!window.confirm('¿Estás seguro de finalizar la ruta? Lo que no devuelvas quedará en el vehículo para la siguiente ruta.')) return;
    setLoading(true); setError('');
    try {
      await finalizarRuta(ruta.id, {
        llenos_sobrantes: stock.map(s => ({ presentacion_id: s.presentacion_id, cantidad: s.llenos_sobrantes })),
        vacios_a_planta: stock.map(s => ({ presentacion_id: s.presentacion_id, cantidad: s.vacios_a_planta })),
        km_fin: Number(kmFin),
      });
      setDone(true);
      finalizarRutaCtx(); // Detiene GPS + limpia contexto
      onRefresh();
    } catch (err) { setError(err.response?.data?.error || 'Error al finalizar'); }
    finally { setLoading(false); }
  }

  if (done) {
    return (
      <div className="text-center py-12">
        <svg className="w-16 h-16 mx-auto text-green-500 mb-4" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h2 className="text-lg font-semibold text-green-700">Ruta finalizada</h2>
        <p className="text-sm text-slate-500 mt-1">Ruta cerrada. El stock no devuelto quedó en el vehículo. Entrega tu caja a la encargada.</p>
      </div>
    );
  }

  const kmFinNum = kmFin ? Number(kmFin) : null;
  const kmInicioNum = ruta.km_inicio ? Number(ruta.km_inicio) : null;
  const kmInvalido = kmFinNum != null && kmInicioNum != null && kmFinNum < kmInicioNum;
  const recorrido = kmFinNum != null && kmInicioNum != null && !kmInvalido ? kmFinNum - kmInicioNum : null;

  return (
    <div className="space-y-4">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

      {/* Kilometraje final */}
      <div className={`bg-white rounded-2xl border shadow-sm p-5 ${kmInvalido ? 'border-red-300' : 'border-slate-200'}`}>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Kilometraje de regreso</p>
        {kmInicioNum != null && (
          <p className="text-xs text-slate-400 mb-2">Km de salida: <span className="font-medium text-slate-600">{kmInicioNum.toLocaleString()} km</span></p>
        )}
        <input type="number" min={kmInicioNum || 0} className={`${inputCls} ${kmInvalido ? '!border-red-400 !ring-red-300' : ''}`} value={kmFin} required
          onChange={e => setKmFin(e.target.value)} placeholder="Km del odometro al regresar *" />
        {!kmFin && <p className="text-xs text-red-500 mt-1">* Obligatorio para finalizar la ruta</p>}
        {kmInvalido && (
          <p className="text-xs text-red-600 mt-1 font-medium">El km de regreso ({kmFinNum.toLocaleString()}) no puede ser menor al de salida ({kmInicioNum.toLocaleString()})</p>
        )}
        {recorrido != null && (
          <p className="text-xs text-blue-600 mt-1.5 font-medium">Recorrido: {recorrido.toLocaleString()} km</p>
        )}
      </div>

      {/* Devolver a planta */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Devolver a planta</p>
        <p className="text-xs text-slate-400 mb-3">Lo que no devuelvas quedará en el vehículo para la siguiente ruta</p>
        {stock.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-3">Sin stock cargado</p>
        ) : (
          <div className="space-y-3">
            {stock.map((s, idx) => (
              <div key={s.presentacion_id} className="border border-slate-200 rounded-xl p-3 bg-slate-50/50">
                <p className="text-sm font-medium text-slate-700 mb-2">{s.presentacion_nombre}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="text-center">
                    <p className="text-slate-400">Cargados</p>
                    <p className="text-lg font-bold text-slate-700">{s.llenos_cargados}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-slate-400">Entregados</p>
                    <p className="text-lg font-bold text-green-600">{s.llenos_entregados}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-center mb-0.5">Devolver llenos</p>
                    <input type="number" min="0" className={`${inputCls} text-center font-bold`}
                      value={s.llenos_sobrantes} onChange={e => updateStock(idx, 'llenos_sobrantes', e.target.value)} />
                    {s.llenos_sobrantes_previos > 0 && (
                      <p className="text-[10px] text-blue-500 text-center mt-0.5">+{s.llenos_sobrantes_previos} ya devueltos</p>
                    )}
                  </div>
                  <div>
                    <p className="text-slate-400 text-center mb-0.5">Vacíos a planta</p>
                    <input type="number" min="0" className={`${inputCls} text-center font-bold`}
                      value={s.vacios_a_planta} onChange={e => updateStock(idx, 'vacios_a_planta', e.target.value)} />
                    {s.vacios_devueltos_previos > 0 && (
                      <p className="text-[10px] text-blue-500 text-center mt-0.5">+{s.vacios_devueltos_previos} ya devueltos</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={handleFinalizar} disabled={loading || !kmFin || kmInvalido}
        className="w-full px-6 py-3 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded-xl transition shadow-sm">
        {loading ? 'Finalizando...' : !kmFin ? 'Ingresa el kilometraje para finalizar' : kmInvalido ? 'Km de regreso menor al de salida' : 'Finalizar Ruta'}
      </button>
    </div>
  );
}
