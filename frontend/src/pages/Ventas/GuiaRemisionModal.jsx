import { useState, useEffect } from 'react';
import { emitirGuiaRemision, getSeries } from '../../services/facturacionService';
import { getConfig, consultarDni, consultarRuc } from '../../services/configService';

const MOTIVOS_TRASLADO = [
  { codigo: '01', label: 'Venta' },
  { codigo: '02', label: 'Compra' },
  { codigo: '04', label: 'Traslado entre establecimientos' },
  { codigo: '08', label: 'Importacion' },
  { codigo: '09', label: 'Exportacion' },
  { codigo: '13', label: 'Otros' },
];

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

const selectCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-white`;

export default function GuiaRemisionModal({ venta, comprobante, onClose, onEmitido }) {
  const hoy = new Date().toISOString().slice(0, 10);

  const [form, setForm] = useState({
    serie:              '',
    serie_id:           null,
    modo_transporte:    'publico',
    motivo_traslado:    '01',
    descripcion_motivo: '',
    fecha_traslado:     hoy,
    peso_total:         '',
    numero_bultos:      '',
    direccion_llegada:  venta?.cliente_direccion || '',
    ubigeo_llegada:     venta?.cliente_ubigeo || '',
    observaciones:      '',
    // Publico
    transportista_ruc:            '',
    transportista_razon_social:   '',
    transportista_mtc:            '',
    // Privado
    chofer_tipo_doc:    '1',
    chofer_numero_doc:  '',
    chofer_nombres:     '',
    chofer_apellidos:   '',
    chofer_licencia:    '',
    numero_placa:       '',
  });

  const [empresaDireccion, setEmpresaDireccion] = useState('');
  const [empresaUbigeo, setEmpresaUbigeo]       = useState('');
  const [series, setSeries]                     = useState([]);
  const [seriesLoading, setSeriesLoading]       = useState(false);
  const [loading, setLoading]         = useState(false);
  const [dniLoading, setDniLoading]   = useState(false);
  const [rucLoading, setRucLoading]   = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState(null);

  // Cargar datos empresa + series
  useEffect(() => {
    getConfig()
      .then(cfg => {
        setEmpresaDireccion(cfg.empresa_direccion || '');
        setEmpresaUbigeo(cfg.empresa_ubigeo || '');
      })
      .catch(() => {});

    setSeriesLoading(true);
    getSeries('guia')
      .then(data => {
        const arr = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
        setSeries(arr);
        if (arr.length === 1) {
          const val = typeof arr[0] === 'string' ? arr[0] : (arr[0].serie || arr[0].nombre || arr[0].value || '');
          const id  = arr[0]?.id || null;
          setForm(f => ({ ...f, serie: val, serie_id: id }));
        }
      })
      .catch(() => setSeries([]))
      .finally(() => setSeriesLoading(false));
  }, []);

  function set(key) {
    return e => setForm(f => ({ ...f, [key]: e.target.value }));
  }

  async function handleEmitir(e) {
    e.preventDefault();
    setError('');

    if (!form.serie) {
      setError('Selecciona una serie'); return;
    }
    if (!form.motivo_traslado || !form.fecha_traslado) {
      setError('Completa motivo y fecha de traslado'); return;
    }
    if (!form.direccion_llegada) {
      setError('Ingresa la direccion de llegada'); return;
    }
    if (form.modo_transporte === 'publico') {
      if (!form.transportista_ruc || !form.transportista_razon_social) {
        setError('Ingresa RUC y razon social del transportista'); return;
      }
    } else {
      if (!form.chofer_numero_doc || !form.chofer_nombres || !form.chofer_apellidos) {
        setError('Completa los datos del chofer'); return;
      }
      if (!form.numero_placa) {
        setError('Ingresa el numero de placa'); return;
      }
    }

    setLoading(true);
    try {
      const result = await emitirGuiaRemision({
        venta_id:       venta.id,
        comprobante_id: comprobante.id,
        ...form,
        peso_total:     Number(form.peso_total) || 1,
        numero_bultos:  Number(form.numero_bultos) || 1,
      });
      setSuccess(result);
      if (onEmitido) onEmitido(result);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al emitir guia de remision');
    } finally {
      setLoading(false);
    }
  }

  const tabClass = (active) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition ${
      active ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    }`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-lg font-semibold text-slate-800">Guia de Remision</h2>
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

          {success ? (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
                Guia de remision emitida: <strong>{success.serie}-{success.numero}</strong>
              </div>
              <div className="flex flex-wrap gap-2">
                {success.pdf_url && (
                  <a href={success.pdf_url} target="_blank" rel="noopener noreferrer"
                    className="px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition">PDF</a>
                )}
                {success.xml_url && (
                  <a href={success.xml_url} target="_blank" rel="noopener noreferrer"
                    className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">XML</a>
                )}
                {success.cdr_url && (
                  <a href={success.cdr_url} target="_blank" rel="noopener noreferrer"
                    className="px-4 py-2 text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition">CDR</a>
                )}
              </div>
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition">Cerrar</button>
            </div>
          ) : (
            <form onSubmit={handleEmitir} className="space-y-5">

              {/* Comprobante de referencia */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3">
                <p className="text-xs text-slate-400">Comprobante de referencia</p>
                <p className="text-sm font-medium text-slate-700">
                  {comprobante.tipo_comprobante === 'factura' ? 'Factura' : 'Boleta'}{' '}
                  {comprobante.serie}-{comprobante.numero}
                </p>
              </div>

              {/* Serie */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Serie</label>
                {seriesLoading ? (
                  <div className="px-3 py-2 text-sm text-slate-400 border border-slate-200 rounded-lg bg-slate-50">Cargando series...</div>
                ) : series.length === 0 ? (
                  <div className="px-3 py-2 text-sm text-yellow-600 border border-yellow-200 rounded-lg bg-yellow-50">No hay series de guia de remision configuradas</div>
                ) : (
                  <select value={form.serie}
                    onChange={e => {
                      const val = e.target.value;
                      const found = series.find(s => (typeof s === 'string' ? s : (s.serie || s.nombre || s.value || '')) === val);
                      setForm(f => ({ ...f, serie: val, serie_id: found?.id || null }));
                    }}
                    className={selectCls}>
                    <option value="">Seleccionar serie</option>
                    {series.map((s, i) => {
                      const val = typeof s === 'string' ? s : (s.serie || s.nombre || s.value || '');
                      const lbl = typeof s === 'string' ? s : (s.serie || s.nombre || s.label || s.value || '');
                      return <option key={i} value={val}>{lbl}</option>;
                    })}
                  </select>
                )}
              </div>

              {/* Tipo de transporte */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-2">Tipo de transporte</label>
                <div className="flex gap-2">
                  <button type="button" className={tabClass(form.modo_transporte === 'publico')}
                    onClick={() => setForm(f => ({ ...f, modo_transporte: 'publico' }))}>
                    Transporte Publico
                  </button>
                  <button type="button" className={tabClass(form.modo_transporte === 'privado')}
                    onClick={() => setForm(f => ({ ...f, modo_transporte: 'privado' }))}>
                    Transporte Privado
                  </button>
                </div>
              </div>

              {/* Motivo y fecha */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Motivo de traslado</label>
                  <select value={form.motivo_traslado} onChange={set('motivo_traslado')} className={selectCls}>
                    {MOTIVOS_TRASLADO.map(m => (
                      <option key={m.codigo} value={m.codigo}>{m.codigo} - {m.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Fecha de traslado</label>
                  <input type="date" value={form.fecha_traslado} onChange={set('fecha_traslado')} className={inputCls} />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Descripcion del motivo</label>
                  <input value={form.descripcion_motivo} onChange={set('descripcion_motivo')}
                    placeholder="Descripcion breve" className={inputCls} />
                </div>
              </div>

              {/* Peso y bultos */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Peso total (KG)</label>
                  <input type="number" step="0.000001" min="0" value={form.peso_total} onChange={set('peso_total')}
                    placeholder="1" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Numero de bultos</label>
                  <input type="number" min="1" value={form.numero_bultos} onChange={set('numero_bultos')}
                    placeholder="1" className={inputCls} />
                </div>
              </div>

              {/* Direcciones */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Direcciones</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Direccion partida</label>
                    <input value={empresaDireccion} readOnly
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-500 bg-slate-50 cursor-not-allowed" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Ubigeo partida</label>
                    <input value={empresaUbigeo} readOnly
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-500 bg-slate-50 cursor-not-allowed" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Direccion llegada</label>
                    <input value={form.direccion_llegada} onChange={set('direccion_llegada')}
                      placeholder="Direccion del destinatario" className={inputCls} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Ubigeo llegada</label>
                    <input value={form.ubigeo_llegada} onChange={set('ubigeo_llegada')}
                      placeholder="150101" maxLength={6} className={inputCls} />
                  </div>
                </div>
              </div>

              {/* Transporte Público */}
              {form.modo_transporte === 'publico' && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Datos del transportista</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">RUC transportista</label>
                      <div className="flex gap-2">
                        <input value={form.transportista_ruc} onChange={set('transportista_ruc')}
                          placeholder="20XXXXXXXXX" maxLength={11} className={`${inputCls} flex-1`} />
                        {/^\d{11}$/.test(form.transportista_ruc) && (
                          <button type="button" disabled={rucLoading}
                            onClick={async () => {
                              setRucLoading(true);
                              try {
                                const r = await consultarRuc(form.transportista_ruc);
                                const d = r.data || r;
                                setForm(f => ({
                                  ...f,
                                  transportista_razon_social: d.nombre_o_razon_social || f.transportista_razon_social,
                                }));
                              } catch { /* silent */ }
                              setRucLoading(false);
                            }}
                            className="px-3 py-2 text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition whitespace-nowrap">
                            {rucLoading ? '...' : 'Buscar'}
                          </button>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">N MTC</label>
                      <input value={form.transportista_mtc} onChange={set('transportista_mtc')}
                        placeholder="Numero MTC" className={inputCls} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Razon social</label>
                      <input value={form.transportista_razon_social} onChange={set('transportista_razon_social')}
                        placeholder="Razon social del transportista" className={inputCls} />
                    </div>
                  </div>
                </div>
              )}

              {/* Transporte Privado */}
              {form.modo_transporte === 'privado' && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Datos del chofer y vehiculo</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Tipo documento</label>
                      <select value={form.chofer_tipo_doc} onChange={set('chofer_tipo_doc')} className={selectCls}>
                        <option value="1">DNI</option>
                        <option value="4">Carnet de Extranjeria</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">N documento</label>
                      <div className="flex gap-2">
                        <input value={form.chofer_numero_doc} onChange={set('chofer_numero_doc')}
                          placeholder="Numero de documento" maxLength={12} className={`${inputCls} flex-1`} />
                        {/^\d{8}$/.test(form.chofer_numero_doc) && (
                          <button type="button" disabled={dniLoading}
                            onClick={async () => {
                              setDniLoading(true);
                              try {
                                const r = await consultarDni(form.chofer_numero_doc);
                                const d = r.data || r;
                                const nombres = d.nombres || '';
                                const apPat = d.apellido_paterno || '';
                                const apMat = d.apellido_materno || '';
                                const apellidos = [apPat, apMat].filter(Boolean).join(' ');
                                // Si no vienen separados, partir nombre_completo
                                if (nombres && apellidos) {
                                  setForm(f => ({ ...f, chofer_nombres: nombres, chofer_apellidos: apellidos }));
                                } else if (d.nombre_completo) {
                                  // nombre_completo suele ser "APELLIDOS, NOMBRES" o "NOMBRES APELLIDOS"
                                  const partes = d.nombre_completo.split(',');
                                  if (partes.length === 2) {
                                    setForm(f => ({ ...f, chofer_apellidos: partes[0].trim(), chofer_nombres: partes[1].trim() }));
                                  } else {
                                    // Poner todo en apellidos y dejar nombres vacío para que el usuario ajuste
                                    const words = d.nombre_completo.trim().split(/\s+/);
                                    if (words.length >= 3) {
                                      setForm(f => ({ ...f, chofer_apellidos: words.slice(0, 2).join(' '), chofer_nombres: words.slice(2).join(' ') }));
                                    } else {
                                      setForm(f => ({ ...f, chofer_nombres: d.nombre_completo, chofer_apellidos: '' }));
                                    }
                                  }
                                }
                              } catch { /* silent */ }
                              setDniLoading(false);
                            }}
                            className="px-3 py-2 text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition whitespace-nowrap">
                            {dniLoading ? '...' : 'Buscar'}
                          </button>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Nombres</label>
                      <input value={form.chofer_nombres} onChange={set('chofer_nombres')}
                        placeholder="Nombres" className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Apellidos</label>
                      <input value={form.chofer_apellidos} onChange={set('chofer_apellidos')}
                        placeholder="Apellidos" className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">N licencia</label>
                      <input value={form.chofer_licencia} onChange={set('chofer_licencia')}
                        placeholder="Licencia de conducir" className={inputCls} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">N placa</label>
                      <input value={form.numero_placa} onChange={set('numero_placa')}
                        placeholder="ABC-123" maxLength={10} className={inputCls} />
                    </div>
                  </div>
                </div>
              )}

              {/* Observaciones */}
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Observaciones</label>
                <textarea value={form.observaciones} onChange={set('observaciones')}
                  rows={2} placeholder="Opcional" className={inputCls} />
              </div>

              {/* Submit */}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={onClose}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition">
                  Cancelar
                </button>
                <button type="submit" disabled={loading || !form.serie}
                  className="px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition">
                  {loading ? 'Emitiendo...' : 'Emitir Guia de Remision'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
