import { useState, useEffect } from 'react';
import { emitirComprobante, getComprobantes, getSeries, getMetodosPagoFacturacion, consultarEstadoSunat } from '../../services/facturacionService';
import { getConfig, consultarDni, consultarRuc } from '../../services/configService';

function fmtS(n) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);
}

export default function ComprobanteModal({ venta, onClose, onEmitido }) {
  // Pre-cargar datos del cliente de la venta
  const clienteDni = venta?.cliente_dni || '';
  const esDni = /^\d{8}$/.test(clienteDni);
  const esRuc = /^\d{11}$/.test(clienteDni);

  const [form, setForm] = useState({
    tipo_comprobante: esRuc ? 'factura' : 'boleta',
    serie: '',
    serie_id: null,
    tipo_documento: esRuc ? '6' : (esDni ? '1' : '1'),
    numero_documento: clienteDni,
    razon_social: venta?.cliente_nombre || '',
    direccion: venta?.cliente_direccion || '',
    ubigeo: venta?.cliente_ubigeo || '',
  });

  const [dniLoading, setDniLoading] = useState(false);
  const [rucLoading, setRucLoading] = useState(false);

  // Modo de pago: 'contado' | 'credito' | 'cuotas'
  const [modoPago, setModoPago] = useState('contado');
  const [metodoSeleccionado, setMetodoSeleccionado] = useState(null);
  const [cuotas, setCuotas] = useState([]);
  const [metodosPago, setMetodosPago] = useState([]);

  const [igvPct, setIgvPct]           = useState(18);
  const [series, setSeries]           = useState([]);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [success, setSuccess]         = useState(null);
  const [existente, setExistente]     = useState(null);
  const [checkingExistente, setCheckingExistente] = useState(true);

  // Filtrar métodos según modo
  const metodosContado = metodosPago.filter(m => !m.is_credit);
  const metodosCredito = metodosPago.filter(m => m.is_credit);

  // Verificar si ya tiene comprobante aceptado por SUNAT
  useEffect(() => {
    if (!venta?.id) return;
    setCheckingExistente(true);
    getComprobantes(venta.id)
      .then(async (rows) => {
        const emitidos = rows.filter(r => r.estado === 'emitido' && r.tipo_comprobante !== 'guia_remision');
        // Consultar estado SUNAT de cada comprobante emitido
        for (const comp of emitidos) {
          try {
            const estado = await consultarEstadoSunat(comp.id);
            // Bloquear si está aceptado (05) o registrado (01)
            if (estado.estado_sunat === '05' || estado.estado_sunat === '01') {
              setExistente(comp);
              return;
            }
          } catch { /* continuar */ }
        }
        // Ninguno aceptado → permitir emitir
      })
      .catch(() => {})
      .finally(() => setCheckingExistente(false));
  }, [venta?.id]);

  // Cargar IGV + métodos de pago del sistema de facturación
  useEffect(() => {
    getConfig()
      .then(cfg => {
        if (cfg.facturacion_igv) setIgvPct(parseFloat(cfg.facturacion_igv));
      })
      .catch(() => {});
    getMetodosPagoFacturacion()
      .then(data => {
        const arr = Array.isArray(data) ? data : [];
        setMetodosPago(arr);
        // Auto-seleccionar Efectivo
        const efectivo = arr.find(m => m.is_cash);
        if (efectivo) setMetodoSeleccionado(efectivo);
      })
      .catch(() => {});
  }, []);

  // Cargar series al cambiar tipo_comprobante
  useEffect(() => {
    setSeries([]);
    setForm(f => ({ ...f, serie: '', serie_id: null }));
    setSeriesLoading(true);
    getSeries(form.tipo_comprobante)
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
  }, [form.tipo_comprobante]);

  // Auto-switch tipo_documento cuando cambia a factura
  useEffect(() => {
    if (form.tipo_comprobante === 'factura') {
      setForm(f => ({ ...f, tipo_documento: '6' }));
    }
  }, [form.tipo_comprobante]);

  function set(key) {
    return e => setForm(f => ({ ...f, [key]: e.target.value }));
  }

  const factor = 1 + igvPct / 100;
  const lineas = (venta?.lineas ?? []).map(l => {
    const totalLinea    = Number(l.subtotal);
    const subtotalLinea = +(totalLinea / factor).toFixed(2);
    const igvLinea      = +(totalLinea - subtotalLinea).toFixed(2);
    return { ...l, sub: subtotalLinea, igvL: igvLinea, tot: totalLinea };
  });
  const totalVenta     = Number(venta?.total || 0);
  const subtotalGlobal = +(totalVenta / factor).toFixed(2);
  const igvGlobal      = +(totalVenta - subtotalGlobal).toFixed(2);

  // Cambiar modo de pago
  function handleModoChange(nuevoModo) {
    setModoPago(nuevoModo);
    setCuotas([]);
    if (nuevoModo === 'contado') {
      const efectivo = metodosContado[0];
      setMetodoSeleccionado(efectivo || null);
    } else {
      const primerCredito = metodosCredito[0];
      setMetodoSeleccionado(primerCredito || null);
      const dias = primerCredito?.number_days || 30;
      if (nuevoModo === 'credito' && primerCredito) {
        generarCuota1(dias);
      }
      if (nuevoModo === 'cuotas') {
        // Empezar con 1 cuota con el total completo, fecha = hoy
        const hoy = new Date();
        setCuotas([{ monto: totalVenta, fecha: hoy.toISOString().slice(0, 10) }]);
      }
    }
  }

  // Seleccionar método de pago específico
  function handleMetodoChange(metodoId) {
    const m = metodosPago.find(x => String(x.id) === String(metodoId));
    if (!m) return;
    setMetodoSeleccionado(m);
    const dias = m.number_days || 30;
    if (modoPago === 'credito') {
      generarCuota1(dias);
    }
    if (modoPago === 'cuotas') {
      // Redistribuir cuotas con los nuevos días
      redistribuirCuotas(cuotas.length || 1, dias);
    }
  }

  // Generar 1 cuota (crédito simple)
  function generarCuota1(dias) {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + dias);
    setCuotas([{
      monto: totalVenta,
      fecha: fecha.toISOString().slice(0, 10),
    }]);
  }

  // Distribuir total en N cuotas equitativas con fechas
  // primerDiaDesdeHoy: en crédito = dias del método, en cuotas = 0 (hoy)
  function redistribuirCuotas(numCuotas, intervaloDias, primerDiaDesdeHoy) {
    if (numCuotas < 1) return;
    const montoCuota = +(totalVenta / numCuotas).toFixed(2);
    const arr = [];
    const hoy = new Date();
    for (let i = 0; i < numCuotas; i++) {
      const fecha = new Date(hoy);
      fecha.setDate(fecha.getDate() + primerDiaDesdeHoy + intervaloDias * i);
      arr.push({
        monto: i === numCuotas - 1 ? +(totalVenta - montoCuota * (numCuotas - 1)).toFixed(2) : montoCuota,
        fecha: fecha.toISOString().slice(0, 10),
      });
    }
    setCuotas(arr);
  }

  // Agregar cuota y redistribuir montos equitativamente
  function handleAddCuota() {
    const intervaloDias = 30;
    const primerDia = modoPago === 'cuotas' ? 0 : (metodoSeleccionado?.number_days || 30);
    redistribuirCuotas(cuotas.length + 1, intervaloDias, primerDia);
  }

  // Eliminar cuota y redistribuir montos
  function handleRemoveCuota(idx) {
    const nuevasCuotas = cuotas.filter((_, i) => i !== idx);
    if (nuevasCuotas.length === 0) {
      setCuotas([]);
      return;
    }
    const intervaloDias = 30;
    const primerDia = modoPago === 'cuotas' ? 0 : (metodoSeleccionado?.number_days || 30);
    redistribuirCuotas(nuevasCuotas.length, intervaloDias, primerDia);
  }

  function updateCuota(idx, key, val) {
    setCuotas(prev => prev.map((c, i) => i === idx ? { ...c, [key]: val } : c));
  }

  async function handleEmitir(e) {
    e.preventDefault();
    if (!form.serie) { setError('Selecciona una serie'); return; }
    if (!form.numero_documento || !form.razon_social) {
      setError('Completa numero de documento y razon social'); return;
    }
    if (form.tipo_comprobante === 'factura' && !form.direccion) {
      setError('Factura requiere direccion'); return;
    }
    if ((modoPago === 'credito' || modoPago === 'cuotas') && cuotas.length === 0) {
      setError('Agrega al menos una cuota'); return;
    }

    const esCredito = modoPago === 'credito' || modoPago === 'cuotas';

    setLoading(true); setError('');
    try {
      const result = await emitirComprobante({
        venta_id: venta.id,
        ...form,
        condicion_pago: esCredito ? 'credito' : 'contado',
        codigo_condicion_de_pago: esCredito ? '02' : '01',
        codigo_metodo_de_pago: modoPago === 'cuotas' ? null : (metodoSeleccionado?.id || '01'),
        condicion_pago_nombre: modoPago === 'cuotas' ? 'Crédito en cuotas' : (metodoSeleccionado?.description || 'Contado'),
        ...(esCredito ? { cuotas } : {}),
      });
      setSuccess(result);
      if (onEmitido) onEmitido(result);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al emitir comprobante');
    } finally { setLoading(false); }
  }

  if (!venta) return null;

  function serieValue(s) {
    if (typeof s === 'string') return s;
    return s.serie || s.nombre || s.value || '';
  }
  function serieLabel(s) {
    if (typeof s === 'string') return s;
    return s.serie || s.nombre || s.label || s.value || '';
  }

  const tabClass = (active) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition ${
      active
        ? 'bg-blue-600 text-white shadow-sm'
        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    }`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-lg font-semibold text-slate-800">Emitir Comprobante</h2>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {checkingExistente ? (
            <div className="flex items-center justify-center py-10 text-slate-400 text-sm">Verificando...</div>
          ) : existente ? (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
                Ya tiene comprobante emitido: <strong>{existente.serie}-{existente.numero}</strong>
                <span className="ml-2 text-xs text-green-500">
                  ({existente.tipo_comprobante === 'boleta' ? 'Boleta' : 'Factura'})
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                {existente.pdf_url && (
                  <a href={existente.pdf_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition">PDF</a>
                )}
                {existente.xml_url && (
                  <a href={existente.xml_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">XML</a>
                )}
                {existente.cdr_url && (
                  <a href={existente.cdr_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition">CDR</a>
                )}
              </div>
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition">Cerrar</button>
            </div>
          ) : (
          <form onSubmit={handleEmitir} className="space-y-5">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

          {success ? (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
                Comprobante emitido: <strong>{success.serie}-{success.numero}</strong>
              </div>
              <div className="flex flex-wrap gap-2">
                {success.pdf_url && (
                  <a href={success.pdf_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition">PDF</a>
                )}
                {success.xml_url && (
                  <a href={success.xml_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition">XML</a>
                )}
                {success.cdr_url && (
                  <a href={success.cdr_url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition">CDR</a>
                )}
              </div>
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition">Cerrar</button>
            </div>
          ) : (
            <>
              {/* Tipo comprobante + Serie */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de comprobante</label>
                  <select value={form.tipo_comprobante} onChange={set('tipo_comprobante')}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-white">
                    <option value="boleta">Boleta</option>
                    <option value="factura">Factura</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Serie</label>
                  {seriesLoading ? (
                    <div className="px-3 py-2 text-sm text-slate-400 border border-slate-200 rounded-lg bg-slate-50">Cargando series...</div>
                  ) : series.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-slate-400 border border-slate-200 rounded-lg bg-slate-50">No hay series disponibles</div>
                  ) : (
                    <select value={form.serie} onChange={e => {
                        const val = e.target.value;
                        const found = series.find(s => serieValue(s) === val);
                        setForm(f => ({ ...f, serie: val, serie_id: found?.id || null }));
                      }}
                      className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-white">
                      <option value="">Seleccionar serie</option>
                      {series.map((s, i) => (
                        <option key={i} value={serieValue(s)}>{serieLabel(s)}</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Datos del cliente */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Tipo documento</label>
                  <select value={form.tipo_documento} onChange={set('tipo_documento')}
                    disabled={form.tipo_comprobante === 'factura'}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-white disabled:bg-slate-100">
                    <option value="1">DNI</option>
                    <option value="6">RUC</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Numero documento</label>
                  <div className="flex gap-2">
                    <input value={form.numero_documento} onChange={set('numero_documento')}
                      maxLength={form.tipo_documento === '6' ? 11 : 8}
                      placeholder={form.tipo_documento === '6' ? 'RUC 11 digitos' : 'DNI 8 digitos'}
                      className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                    {/^\d{8}$/.test(form.numero_documento) && (
                      <button type="button" disabled={dniLoading}
                        onClick={async () => {
                          setDniLoading(true);
                          try {
                            const r = await consultarDni(form.numero_documento);
                            setForm(f => ({ ...f, razon_social: r.data.nombre_completo }));
                          } catch { /* silent */ }
                          setDniLoading(false);
                        }}
                        className="px-2.5 py-1.5 text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition whitespace-nowrap">
                        {dniLoading ? '...' : 'Buscar'}
                      </button>
                    )}
                    {/^\d{11}$/.test(form.numero_documento) && (
                      <button type="button" disabled={rucLoading}
                        onClick={async () => {
                          setRucLoading(true);
                          try {
                            const r = await consultarRuc(form.numero_documento);
                            setForm(f => ({
                              ...f,
                              razon_social: r.data.nombre_o_razon_social,
                              direccion: r.data.direccion || f.direccion,
                              ubigeo: String(r.data.ubigeo || '').split(',').pop().trim() || f.ubigeo,
                            }));
                          } catch { /* silent */ }
                          setRucLoading(false);
                        }}
                        className="px-2.5 py-1.5 text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition whitespace-nowrap">
                        {rucLoading ? '...' : 'Buscar'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Razon social / Nombre</label>
                  <input value={form.razon_social} onChange={set('razon_social')}
                    placeholder="Nombre completo o razon social"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Direccion {form.tipo_comprobante === 'factura' && <span className="text-red-500">*</span>}
                  </label>
                  <input value={form.direccion} onChange={set('direccion')}
                    placeholder="Direccion fiscal"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Ubigeo</label>
                  <input value={form.ubigeo} readOnly
                    placeholder="—"
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 text-slate-500 bg-slate-50 cursor-not-allowed" />
                </div>
              </div>

              {/* ── Condición de pago ── */}
              <div className="space-y-3">
                <label className="block text-xs font-medium text-slate-600">Condición de pago</label>

                {/* Tabs: Contado | Crédito | Crédito en cuotas */}
                <div className="flex gap-2">
                  <button type="button" className={tabClass(modoPago === 'contado')}
                    onClick={() => handleModoChange('contado')}>Contado</button>
                  <button type="button" className={tabClass(modoPago === 'credito')}
                    onClick={() => handleModoChange('credito')}>Crédito</button>
                  <button type="button" className={tabClass(modoPago === 'cuotas')}
                    onClick={() => handleModoChange('cuotas')}>Crédito en cuotas</button>
                </div>

                {/* Dropdown de métodos según modo */}
                {modoPago === 'contado' && (
                  <select value={metodoSeleccionado?.id || ''} onChange={e => handleMetodoChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-white">
                    {metodosContado.map(m => (
                      <option key={m.id} value={m.id}>{m.description}</option>
                    ))}
                  </select>
                )}

                {modoPago === 'credito' && (
                  <select value={metodoSeleccionado?.id || ''} onChange={e => handleMetodoChange(e.target.value)}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-white">
                    {metodosCredito.map(m => (
                      <option key={m.id} value={m.id}>
                        {m.description}{m.number_days ? ` (${m.number_days} días)` : ''}
                      </option>
                    ))}
                  </select>
                )}

                {/* Cuotas — crédito simple: 1 cuota auto | cuotas: editables */}
                {modoPago === 'credito' && cuotas.length > 0 && (
                  <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Vencimiento</p>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate-600">Monto:</span>
                      <span className="text-sm font-semibold tabular-nums">{fmtS(cuotas[0].monto)}</span>
                      <span className="text-sm text-slate-600 ml-2">Fecha:</span>
                      <input type="date" value={cuotas[0].fecha}
                        onChange={e => updateCuota(0, 'fecha', e.target.value)}
                        className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                    </div>
                  </div>
                )}

                {modoPago === 'cuotas' && (
                  <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Detalle de cuotas</p>
                      <button type="button" onClick={handleAddCuota}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                        </svg>
                        Agregar cuota
                      </button>
                    </div>
                    {cuotas.map((c, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 w-14 shrink-0">Cuota {i + 1}</span>
                        <input type="number" step="0.01" min="0"
                          value={c.monto} onChange={e => updateCuota(i, 'monto', e.target.value)}
                          className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition tabular-nums" />
                        <input type="date"
                          value={c.fecha} onChange={e => updateCuota(i, 'fecha', e.target.value)}
                          className="px-3 py-1.5 text-sm rounded-lg border border-slate-300 text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition" />
                        <button type="button" onClick={() => handleRemoveCuota(i)}
                          className="w-7 h-7 shrink-0 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 hover:text-red-600 transition"
                          title="Eliminar cuota">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                    <div className="flex justify-between text-xs pt-1 border-t border-slate-200">
                      <span className="text-slate-400">Total cuotas</span>
                      <span className={`font-semibold tabular-nums ${
                        Math.abs(cuotas.reduce((s, c) => s + Number(c.monto), 0) - totalVenta) < 0.02
                          ? 'text-green-600' : 'text-red-500'
                      }`}>
                        {fmtS(cuotas.reduce((s, c) => s + Number(c.monto), 0))}
                        {Math.abs(cuotas.reduce((s, c) => s + Number(c.monto), 0) - totalVenta) >= 0.02 && (
                          <span className="ml-1">(debe ser {fmtS(totalVenta)})</span>
                        )}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Preview de lineas con IGV */}
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Desglose (IGV {igvPct}%)
                </p>
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          {['Producto', 'Cant.', 'P. Unit', 'Subtotal', 'IGV', 'Total'].map(h => (
                            <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {lineas.map((l, i) => (
                          <tr key={i}>
                            <td className="px-3 py-2 text-sm text-slate-800 whitespace-nowrap">{l.presentacion_nombre}</td>
                            <td className="px-3 py-2 text-center tabular-nums">{l.cantidad}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmtS(Number(l.precio_unitario) / factor)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{fmtS(l.sub)}</td>
                            <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmtS(l.igvL)}</td>
                            <td className="px-3 py-2 text-right tabular-nums font-medium">{fmtS(l.tot)}</td>
                          </tr>
                        ))}
                        <tr className="bg-slate-50 font-semibold">
                          <td colSpan={3} className="px-3 py-2 text-right text-xs text-slate-500 uppercase">Totales</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtS(subtotalGlobal)}</td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmtS(igvGlobal)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{fmtS(totalVenta)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Submit */}
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={onClose}
                  className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition">
                  Cancelar
                </button>
                <button type="submit" disabled={loading || !form.serie}
                  className="px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition">
                  {loading ? 'Emitiendo...' : 'Emitir comprobante'}
                </button>
              </div>
            </>
          )}
        </form>
          )}
        </div>
      </div>
    </div>
  );
}
