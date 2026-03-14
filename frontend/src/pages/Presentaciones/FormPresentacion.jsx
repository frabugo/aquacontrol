import { useEffect, useState } from 'react';
import { crearPresentacion, actualizarPresentacion } from '../../services/presentacionesService';

const EMPTY = {
  nombre: '', descripcion: '', tipo: 'agua', unidad: 'unidad',
  precio_base: '', stock_minimo: '', es_producto_final: false, es_retornable: false,
  stock_llenos: '', stock_vacios: '', activo: true,
};

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}

export default function FormPresentacion({ isOpen, onClose, presentacion, onSaved }) {
  const isEdit = Boolean(presentacion?.id);
  const [form,    setForm]    = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (isOpen) {
      setError('');
      setForm(isEdit ? {
        nombre:            presentacion.nombre            ?? '',
        descripcion:       presentacion.descripcion       ?? '',
        tipo:              presentacion.tipo              ?? 'agua',
        unidad:            presentacion.unidad            ?? 'unidad',
        precio_base:       presentacion.precio_base       ?? '',
        stock_minimo:      presentacion.stock_minimo      ?? '',
        es_producto_final: Boolean(presentacion.es_producto_final),
        es_retornable:     Boolean(presentacion.es_retornable),
        stock_llenos:      presentacion.stock_llenos      ?? '',
        stock_vacios:      presentacion.stock_vacios      ?? '',
        activo:            Boolean(presentacion.activo ?? 1),
      } : EMPTY);
    }
  }, [isOpen, presentacion]);

  if (!isOpen) return null;

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  function setCheck(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.checked }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = {
        ...form,
        precio_base:       parseFloat(form.precio_base)  || 0,
        stock_minimo:      parseInt(form.stock_minimo)   || 0,
        es_producto_final: form.es_producto_final ? 1 : 0,
        es_retornable:     form.es_producto_final ? 0 : (form.es_retornable ? 1 : 0),
        activo:            form.activo ? 1 : 0,
        stock_llenos:      form.es_retornable && !form.es_producto_final ? parseInt(form.stock_llenos) || 0 : 0,
        stock_vacios:      form.es_retornable && !form.es_producto_final ? parseInt(form.stock_vacios) || 0 : 0,
      };
      const saved = isEdit
        ? await actualizarPresentacion(presentacion.id, payload)
        : await crearPresentacion(payload);
      onSaved(saved, isEdit);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-lg font-semibold text-slate-800">
            {isEdit ? 'Editar presentación' : 'Nueva presentación'}
          </h2>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
            )}

            {/* Datos básicos */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Datos básicos</p>
              <div className="space-y-3">
                <Field label="Nombre *">
                  <input required className={inputCls} value={form.nombre}
                    onChange={set('nombre')} placeholder="ej. Bidón 20L" />
                </Field>
                <Field label="Descripción">
                  <input className={inputCls} value={form.descripcion}
                    onChange={set('descripcion')} placeholder="Descripción opcional" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Tipo">
                    <select className={inputCls} value={form.tipo} onChange={set('tipo')}>
                      <option value="agua">Agua</option>
                      <option value="hielo">Hielo</option>
                      <option value="otro">Otro</option>
                    </select>
                  </Field>
                  <Field label="Unidad">
                    <select className={inputCls} value={form.unidad} onChange={set('unidad')}>
                      <option value="unidad">Unidad</option>
                      <option value="bolsa">Bolsa</option>
                      <option value="kg">Kg</option>
                      <option value="caja">Caja</option>
                    </select>
                  </Field>
                  <Field label="Precio base (S/)">
                    <input type="number" min="0" step="0.000001" className={inputCls}
                      value={form.precio_base} onChange={set('precio_base')} placeholder="0.00" />
                  </Field>
                  <Field label="Stock mínimo">
                    <input type="number" min="0" step="1" className={inputCls}
                      value={form.stock_minimo} onChange={set('stock_minimo')} placeholder="0" />
                  </Field>
                </div>
              </div>
            </div>

            {/* Producto final / Retornable */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Control de stock</p>
              <div className="space-y-3">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.es_producto_final}
                    onChange={e => setForm(f => ({ ...f, es_producto_final: e.target.checked, ...(e.target.checked ? { es_retornable: false } : {}) }))}
                    className="mt-0.5 w-4 h-4 rounded accent-orange-500" />
                  <div>
                    <span className="text-sm font-medium text-slate-800">Es producto final</span>
                    <p className="text-xs text-slate-400 mt-0.5">Se compra listo para vender. No requiere producción.</p>
                  </div>
                </label>

                <label className={`flex items-start gap-3 ${form.es_producto_final ? 'opacity-40 pointer-events-none' : 'cursor-pointer'}`}>
                  <input type="checkbox" checked={form.es_retornable} onChange={setCheck('es_retornable')}
                    disabled={form.es_producto_final}
                    className="mt-0.5 w-4 h-4 rounded accent-blue-600" />
                  <div>
                    <span className="text-sm font-medium text-slate-800">Es retornable</span>
                    <p className="text-xs text-slate-400 mt-0.5">Requiere seguimiento de bidones prestados</p>
                  </div>
                </label>
              </div>

              {form.es_retornable && (
                <div className="mt-3 space-y-3">
                  {/* Aviso */}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm text-blue-800">
                    <p className="font-medium mb-1">Este producto llevará control de:</p>
                    <p className="text-xs text-blue-600">
                      Llenos · Vacíos · Rotos · En lavado · En reparación · Perdidos · Dados de baja
                    </p>
                  </div>
                  {!isEdit && (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Stock llenos (inicial)" hint="Bidones llenos disponibles hoy">
                        <input type="number" min="0" step="1" className={inputCls}
                          value={form.stock_llenos} onChange={set('stock_llenos')} placeholder="0" />
                      </Field>
                      <Field label="Stock vacíos (inicial)" hint="Bidones vacíos en planta hoy">
                        <input type="number" min="0" step="1" className={inputCls}
                          value={form.stock_vacios} onChange={set('stock_vacios')} placeholder="0" />
                      </Field>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Estado — solo en edición */}
            {isEdit && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Estado</p>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={form.activo} onChange={setCheck('activo')}
                    className="w-4 h-4 rounded accent-blue-600" />
                  <span className="text-sm text-slate-700">Activo (visible en el sistema)</span>
                </label>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl shrink-0">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-100 transition">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition flex items-center gap-2">
              {loading && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              {isEdit ? 'Guardar cambios' : 'Crear presentación'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
