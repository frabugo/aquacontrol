import useMetodosPago from '../../hooks/useMetodosPago';

function formatS(n) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);
}
function formatHora(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}
function formatFechaHora(dt) {
  if (!dt) return '—';
  const d = new Date(dt);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}
function formatFecha(d) {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d + 'T12:00:00') : new Date(d);
  return date.toLocaleDateString('es-PE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
}

export default function TicketCierre({ caja, saldos, onClose }) {
  const { metodos } = useMetodosPago();

  if (!caja) return null;

  const totalCobrado = metodos
    .filter(m => m.nombre !== 'credito')
    .reduce((s, m) => s + (saldos?.[m.nombre] ?? 0), 0);

  const credito = saldos?.credito ?? 0;

  function handlePrint() {
    window.print();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm print:hidden" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col print:max-w-none print:shadow-none print:rounded-none print:max-h-none print:h-auto">

        {/* Print styles */}
        <style>{`
          @media print {
            body > *:not(.fixed) { display: none !important; }
            .fixed { position: static !important; }
            .fixed > .absolute { display: none !important; }
            .fixed > .relative {
              max-width: 100% !important;
              max-height: none !important;
              box-shadow: none !important;
              border-radius: 0 !important;
              width: 80mm;
              margin: 0 auto;
              font-size: 11px;
            }
            .print\\:hidden { display: none !important; }
          }
        `}</style>

        {/* Header */}
        <div className="text-center px-6 pt-5 pb-3 border-b border-dashed border-slate-300">
          <h2 className="text-base font-bold text-slate-800 uppercase tracking-wide">AquaControl</h2>
          <p className="text-xs text-slate-500 mt-0.5">Cierre de Caja</p>
          <p className="text-xs text-slate-400 mt-1 capitalize">{formatFecha(caja.fecha)}</p>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 print:overflow-visible">

          {/* Info general */}
          <div className="space-y-1 text-xs text-slate-600">
            <div className="flex justify-between">
              <span>Apertura:</span>
              <span className="font-medium">{formatFechaHora(caja.hora_apertura)}</span>
            </div>
            <div className="flex justify-between">
              <span>Cierre:</span>
              <span className="font-medium">{formatFechaHora(caja.cerrada_en)}</span>
            </div>
            <div className="flex justify-between">
              <span>Abierta por:</span>
              <span className="font-medium">{caja.abierta_por_nombre || '—'}</span>
            </div>
            <div className="flex justify-between">
              <span>Cerrada por:</span>
              <span className="font-medium">{caja.cerrada_por_nombre || '—'}</span>
            </div>
          </div>

          <div className="border-t border-dashed border-slate-200" />

          {/* Tabla por método */}
          <div>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="py-1.5 font-semibold text-slate-600">Método</th>
                  <th className="py-1.5 font-semibold text-slate-600 text-right">Inicio</th>
                  <th className="py-1.5 font-semibold text-slate-600 text-right">Ing.</th>
                  <th className="py-1.5 font-semibold text-slate-600 text-right">Egr.</th>
                  <th className="py-1.5 font-semibold text-slate-600 text-right">Final</th>
                </tr>
              </thead>
              <tbody>
                {metodos.map(m => {
                  const saldoData = caja.saldos_map?.[m.nombre] || {};
                  const movData = caja.metodos_movimientos?.[m.nombre] || {};
                  const ini = Number(saldoData.saldo_ini ?? caja[`saldo_ini_${m.nombre}`]) || 0;
                  const ing = Number(movData.ing ?? caja[`ing_${m.nombre}`]) || 0;
                  const fin = saldos?.[m.nombre] ?? 0;
                  // Egresos: usar data directa si existe, sino deducir de ini+ing-fin
                  const egrRaw = movData.egr ?? caja[`egr_${m.nombre}`];
                  const egr = m.nombre === 'credito' ? 0
                    : (egrRaw != null ? Number(egrRaw) || 0 : Math.max(0, ini + ing - fin));

                  return (
                    <tr key={m.nombre} className="border-b border-slate-50">
                      <td className="py-1.5 text-slate-700 font-medium">{m.etiqueta}</td>
                      <td className="py-1.5 text-right tabular-nums text-slate-600">{formatS(ini)}</td>
                      <td className="py-1.5 text-right tabular-nums text-emerald-600">{formatS(ing)}</td>
                      <td className="py-1.5 text-right tabular-nums text-red-600">{formatS(egr)}</td>
                      <td className="py-1.5 text-right tabular-nums font-bold text-slate-800">{formatS(fin)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="border-t border-dashed border-slate-200" />

          {/* Totales */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-semibold text-slate-700">Total cobrado</span>
              <span className="text-lg font-bold text-slate-800">{formatS(totalCobrado)}</span>
            </div>
            {credito > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-slate-500">Crédito (por cobrar)</span>
                <span className="text-sm font-semibold text-amber-600">{formatS(credito)}</span>
              </div>
            )}
          </div>

          {/* Desglose origen si existe */}
          {(caja.totales_directo > 0 || caja.totales_repartidores_entregado > 0) && (
            <>
              <div className="border-t border-dashed border-slate-200" />
              <div className="space-y-1 text-xs text-slate-600">
                <p className="font-semibold text-slate-700 mb-1">Desglose por origen</p>
                <div className="flex justify-between">
                  <span>Planta (directo)</span>
                  <span className="font-medium">{formatS(caja.totales_directo)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Reparto entregado</span>
                  <span className="font-medium">{formatS(caja.totales_repartidores_entregado)}</span>
                </div>
              </div>
            </>
          )}

          {/* Observaciones */}
          {caja.observaciones_cierre && (
            <>
              <div className="border-t border-dashed border-slate-200" />
              <div>
                <p className="text-xs font-semibold text-slate-600 mb-0.5">Observaciones</p>
                <p className="text-xs text-slate-500">{caja.observaciones_cierre}</p>
              </div>
            </>
          )}

          <div className="border-t border-dashed border-slate-300 pt-2 text-center">
            <p className="text-xs text-slate-400">— Fin del cierre —</p>
          </div>
        </div>

        {/* Buttons (hidden on print) */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl shrink-0 print:hidden">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-white transition text-slate-600">
            Cerrar
          </button>
          <button type="button" onClick={handlePrint}
            className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Imprimir
          </button>
        </div>
      </div>
    </div>
  );
}
