import { useCallback, useEffect, useRef, useState } from 'react';
import Layout from '../../components/Layout';
import {
  listarCompras, crearCompra, anularCompra,
  deudasProveedores, comprasDeProveedor, historialPagosProveedor,
  registrarPagoProveedor, anularPagoProveedor,
} from '../../services/comprasService';
import useCajaAbierta from '../../hooks/useCajaAbierta';
import useMetodosPago from '../../hooks/useMetodosPago';
import { listarInsumos } from '../../services/insumosService';
import { listarPresentaciones } from '../../services/presentacionesService';
import { listarProveedores, crearProveedor } from '../../services/proveedoresService';
import BuscadorConCrear from '../../components/BuscadorConCrear';
import { consultarRuc } from '../../services/configService';
import { exportarCompras } from '../../services/reportesService';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function formatS(n) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);
}
function formatFechaHora(dt) {
  if (!dt) return '';
  const d = new Date(dt);
  return d.toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })
    + ' ' + d.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
}

const ESTADO_BADGE = {
  recibida:  { cls: 'bg-green-100 text-green-700',  label: 'Recibida'  },
  pendiente: { cls: 'bg-yellow-100 text-yellow-700', label: 'Pendiente' },
  anulada:   { cls: 'bg-slate-100 text-slate-400',   label: 'Anulada'  },
};

function newItem(id) {
  return { id, tipo_item: 'insumo', insumo_id: '', presentacion_id: '', cantidad: '', precio_unitario: '' };
}

