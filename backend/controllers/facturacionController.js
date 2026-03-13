// controllers/facturacionController.js
const db = require('../db');
const https = require('https');
const http  = require('http');
const getConfigValue = require('../helpers/getConfigValue');
const logAudit = require('../helpers/audit');

// Helper: HTTP request que acepta certificados autofirmados (APIs demo/internas)
function apiFetch(url, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const mod = parsed.protocol === 'https:' ? https : http;
    const opts = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method,
      headers,
      rejectUnauthorized: false,
    };
    const req = mod.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        resolve({
          ok:     res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          json:   () => { try { return JSON.parse(data); } catch { return data; } },
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// Mapeo document_type_id de la API externa
const DOC_TYPE_MAP = {
  boleta:         '03',  // B...
  factura:        '01',  // F...
  guia_remision:  '09',  // T...
};

/* ── GET /api/facturacion/listar — Listado de comprobantes con filtros ── */
exports.listar = async (req, res) => {
  try {
    const {
      q, tipo_comprobante, estado, estado_sunat,
      fecha_inicio, fecha_fin,
      page = 1, limit = 20,
    } = req.query;

    const p = Math.max(1, parseInt(page));
    const l = Math.min(100, Math.max(1, parseInt(limit) || 20));
    const offset = (p - 1) * l;

    let where = '1=1';
    const params = [];

    if (q) {
      where += ` AND (c.razon_social LIKE ? OR c.serie LIKE ? OR c.numero LIKE ? OR c.numero_documento LIKE ?)`;
      const like = `%${q}%`;
      params.push(like, like, like, like);
    }
    if (tipo_comprobante) {
      where += ' AND c.tipo_comprobante = ?';
      params.push(tipo_comprobante);
    }
    if (estado) {
      where += ' AND c.estado = ?';
      params.push(estado);
    }
    if (estado_sunat) {
      where += ' AND c.estado_sunat = ?';
      params.push(estado_sunat);
    }
    if (fecha_inicio) {
      where += ' AND DATE(c.creado_en) >= ?';
      params.push(fecha_inicio);
    }
    if (fecha_fin) {
      where += ' AND DATE(c.creado_en) <= ?';
      params.push(fecha_fin);
    }

    const [[{ total }]] = await db.query(
      `SELECT COUNT(*) AS total FROM comprobantes c WHERE ${where}`, params
    );

    const [rows] = await db.query(
      `SELECT c.*, u.nombre AS emitido_por_nombre
         FROM comprobantes c
         LEFT JOIN usuarios u ON u.id = c.emitido_por
         WHERE ${where}
         ORDER BY c.creado_en DESC
         LIMIT ? OFFSET ?`,
      [...params, l, offset]
    );

    res.json({
      data: rows,
      total,
      page: p,
      pages: Math.ceil(total / l) || 1,
    });
  } catch (err) {
    console.error('facturacion.listar:', err.message);
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/facturacion/series?tipo=boleta|factura ── */
exports.getSeries = async (req, res) => {
  try {
    const { tipo } = req.query;
    if (!tipo || !['boleta', 'factura', 'guia'].includes(tipo)) {
      return res.status(400).json({ error: 'tipo debe ser boleta, factura o guia' });
    }

    const seriesUrl = await getConfigValue('facturacion_series_url', '');
    const token     = await getConfigValue('facturacion_token', '');

    if (!seriesUrl || !token) {
      return res.status(400).json({ error: 'Falta configurar URL de series y token en Configuracion' });
    }

    const resp = await apiFetch(seriesUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    const data = resp.json();
    if (!resp.ok) {
      return res.status(resp.status).json({ error: data.message || data.error || 'Error al obtener series' });
    }

    // Filtrar por document_type_id según tipo solicitado
    const docTypeId = tipo === 'guia' ? DOC_TYPE_MAP.guia_remision : DOC_TYPE_MAP[tipo];
    const all = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
    const filtered = all.filter(s => s.document_type_id === docTypeId);

    // Devolver formato limpio: { serie, id }
    const series = filtered.map(s => ({
      id:    s.id,
      serie: s.number,
    }));

    res.json(series);
  } catch (err) {
    console.error('facturacion.getSeries:', err.message);
    res.status(502).json({ error: `No se pudo conectar a la API de series: ${err.message}` });
  }
};

/* ── GET /api/facturacion/metodos-pago ── */
exports.getMetodosPago = async (req, res) => {
  try {
    const facturacionUrl = await getConfigValue('facturacion_url', '');
    const token          = await getConfigValue('facturacion_token', '');
    if (!facturacionUrl || !token) {
      return res.status(400).json({ error: 'Falta configurar URL y Token de facturacion' });
    }

    // Endpoint dedicado: GET /api/document/paymentmethod
    const baseUrl = new URL(facturacionUrl);
    const pmUrl = `${baseUrl.protocol}//${baseUrl.host}/api/document/paymentmethod`;

    const resp = await apiFetch(pmUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });
    const data = resp.json();
    console.log('[facturacion] paymentmethod response:', JSON.stringify(data, null, 2));
    if (!resp.ok) {
      return res.status(resp.status).json({ error: 'Error al obtener métodos de pago' });
    }

    const methods = data.payment_method_type || data.payment_method_types || [];
    res.json(methods);
  } catch (err) {
    console.error('facturacion.getMetodosPago:', err.message);
    res.status(502).json({ error: `No se pudo conectar: ${err.message}` });
  }
};

/* ── POST /api/facturacion/emitir ── */
exports.emitir = async (req, res) => {
  try {
    const {
      venta_id,
      tipo_comprobante,
      serie,
      serie_id = null,                      // ID numérico de la serie en FacturaloPerú
      tipo_documento,
      numero_documento,
      razon_social,
      direccion,
      ubigeo,
      condicion_pago = 'contado',            // 'contado' | 'credito'
      codigo_condicion_de_pago = '01',     // '01' contado, '02' crédito
      codigo_metodo_de_pago = '05',        // ID del payment_method_type
      condicion_pago_nombre = null,         // ej: "Crédito 30 días"
      cuotas = [],                          // [{ monto, fecha }]
    } = req.body;

    // Validaciones básicas
    if (!venta_id || !tipo_comprobante || !tipo_documento || !numero_documento || !razon_social) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    if (!['boleta', 'factura'].includes(tipo_comprobante)) {
      return res.status(400).json({ error: 'Tipo de comprobante invalido' });
    }
    if (!serie) {
      return res.status(400).json({ error: 'Debe seleccionar una serie' });
    }
    if (tipo_comprobante === 'factura' && tipo_documento !== '6') {
      return res.status(400).json({ error: 'Factura requiere RUC (tipo_documento = 6)' });
    }
    if (tipo_comprobante === 'factura' && !direccion) {
      return res.status(400).json({ error: 'Factura requiere direccion' });
    }

    // Verificar que la venta existe
    const [[venta]] = await db.query(
      'SELECT * FROM ventas WHERE id = ?',
      [venta_id]
    );
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });

    // Bloquear si ya existe un comprobante aceptado o registrado en SUNAT
    const [[aceptado]] = await db.query(
      `SELECT id FROM comprobantes
       WHERE venta_id = ? AND tipo_comprobante = ? AND estado = 'emitido' AND estado_sunat IN ('01','05')
       LIMIT 1`,
      [venta_id, tipo_comprobante]
    );
    if (aceptado) {
      return res.status(409).json({ error: `Ya existe un ${tipo_comprobante} emitido para esta venta` });
    }

    // Obtener líneas de la venta
    const [lineas] = await db.query(
      `SELECT d.*, p.nombre AS presentacion_nombre
         FROM venta_detalle d
         JOIN presentaciones p ON p.id = d.presentacion_id
         WHERE d.venta_id = ?
         ORDER BY d.id`,
      [venta_id]
    );

    // Leer config de facturación
    const facturacionUrl   = await getConfigValue('facturacion_url', '');
    const facturacionToken = await getConfigValue('facturacion_token', '');
    const igvPct           = parseFloat(await getConfigValue('facturacion_igv', '18'));

    if (!facturacionUrl || !facturacionToken) {
      return res.status(400).json({ error: 'Falta configurar URL y Token de facturacion en Configuracion' });
    }

    // Calcular subtotal, IGV y total por línea
    const factor = 1 + igvPct / 100;

    const items = lineas.map((l, idx) => {
      const totalItem     = Number(l.subtotal);           // precio con IGV
      const valorItem     = +(totalItem / factor).toFixed(2); // sin IGV
      const igvItem       = +(totalItem - valorItem).toFixed(2);
      const cant          = Number(l.cantidad);
      const valorUnitario = +(Number(l.precio_unitario) / factor).toFixed(2);

      return {
        codigo_interno:                `P${String(idx + 1).padStart(3, '0')}`,
        descripcion:                   l.tipo_linea === 'recarga' ? `${l.presentacion_nombre}-Recarga` : l.presentacion_nombre,
        codigo_producto_sunat:         '',
        unidad_de_medida:              'NIU',
        cantidad:                      cant,
        valor_unitario:                valorUnitario,
        codigo_tipo_precio:            '01',
        precio_unitario:               Number(l.precio_unitario),
        codigo_tipo_afectacion_igv:    '10',    // gravado
        total_base_igv:                valorItem,
        porcentaje_igv:                igvPct,
        total_igv:                     igvItem,
        total_impuestos:               igvItem,
        total_valor_item:              valorItem,
        total_item:                    totalItem,
      };
    });

    const totalVenta     = Number(venta.total);
    const subtotalGlobal = +(totalVenta / factor).toFixed(2);
    const igvGlobal      = +(totalVenta - subtotalGlobal).toFixed(2);

    const now = new Date();
    const fechaEmision = now.toISOString().slice(0, 10);
    const horaEmision  = now.toTimeString().slice(0, 8);

    // Condición de pago — usa el ID directo del catálogo de FacturaloPerú
    const condNombre = condicion_pago_nombre || (condicion_pago === 'credito' ? 'Crédito' : 'Contado');
    let fechaVencimiento = fechaEmision;
    let cuotasPayload = [];

    if (condicion_pago === 'credito' && cuotas.length > 0) {
      fechaVencimiento = cuotas[cuotas.length - 1].fecha || fechaEmision;
      cuotasPayload = cuotas.map(c => ({
        fecha:                c.fecha,
        codigo_tipo_moneda:   'PEN',
        monto:                Number(c.monto),
        ...(codigo_metodo_de_pago ? { codigo_metodo_de_pago } : {}),
      }));
    }

    const legends = [
      { code: '2006', value: `Condición de pago: ${condNombre}` },
    ];

    // Payload formato español FacturaloPerú (DocumentTransform)
    const payload = {
      codigo_tipo_documento:   DOC_TYPE_MAP[tipo_comprobante],
      serie_documento:         serie,
      numero_documento:        '#',          // auto-generar correlativo
      codigo_tipo_operacion:   '0101',       // venta interna
      codigo_tipo_moneda:      'PEN',
      fecha_de_vencimiento:    fechaVencimiento,
      fecha_de_emision:        fechaEmision,
      hora_de_emision:         horaEmision,
      codigo_condicion_de_pago: codigo_condicion_de_pago,
      ...(cuotasPayload.length > 0 ? { cuotas: cuotasPayload } : {}),
      legends,
      totales: {
        total_exportacion:             0,
        total_operaciones_gravadas:    subtotalGlobal,
        total_operaciones_inafectas:   0,
        total_operaciones_exoneradas:  0,
        total_operaciones_gratuitas:   0,
        total_igv:                     igvGlobal,
        total_impuestos:               igvGlobal,
        total_valor:                   subtotalGlobal,
        total_venta:                   totalVenta,
      },
      datos_del_cliente_o_receptor: {
        codigo_tipo_documento_identidad: tipo_documento,
        numero_documento,
        apellidos_y_nombres_o_razon_social: razon_social,
        codigo_pais:  'PE',
        ...(ubigeo   ? { ubigeo }   : {}),
        ...(direccion ? { direccion } : {}),
      },
      items,
    };

    // Debug: log FULL payload enviado a la API
    console.log('[facturacion] PAYLOAD COMPLETO:', JSON.stringify(payload, null, 2));

    // Llamar API externa
    let apiResponse;
    try {
      const resp = await apiFetch(facturacionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${facturacionToken}`,
        },
        body: JSON.stringify(payload),
      });
      apiResponse = resp.json();
      console.log('[facturacion] RESPUESTA API:', JSON.stringify(apiResponse, null, 2));

      if (!resp.ok || apiResponse.success === false) {
        // Guardar comprobante con estado error
        await db.query(
          `INSERT INTO comprobantes
             (venta_id, tipo_comprobante, tipo_documento, numero_documento, razon_social,
              direccion, ubigeo, subtotal, igv, total, porcentaje_igv, condicion_pago,
              serie, api_response, estado, error_mensaje, emitido_por)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'error', ?, ?)`,
          [
            venta_id, tipo_comprobante, tipo_documento, numero_documento, razon_social,
            direccion || null, ubigeo || null, subtotalGlobal, igvGlobal, totalVenta, igvPct,
            condNombre,
            serie,
            JSON.stringify(apiResponse), apiResponse.message || 'Error de la API',
            req.user.id,
          ]
        );
        return res.status(400).json({
          error: apiResponse.message || 'Error al emitir comprobante',
          api_response: apiResponse,
        });
      }
    } catch (fetchErr) {
      return res.status(502).json({ error: `No se pudo conectar a la API de facturacion: ${fetchErr.message}` });
    }

    // Mapear respuesta FacturaloPerú (links en raíz, data con number/hash)
    const apiData  = apiResponse.data || apiResponse;
    const links    = apiResponse.links || apiData.links || {};
    const seriNum  = (apiData.number || '').split('-');
    const serieRes = seriNum[0] || serie;
    const numRes   = seriNum.slice(1).join('-') || null;

    // Guardar comprobante exitoso
    const [result] = await db.query(
      `INSERT INTO comprobantes
         (venta_id, tipo_comprobante, tipo_documento, numero_documento, razon_social,
          direccion, ubigeo, subtotal, igv, total, porcentaje_igv, condicion_pago,
          serie, numero, pdf_url, xml_url, cdr_url, hash_cpe,
          api_response, estado, emitido_por)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'emitido', ?)`,
      [
        venta_id, tipo_comprobante, tipo_documento, numero_documento, razon_social,
        direccion || null, ubigeo || null, subtotalGlobal, igvGlobal, totalVenta, igvPct,
        condNombre,
        serieRes,
        numRes,
        links.pdf || apiData.enlace_del_pdf || null,
        links.xml || apiData.enlace_del_xml || null,
        links.cdr || apiData.enlace_del_cdr || null,
        apiData.hash || apiData.cadena_para_codigo_qr || null,
        JSON.stringify(apiResponse),
        req.user.id,
      ]
    );

    const [[comprobante]] = await db.query('SELECT * FROM comprobantes WHERE id = ?', [result.insertId]);

    logAudit(req, {
      modulo: 'facturacion', accion: 'crear', tabla: 'comprobantes',
      registro_id: result.insertId,
      detalle: { venta_id, tipo_comprobante, serie: comprobante.serie, numero: comprobante.numero },
    });

    res.status(201).json(comprobante);
  } catch (err) {
    console.error('facturacion.emitir:', err.message);
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/facturacion/venta/:ventaId ── */
exports.getByVenta = async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT c.*, u.nombre AS emitido_por_nombre
         FROM comprobantes c
         LEFT JOIN usuarios u ON u.id = c.emitido_por
         WHERE c.venta_id = ?
         ORDER BY c.creado_en DESC`,
      [req.params.ventaId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/* ── GET /api/facturacion/estado/:comprobanteId — Consultar estado SUNAT ── */
exports.consultarEstado = async (req, res) => {
  try {
    const [[comp]] = await db.query(
      'SELECT id, tipo_comprobante, api_response, estado, estado_sunat, voided_external_id FROM comprobantes WHERE id = ?',
      [req.params.comprobanteId]
    );
    if (!comp) return res.status(404).json({ error: 'Comprobante no encontrado' });

    // Extraer external_id de la respuesta guardada
    let apiData;
    try { apiData = typeof comp.api_response === 'string' ? JSON.parse(comp.api_response) : comp.api_response; } catch { apiData = {}; }
    const extId = apiData?.data?.external_id || apiData?.external_id || '';
    if (!extId) return res.json({ estado_sunat: null, mensaje: 'Sin external_id' });

    const facturacionUrl   = await getConfigValue('facturacion_url', '');
    const facturacionToken = await getConfigValue('facturacion_token', '');
    if (!facturacionUrl || !facturacionToken) {
      return res.json({ estado_sunat: null, mensaje: 'API no configurada' });
    }

    // Guías de remisión no pasan por SUNAT
    if (comp.tipo_comprobante === 'guia_remision') {
      return res.json({ estado_sunat: '01', descripcion: 'Registrado', external_id: extId });
    }

    const baseUrl = new URL(facturacionUrl);
    const host = `${baseUrl.protocol}//${baseUrl.host}`;
    const listEndpoint = `${host}/api/documents/lists`;

    const resp = await apiFetch(listEndpoint, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${facturacionToken}`,
      },
    });
    const data = await resp.json();
    const items = data?.data || [];
    const doc = items.find(d => d.external_id === extId);

    if (!doc) {
      return res.json({ estado_sunat: null, mensaje: 'No encontrado en listado' });
    }

    const stateId   = doc.state_type_id || '';
    const stateDesc = doc.state_type_description || '';
    console.log(`[facturacion] Estado real facturador para comp ${comp.id}: state_type_id=${stateId} (${stateDesc}), local estado=${comp.estado}, local estado_sunat=${comp.estado_sunat}`);

    // Sincronizar estado local con el estado real del facturador
    if (stateId) {
      if (stateId === '11') {
        // SUNAT confirmó anulación
        await db.query(`UPDATE comprobantes SET estado = 'anulado', estado_sunat = ?, voided_external_id = NULL WHERE id = ?`, [stateId, comp.id]);
      } else if (stateId === '13') {
        // Por anular: resumen creado pero baja no enviada → sigue emitido
        await db.query(`UPDATE comprobantes SET estado = 'emitido', estado_sunat = ? WHERE id = ?`, [stateId, comp.id]);
      } else if (['01', '05', '07', '09'].includes(stateId)) {
        // Documento activo o rechazado → restaurar a emitido
        await db.query(`UPDATE comprobantes SET estado = 'emitido', estado_sunat = ?, voided_external_id = NULL WHERE id = ?`, [stateId, comp.id]);
      } else {
        await db.query(`UPDATE comprobantes SET estado_sunat = ? WHERE id = ?`, [stateId, comp.id]);
      }
    }

    res.json({ estado_sunat: stateId, descripcion: stateDesc, external_id: extId });
  } catch (err) {
    console.error('facturacion.consultarEstado:', err.message);
    res.json({ estado_sunat: null, mensaje: err.message });
  }
};

/* ── POST /api/facturacion/anular — Anular comprobante en SUNAT ── */
exports.anularComprobante = async (req, res) => {
  try {
    const { comprobante_id, motivo } = req.body;
    if (!comprobante_id || !motivo) {
      return res.status(400).json({ error: 'Falta comprobante_id o motivo' });
    }

    const [[comp]] = await db.query(
      'SELECT * FROM comprobantes WHERE id = ?',
      [comprobante_id]
    );
    if (!comp) return res.status(404).json({ error: 'Comprobante no encontrado' });
    if (comp.estado !== 'emitido') {
      return res.status(400).json({ error: 'Solo se pueden anular comprobantes emitidos' });
    }

    // Extraer external_id
    let apiData;
    try { apiData = typeof comp.api_response === 'string' ? JSON.parse(comp.api_response) : comp.api_response; } catch { apiData = {}; }
    const extId = apiData?.data?.external_id || apiData?.external_id || '';
    if (!extId) return res.status(400).json({ error: 'Comprobante sin external_id' });

    const facturacionUrl   = await getConfigValue('facturacion_url', '');
    const facturacionToken = await getConfigValue('facturacion_token', '');
    if (!facturacionUrl || !facturacionToken) {
      return res.status(400).json({ error: 'API de facturación no configurada' });
    }

    const baseUrl = new URL(facturacionUrl);
    const host = `${baseUrl.protocol}//${baseUrl.host}`;

    if (!['factura', 'boleta'].includes(comp.tipo_comprobante)) {
      return res.status(400).json({ error: 'Solo se pueden anular boletas y facturas' });
    }

    // Consultar /api/documents/lists para obtener la fecha exacta del documento
    let fechaEmision;
    try {
      const listResp = await apiFetch(`${host}/api/documents/lists`, {
        headers: { 'Authorization': `Bearer ${facturacionToken}` },
      });
      const listData = await listResp.json();
      const docs = listData?.data || listData || [];
      const found = docs.find(d => d.external_id === extId);
      console.log('[facturacion] Documento encontrado en lists:', JSON.stringify(found, null, 2));
      if (found) {
        fechaEmision = found.date_of_issue || '';
      }
    } catch (e) {
      console.log('[facturacion] No se pudo consultar lists:', e.message);
    }

    // Fallback: api_response guardada o creado_en
    if (!fechaEmision) {
      fechaEmision = apiData?.data?.date_of_issue || apiData?.data?.fecha_de_emision
        || apiData?.date_of_issue || apiData?.fecha_de_emision || '';
    }
    if (!fechaEmision) {
      const d = comp.creado_en ? new Date(comp.creado_en) : new Date();
      fechaEmision = d.toISOString().slice(0, 10);
    }
    console.log('[facturacion] Fecha emisión para anular:', fechaEmision);

    let endpoint, payload;

    if (comp.tipo_comprobante === 'factura') {
      // Facturas: Comunicación de Baja
      endpoint = `${host}/api/voided`;
      payload = {
        fecha_de_emision_de_documentos: fechaEmision,
        documentos: [{
          external_id: extId,
          motivo_anulacion: motivo,
        }],
      };
    } else {
      // Boletas: Resumen Diario de anulación
      endpoint = `${host}/api/summaries`;
      payload = {
        fecha_de_emision_de_documentos: fechaEmision,
        codigo_tipo_proceso: '3',
        documentos: [{
          external_id: extId,
          motivo_anulacion: motivo,
        }],
      };
    }

    console.log('[facturacion] ANULAR PAYLOAD:', JSON.stringify(payload, null, 2));

    const resp = await apiFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${facturacionToken}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await resp.json();
    console.log('[facturacion] ANULAR RESPUESTA:', JSON.stringify(data, null, 2));

    if (!resp.ok || data.success === false) {
      return res.status(400).json({
        error: data.message || 'Error al anular comprobante',
        api_response: data,
      });
    }

    const voidedExtId = data.data?.external_id || '';
    const ticket = data.data?.ticket || '';
    console.log('[facturacion] Voided external_id:', voidedExtId, 'ticket:', ticket);

    // Guardar resumen de anulación — pendiente de enviar baja
    await db.query(
      `UPDATE comprobantes SET estado_sunat = '13', voided_external_id = ? WHERE id = ?`,
      [voidedExtId, comprobante_id]
    );

    logAudit(req, {
      modulo: 'facturacion', accion: 'cancelar', tabla: 'comprobantes',
      registro_id: comprobante_id,
      detalle: { motivo, tipo: comp.tipo_comprobante, serie: comp.serie, numero: comp.numero, voided_external_id: voidedExtId, ticket },
    });

    res.json({
      success: true,
      mensaje: 'Resumen de anulación creado. Falta enviar la baja a SUNAT.',
      estado_sunat: '13',
      voided_external_id: voidedExtId,
    });
  } catch (err) {
    console.error('facturacion.anularComprobante:', err.message);
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/facturacion/enviar-baja — Consultar ticket de anulación en SUNAT ── */
exports.enviarBaja = async (req, res) => {
  try {
    const { comprobante_id } = req.body;
    if (!comprobante_id) return res.status(400).json({ error: 'Falta comprobante_id' });

    const [[comp]] = await db.query('SELECT * FROM comprobantes WHERE id = ?', [comprobante_id]);
    if (!comp) return res.status(404).json({ error: 'Comprobante no encontrado' });
    if (!comp.voided_external_id) return res.status(400).json({ error: 'No tiene resumen de anulación. Primero use el botón Anular.' });

    const facturacionUrl   = await getConfigValue('facturacion_url', '');
    const facturacionToken = await getConfigValue('facturacion_token', '');
    const baseUrl = new URL(facturacionUrl);
    const host = `${baseUrl.protocol}//${baseUrl.host}`;

    // Paso 1: Consultar ticket de la anulación vía POST /api/voided/status
    // (para boletas: POST /api/summaries/status)
    const statusEndpoint = comp.tipo_comprobante === 'boleta'
      ? `${host}/api/summaries/status`
      : `${host}/api/voided/status`;

    console.log(`[facturacion] Consultando ticket anulación: ${statusEndpoint} external_id=${comp.voided_external_id}`);

    const statusResp = await apiFetch(statusEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${facturacionToken}`,
      },
      body: JSON.stringify({ external_id: comp.voided_external_id }),
    });
    const statusData = await statusResp.json();
    console.log('[facturacion] TICKET STATUS RESPUESTA:', JSON.stringify(statusData, null, 2));

    // Paso 2: También verificar estado del documento original en /api/documents/lists
    let apiData;
    try { apiData = typeof comp.api_response === 'string' ? JSON.parse(comp.api_response) : comp.api_response; } catch { apiData = {}; }
    const origExtId = apiData?.data?.external_id || apiData?.external_id || '';

    const listResp = await apiFetch(`${host}/api/documents/lists`, {
      headers: { 'Authorization': `Bearer ${facturacionToken}` },
    });
    const listData = await listResp.json();
    const doc = (listData?.data || []).find(d => d.external_id === origExtId);
    console.log('[facturacion] ENVIAR BAJA - Estado documento:', doc?.state_type_id, doc?.state_type_description);

    const stateId = doc?.state_type_id || '';

    if (stateId === '11') {
      await db.query(
        `UPDATE comprobantes SET estado = 'anulado', estado_sunat = '11', voided_external_id = NULL WHERE id = ?`,
        [comprobante_id]
      );
      logAudit(req, {
        modulo: 'facturacion', accion: 'eliminar', tabla: 'comprobantes',
        registro_id: comprobante_id,
        detalle: { tipo: comp.tipo_comprobante, serie: comp.serie, numero: comp.numero },
      });
      return res.json({ success: true, mensaje: 'Baja confirmada por SUNAT. Comprobante anulado.', estado_sunat: '11' });
    }

    if (stateId === '13') {
      // Mostrar info del ticket si disponible
      const ticketMsg = statusData?.data?.description || statusData?.message || '';
      return res.json({
        success: true,
        mensaje: `La baja aún está en proceso.${ticketMsg ? ' ' + ticketMsg : ' SUNAT no ha confirmado todavía.'}`,
        estado_sunat: '13',
        ticket_status: statusData,
      });
    }

    if (['01', '05', '07'].includes(stateId)) {
      await db.query(
        `UPDATE comprobantes SET estado = 'emitido', estado_sunat = ?, voided_external_id = NULL WHERE id = ?`,
        [stateId, comprobante_id]
      );
      return res.json({ success: true, mensaje: `El documento volvió a estado: ${doc.state_type_description}. El resumen fue cancelado.`, estado_sunat: stateId });
    }

    res.json({ success: true, mensaje: `Estado actual: ${doc?.state_type_description || 'Desconocido'}`, estado_sunat: stateId || '13', ticket_status: statusData });
  } catch (err) {
    console.error('facturacion.enviarBaja:', err.message);
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/facturacion/cancelar-anulacion — Cancelar resumen de anulación ── */
exports.cancelarAnulacion = async (req, res) => {
  try {
    const { comprobante_id } = req.body;
    if (!comprobante_id) return res.status(400).json({ error: 'Falta comprobante_id' });

    const [[comp]] = await db.query('SELECT * FROM comprobantes WHERE id = ?', [comprobante_id]);
    if (!comp) return res.status(404).json({ error: 'Comprobante no encontrado' });
    if (!comp.voided_external_id) return res.status(400).json({ error: 'No tiene resumen de anulación pendiente' });

    // Verificar estado real en el facturador antes de cancelar
    const facturacionUrl   = await getConfigValue('facturacion_url', '');
    const facturacionToken = await getConfigValue('facturacion_token', '');

    if (facturacionUrl && facturacionToken) {
      let apiData;
      try { apiData = typeof comp.api_response === 'string' ? JSON.parse(comp.api_response) : comp.api_response; } catch { apiData = {}; }
      const origExtId = apiData?.data?.external_id || apiData?.external_id || '';

      if (origExtId) {
        const baseUrl = new URL(facturacionUrl);
        const host = `${baseUrl.protocol}//${baseUrl.host}`;
        try {
          const listResp = await apiFetch(`${host}/api/documents/lists`, {
            headers: { 'Authorization': `Bearer ${facturacionToken}` },
          });
          const listData = await listResp.json();
          const doc = (listData?.data || []).find(d => d.external_id === origExtId);
          if (doc?.state_type_id === '11') {
            // Ya fue anulado por SUNAT — no se puede cancelar
            await db.query(`UPDATE comprobantes SET estado = 'anulado', estado_sunat = '11', voided_external_id = NULL WHERE id = ?`, [comprobante_id]);
            return res.status(400).json({ error: 'No se puede cancelar: SUNAT ya confirmó la anulación.' });
          }
        } catch (e) {
          console.log('[facturacion] No se pudo verificar estado para cancelar:', e.message);
        }
      }
    }

    // Restaurar estado a emitido
    await db.query(
      `UPDATE comprobantes SET estado_sunat = '05', voided_external_id = NULL WHERE id = ?`,
      [comprobante_id]
    );

    logAudit(req, {
      modulo: 'facturacion', accion: 'editar', tabla: 'comprobantes',
      registro_id: comprobante_id,
      detalle: { tipo: comp.tipo_comprobante, serie: comp.serie, numero: comp.numero },
    });

    res.json({ success: true, mensaje: 'Anulación cancelada', estado_sunat: '05' });
  } catch (err) {
    console.error('facturacion.cancelarAnulacion:', err.message);
    res.status(500).json({ error: err.message });
  }
};

/* ── POST /api/facturacion/guia — Guía de Remisión ── */
exports.emitirGuia = async (req, res) => {
  try {
    const {
      venta_id,
      comprobante_id,
      modo_transporte,        // 'publico' | 'privado'
      motivo_traslado,        // '01','02','04', etc.
      descripcion_motivo,
      fecha_traslado,
      peso_total,
      numero_bultos,
      direccion_llegada,
      ubigeo_llegada,
      observaciones,
      // Transporte público
      transportista_ruc,
      transportista_razon_social,
      transportista_mtc,
      // Transporte privado
      chofer_tipo_doc,
      chofer_numero_doc,
      chofer_nombres,
      chofer_apellidos,
      chofer_licencia,
      numero_placa,
      // Serie seleccionada en frontend
      serie,
    } = req.body;

    // Validaciones básicas
    if (!venta_id || !comprobante_id || !modo_transporte || !motivo_traslado || !fecha_traslado) {
      return res.status(400).json({ error: 'Faltan campos obligatorios' });
    }
    if (!['publico', 'privado'].includes(modo_transporte)) {
      return res.status(400).json({ error: 'modo_transporte debe ser publico o privado' });
    }
    if (modo_transporte === 'publico' && (!transportista_ruc || !transportista_razon_social)) {
      return res.status(400).json({ error: 'Transporte público requiere RUC y razón social del transportista' });
    }
    if (modo_transporte === 'privado' && (!chofer_numero_doc || !chofer_nombres || !chofer_apellidos || !numero_placa)) {
      return res.status(400).json({ error: 'Transporte privado requiere datos del chofer y placa' });
    }

    // Leer config del emisor
    const empresaRuc       = await getConfigValue('empresa_ruc', '');
    const empresaRazon     = await getConfigValue('empresa_razon_social', '');
    const empresaDireccion = await getConfigValue('empresa_direccion', '');
    const empresaUbigeo    = await getConfigValue('empresa_ubigeo', '');
    const empresaEmail     = await getConfigValue('empresa_email', '');
    const empresaTelefono  = await getConfigValue('empresa_telefono', '');

    if (!empresaRuc || !empresaRazon) {
      return res.status(400).json({ error: 'Falta configurar RUC y razón social de la empresa en Configuración > Facturación' });
    }

    // Leer comprobante origen
    const [[comprobante]] = await db.query(
      'SELECT * FROM comprobantes WHERE id = ? AND venta_id = ?',
      [comprobante_id, venta_id]
    );
    if (!comprobante || comprobante.estado !== 'emitido') {
      return res.status(404).json({ error: 'Comprobante origen no encontrado o no emitido' });
    }

    // Leer venta y líneas
    const [[venta]] = await db.query('SELECT * FROM ventas WHERE id = ?', [venta_id]);
    if (!venta) return res.status(404).json({ error: 'Venta no encontrada' });

    const [lineas] = await db.query(
      `SELECT d.*, p.nombre AS presentacion_nombre
         FROM venta_detalle d
         JOIN presentaciones p ON p.id = d.presentacion_id
         WHERE d.venta_id = ?
         ORDER BY d.id`,
      [venta_id]
    );

    // Leer config de facturación
    const facturacionUrl   = await getConfigValue('facturacion_url', '');
    const facturacionToken = await getConfigValue('facturacion_token', '');

    if (!facturacionUrl || !facturacionToken) {
      return res.status(400).json({ error: 'Falta configurar URL y Token de facturación' });
    }

    // Serie viene del frontend (seleccionada igual que boleta/factura)
    if (!serie) {
      return res.status(400).json({ error: 'Debe seleccionar una serie de guía de remisión' });
    }
    const serieGuia = serie;

    // Items para la guía (solo código y cantidad)
    const items = lineas.map((l, idx) => ({
      codigo_interno:        `P${String(idx + 1).padStart(3, '0')}`,
      descripcion:           l.tipo_linea === 'recarga' ? `${l.presentacion_nombre}-Recarga` : l.presentacion_nombre,
      unidad_de_medida:      'NIU',
      cantidad:              Number(l.cantidad),
    }));

    // Construir payload para guía de remisión
    const payload = {
      codigo_tipo_documento:  '09',
      serie_documento:        serieGuia,
      numero_documento:       '#',
      fecha_de_emision:       fecha_traslado,
      hora_de_emision:        new Date().toTimeString().slice(0, 8),
      codigo_tipo_documento_identidad_emisor: '6',  // RUC
      numero_documento_emisor: empresaRuc,
      datos_del_emisor: {
        codigo_pais:                          'PE',
        ubigeo:                               empresaUbigeo || '',
        direccion:                            empresaDireccion || '',
        correo_electronico:                   empresaEmail || '',
        telefono:                             empresaTelefono || '',
        codigo_del_domicilio_fiscal:          '0000',
        apellidos_y_nombres_o_razon_social:   empresaRazon,
      },
      datos_del_cliente_o_receptor: {
        codigo_tipo_documento_identidad: comprobante.tipo_documento,
        numero_documento:                comprobante.numero_documento,
        apellidos_y_nombres_o_razon_social: comprobante.razon_social,
        codigo_pais:                     'PE',
        ubigeo:                          comprobante.ubigeo || '',
        direccion:                       comprobante.direccion || '',
      },
      observaciones: observaciones || '',
      codigo_modo_transporte:  modo_transporte === 'publico' ? '01' : '02',
      codigo_motivo_traslado:  motivo_traslado,
      descripcion_motivo_traslado: descripcion_motivo || '',
      fecha_de_traslado:       fecha_traslado,
      codigo_de_puerto:        '',
      indicador_de_transbordo: false,
      unidad_peso_total:       'KGM',
      peso_total:              Number(peso_total) || 1,
      numero_de_bultos:        Number(numero_bultos) || 1,
      numero_de_contenedor:    '',
      direccion_partida: {
        ubigeo:                        empresaUbigeo || '',
        direccion:                     empresaDireccion || '',
        codigo_del_domicilio_fiscal:   '0000',
      },
      direccion_llegada: {
        ubigeo:                        ubigeo_llegada || '',
        direccion:                     direccion_llegada || '',
        codigo_del_domicilio_fiscal:   '0000',
      },
      documento_afectado: {
        serie_documento:        comprobante.serie,
        numero_documento:       comprobante.numero,
        codigo_tipo_documento:  DOC_TYPE_MAP[comprobante.tipo_comprobante] || '03',
      },
      items,
    };

    // Datos de transporte
    if (modo_transporte === 'publico') {
      payload.transportista = {
        codigo_tipo_documento_identidad: '6',   // RUC
        numero_documento:                transportista_ruc,
        apellidos_y_nombres_o_razon_social: transportista_razon_social,
        numero_mtc:                      transportista_mtc || '',
      };
    } else {
      payload.chofer = {
        codigo_tipo_documento_identidad: chofer_tipo_doc || '1',
        numero_documento:                chofer_numero_doc,
        nombres:                         chofer_nombres,
        apellidos:                       chofer_apellidos,
        numero_licencia:                 chofer_licencia || '',
      };
      payload.numero_de_placa = numero_placa;
    }

    console.log('[facturacion] GUIA PAYLOAD:', JSON.stringify(payload, null, 2));

    // Llamar API: POST /api/dispatches
    const baseUrl = new URL(facturacionUrl);
    const dispatchUrl = `${baseUrl.protocol}//${baseUrl.host}/api/dispatches`;

    let apiResponse;
    try {
      const resp = await apiFetch(dispatchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${facturacionToken}`,
        },
        body: JSON.stringify(payload),
      });
      apiResponse = resp.json();
      console.log('[facturacion] GUIA RESPUESTA:', JSON.stringify(apiResponse, null, 2));

      if (!resp.ok || apiResponse.success === false) {
        await db.query(
          `INSERT INTO comprobantes
             (venta_id, tipo_comprobante, tipo_documento, numero_documento, razon_social,
              serie, api_response, estado, error_mensaje, emitido_por,
              subtotal, igv, total, porcentaje_igv)
           VALUES (?, 'guia_remision', ?, ?, ?, ?, ?, 'error', ?, ?, 0, 0, 0, 0)`,
          [
            venta_id,
            comprobante.tipo_documento,
            comprobante.numero_documento,
            comprobante.razon_social,
            serieGuia,
            JSON.stringify(apiResponse),
            apiResponse.message || 'Error al emitir guía',
            req.user.id,
          ]
        );
        return res.status(400).json({
          error: apiResponse.message || 'Error al emitir guía de remisión',
          api_response: apiResponse,
        });
      }
    } catch (fetchErr) {
      return res.status(502).json({ error: `No se pudo conectar a la API: ${fetchErr.message}` });
    }

    // Mapear respuesta — dispatches puede devolver links en distintas ubicaciones
    const apiData  = apiResponse.data || apiResponse;
    const links    = apiResponse.links || apiData.links || {};
    const seriNum  = (apiData.number || '').split('-');
    const serieRes = seriNum[0] || serieGuia;
    const numRes   = seriNum.slice(1).join('-') || null;

    // Construir URLs de descarga si no vienen en links
    const apiBase = `${new URL(facturacionUrl).protocol}//${new URL(facturacionUrl).host}`;
    const extId   = apiData.external_id || apiData.id || '';
    const pdfUrl  = links.pdf || apiData.enlace_del_pdf || apiData.download_pdf
                    || (extId ? `${apiBase}/downloads/dispatch/pdf/${extId}` : null);
    const xmlUrl  = links.xml || apiData.enlace_del_xml || apiData.download_xml
                    || (extId ? `${apiBase}/downloads/dispatch/xml/${extId}` : null);
    const cdrUrl  = links.cdr || apiData.enlace_del_cdr || apiData.download_cdr || null;

    // Guardar comprobante exitoso
    const [result] = await db.query(
      `INSERT INTO comprobantes
         (venta_id, tipo_comprobante, tipo_documento, numero_documento, razon_social,
          serie, numero, pdf_url, xml_url, cdr_url, hash_cpe,
          api_response, estado, emitido_por,
          subtotal, igv, total, porcentaje_igv)
       VALUES (?, 'guia_remision', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'emitido', ?, 0, 0, 0, 0)`,
      [
        venta_id,
        comprobante.tipo_documento,
        comprobante.numero_documento,
        comprobante.razon_social,
        serieRes,
        numRes,
        pdfUrl,
        xmlUrl,
        cdrUrl,
        apiData.hash || apiData.cadena_para_codigo_qr || null,
        JSON.stringify(apiResponse),
        req.user.id,
      ]
    );

    const [[guia]] = await db.query('SELECT * FROM comprobantes WHERE id = ?', [result.insertId]);

    logAudit(req, {
      modulo: 'facturacion', accion: 'crear', tabla: 'comprobantes',
      registro_id: result.insertId,
      detalle: { venta_id, tipo: 'guia_remision', serie: guia.serie, numero: guia.numero },
    });

    res.status(201).json(guia);
  } catch (err) {
    console.error('facturacion.emitirGuia:', err.message);
    res.status(500).json({ error: err.message });
  }
};
