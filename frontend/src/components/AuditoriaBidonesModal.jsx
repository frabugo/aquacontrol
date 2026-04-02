import { useEffect, useState } from 'react';
import { auditoriaBidones } from '../services/devolucionesService';

function fmtFecha(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtFechaHora(dt) {
  if (!dt) return '—';
  const d = new Date(dt);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })
    + ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

const ORIGEN = { manual: 'Manual', venta: 'Venta', reparto: 'Reparto' };

export default function AuditoriaBidonesModal({ cliente, onClose }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  useEffect(() => {
    auditoriaBidones(cliente.id)
      .then(setData)
      .catch(err => setError(err.response?.data?.error || 'Error al cargar'))
      .finally(() => setLoading(false));
  }, [cliente.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Detalle de bidones prestados</h2>
            <p className="text-sm text-slate-500">{cliente.nombre}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {loading ? (
            <div className="text-center py-12 text-slate-400">Cargando...</div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
          ) : data && (
            <>
              {/* Resumen */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-orange-600">{data.resumen.total_prestados}</p>
                  <p className="text-xs text-orange-700 mt-1">Total prestados</p>
                </div>
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-green-600">{data.resumen.total_devueltos}</p>
                  <p className="text-xs text-green-700 mt-1">Devueltos</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-blue-600">{data.resumen.saldo_actual}</p>
                  <p className="text-xs text-blue-700 mt-1">Saldo actual</p>
                </div>
                {data.resumen.diferencia !== 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                    <p className="text-2xl font-bold text-red-600">{data.resumen.diferencia > 0 ? '+' : ''}{data.resumen.diferencia}</p>
                    <p className="text-xs text-red-700 mt-1">Diferencia</p>
                  </div>
                )}
              </div>

              {/* Carga inicial */}
              {data.resumen.ultima_carga_inicial && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                  Carga inicial: <b>{data.resumen.ultima_carga_inicial.bidones_nuevo}</b> bidones
                  (antes: {data.resumen.ultima_carga_inicial.bidones_anterior})
                  — {fmtFecha(data.resumen.ultima_carga_inicial.fecha)} por {data.resumen.ultima_carga_inicial.usuario}
                </div>
              )}

              {/* Prestamos de ventas */}
              {data.prestamos_explicitos.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">Prestamos por venta ({data.resumen.prestamos_ventas})</h3>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-500 text-xs">
                        <tr>
                          <th className="px-3 py-2 text-left">Venta</th>
                          <th className="px-3 py-2 text-left">Fecha</th>
                          <th className="px-3 py-2 text-left">Producto</th>
                          <th className="px-3 py-2 text-center">Cantidad</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.prestamos_explicitos.map((p, i) => (
                          <tr key={`pe-${i}`} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-medium text-blue-600">{p.folio}</td>
                            <td className="px-3 py-2 text-slate-500">{fmtFechaHora(p.fecha_hora)}</td>
                            <td className="px-3 py-2 text-slate-600">{p.presentacion}</td>
                            <td className="px-3 py-2 text-center font-semibold text-orange-600">+{p.cantidad}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Prestamos automaticos */}
              {data.prestamos_auto.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">Prestamos automaticos por recargas ({data.resumen.prestamos_auto_recargas})</h3>
                  <p className="text-xs text-slate-400 mb-2">Vacios faltantes en recargas de productos retornables</p>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-500 text-xs">
                        <tr>
                          <th className="px-3 py-2 text-left">Venta</th>
                          <th className="px-3 py-2 text-left">Fecha</th>
                          <th className="px-3 py-2 text-left">Producto</th>
                          <th className="px-3 py-2 text-center">Faltantes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.prestamos_auto.map((p, i) => (
                          <tr key={`pa-${i}`} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-medium text-blue-600">{p.folio}</td>
                            <td className="px-3 py-2 text-slate-500">{fmtFechaHora(p.fecha_hora)}</td>
                            <td className="px-3 py-2 text-slate-600">{p.presentacion}</td>
                            <td className="px-3 py-2 text-center font-semibold text-orange-600">+{p.cantidad}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Devoluciones */}
              {data.devoluciones.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">Devoluciones ({data.resumen.total_devueltos})</h3>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-500 text-xs">
                        <tr>
                          <th className="px-3 py-2 text-left">Fecha</th>
                          <th className="px-3 py-2 text-left">Producto</th>
                          <th className="px-3 py-2 text-left">Origen</th>
                          <th className="px-3 py-2 text-left">Venta</th>
                          <th className="px-3 py-2 text-center">Cantidad</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {data.devoluciones.map((d, i) => (
                          <tr key={`d-${i}`} className="hover:bg-slate-50">
                            <td className="px-3 py-2 text-slate-500">{fmtFecha(d.fecha)}</td>
                            <td className="px-3 py-2 text-slate-600">{d.presentacion}</td>
                            <td className="px-3 py-2 text-slate-500">{ORIGEN[d.origen] || d.origen}</td>
                            <td className="px-3 py-2 text-blue-600">{d.venta_folio || '—'}</td>
                            <td className="px-3 py-2 text-center font-semibold text-green-600">-{d.cantidad}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Sin movimientos */}
              {data.prestamos_explicitos.length === 0 && data.prestamos_auto.length === 0 && data.devoluciones.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-sm">
                  No hay movimientos de bidones registrados para este cliente
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
