import { useEffect, useState } from 'react';
import api from '../../services/api';

export default function ResumenBidones({ cajaId, autoOpen = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(autoOpen);

  useEffect(() => {
    if (!cajaId || !open) return;
    setLoading(true);
    api.get(`/caja/${cajaId}/resumen-bidones`)
      .then(r => setData(r.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [cajaId, open]);

  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden ${autoOpen ? '' : ''}`}>
      {!autoOpen && <button onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 transition">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
          <span className="text-sm font-semibold text-slate-700">Resumen de bidones del dia</span>
        </div>
        <svg className={`w-4 h-4 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>}

      {open && (
        <div className="px-5 pb-5 border-t border-slate-100">
          {loading ? (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : !data ? (
            <p className="text-sm text-slate-400 text-center py-4">No se pudo cargar el resumen</p>
          ) : (
            <div className="space-y-4 pt-4">
              {/* Movimientos del dia */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Movimientos del dia</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Item label="Producidos (llenados)" value={data.producidos} color="emerald" icon="+" />
                  <Item label="Lavados" value={data.lavados} color="blue" icon="+" />
                  {data.comprados > 0 && <Item label="Comprados" value={data.comprados} color="purple" icon="+" />}
                </div>
              </div>

              {/* Ventas */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Ventas</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {data.vendidos_recarga > 0 && <Item label="Recargas" value={data.vendidos_recarga} color="amber" icon="-" />}
                  {data.vendidos_completo > 0 && <Item label="Bidones completos" value={data.vendidos_completo} color="amber" icon="-" />}
                  {data.vendidos_prestamo > 0 && <Item label="Prestamos" value={data.vendidos_prestamo} color="red" icon="-" />}
                  {data.prestamos_auto > 0 && <Item label="Prestamos auto (vacios no devueltos)" value={data.prestamos_auto} color="red" icon="" />}
                  {data.vendidos_producto > 0 && <Item label="Productos" value={data.vendidos_producto} color="slate" icon="-" />}
                  {(data.vendidos_recarga + data.vendidos_completo + data.vendidos_prestamo + data.vendidos_producto) === 0 && (
                    <p className="text-sm text-slate-400 col-span-2">Sin ventas de bidones hoy</p>
                  )}
                </div>
              </div>

              {/* Devoluciones */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Devoluciones</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <Item label="Vacios recibidos (ventas)" value={data.vacios_recibidos_ventas} color="blue" icon="+" />
                  <Item label="Devueltos (deudas)" value={data.devueltos_deuda} color="green" icon="+" />
                </div>
              </div>

              {/* Stock actual */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Stock actual</p>
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="text-left px-3 py-2 text-xs font-semibold text-slate-500">Producto</th>
                        <th className="text-center px-3 py-2 text-xs font-semibold text-emerald-600">Llenos</th>
                        <th className="text-center px-3 py-2 text-xs font-semibold text-slate-500">Vacios</th>
                        <th className="text-center px-3 py-2 text-xs font-semibold text-amber-600">Por lavar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.stock.map((s, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 font-medium text-slate-700">{s.nombre}</td>
                          <td className="px-3 py-2 text-center font-bold text-emerald-700">{s.stock_llenos}</td>
                          <td className="px-3 py-2 text-center text-slate-600">{s.stock_vacios}</td>
                          <td className="px-3 py-2 text-center font-bold text-amber-700">{s.stock_en_lavado}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Item({ label, value, color, icon }) {
  const colors = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    purple: 'bg-purple-50 text-purple-700 border-purple-100',
    green: 'bg-green-50 text-green-700 border-green-100',
    slate: 'bg-slate-50 text-slate-600 border-slate-200',
  };
  return (
    <div className={`rounded-xl border px-3 py-2 ${colors[color]}`}>
      <p className="text-lg font-bold">{icon === '+' ? '+' : '-'}{value}</p>
      <p className="text-xs opacity-70">{label}</p>
    </div>
  );
}
