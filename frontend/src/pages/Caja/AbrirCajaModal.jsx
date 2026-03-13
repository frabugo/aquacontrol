import { useEffect, useState } from 'react';
import { abrirCaja, previewApertura } from '../../services/cajaService';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

export default function AbrirCajaModal({ isOpen, onClose, onOpened }) {
  const [saldo,       setSaldo]       = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [arrastres,   setArrastres]   = useState([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setObservaciones(''); setError('');
      setLoadingPreview(true);
      previewApertura()
        .then(res => {
          const data = res.data || [];
          setArrastres(data);
          const ef = data.find(a => a.nombre === 'efectivo');
          setSaldo(ef && ef.arrastra_saldo && ef.saldo_ini > 0 ? String(ef.saldo_ini) : '');
        })
        .catch(() => { setArrastres([]); setSaldo(''); })
        .finally(() => setLoadingPreview(false));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const conArrastre = arrastres.filter(a => a.arrastra_saldo && a.saldo_ini > 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const caja = await abrirCaja({
        saldo_ini_efectivo: parseFloat(saldo) || 0,
        observaciones: observaciones.trim() || undefined,
      });
      onOpened(caja);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al abrir la caja');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
            <h2 className="text-base font-semibold text-slate-800">Abrir caja</h2>
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
          )}

          {/* Saldos que se arrastran */}
          {!loadingPreview && conArrastre.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wider mb-2">Saldos de caja anterior</p>
              <div className="space-y-1.5">
                {conArrastre.map(a => (
                  <div key={a.nombre} className="flex justify-between text-sm">
                    <span className="text-blue-600">{a.etiqueta}</span>
                    <span className="font-semibold text-blue-800">S/ {Number(a.saldo_ini).toFixed(2)}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-blue-500 mt-2">Estos montos se arrastran automaticamente</p>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Efectivo en caja al inicio (S/)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">S/</span>
              <input
                type="number" min="0" step="0.01"
                className={`${inputCls} pl-8`}
                value={saldo}
                onChange={e => setSaldo(e.target.value)}
                placeholder="0.00"
                autoFocus
              />
            </div>
            <p className="text-xs text-slate-400 mt-1">Dinero fisico contado antes de iniciar ventas</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Observaciones (opcional)</label>
            <textarea rows={2} className={inputCls}
              value={observaciones} onChange={e => setObservaciones(e.target.value)}
              placeholder="Notas de apertura..." />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 rounded-lg transition flex items-center justify-center gap-2">
              {loading && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              Abrir caja
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
