import { useEffect, useState } from 'react';
import { crearCliente, actualizarCliente } from '../../services/clientesService';
import { consultarDni, consultarRuc } from '../../services/configService';

const EMPTY = {
  nombre: '', dni: '', telefono: '', direccion: '', latitud: '', longitud: '',
  tipo: 'menudeo',
  precio_recarga_con_bidon: '', precio_recarga_sin_bidon: '',
  precio_bidon_lleno: '', credito_maximo: '', notas: '', ubigeo: '',
};

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
    </div>
  );
}

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

export default function ClienteModal({ isOpen, onClose, cliente, onSaved }) {
  const isEdit = Boolean(cliente?.id);
  const [form,    setForm]    = useState(EMPTY);
  const [loading, setLoading]       = useState(false);
  const [error,   setError]         = useState('');
  const [dniLoading, setDniLoading] = useState(false);
  const [rucLoading, setRucLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setError('');
      setForm(isEdit ? {
        nombre:                   cliente.nombre                   ?? '',
        dni:                      cliente.dni                      ?? '',
        telefono:                 cliente.telefono                 ?? '',
        direccion:                cliente.direccion                ?? '',
        latitud:                  cliente.latitud                  ?? '',
        longitud:                 cliente.longitud                 ?? '',
        tipo:                     cliente.tipo                     ?? 'menudeo',
        precio_recarga_con_bidon: cliente.precio_recarga_con_bidon ?? '',
        precio_recarga_sin_bidon: cliente.precio_recarga_sin_bidon ?? '',
        precio_bidon_lleno:       cliente.precio_bidon_lleno       ?? '',
        credito_maximo:           cliente.credito_maximo           ?? '',
        notas:                    cliente.notas                    ?? '',
        ubigeo:                   cliente.ubigeo                   ?? '',
      } : EMPTY);
    }
  }, [isOpen, cliente]);

  if (!isOpen) return null;

  function set(field) {
    return e => setForm(f => ({ ...f, [field]: e.target.value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const payload = {
        ...form,
        latitud:                  form.latitud ? parseFloat(form.latitud) : null,
        longitud:                 form.longitud ? parseFloat(form.longitud) : null,
        precio_recarga_con_bidon: parseFloat(form.precio_recarga_con_bidon) || 0,
        precio_recarga_sin_bidon: parseFloat(form.precio_recarga_sin_bidon) || 0,
        precio_bidon_lleno:       parseFloat(form.precio_bidon_lleno)       || 0,
        credito_maximo:           parseFloat(form.credito_maximo)           || 0,
      };
      const saved = isEdit
        ? await actualizarCliente(cliente.id, payload)
        : await crearCliente(payload);
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
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-lg font-semibold text-slate-800">
            {isEdit ? 'Editar cliente' : 'Nuevo cliente'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form wraps scrollable body + footer */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          {/* Body */}
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
                {error}
              </div>
            )}

            {/* Datos básicos */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Datos básicos</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Nombre *">
                  <input required className={inputCls} value={form.nombre}
                    onChange={set('nombre')} placeholder="Nombre completo" />
                </Field>
                <Field label="DNI / RUC">
                  <div className="flex gap-1.5">
                    <input className={`${inputCls} flex-1`} value={form.dni}
                      onChange={e => setForm(f => ({ ...f, dni: e.target.value.replace(/\D/g, '').slice(0, 11) }))} placeholder="12345678" maxLength={11} />
                    {/^\d{8}$/.test(form.dni) && (
                      <button type="button" disabled={dniLoading}
                        onClick={async () => {
                          setDniLoading(true);
                          try {
                            const r = await consultarDni(form.dni);
                            setForm(f => ({ ...f, nombre: r.data.nombre_completo }));
                          } catch { /* silent */ }
                          setDniLoading(false);
                        }}
                        className="px-2.5 py-1.5 text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition whitespace-nowrap">
                        {dniLoading ? '...' : 'Completar'}
                      </button>
                    )}
                    {/^\d{11}$/.test(form.dni) && (
                      <button type="button" disabled={rucLoading}
                        onClick={async () => {
                          setRucLoading(true);
                          try {
                            const r = await consultarRuc(form.dni);
                            setForm(f => ({
                              ...f,
                              nombre: r.data.nombre_o_razon_social,
                              direccion: r.data.direccion || '',
                              ubigeo: String(r.data.ubigeo || '').split(',').pop().trim(),
                            }));
                          } catch { /* silent */ }
                          setRucLoading(false);
                        }}
                        className="px-2.5 py-1.5 text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition whitespace-nowrap">
                        {rucLoading ? '...' : 'Completar'}
                      </button>
                    )}
                  </div>
                </Field>
                <Field label="Teléfono">
                  <input className={inputCls} value={form.telefono}
                    onChange={set('telefono')} placeholder="999 999 999" />
                </Field>
                <Field label="Tipo de cliente">
                  <select className={inputCls} value={form.tipo} onChange={set('tipo')}>
                    <option value="menudeo">Menudeo</option>
                    <option value="mayoreo">Mayoreo</option>
                    <option value="especial">Especial</option>
                  </select>
                </Field>
                <Field label="Dirección">
                  <input className={inputCls} value={form.direccion}
                    onChange={set('direccion')} placeholder="Dirección de entrega" />
                </Field>
                <Field label="Ubigeo" hint="Se completa al consultar RUC">
                  <input className={`${inputCls} bg-slate-50`} value={form.ubigeo}
                    readOnly placeholder="—" />
                </Field>
                <Field label="Latitud">
                  <input type="number" step="any" className={inputCls} value={form.latitud}
                    onChange={set('latitud')} placeholder="-12.0463731" />
                </Field>
                <Field label="Longitud">
                  <input type="number" step="any" className={inputCls} value={form.longitud}
                    onChange={set('longitud')} placeholder="-77.0427934" />
                </Field>
                <Field label="Crédito máximo (S/)" hint="0 = sin límite de crédito">
                  <input type="number" min="0" step="0.01" className={inputCls}
                    value={form.credito_maximo} onChange={set('credito_maximo')} placeholder="0.00" />
                </Field>
              </div>
            </div>

            {/* Precios */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Precios (S/)</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Recarga con devolución" hint="Cliente devuelve bidón vacío">
                  <input type="number" min="0" step="0.01" className={inputCls}
                    value={form.precio_recarga_con_bidon} onChange={set('precio_recarga_con_bidon')} placeholder="0.00" />
                </Field>
                <Field label="Recarga en préstamo" hint="Cliente queda con el bidón">
                  <input type="number" min="0" step="0.01" className={inputCls}
                    value={form.precio_recarga_sin_bidon} onChange={set('precio_recarga_sin_bidon')} placeholder="0.00" />
                </Field>
                <Field label="Bidón lleno (compra)" hint="Compra bidón + agua">
                  <input type="number" min="0" step="0.01" className={inputCls}
                    value={form.precio_bidon_lleno} onChange={set('precio_bidon_lleno')} placeholder="0.00" />
                </Field>
              </div>
            </div>

            {/* Notas */}
            <Field label="Notas internas">
              <textarea rows={2} className={inputCls} value={form.notas}
                onChange={set('notas')} placeholder="Observaciones, horario de entrega, etc." />
            </Field>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-100 transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition flex items-center gap-2"
            >
              {loading && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              {isEdit ? 'Guardar cambios' : 'Crear cliente'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
