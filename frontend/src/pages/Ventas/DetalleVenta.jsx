import { useEffect, useState } from 'react';
import { obtenerVenta } from '../../services/ventasService';
import { getComprobantes, consultarEstadoSunat, anularComprobante, enviarBaja, cancelarAnulacion } from '../../services/facturacionService';
import ComprobanteModal from './ComprobanteModal';
import GuiaRemisionModal from './GuiaRemisionModal';

const TIPO_LABEL = {
  compra_bidon: 'Compra bidón',
  recarga:      'Recarga',
  prestamo:     'Préstamo',
  producto:     'Producto',
  devolucion:   'Devolución',
};

const TIPO_CLS = {
  compra_bidon: 'bg-blue-100 text-blue-700',
  recarga:      'bg-green-100 text-green-700',
  prestamo:     'bg-orange-100 text-orange-700',
  producto:     'bg-slate-100 text-slate-600',
  devolucion:   'bg-purple-100 text-purple-700',
};

const ESTADO_BADGE = {
  pagada:    { cls: 'bg-green-100 text-green-700',   label: 'Pagada' },
  pendiente: { cls: 'bg-yellow-100 text-yellow-700', label: 'Pendiente' },
  cancelada: { cls: 'bg-red-100 text-red-700',       label: 'Anulada' },
};

function fmtS(n) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);
}

