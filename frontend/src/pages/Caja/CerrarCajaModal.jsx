import { useEffect, useState } from 'react';
import { cerrarCaja } from '../../services/cajaService';
import useMetodosPago from '../../hooks/useMetodosPago';
import TicketCierre from './TicketCierre';

function formatS(n) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);
}

const COLOR = {
  emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  purple:  'bg-purple-50  border-purple-200  text-purple-700',
  blue:    'bg-blue-50    border-blue-200    text-blue-700',
  orange:  'bg-orange-50  border-orange-200  text-orange-700',
  red:     'bg-red-50     border-red-200     text-red-700',
  amber:   'bg-amber-50   border-amber-200   text-amber-700',
  cyan:    'bg-cyan-50    border-cyan-200    text-cyan-700',
  pink:    'bg-pink-50    border-pink-200    text-pink-700',
  slate:   'bg-slate-50   border-slate-200   text-slate-700',
};

export default function CerrarCajaModal({ isOpen, onClose, saldos, caja, onClosed, cajasPendientes = [] }) {
  const { metodos } = useMetodosPago();
  const [observaciones, setObservaciones] = useState('');
  const [loading,       setLoading]       = useState(false);
  const [error,         setError]         = useState('');
  const [cajaCerrada,   setCajaCerrada]   = useState(null);

  useEffect(() => {
    if (isOpen) { setObservaciones(''); setError(''); setCajaCerrada(null); }
  }, [isOpen]);

  if (!isOpen || !caja) return null;

  async function handleCerrar() {
    setError('');
    setLoading(true);
    try {
      const updated = await cerrarCaja({ observaciones: observaciones.trim() || undefined });
      onClosed(updated);
      setCajaCerrada(updated);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cerrar la caja');
    } finally {
      setLoading(false);
    }
  }

  const total = metodos.filter(m => m.nombre !== 'credito').reduce((s, m) => s + (saldos?.[m.nombre] ?? 0), 0);

  /* ── Ticket post-cierre ── */
  if (cajaCerrada) {
    // Compute final saldos from the closed caja
    const saldosFin = {};
    const sMap = cajaCerrada.saldos_map || {};
    for (const m of metodos) {
      const sd = sMap[m.nombre] || {};
      if (sd.saldo_fin != null) {
        saldosFin[m.nombre] = Number(sd.saldo_fin);
      } else if (cajaCerrada[`saldo_fin_${m.nombre}`] != null) {
        saldosFin[m.nombre] = Number(cajaCerrada[`saldo_fin_${m.nombre}`]);
      } else {
        saldosFin[m.nombre] = saldos?.[m.nombre] ?? 0;
      }
    }
    return <TicketCierre caja={cajaCerrada} saldos={saldosFin} onClose={onClose} />;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800">Resumen de cierre</h2>
              <p className="text-xs text-slate-400">Verifica los saldos antes de cerrar</p>
            </div>
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
          )}

          {cajasPendientes.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
              <p className="text-sm font-semibold text-amber-800">No se puede cerrar</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Hay {cajasPendientes.length} caja{cajasPendientes.length > 1 ? 's' : ''} sin entregar:
                {' '}<span className="font-medium">{cajasPendientes.map(r => r.repartidor_nombre).join(', ')}</span>
              </p>
            </div>
          )}

          {/* Saldo cards */}
          <div className="grid grid-cols-2 gap-3">
            {metodos.map(m => (
              <div key={m.nombre} className={`border rounded-xl px-4 py-3 ${COLOR[m.color] || COLOR.slate}`}>
                <p className="text-xs font-medium opacity-70 mb-1">{m.etiqueta}</p>
                <p className="text-lg font-bold">{formatS(saldos?.[m.nombre] ?? 0)}</p>
                {m.nombre === 'credito' && (
                  <p className="text-xs opacity-60 mt-0.5">Por cobrar</p>
                )}
              </div>
            ))}
          </div>

          {/* Total cash */}
          <div className="bg-slate-800 rounded-xl px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-slate-300">Total efectivo + digital</span>
            <span className="text-xl font-bold text-white">{formatS(total)}</span>
          </div>

          {/* Observaciones */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Observaciones del cierre (opcional)</label>
            <textarea rows={2}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800 placeholder-slate-400
                focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              value={observaciones}
              onChange={e => setObservaciones(e.target.value)}
              placeholder="Notas finales del día…"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl shrink-0">
          <button type="button" onClick={onClose}
            className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-white transition text-slate-600">
            Cancelar
          </button>
          <button type="button" onClick={handleCerrar} disabled={loading || cajasPendientes.length > 0}
            className={`flex-1 px-4 py-2 text-sm font-semibold rounded-lg transition flex items-center justify-center gap-2 ${
              cajasPendientes.length > 0
                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                : 'text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400'
            }`}>
            {loading && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            )}
            Confirmar cierre
          </button>
        </div>
      </div>
    </div>
  );
}