/* ── Modal Nueva Compra ── */
function NuevaCompraModal({ isOpen, onClose, onSaved }) {
  const [insumos,        setInsumos]        = useState([]);
  const [presentaciones, setPresentaciones] = useState([]);
  const [proveedor, setProveedor] = useState(null);
  const [fecha,        setFecha]       = useState(today());
  const [notas,        setNotas]       = useState('');
  const [items,        setItems]       = useState(() => [newItem(1)]);
  const nextId = useRef(2);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  useEffect(() => {
    if (isOpen) {
      setProveedor(null); setFecha(today()); setNotas('');
      setItems([newItem(1)]); nextId.current = 2; setError('');
      listarInsumos({ activo: 1 }).then(r => setInsumos(Array.isArray(r.data) ? r.data : [])).catch(() => {});
      listarPresentaciones({ activo: 1, limit: 100 }).then(r => setPresentaciones(Array.isArray(r.data) ? r.data : [])).catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  function updateItem(id, patch) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...patch } : it));
  }
  function addItem() { setItems(prev => [...prev, newItem(nextId.current++)]); }
  function removeItem(id) { setItems(prev => prev.length > 1 ? prev.filter(it => it.id !== id) : prev); }

  const total = items.reduce((s, it) => s + (Number(it.precio_unitario) * Number(it.cantidad) || 0), 0);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    for (const it of items) {
      if (it.tipo_item === 'insumo'        && !it.insumo_id)       return setError('Selecciona un insumo en cada línea');
      if (it.tipo_item === 'presentacion'  && !it.presentacion_id) return setError('Selecciona una presentación en cada línea');
      if (!it.cantidad || Number(it.cantidad) <= 0)                return setError('La cantidad debe ser mayor a 0');
    }
    setLoading(true);
    try {
      const result = await crearCompra({
        proveedor_id: proveedor?.id || null,
        fecha,
        notas: notas.trim() || null,
        items: items.map(it => ({
          tipo_item:       it.tipo_item,
          insumo_id:       it.tipo_item === 'insumo'       ? Number(it.insumo_id)       : null,
          presentacion_id: it.tipo_item === 'presentacion' ? Number(it.presentacion_id) : null,
          cantidad:        Number(it.cantidad),
          precio_unitario: Number(it.precio_unitario),
        })),
      });
      onSaved(result);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrar compra');
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[95vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-lg font-semibold text-slate-800">Nueva compra</h2>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
            {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Proveedor</label>
                <BuscadorConCrear
                  placeholder="Buscar proveedor…"
                  value={proveedor}
                  onChange={setProveedor}
                  onSearch={q => listarProveedores({ q, limit: 10 }).then(r => Array.isArray(r.data) ? r.data : [])}
                  onCreate={crearProveedor}
                  createTitle="Nuevo proveedor"
                  createFields={[
                    { key: 'nombre', label: 'Nombre', required: true, wide: true },
                    { key: 'ruc', label: 'RUC', maxLength: 11, transform: v => v.replace(/\D/g, '').slice(0, 11), action: {
                      label: 'Completar',
                      show: v => /^\d{11}$/.test(v || ''),
                      onClick: async (v) => {
                        const r = await consultarRuc(v);
                        return { nombre: r.data.nombre_o_razon_social, direccion: r.data.direccion || '', ubigeo: String(r.data.ubigeo || '').split(',').pop().trim() };
                      },
                    }},
                    { key: 'telefono', label: 'Teléfono' },
                    { key: 'email', label: 'Email', type: 'email' },
                    { key: 'contacto', label: 'Contacto' },
                    { key: 'direccion', label: 'Dirección' },
                    { key: 'ubigeo', label: 'Ubigeo', readOnly: true, placeholder: '—', hint: 'Se completa al consultar RUC' },
                    { key: 'notas', label: 'Notas', type: 'textarea', wide: true, placeholder: 'Observaciones...' },
                  ]}
                  renderOption={pv => (
                    <>
                      <span style={{ fontWeight: 500, color: '#1e293b' }}>{pv.nombre}</span>
                      {pv.ruc && <span style={{ color: '#94a3b8', fontSize: '12px' }}>{pv.ruc}</span>}
                    </>
                  )}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Fecha</label>
                <input type="date" className={inputCls} value={fecha} onChange={e => setFecha(e.target.value)} />
              </div>
            </div>

            {/* Ítems */}
            <div>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Ítems</p>
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div key={it.id} className="border border-slate-200 rounded-xl p-3 bg-slate-50/50 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-slate-500">Ítem {idx + 1}</span>
                      {items.length > 1 && (
                        <button type="button" onClick={() => removeItem(it.id)}
                          className="w-5 h-5 rounded-full flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="col-span-2">
                        <select className={inputCls} value={it.tipo_item} onChange={e => updateItem(it.id, { tipo_item: e.target.value, insumo_id: '', presentacion_id: '' })}>
                          <option value="insumo">Insumo</option>
                          <option value="presentacion">Envase / presentación</option>
                        </select>
                      </div>
                      <div className="col-span-2">
                        {it.tipo_item === 'insumo' ? (
                          <select className={inputCls} value={it.insumo_id} onChange={e => updateItem(it.id, { insumo_id: e.target.value })} required>
                            <option value="">Seleccionar…</option>
                            {insumos.map(i => <option key={i.id} value={i.id}>{i.nombre}</option>)}
                          </select>
                        ) : (
                          <select className={inputCls} value={it.presentacion_id} onChange={e => updateItem(it.id, { presentacion_id: e.target.value })} required>
                            <option value="">Seleccionar…</option>
                            {presentaciones.filter(p => p.es_retornable || p.es_producto_final).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                          </select>
                        )}
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-0.5">Cantidad</label>
                        <input type="number" min="0.01" step="0.000001" className={inputCls} value={it.cantidad} onChange={e => updateItem(it.id, { cantidad: e.target.value })} placeholder="0" required />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-500 mb-0.5">Precio unit. (S/)</label>
                        <input type="number" min="0" step="0.000001" className={inputCls} value={it.precio_unitario} onChange={e => updateItem(it.id, { precio_unitario: e.target.value })} placeholder="0.00" />
                      </div>
                      <div className="flex items-end">
                        <div className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-2 text-right">
                          <div className="text-xs text-slate-400">Subtotal</div>
                          <div className="text-sm font-bold text-slate-800">
                            {formatS((Number(it.precio_unitario) || 0) * (Number(it.cantidad) || 0))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={addItem}
                className="mt-2 flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                Agregar ítem
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Notas (opcional)</label>
              <textarea rows={2} className={inputCls} value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones de la compra…" />
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl shrink-0">
            <div className="text-right">
              <span className="text-xs text-slate-400">TOTAL COMPRA</span>
              <div className="text-xl font-bold text-slate-800">{formatS(total)}</div>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-white transition">Cancelar</button>
              <button type="submit" disabled={loading} className="px-6 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition">
                {loading ? 'Registrando…' : 'Registrar compra'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Modal Pagar Proveedor ── */
function PagarProveedorModal({ proveedor, onClose, onPaid, cajaAbierta }) {
  const { metodosAbono } = useMetodosPago();
  const [compras, setCompras]   = useState([]);
  const [pagos, setPagos]       = useState([]);
  const [loading, setLoading]   = useState(true);

  const [monto, setMonto]       = useState('');
  const [metodo, setMetodo]     = useState('efectivo');
  const [compraId, setCompraId] = useState('');
  const [notas, setNotas]       = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState('');
  const [saldoActual, setSaldoActual] = useState(Number(proveedor.saldo_deuda));

  useEffect(() => {
    Promise.all([
      comprasDeProveedor(proveedor.id),
      historialPagosProveedor(proveedor.id),
    ]).then(([c, p]) => {
      setCompras(c.data || []);
      setPagos(p.data || []);
    }).catch(() => {})
      .finally(() => setLoading(false));
  }, [proveedor.id]);

  // Auto-fill monto when selecting a compra
  function handleCompraSelect(val) {
    setCompraId(val);
    if (val) {
      const c = compras.find(x => String(x.id) === val);
      if (c) setMonto(String(c.saldo_pendiente));
    } else {
      setMonto('');
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!monto || Number(monto) <= 0) return setError('Ingrese un monto válido');
    if (!cajaAbierta) return setError('No hay caja abierta');
    setError(''); setSubmitting(true);
    try {
      const res = await registrarPagoProveedor({
        proveedor_id: proveedor.id,
        compra_id: compraId || null,
        monto: Number(monto),
        metodo_pago: metodo,
        notas: notas.trim() || null,
      });
      setSaldoActual(res.saldo_actualizado);
      setPagos(prev => [res.pago, ...prev]);
      const c = await comprasDeProveedor(proveedor.id);
      setCompras(c.data || []);
      setMonto(''); setNotas(''); setCompraId('');
      onPaid(res.saldo_actualizado);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrar pago');
    } finally { setSubmitting(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Pagar a {proveedor.nombre}</h2>
            <p className="text-sm text-slate-500">
              Deuda pendiente: <span className="font-bold text-red-600">{formatS(saldoActual)}</span>
              {proveedor.ruc && <span className="ml-2 text-slate-400">RUC: {proveedor.ruc}</span>}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

          {/* Form registrar pago */}
          {cajaAbierta && saldoActual > 0 && (
            <form onSubmit={handleSubmit} className="bg-orange-50 border border-orange-200 rounded-xl p-4">
              <p className="text-sm font-semibold text-orange-800 mb-3">Registrar pago</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Monto (S/) *</label>
                  <input type="number" min="0.01" step="0.000001" required className={inputCls}
                    value={monto} onChange={e => setMonto(e.target.value)} placeholder="0.00" />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Método *</label>
                  <select className={inputCls} value={metodo} onChange={e => setMetodo(e.target.value)}>
                    {metodosAbono.map(m => (
                      <option key={m.nombre} value={m.nombre}>{m.etiqueta}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Compra (opcional)</label>
                  <select className={inputCls} value={compraId} onChange={e => handleCompraSelect(e.target.value)}>
                    <option value="">Pago general</option>
                    {compras.filter(c => c.saldo_pendiente > 0).map(c => (
                      <option key={c.id} value={c.id}>#{c.numero} — {formatS(c.saldo_pendiente)}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end">
                  <button type="submit" disabled={submitting}
                    className="w-full px-4 py-2 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 rounded-lg transition">
                    {submitting ? 'Registrando...' : 'Registrar pago'}
                  </button>
                </div>
              </div>
              <div className="mt-2">
                <input className={`${inputCls} text-xs`} value={notas} onChange={e => setNotas(e.target.value)}
                  placeholder="Notas del pago (opcional)" />
              </div>
            </form>
          )}

          {!cajaAbierta && (
            <div className="bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-4 py-3 text-sm">
              Abre la caja para registrar pagos a proveedores.
            </div>
          )}

          {/* Compras del proveedor */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Compras pendientes de pago</h3>
            {loading ? (
              <p className="text-sm text-slate-400">Cargando...</p>
            ) : compras.filter(c => c.saldo_pendiente > 0).length === 0 ? (
              <p className="text-sm text-slate-400">Sin compras pendientes de pago</p>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
                      <th className="px-4 py-2">N° Compra</th>
                      <th className="px-4 py-2">Fecha</th>
                      <th className="px-4 py-2 text-right">Total</th>
                      <th className="px-4 py-2 text-right">Pagado</th>
                      <th className="px-4 py-2 text-right">Pendiente</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {compras.filter(c => c.saldo_pendiente > 0).map(c => (
                      <tr key={c.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 font-mono text-xs">{c.numero}</td>
                        <td className="px-4 py-2 text-xs text-slate-500">{c.fecha}</td>
                        <td className="px-4 py-2 text-right tabular-nums">{formatS(c.total)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-green-600">{formatS(c.total_pagado)}</td>
                        <td className="px-4 py-2 text-right tabular-nums font-bold text-red-600">{formatS(c.saldo_pendiente)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Historial de pagos */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2">Historial de pagos</h3>
            {loading ? (
              <p className="text-sm text-slate-400">Cargando...</p>
            ) : pagos.length === 0 ? (
              <p className="text-sm text-slate-400">Sin pagos registrados</p>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
                      <th className="px-4 py-2">Fecha</th>
                      <th className="px-4 py-2">Método</th>
                      <th className="px-4 py-2 text-right">Monto</th>
                      <th className="px-4 py-2">Compra</th>
                      <th className="px-4 py-2">Estado</th>
                      <th className="px-4 py-2">Registrado por</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagos.map(p => {
                      const anulado = p.estado === 'anulado';
                      return (
                        <tr key={p.id} className={anulado ? 'opacity-50' : 'hover:bg-slate-50'}>
                          <td className="px-4 py-2 text-xs text-slate-500">{formatFechaHora(p.fecha_hora)}</td>
                          <td className="px-4 py-2">
                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 capitalize">{p.metodo_pago}</span>
                          </td>
                          <td className={`px-4 py-2 text-right tabular-nums font-semibold ${anulado ? 'text-slate-400 line-through' : 'text-orange-700'}`}>
                            {formatS(p.monto)}
                          </td>
                          <td className="px-4 py-2 text-xs font-mono">{p.compra_numero || '—'}</td>
                          <td className="px-4 py-2">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              anulado ? 'bg-slate-100 text-slate-400' : 'bg-green-100 text-green-700'
                            }`}>{anulado ? 'Anulado' : 'Activo'}</span>
                          </td>
                          <td className="px-4 py-2 text-xs text-slate-500">{p.registrado_por_nombre || '—'}</td>
                          <td className="px-4 py-2">
                            {!anulado && cajaAbierta && (
                              <button onClick={async () => {
                                if (!window.confirm('¿Anular este pago? La deuda del proveedor volverá a subir.')) return;
                                try {
                                  const res = await anularPagoProveedor(p.id);
                                  setSaldoActual(res.saldo_actualizado);
                                  setPagos(prev => prev.map(x => x.id === p.id ? { ...x, estado: 'anulado' } : x));
                                  const c = await comprasDeProveedor(proveedor.id);
                                  setCompras(c.data || []);
                                  onPaid(res.saldo_actualizado);
                                } catch (err) { alert(err.response?.data?.error || 'Error al anular pago'); }
                              }}
                                className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition font-medium">
                                Anular
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl shrink-0">
          <button onClick={onClose}
            className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-100 transition text-slate-600">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Vista: Deudas Proveedores ── */
function DeudasProveedoresView({ cajaAbierta }) {
  const [deudas, setDeudas]     = useState([]);
  const [total, setTotal]       = useState(0);
  const [pages, setPages]       = useState(1);
  const [page, setPage]         = useState(1);
  const [loading, setLoading]   = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch]     = useState('');
  const [selectedProv, setSelectedProv] = useState(null);

  const fetchDeudas = useCallback(async (q, p) => {
    setLoading(true);
    try {
      const res = await deudasProveedores({ q: q || undefined, page: p, limit: 30 });
      setDeudas(res.data || []);
      setTotal(res.total ?? 0);
      setPages(res.pages ?? 1);
    } catch { setDeudas([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => { setSearch(searchInput); setPage(1); }, 350);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => { fetchDeudas(search, page); }, [search, page, fetchDeudas]);

  function handlePaid(provId, nuevoSaldo) {
    setDeudas(prev => prev.map(d =>
      d.id === provId ? { ...d, saldo_deuda: nuevoSaldo } : d
    ).filter(d => Number(d.saldo_deuda) > 0));
  }

  const totalDeuda = deudas.reduce((s, d) => s + Number(d.saldo_deuda), 0);

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <p className="text-sm text-slate-500">
          {loading ? '...' : `${total} proveedor${total !== 1 ? 'es' : ''} con deuda`}
          {!loading && totalDeuda > 0 && (
            <span className="ml-2 font-semibold text-red-600">Total: {formatS(totalDeuda)}</span>
          )}
        </p>
      </div>

      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
            fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
            placeholder="Buscar proveedor..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                {['Proveedor', 'RUC', 'Teléfono', 'Compras', 'Deuda', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 6 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 animate-pulse rounded" style={{ width: '80px' }} /></td>
                  ))}</tr>
                ))
              ) : deudas.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                  {search ? 'No se encontraron proveedores' : 'No hay proveedores con deuda pendiente'}
                </td></tr>
              ) : deudas.map(d => (
                <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-slate-800">{d.nombre}</td>
                  <td className="px-4 py-3 text-slate-500 font-mono text-xs">{d.ruc || '—'}</td>
                  <td className="px-4 py-3 text-slate-500">{d.telefono || '—'}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{d.num_compras}</td>
                  <td className="px-4 py-3 tabular-nums">
                    <span className="text-red-600 font-bold">{formatS(d.saldo_deuda)}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => setSelectedProv(d)}
                      className="px-3 py-1.5 text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 rounded-lg transition">
                      Pagar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-white">
            <p className="text-xs text-slate-500">Página {page} de {pages}</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">Anterior</button>
              <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">Siguiente</button>
            </div>
          </div>
        )}
      </div>

      {selectedProv && (
        <PagarProveedorModal
          proveedor={selectedProv}
          cajaAbierta={cajaAbierta}
          onClose={() => setSelectedProv(null)}
          onPaid={(nuevoSaldo) => handlePaid(selectedProv.id, nuevoSaldo)}
        />
      )}
    </>
  );
}

/* ── Página principal ── */
export default function Compras() {
  const [tab, setTab]           = useState('compras');
  const [compras,  setCompras]  = useState([]);
  const [total,    setTotal]    = useState(0);
  const [pages,    setPages]    = useState(1);
  const [page,     setPage]     = useState(1);
  const [fechaIni, setFechaIni] = useState('');
  const [fechaFin, setFechaFin] = useState('');
  const [loading,  setLoading]  = useState(true);
  const [modalOpen,setModalOpen]= useState(false);
  const [pagarCompra, setPagarCompra] = useState(null);
  const { cajaAbierta } = useCajaAbierta();

  const fetchCompras = useCallback(async (fi, ff, p) => {
    setLoading(true);
    try {
      const res = await listarCompras({ fecha_inicio: fi || undefined, fecha_fin: ff || undefined, page: p, limit: 20 });
      setCompras(Array.isArray(res.data) ? res.data : []);
      setTotal(res.total ?? 0);
      setPages(res.pages ?? 1);
    } catch { setCompras([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (tab === 'compras') fetchCompras(fechaIni, fechaFin, page);
  }, [fechaIni, fechaFin, page, tab, fetchCompras]);

  function onSaved() { fetchCompras(fechaIni, fechaFin, 1); setPage(1); }

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Compras</h1>
          {tab === 'compras' && (
            <p className="text-sm text-slate-500 mt-0.5">{loading ? '...' : `${total} compra${total !== 1 ? 's' : ''}`}</p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!cajaAbierta && (
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">Abre la caja para operar</span>
          )}
          {tab === 'compras' && (
            <>
              <button onClick={() => exportarCompras({ fecha_inicio: fechaIni || undefined, fecha_fin: fechaFin || undefined }).catch(() => {})}
                className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" />
                </svg>
                <span className="hidden sm:inline">Exportar</span>
              </button>
              <button onClick={() => setModalOpen(true)} disabled={!cajaAbierta}
                title={!cajaAbierta ? 'Abre la caja primero' : undefined}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition shadow-sm">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
                Nueva compra
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 rounded-xl p-1 w-fit">
        <button onClick={() => setTab('compras')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
            tab === 'compras' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}>
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Compras
          </span>
        </button>
        <button onClick={() => setTab('deudas')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition ${
            tab === 'deudas' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}>
          <span className="flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
            </svg>
            Deudas proveedores
          </span>
        </button>
      </div>

      {tab === 'compras' && (
        <>
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-400">Desde</span>
              <input type="date" value={fechaIni} onChange={e => { setFechaIni(e.target.value); setPage(1); }}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
              <span className="text-xs text-slate-400">Hasta</span>
              <input type="date" value={fechaFin} onChange={e => { setFechaFin(e.target.value); setPage(1); }}
                className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
            </div>
            <button onClick={() => { setFechaIni(today()); setFechaFin(today()); setPage(1); }}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">Hoy</button>
            <button onClick={() => {
                const d = new Date(); d.setDate(d.getDate() - 6);
                setFechaIni(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
                setFechaFin(today()); setPage(1);
              }}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">7 días</button>
            <button onClick={() => {
                const d = new Date();
                setFechaIni(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`);
                setFechaFin(today()); setPage(1);
              }}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">Mes</button>
            <button onClick={() => { setFechaIni(''); setFechaFin(''); setPage(1); }}
              className={`px-3 py-2 text-xs border rounded-lg transition ${!fechaIni && !fechaFin ? 'bg-blue-50 border-blue-300 text-blue-600' : 'border-slate-300 hover:bg-slate-50 text-slate-600'}`}>Todas</button>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-left">
                    {['N° Compra', 'Fecha', 'Proveedor', 'Total', 'Pagado', 'Deuda', 'Estado', 'Registrado por', ''].map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>{Array.from({ length: 9 }).map((_, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 animate-pulse rounded" style={{ width: j === 2 ? '120px' : '80px' }} /></td>
                      ))}</tr>
                    ))
                  ) : compras.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-12 text-center text-slate-400">No hay compras registradas</td></tr>
                  ) : compras.map(c => {
                    const badge = ESTADO_BADGE[c.estado] ?? ESTADO_BADGE.recibida;
                    const pagado = Number(c.total_pagado) || 0;
                    const deuda = c.estado === 'anulada' ? 0 : Math.max(0, Number(c.total) - pagado);
                    const tieneProveedor = !!c.proveedor_id;
                    return (
                      <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">{c.numero}</td>
                        <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{c.fecha}</td>
                        <td className="px-4 py-3 text-slate-800">
                          {c.proveedor_nombre ?? c.proveedor ?? <span className="text-slate-400 text-xs">Sin proveedor</span>}
                        </td>
                        <td className="px-4 py-3 tabular-nums font-semibold text-slate-800">{formatS(c.total)}</td>
                        <td className="px-4 py-3 tabular-nums">
                          {tieneProveedor ? (
                            pagado > 0
                              ? <span className="text-green-600 font-medium">{formatS(pagado)}</span>
                              : <span className="text-slate-400">—</span>
                          ) : <span className="text-slate-300 text-xs">N/A</span>}
                        </td>
                        <td className="px-4 py-3 tabular-nums">
                          {tieneProveedor ? (
                            deuda > 0
                              ? <span className="text-red-600 font-bold">{formatS(deuda)}</span>
                              : <span className="text-green-600 text-xs font-medium">Pagada</span>
                          ) : <span className="text-slate-300 text-xs">N/A</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>{badge.label}</span>
                        </td>
                        <td className="px-4 py-3 text-slate-500">{c.registrado_por_nombre ?? '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1.5">
                            {c.estado !== 'anulada' && tieneProveedor && deuda > 0 && (
                              <button onClick={() => setPagarCompra({
                                id: c.proveedor_id,
                                nombre: c.proveedor_nombre ?? c.proveedor,
                                saldo_deuda: deuda,
                                ruc: null,
                              })}
                                className="px-2 py-1 text-xs text-orange-600 hover:bg-orange-50 border border-orange-200 rounded-lg transition font-medium">
                                Pagar
                              </button>
                            )}
                            {c.estado !== 'anulada' && (
                              <button onClick={async () => {
                                if (!window.confirm(`¿Anular compra ${c.numero}?`)) return;
                                try {
                                  await anularCompra(c.id);
                                  fetchCompras(fechaIni, fechaFin, page);
                                } catch (err) { alert(err.response?.data?.error || 'Error al anular'); }
                              }}
                                className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition font-medium">
                                Anular
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {!loading && compras.length > 0 && (
                  <tfoot>
                    <tr className="bg-slate-50 border-t-2 border-slate-300">
                      <td colSpan={3} className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase">Total página</td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-slate-800">
                        {formatS(compras.filter(c => c.estado !== 'anulada').reduce((s, c) => s + Number(c.total || 0), 0))}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-green-600">
                        {formatS(compras.filter(c => c.estado !== 'anulada').reduce((s, c) => s + Number(c.total_pagado || 0), 0))}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums font-bold text-red-600">
                        {formatS(compras.filter(c => c.estado !== 'anulada').reduce((s, c) => s + Math.max(0, Number(c.total || 0) - Number(c.total_pagado || 0)), 0))}
                      </td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {pages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-white">
                <p className="text-xs text-slate-500">Página {page} de {pages}</p>
                <div className="flex gap-2">
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                    className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">← Anterior</button>
                  <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
                    className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">Siguiente →</button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {tab === 'deudas' && <DeudasProveedoresView cajaAbierta={cajaAbierta} />}

      <NuevaCompraModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onSaved={onSaved} />

      {pagarCompra && (
        <PagarProveedorModal
          proveedor={pagarCompra}
          cajaAbierta={cajaAbierta}
          onClose={() => setPagarCompra(null)}
          onPaid={() => { fetchCompras(fechaIni, fechaFin, page); }}
        />
      )}
    </Layout>
  );
}