function fmtFechaHora(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function DetalleVenta({ ventaId, onClose, onCancelled }) {
  const [venta, setVenta]             = useState(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [comprobantes, setComprobantes] = useState([]);
  const [comprobanteOpen, setComprobanteOpen] = useState(false);
  const [guiaOpen, setGuiaOpen]               = useState(false);
  const [guiaComprobante, setGuiaComprobante] = useState(null);
  const [estadosSunat, setEstadosSunat]       = useState({});
  const [anularTarget, setAnularTarget]         = useState(null);
  const [motivoAnulacion, setMotivoAnulacion]   = useState('');
  const [anulando, setAnulando]                 = useState(false);
  const [anularError, setAnularError]           = useState('');

  useEffect(() => {
    if (!ventaId) return;
    setLoading(true);
    setError('');
    obtenerVenta(ventaId)
      .then(data => setVenta(data))
      .catch(() => setError('No se pudo cargar la venta'))
      .finally(() => setLoading(false));
    getComprobantes(ventaId)
      .then(data => {
        setComprobantes(data);
        // Consultar estado real en el facturador para boletas/facturas
        data.filter(c => ['emitido', 'anulado'].includes(c.estado) && c.tipo_comprobante !== 'guia_remision').forEach(c => {
          consultarEstadoSunat(c.id)
            .then(r => {
              setEstadosSunat(prev => ({ ...prev, [c.id]: r }));
              // Sincronizar estado local si el facturador dice algo diferente
              if (r.estado_sunat === '11') {
                setComprobantes(prev => prev.map(x => x.id === c.id ? { ...x, estado: 'anulado', estado_sunat: '11' } : x));
              } else if (['01', '05', '07'].includes(r.estado_sunat) && c.estado === 'anulado') {
                setComprobantes(prev => prev.map(x => x.id === c.id ? { ...x, estado: 'emitido', estado_sunat: r.estado_sunat } : x));
              }
            })
            .catch(() => {});
        });
        // Guías: mostrar como Registrado
        data.filter(c => c.tipo_comprobante === 'guia_remision' && c.estado === 'emitido').forEach(c => {
          consultarEstadoSunat(c.id)
            .then(r => setEstadosSunat(prev => ({ ...prev, [c.id]: r })))
            .catch(() => {});
        });
      })
      .catch(() => {});
  }, [ventaId]);

  const handleAnular = async () => {
    if (!anularTarget || !motivoAnulacion.trim()) return;
    setAnulando(true);
    setAnularError('');
    try {
      const result = await anularComprobante({
        comprobante_id: anularTarget.id,
        motivo: motivoAnulacion.trim(),
      });
      // Paso 1 completado: resumen creado, pendiente enviar baja
      setComprobantes(prev => prev.map(c =>
        c.id === anularTarget.id ? { ...c, estado_sunat: '13', voided_external_id: result.voided_external_id } : c
      ));
      setEstadosSunat(prev => ({ ...prev, [anularTarget.id]: { estado_sunat: '13', descripcion: 'Por anular' } }));
      setAnularTarget(null);
      setMotivoAnulacion('');
    } catch (err) {
      setAnularError(err.response?.data?.error || 'Error al anular comprobante');
    } finally {
      setAnulando(false);
    }
  };

  const handleEnviarBaja = async (comp) => {
    if (!confirm(`¿Consultar estado de baja para ${comp.tipo_comprobante} ${comp.serie}-${comp.numero}?`)) return;
    try {
      const result = await enviarBaja({ comprobante_id: comp.id });
      const est = result.estado_sunat;
      if (est === '11') {
        setComprobantes(prev => prev.map(c =>
          c.id === comp.id ? { ...c, estado: 'anulado', estado_sunat: '11', voided_external_id: null } : c
        ));
        setEstadosSunat(prev => ({ ...prev, [comp.id]: { estado_sunat: '11', descripcion: 'Anulado' } }));
        alert('Baja confirmada por SUNAT. Comprobante anulado.');
      } else if (est === '13') {
        alert(result.mensaje || 'La baja aún está en proceso. SUNAT no ha confirmado todavía.');
      } else if (['01', '05', '07'].includes(est)) {
        setComprobantes(prev => prev.map(c =>
          c.id === comp.id ? { ...c, estado: 'emitido', estado_sunat: est, voided_external_id: null } : c
        ));
        const desc = est === '05' ? 'Aceptado' : est === '01' ? 'Registrado' : 'Observado';
        setEstadosSunat(prev => ({ ...prev, [comp.id]: { estado_sunat: est, descripcion: desc } }));
        alert(result.mensaje || `El resumen fue cancelado. Documento volvió a: ${desc}`);
      } else {
        alert(result.mensaje || `Estado actual: ${est}`);
      }
    } catch (err) {
      alert(err.response?.data?.error || 'Error al consultar estado de baja');
    }
  };

  const handleCancelarAnulacion = async (comp) => {
    if (!confirm(`¿Cancelar la anulación de ${comp.tipo_comprobante} ${comp.serie}-${comp.numero}?`)) return;
    try {
      await cancelarAnulacion({ comprobante_id: comp.id });
      setComprobantes(prev => prev.map(c =>
        c.id === comp.id ? { ...c, estado: 'emitido', estado_sunat: '05', voided_external_id: null } : c
      ));
      setEstadosSunat(prev => ({ ...prev, [comp.id]: { estado_sunat: '05', descripcion: 'Aceptado' } }));
    } catch (err) {
      alert(err.response?.data?.error || 'Error al cancelar anulación');
    }
  };

  if (!ventaId) return null;

  const badge = venta ? (ESTADO_BADGE[venta.estado] ?? ESTADO_BADGE.pagada) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-800">
              {loading ? 'Cargando…' : `Venta ${venta?.folio ?? ''}`}
            </h2>
            {badge && <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${badge.cls}`}>{badge.label}</span>}
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

          {loading ? (
            <div className="py-12 text-center text-slate-400">Cargando detalle…</div>
          ) : venta && (
            <>
              {/* Info general */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <p className="text-xs text-slate-400">Fecha / hora</p>
                  <p className="text-sm font-medium text-slate-700">{fmtFechaHora(venta.fecha_hora)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Cliente</p>
                  <p className="text-sm font-medium text-slate-700">{venta.cliente_nombre ?? 'Sin cliente'}</p>
                  {venta.cliente_telefono && <p className="text-xs text-slate-400">{venta.cliente_telefono}</p>}
                </div>
                <div>
                  <p className="text-xs text-slate-400">Vendedor</p>
                  <p className="text-sm font-medium text-slate-700">{venta.vendedor_nombre ?? '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400">Origen</p>
                  <p className="text-sm font-medium text-slate-700 capitalize">{venta.origen}</p>
                </div>
              </div>

              {/* Líneas de venta */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Productos</p>
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        {['Producto', 'Tipo', 'Cant.', 'Vacíos', 'Precio', 'Desc.', 'Subtotal'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {(venta.lineas ?? []).map(l => (
                        <tr key={l.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2.5 text-sm font-medium text-slate-800 whitespace-nowrap">
                            {l.presentacion_nombre}
                          </td>
                          <td className="px-3 py-2.5">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${TIPO_CLS[l.tipo_linea] ?? 'bg-slate-100 text-slate-600'}`}>
                              {TIPO_LABEL[l.tipo_linea] ?? l.tipo_linea}
                            </span>
                          </td>
                          <td className="px-3 py-2.5 text-center tabular-nums">{l.cantidad}</td>
                          <td className="px-3 py-2.5 text-center tabular-nums text-slate-500">
                            {l.vacios_recibidos > 0 ? l.vacios_recibidos : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{fmtS(l.precio_unitario)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-400">
                            {Number(l.descuento_linea) > 0 ? `-${fmtS(l.descuento_linea)}` : '—'}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold">{fmtS(l.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Desglose de pagos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Totales</p>
                  <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-500">Subtotal</span>
                      <span className="tabular-nums">{fmtS(venta.subtotal)}</span>
                    </div>
                    {Number(venta.descuento) > 0 && (
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-500">Descuento</span>
                        <span className="tabular-nums text-red-600">-{fmtS(venta.descuento)}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-base font-bold border-t border-slate-200 pt-2">
                      <span>Total</span>
                      <span className="tabular-nums">{fmtS(venta.total)}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Forma de pago</p>
                  <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                    {(venta.pagos || []).filter(p => Number(p.monto) > 0).map((p, i) => (
                      <div key={i} className="flex justify-between text-sm">
                        <span className="text-slate-500">{p.metodo_etiqueta || p.metodo_pago}</span>
                        <span className={`tabular-nums font-medium`}
                          style={p.metodo_color ? { color: p.metodo_color } : undefined}>
                          {fmtS(p.monto)}
                        </span>
                      </div>
                    ))}
                    {Number(venta.deuda_generada) > 0 && (
                      <div className="flex justify-between text-sm border-t border-slate-200 pt-2">
                        <span className="text-orange-600 font-medium">Deuda generada</span>
                        <span className="tabular-nums font-bold text-orange-600">{fmtS(venta.deuda_generada)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Movimientos de caja */}
              {venta.movimientos && venta.movimientos.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Movimientos de caja</p>
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          {['Tipo', 'Método', 'Monto', 'Descripción', 'Registrado por'].map(h => (
                            <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {venta.movimientos.map(m => (
                          <tr key={m.id}>
                            <td className="px-3 py-2 text-xs">
                              <span className={`px-2 py-0.5 rounded-full font-medium
                                ${m.tipo === 'ingreso' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {m.tipo}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs text-slate-600 capitalize">{m.metodo_pago}</td>
                            <td className="px-3 py-2 text-xs tabular-nums font-medium">{fmtS(m.monto)}</td>
                            <td className="px-3 py-2 text-xs text-slate-400 max-w-[160px] truncate">{m.descripcion ?? '—'}</td>
                            <td className="px-3 py-2 text-xs text-slate-500">{m.registrado_por_nombre ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Notas */}
              {venta.notas && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1">Notas</p>
                  <p className="text-sm text-slate-600 bg-slate-50 rounded-xl px-4 py-3">{venta.notas}</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Comprobantes */}
        {comprobantes.filter(c => ['emitido', 'anulado'].includes(c.estado)).length > 0 && (
          <div className="px-6 pb-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Comprobantes</p>
            <div className="space-y-2">
              {comprobantes.filter(c => ['emitido', 'anulado'].includes(c.estado)).map(c => {
                const sunat = estadosSunat[c.id];
                const esAnulado = c.estado === 'anulado' || sunat?.estado_sunat === '11';
                const sunatBadge = sunat?.estado_sunat === '05' ? { cls: 'bg-green-100 text-green-700', label: 'Aceptado' }
                  : sunat?.estado_sunat === '07' ? { cls: 'bg-yellow-100 text-yellow-700', label: 'Observado' }
                  : sunat?.estado_sunat === '09' ? { cls: 'bg-red-100 text-red-700', label: 'Rechazado' }
                  : sunat?.estado_sunat === '11' ? { cls: 'bg-red-100 text-red-600', label: 'Anulado' }
                  : sunat?.estado_sunat === '13' ? { cls: 'bg-orange-100 text-orange-600', label: 'Por anular' }
                  : sunat?.estado_sunat === '01' ? { cls: 'bg-blue-100 text-blue-600', label: 'Registrado' }
                  : null;
                return (
                <div key={c.id} className={`flex items-center gap-3 rounded-xl px-4 py-2.5 ${esAnulado ? 'bg-red-50/60' : 'bg-slate-50'}`}>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    c.tipo_comprobante === 'boleta' ? 'bg-green-100 text-green-700' :
                    c.tipo_comprobante === 'factura' ? 'bg-blue-100 text-blue-700' :
                    'bg-purple-100 text-purple-700'
                  }`}>
                    {c.tipo_comprobante === 'guia_remision' ? 'Guia' : c.tipo_comprobante}
                  </span>
                  <span className={`text-sm font-medium ${esAnulado ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                    {c.serie && c.numero ? `${c.serie}-${c.numero}` : 'Emitido'}
                  </span>
                  {sunatBadge && (
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${sunatBadge.cls}`}
                      title={sunat.descripcion || ''}>
                      {sunatBadge.label}
                    </span>
                  )}
                  {!sunatBadge && !esAnulado && sunat === undefined && (
                    <span className="text-xs text-slate-400">...</span>
                  )}
                  <div className="flex gap-1.5 ml-auto">
                    {c.pdf_url && (
                      <a href={c.pdf_url} target="_blank" rel="noopener noreferrer"
                        className="px-2.5 py-1 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition">
                        PDF
                      </a>
                    )}
                    {c.xml_url && (
                      <a href={c.xml_url} target="_blank" rel="noopener noreferrer"
                        className="px-2.5 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">
                        XML
                      </a>
                    )}
                    {c.cdr_url && (
                      <a href={c.cdr_url} target="_blank" rel="noopener noreferrer"
                        className="px-2.5 py-1 text-xs font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition">
                        CDR
                      </a>
                    )}
                    {!esAnulado && c.tipo_comprobante !== 'guia_remision' && sunat && ['01', '05'].includes(sunat.estado_sunat) && (
                      <button type="button"
                        onClick={() => { setAnularTarget(c); setMotivoAnulacion(''); setAnularError(''); }}
                        className="px-2.5 py-1 text-xs font-medium bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition">
                        Anular
                      </button>
                    )}
                    {c.tipo_comprobante !== 'guia_remision' && sunat?.estado_sunat === '13' && (
                      <>
                        <button type="button"
                          onClick={() => handleEnviarBaja(c)}
                          className="px-2.5 py-1 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition">
                          Verificar baja
                        </button>
                        <button type="button"
                          onClick={() => handleCancelarAnulacion(c)}
                          className="px-2.5 py-1 text-xs font-medium bg-slate-500 hover:bg-slate-600 text-white rounded-lg transition">
                          Cancelar
                        </button>
                      </>
                    )}
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Footer */}
        {venta && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl shrink-0">
            <div className="flex items-center gap-2">
              <button type="button"
                onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-white transition">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Imprimir
              </button>
              {venta.estado !== 'cancelada' && (
                <button type="button"
                  onClick={() => setComprobanteOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-emerald-700 border border-emerald-300 rounded-lg hover:bg-emerald-50 transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Generar comprobante
                </button>
              )}
              {comprobantes.some(c => c.estado === 'emitido' && c.tipo_comprobante !== 'guia_remision') && (
                <button type="button"
                  onClick={() => {
                    const comp = comprobantes.find(c => c.estado === 'emitido' && c.tipo_comprobante !== 'guia_remision');
                    setGuiaComprobante(comp);
                    setGuiaOpen(true);
                  }}
                  className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-700 border border-indigo-300 rounded-lg hover:bg-indigo-50 transition">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                  Guia de Remision
                </button>
              )}
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-white transition">
                Cerrar
              </button>
              {venta.estado !== 'cancelada' && onCancelled && (
                <button type="button"
                  onClick={() => { onCancelled(venta.id); onClose(); }}
                  className="px-4 py-2 text-sm font-semibold text-red-600 border border-red-300 rounded-lg hover:bg-red-50 transition">
                  Anular venta
                </button>
              )}
            </div>
          </div>
        )}

        {/* Modal comprobante */}
        {comprobanteOpen && venta && (
          <ComprobanteModal
            venta={venta}
            onClose={() => setComprobanteOpen(false)}
            onEmitido={(comp) => {
              setComprobantes(prev => [comp, ...prev]);
            }}
          />
        )}

        {/* Modal anular comprobante */}
        {anularTarget && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/30 rounded-2xl" onClick={() => !anulando && setAnularTarget(null)} />
            <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
              <h3 className="text-base font-semibold text-slate-800">Anular comprobante</h3>
              <p className="text-sm text-slate-500">
                Vas a anular <span className="font-medium text-slate-700">{anularTarget.tipo_comprobante} {anularTarget.serie}-{anularTarget.numero}</span>.
                Esta acción se enviará a SUNAT.
              </p>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Motivo de anulación *</label>
                <textarea
                  value={motivoAnulacion}
                  onChange={e => setMotivoAnulacion(e.target.value)}
                  rows={3}
                  placeholder="Ej: Error en datos del cliente"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-300 focus:border-orange-400 outline-none"
                  disabled={anulando}
                />
              </div>
              {anularError && <p className="text-xs text-red-600">{anularError}</p>}
              <div className="flex justify-end gap-2">
                <button type="button"
                  onClick={() => setAnularTarget(null)}
                  disabled={anulando}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition">
                  Cancelar
                </button>
                <button type="button"
                  onClick={handleAnular}
                  disabled={anulando || !motivoAnulacion.trim()}
                  className="px-4 py-2 text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-lg transition disabled:opacity-50">
                  {anulando ? 'Anulando...' : 'Sí, anular'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal guia de remision */}
        {guiaOpen && venta && guiaComprobante && (
          <GuiaRemisionModal
            venta={venta}
            comprobante={guiaComprobante}
            onClose={() => { setGuiaOpen(false); setGuiaComprobante(null); }}
            onEmitido={(guia) => {
              setComprobantes(prev => [guia, ...prev]);
            }}
          />
        )}
      </div>
    </div>
  );
}
