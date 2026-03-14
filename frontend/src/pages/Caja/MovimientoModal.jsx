import { useEffect, useState } from 'react';
import { addMovimiento } from '../../services/cajaService';
import api from '../../services/api';
import useMetodosPago from '../../hooks/useMetodosPago';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

const METODO_BTN = {
  emerald: { active: 'border-emerald-500 bg-emerald-50 text-emerald-700', inactive: 'border-slate-200 text-slate-600 hover:border-slate-300' },
  purple:  { active: 'border-purple-500  bg-purple-50  text-purple-700',  inactive: 'border-slate-200 text-slate-600 hover:border-slate-300' },
  blue:    { active: 'border-blue-500    bg-blue-50    text-blue-700',    inactive: 'border-slate-200 text-slate-600 hover:border-slate-300' },
  orange:  { active: 'border-orange-500  bg-orange-50  text-orange-700',  inactive: 'border-slate-200 text-slate-600 hover:border-slate-300' },
  red:     { active: 'border-red-500     bg-red-50     text-red-700',     inactive: 'border-slate-200 text-slate-600 hover:border-slate-300' },
  amber:   { active: 'border-amber-500   bg-amber-50   text-amber-700',   inactive: 'border-slate-200 text-slate-600 hover:border-slate-300' },
  cyan:    { active: 'border-cyan-500    bg-cyan-50    text-cyan-700',    inactive: 'border-slate-200 text-slate-600 hover:border-slate-300' },
  pink:    { active: 'border-pink-500    bg-pink-50    text-pink-700',    inactive: 'border-slate-200 text-slate-600 hover:border-slate-300' },
  slate:   { active: 'border-slate-500   bg-slate-50   text-slate-700',   inactive: 'border-slate-200 text-slate-600 hover:border-slate-300' },
};

export default function MovimientoModal({ isOpen, onClose, onSaved }) {
  const { metodosPago: metodos } = useMetodosPago();
  const [tipo,        setTipo]        = useState('ingreso');
  const [metodo,      setMetodo]      = useState('efectivo');
  const [monto,       setMonto]       = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState('');
  const [categorias, setCategorias]   = useState([]);
  const [categoriaId, setCategoriaId] = useState('');

  useEffect(() => {
    if (isOpen) {
      setTipo('ingreso'); setMetodo('efectivo');
      setMonto(''); setDescripcion(''); setError('');
      setCategoriaId('');
      api.get('/config/categorias-caja').then(r => setCategorias(Array.isArray(r.data?.data) ? r.data.data : Array.isArray(r.data) ? r.data : [])).catch(() => setCategorias([]));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!monto || Number(monto) <= 0) return setError('El monto debe ser mayor a 0');
    if (!descripcion.trim())           return setError('La descripción es requerida');
    if (!categoriaId)                    return setError('Selecciona una categoría');

    setLoading(true);
    try {
      const mov = await addMovimiento({
        tipo,
        metodo_pago: metodo,
        monto:       parseFloat(monto),
        descripcion: descripcion.trim(),
        categoria_id: Number(categoriaId),
      });
      onSaved(mov);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrar el movimiento');
    } finally {
      setLoading(false);
    }
  }

  const isIngreso = tipo === 'ingreso';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-base font-semibold text-slate-800">Movimiento manual</h2>
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

          {/* Tipo toggle */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'ingreso', label: '+ Ingreso', cls: isIngreso ? 'border-green-500 bg-green-50 text-green-700' : 'border-slate-200 text-slate-600 hover:border-slate-300' },
              { value: 'egreso',  label: '− Egreso',  cls: !isIngreso ? 'border-red-500   bg-red-50   text-red-700'   : 'border-slate-200 text-slate-600 hover:border-slate-300' },
            ].map(({ value, label, cls }) => (
              <button key={value} type="button" onClick={() => setTipo(value)}
                className={`py-2.5 rounded-xl border text-sm font-semibold transition ${cls}`}>
                {label}
              </button>
            ))}
          </div>

          {/* Método de pago */}
          <div>
            <p className="text-xs font-medium text-slate-600 mb-2">Método</p>
            <div className="grid grid-cols-2 gap-2">
              {metodos.map(m => {
                const cls = METODO_BTN[m.color] || METODO_BTN.slate;
                return (
                  <button key={m.nombre} type="button" onClick={() => setMetodo(m.nombre)}
                    className={`py-2 rounded-xl border text-xs font-medium transition ${metodo === m.nombre ? cls.active : cls.inactive}`}>
                    {m.etiqueta}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Categoria */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Categoría *</label>
            <select value={categoriaId} onChange={e => setCategoriaId(e.target.value)}
              className={inputCls} required>
              <option value="">Seleccionar...</option>
              {categorias.filter(cat => cat.tipo === tipo && cat.activo).map(cat => (
                <option key={cat.id} value={cat.id}>{cat.nombre}</option>
              ))}
            </select>
          </div>

          {/* Monto */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Monto (S/)</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">S/</span>
              <input
                type="number" min="0.01" step="0.000001" required
                className={`${inputCls} pl-8`}
                value={monto} onChange={e => setMonto(e.target.value)}
                placeholder="0.00" autoFocus
              />
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Descripción *</label>
            <input
              className={inputCls} required
              value={descripcion} onChange={e => setDescripcion(e.target.value)}
              placeholder={isIngreso ? 'ej. Cobro deuda cliente…' : 'ej. Compra de materiales…'}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className={`flex-1 px-4 py-2 text-sm font-semibold text-white rounded-lg transition flex items-center justify-center gap-2
                ${isIngreso
                  ? 'bg-green-600 hover:bg-green-700 disabled:bg-green-400'
                  : 'bg-red-600   hover:bg-red-700   disabled:bg-red-400'}`}>
              {loading && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              Registrar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
