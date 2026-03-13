/**
 * AUDITORÍA E2E v3 — AquaControl
 * Flujo real: Compra→Lavado(sucio→limpio)→Producción→Venta→Reparto
 *
 * REGLA DE NEGOCIO: Compra de bidones va directo a en_lavado (sucios).
 * Después de lavar pasan a vacios (limpios). Producción usa vacios → llenos.
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');

const BASE = 'http://127.0.0.1:3001/api';
const HDR = { 'Content-Type': 'application/json', 'Host': 'demo.aquacontrol.site' };
const adminToken = jwt.sign({ id: 1, nombre: 'Administrador', email: 'admin@aquacontrol.pe', rol: 'admin' }, process.env.JWT_SECRET, { expiresIn: '2h' });
const choferToken = jwt.sign({ id: 2, nombre: 'Chofer Demo', email: 'chofer@aquacontrol.pe', rol: 'chofer' }, process.env.JWT_SECRET, { expiresIn: '2h' });

async function api(method, path, body, token = adminToken) {
  const opts = { method, headers: { ...HDR, Authorization: 'Bearer ' + token } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { s: res.status, d: data, ok: res.status < 400 };
}

const errs = [], warns = [], bugs = [];
let step = 0;
function log(m) { step++; console.log(`\n[${step}] ${m}`); }
function ok(m) { console.log(`  ✅ ${m}`); }
function fail(m) { console.log(`  ❌ ${m}`); errs.push(`[${step}] ${m}`); }
function warn(m) { console.log(`  ⚠️  ${m}`); warns.push(`[${step}] ${m}`); }
function bug(m) { console.log(`  🐛 ${m}`); bugs.push(`[${step}] ${m}`); }

async function getStock() {
  const { d } = await api('GET', '/presentaciones');
  const r = {}; for (const p of (d.data || d)) r[p.id] = { n: p.nombre, l: p.stock_llenos, v: p.stock_vacios, w: p.stock_en_lavado }; return r;
}
async function getIns() {
  const { d } = await api('GET', '/insumos');
  const r = {}; for (const i of (d.data || d)) r[i.id] = { n: i.nombre, s: parseFloat(i.stock_actual) }; return r;
}
function ps(label, s, ins) {
  console.log(`  📦 [${label}]`);
  for (const [,v] of Object.entries(s)) console.log(`     ${v.n}: L=${v.l} V=${v.v} W=${v.w}`);
  if (ins) for (const [,v] of Object.entries(ins)) console.log(`     INS ${v.n}: ${v.s}`);
}
function chk(id, field, before, after, expected, label) {
  const diff = after[id][field] - before[id][field];
  if (diff === expected) ok(`${label}: ${field} ${expected >= 0 ? '+' : ''}${expected} ✓`);
  else bug(`${label}: ${field} esperaba ${expected >= 0 ? '+' : ''}${expected}, obtuvo ${diff >= 0 ? '+' : ''}${diff}`);
}

const BID = 1, B3K = 2, INS1 = 1;
const HOY = new Date().toISOString().split('T')[0];

(async () => {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  AUDITORÍA E2E v3 — Flujo completo de negocio       ║');
  console.log('╚══════════════════════════════════════════════════════╝');

  let clienteId, ventaId, pedidoId, rutaId;

  // ═══ 1. ESTADO INICIAL ═══
  log('ESTADO INICIAL');
  const s0 = await getStock(), i0 = await getIns();
  ps('Inicio', s0, i0);

  // ═══ 2. ABRIR CAJA ═══
  log('ABRIR CAJA — S/100 apertura');
  let r = await api('POST', '/caja/abrir', { saldo_ini_efectivo: 100 });
  if (r.ok) ok('Caja abierta S/100'); else fail(`Abrir caja: ${JSON.stringify(r.d)}`);

  // ═══ 3. CREAR CLIENTE ═══
  log('CREAR CLIENTE');
  r = await api('POST', '/clientes', { nombre: 'AUDIT CLIENT', tipo: 'menudeo', telefono: '999', direccion: 'Test', latitud: '-6.77', longitud: '-79.84' });
  if (r.ok) { clienteId = r.d.id || r.d.insertId; ok(`Cliente ID=${clienteId}`); } else fail(`Cliente: ${JSON.stringify(r.d)}`);

  // ═══ 4. COMPRA INSUMOS — 50 bolsas hielo ═══
  log('COMPRA — 50 bolsas hielo a proveedor');
  const iPre4 = await getIns();
  r = await api('POST', '/compras', {
    proveedor_id: 1, fecha: HOY,
    items: [{ tipo_item: 'insumo', insumo_id: INS1, cantidad: 50, precio_unitario: 0.30 }]
  });
  if (r.ok) ok(`Compra OK`); else fail(`Compra: ${JSON.stringify(r.d)}`);
  const iPost4 = await getIns();
  const bolsaDiff = (iPost4[INS1]?.s || 0) - (iPre4[INS1]?.s || 0);
  if (bolsaDiff === 50) ok(`Insumo bolsas: +50 ✓`); else bug(`Insumo bolsas: esperaba +50, obtuvo +${bolsaDiff}`);

  // ═══ 5. COMPRA BIDONES — van directo a en_lavado (sucios) ═══
  log('COMPRA BIDONES — 30 bidones (van a en_lavado/sucios)');
  const sPre5 = await getStock();

  // Opción 1: compra_empresa debería meter a lavado
  r = await api('POST', `/presentaciones/${BID}/movimientos`, {
    tipo: 'compra_empresa', cantidad: 30, motivo: 'Compra bidones nuevos'
  });
  if (r.ok) ok('compra_empresa registrado');
  else fail(`compra_empresa: ${JSON.stringify(r.d)}`);

  const sPost5 = await getStock();
  const wDiff5 = sPost5[BID].w - sPre5[BID].w;
  const vDiff5 = sPost5[BID].v - sPre5[BID].v;
  console.log(`  📊 Post-compra bidones: vacios ${vDiff5 >= 0 ? '+' : ''}${vDiff5}, lavado ${wDiff5 >= 0 ? '+' : ''}${wDiff5}`);

  if (wDiff5 === 30) ok('Bidones fueron a en_lavado (sucios) ✓');
  else if (vDiff5 === 30) {
    bug('Bidones fueron a VACIOS en vez de en_lavado — debería ir a sucios');
  } else {
    bug(`Stock no cambió como esperado. V=${vDiff5}, W=${wDiff5}`);
    // Intentar con ajuste directo a lavado
    warn('Intentando ajuste manual a en_lavado...');
    r = await api('POST', `/presentaciones/${BID}/movimientos`, {
      tipo: 'ajuste', estado_origen: 'ninguno', estado_destino: 'en_lavado', cantidad: 30, motivo: 'Bidones sucios'
    });
    if (r.ok) ok('Ajuste a en_lavado registrado');
    else warn(`Ajuste: ${JSON.stringify(r.d)}`);
  }

  const sPost5b = await getStock();
  ps('Post-compra bidones', sPost5b);

  // ═══ 6. LAVADO — Lavar los 30 bidones sucios ═══
  log('LAVADO — 25 bidones (de en_lavado a vacios)');
  const sPre6 = await getStock();

  r = await api('POST', '/lavados', { presentacion_id: BID, cantidad: 25, notas: 'Lavado audit' });
  if (r.ok) ok('Lavado completado: 25 bidones');
  else fail(`Lavado: ${JSON.stringify(r.d)}`);

  const sPost6 = await getStock();
  // Trigger lavado_fin: vacios += 25, en_lavado -= 25
  chk(BID, 'v', sPre6, sPost6, +25, 'lavado vacios');
  chk(BID, 'w', sPre6, sPost6, -25, 'lavado en_lavado');
  ps('Post-lavado', sPost6);

  // ═══ 7. PRODUCCIÓN BIDONES — 15 bidones ═══
  log('PRODUCCIÓN — 15 bidones 20L (de vacios a llenos)');
  const sPre7 = await getStock();
  r = await api('POST', '/produccion', { presentacion_id: BID, turno: 'manana' });
  let lote1;
  if (r.ok) { lote1 = r.d.id || r.d.loteId || r.d.insertId; ok(`Lote ID=${lote1}`); } else fail(`Lote: ${JSON.stringify(r.d)}`);
  if (lote1) {
    r = await api('PUT', `/produccion/${lote1}/completar`, { cantidad_producida: 15 });
    if (r.ok) ok('Completado: +15 llenos');
    else fail(`Completar: ${JSON.stringify(r.d)}`);
  }
  const sPost7 = await getStock();
  chk(BID, 'l', sPre7, sPost7, +15, 'prod llenos');
  chk(BID, 'v', sPre7, sPost7, -15, 'prod vacios (consumidos)');

  // ═══ 8. PRODUCCIÓN HIELO — 30 bolsas ═══
  log('PRODUCCIÓN — 30 bolsas hielo 3kg');
  const iPre8 = await getIns();
  r = await api('POST', '/produccion', { presentacion_id: B3K, turno: 'manana' });
  let lote2;
  if (r.ok) { lote2 = r.d.id || r.d.loteId || r.d.insertId; ok(`Lote ID=${lote2}`); } else fail(`Lote: ${JSON.stringify(r.d)}`);
  if (lote2) {
    r = await api('PUT', `/produccion/${lote2}/completar`, { cantidad_producida: 30 });
    if (r.ok) ok('Completado: +30 bolsas');
    else fail(`Completar: ${JSON.stringify(r.d)}`);
  }
  const sPost8 = await getStock();
  const iPost8 = await getIns();
  if (sPost8[B3K].l === 30) ok('Bolsa 3kg llenos: 30 ✓');
  else bug(`Bolsa 3kg: esperaba 30, obtuvo ${sPost8[B3K].l}`);
  const insConsumo = (iPre8[INS1]?.s || 0) - (iPost8[INS1]?.s || 0);
  if (insConsumo === 30) ok(`Insumo bolsas consumido: -30 ✓`);
  else bug(`Insumo consumo: esperaba -30, obtuvo -${insConsumo}`);
  ps('Post-producción', sPost8, iPost8);

  // ═══ 9. VENTA EN PLANTA ═══
  log('VENTA PLANTA — 3 recargas bidón (S/8) + 5 bolsas (S/2) = S/34');
  const sPre9 = await getStock();
  r = await api('POST', '/ventas', {
    cliente_id: clienteId || 1,
    lineas: [
      { presentacion_id: BID, tipo_linea: 'recarga', cantidad: 3, precio_unitario: 8.00, vacios_recibidos: 3 },
      { presentacion_id: B3K, tipo_linea: 'producto', cantidad: 5, precio_unitario: 2.00 }
    ],
    pagos: [{ metodo: 'efectivo', monto: 34.00 }]
  });
  if (r.ok) { ventaId = r.d.id || r.d.ventaId || r.d.insertId; ok(`Venta ID=${ventaId}, S/34`); }
  else fail(`Venta: ${JSON.stringify(r.d)}`);

  const sPost9 = await getStock();
  chk(BID, 'l', sPre9, sPost9, -3, 'venta bidón llenos');
  chk(B3K, 'l', sPre9, sPost9, -5, 'venta bolsa llenos');
  // vacios_recibidos=3 en recarga planta (sin ruta): deberían ir a en_lavado (sucios)
  const wDiff9 = sPost9[BID].w - sPre9[BID].w;
  const vDiff9 = sPost9[BID].v - sPre9[BID].v;
  console.log(`  📊 Vacios recibidos (3): vacios=${vDiff9 >= 0 ? '+' : ''}${vDiff9}, lavado=${wDiff9 >= 0 ? '+' : ''}${wDiff9}`);
  if (wDiff9 === 3) ok('Vacios recibidos van a en_lavado (sucios) ✓ — correcto');
  else if (vDiff9 === 3) warn('Vacios recibidos fueron a vacios (limpios) — ¿deberían ir a sucios?');
  else bug(`Vacios recibidos: destino inesperado V=${vDiff9} W=${wDiff9}`);

  // Verificar caja recibió S/34
  r = await api('GET', '/caja/movimientos');
  const movsPostVenta = r.d?.data || r.d;
  const ventaMov = Array.isArray(movsPostVenta) ? movsPostVenta.find(m => m.tipo === 'venta' || (m.tipo === 'ingreso' && parseFloat(m.monto) === 34)) : null;
  if (ventaMov) ok(`Caja: movimiento venta S/${ventaMov.monto} registrado`);
  else warn('No se encontró movimiento de caja por S/34');

  // ═══ 10. PEDIDO ═══
  log('PEDIDO — 2 recargas + 3 bolsas para delivery');
  r = await api('POST', '/pedidos', {
    cliente_id: clienteId || 1,
    detalle: [
      { presentacion_id: BID, cantidad: 2, precio_unitario: 8.00, tipo_linea: 'recarga' },
      { presentacion_id: B3K, cantidad: 3, precio_unitario: 2.00, tipo_linea: 'producto' }
    ],
    notas_encargada: 'Pedido audit', direccion_entrega: 'Calle Test', latitud: '-6.77', longitud: '-79.84'
  });
  if (r.ok) { pedidoId = r.d.id || r.d.pedidoId || r.d.insertId; ok(`Pedido ID=${pedidoId}`); }
  else fail(`Pedido: ${JSON.stringify(r.d)}`);

  // ═══ 11. CREAR RUTA + ASIGNAR ═══
  log('CREAR RUTA + ASIGNAR PEDIDO');
  r = await api('POST', '/rutas', { repartidor_id: 2, vehiculo_id: 1, fecha: HOY });
  if (r.ok) { rutaId = r.d.id || r.d.rutaId || r.d.insertId; ok(`Ruta ID=${rutaId}`); }
  else fail(`Ruta: ${JSON.stringify(r.d)}`);
  if (pedidoId && rutaId) {
    r = await api('PUT', `/pedidos/${pedidoId}/asignar-ruta`, { ruta_id: rutaId });
    if (r.ok) ok('Pedido asignado a ruta'); else fail(`Asignar: ${JSON.stringify(r.d)}`);
  }

  // ═══ 12. CARGAR VEHÍCULO ═══
  log('CARGAR VEHÍCULO — 7 bidones + 15 bolsas');
  if (rutaId) {
    r = await api('PUT', `/rutas/${rutaId}/cargar`, {
      items: [{ presentacion_id: BID, cantidad: 7 }, { presentacion_id: B3K, cantidad: 15 }]
    });
    if (r.ok) ok('Vehículo cargado'); else fail(`Cargar: ${JSON.stringify(r.d)}`);
  }

  // ═══ 13. SALIR RUTA (stock descuenta de planta al salir, no al cargar) ═══
  log('SALIR A RUTA');
  const sPre13 = await getStock();
  if (rutaId) {
    r = await api('PUT', `/rutas/${rutaId}/salir`, { km_inicio: 15000 });
    if (r.ok) ok('Ruta iniciada km=15000'); else fail(`Salir: ${JSON.stringify(r.d)}`);
  }
  const sPost13 = await getStock();
  chk(BID, 'l', sPre13, sPost13, -7, 'salir ruta bidones (descuenta de planta)');
  chk(B3K, 'l', sPre13, sPost13, -15, 'salir ruta bolsas (descuenta de planta)');

  // Stock vehículo post-salida
  if (rutaId) {
    r = await api('GET', `/rutas/${rutaId}/stock-vehiculo`);
    const sv = r.d?.data || r.d;
    if (Array.isArray(sv)) for (const s of sv) ok(`Vehículo: ${s.nombre || 'pres_' + s.presentacion_id} cargados=${s.llenos_cargados}`);
  }

  // ═══ 14. ENTREGAR PEDIDO (chofer) ═══
  log('ENTREGAR PEDIDO — 2 recargas + 3 bolsas, vacios=2, S/22');
  if (pedidoId) {
    r = await api('PUT', `/pedidos/${pedidoId}/entregar`, {
      lineas: [
        { presentacion_id: BID, tipo_linea: 'recarga', cantidad: 2, precio_unitario: 8.00, vacios_recibidos: 2 },
        { presentacion_id: B3K, tipo_linea: 'producto', cantidad: 3, precio_unitario: 2.00 }
      ],
      pagos: [{ metodo: 'efectivo', monto: 22.00 }],
      notas_repartidor: 'Entrega audit'
    }, choferToken);
    if (r.ok) ok('Pedido entregado S/22');
    else warn(`Entregar: [${r.s}] ${JSON.stringify(r.d)}`);
  }

  // Verificar stock_vehiculo después de entregar
  if (rutaId) {
    r = await api('GET', `/rutas/${rutaId}/stock-vehiculo`);
    const sv = r.d?.data || r.d;
    if (Array.isArray(sv)) {
      const svBid = sv.find(s => s.presentacion_id === BID);
      const svB3k = sv.find(s => s.presentacion_id === B3K);
      if (svBid && svBid.llenos_entregados === 2) ok('stock_vehiculo bidón: llenos_entregados=2 ✓');
      else bug(`stock_vehiculo bidón llenos_entregados: esperaba 2, obtuvo ${svBid?.llenos_entregados}`);
      if (svBid && svBid.vacios_recogidos === 2) ok('stock_vehiculo bidón: vacios_recogidos=2 ✓');
      else warn(`stock_vehiculo bidón vacios_recogidos: esperaba 2, obtuvo ${svBid?.vacios_recogidos}`);
      if (svB3k && svB3k.llenos_entregados === 3) ok('stock_vehiculo bolsa: llenos_entregados=3 ✓');
      else bug(`stock_vehiculo bolsa llenos_entregados: esperaba 3, obtuvo ${svB3k?.llenos_entregados}`);
    }
  }

  // ═══ 15. VENTA AL PASO (chofer) ═══
  log('VENTA AL PASO — 4 bolsas hielo S/8');
  if (rutaId) {
    r = await api('POST', `/rutas/${rutaId}/venta-rapida`, {
      cliente_id: 1,
      lineas: [{ presentacion_id: B3K, tipo_linea: 'producto', cantidad: 4, precio_unitario: 2.00 }],
      pagos: [{ metodo: 'efectivo', monto: 8.00 }]
    }, choferToken);
    if (r.ok) ok('Venta al paso S/8'); else warn(`VAP: [${r.s}] ${JSON.stringify(r.d)}`);
  }

  // ═══ 16. GASTO RUTA ═══
  log('GASTO RUTA — S/15 combustible');
  if (rutaId) {
    r = await api('POST', `/rutas/${rutaId}/gasto`, { tipo: 'combustible', monto: 15.00, descripcion: 'Gasolina' }, choferToken);
    if (r.ok) ok('Gasto S/15'); else warn(`Gasto: [${r.s}] ${JSON.stringify(r.d)}`);
  }

  // Verificar caja_ruta del chofer
  if (rutaId) {
    r = await api('GET', `/rutas/${rutaId}`);
    const ruta = r.d;
    if (ruta?.caja_ruta) {
      const cr = ruta.caja_ruta;
      console.log(`  💰 Caja ruta: cobrado_efe=${cr.cobrado_efectivo} gastos=${cr.total_gastos} neto=${cr.neto_a_entregar}`);
      // Esperado: +22 (pedido) +8 (VAP) = 30 cobrado, -15 gasto, neto=15
      if (parseFloat(cr.cobrado_efectivo) === 30) ok('caja_ruta cobrado_efectivo=30 ✓ (22+8)');
      else bug(`caja_ruta cobrado_efectivo: esperaba 30, obtuvo ${cr.cobrado_efectivo}`);
      if (parseFloat(cr.gasto_combustible) === 15) ok('caja_ruta gasto_combustible=15 ✓');
      else bug(`caja_ruta gasto_combustible: esperaba 15, obtuvo ${cr.gasto_combustible}`);
      if (parseFloat(cr.neto_a_entregar) === 15) ok('caja_ruta neto_a_entregar=15 ✓ (30-15)');
      else bug(`caja_ruta neto_a_entregar: esperaba 15, obtuvo ${cr.neto_a_entregar}`);
    } else {
      // Try direct query
      r = await api('GET', `/rutas`);
      warn('No se pudo verificar caja_ruta directamente');
    }
  }

  // ═══ 17. VISITA PLANTA — devolver vacios ═══
  log('VISITA PLANTA — devolver 2 vacios recogidos');
  if (rutaId) {
    r = await api('POST', `/rutas/${rutaId}/visita-planta`, {
      items: [{ presentacion_id: BID, vacios_devueltos: 2, llenos_devueltos: 0, llenos_cargados: 0 }],
      notas: 'Devolver vacios'
    }, choferToken);
    if (r.ok) ok('2 vacios devueltos'); else warn(`Visita: [${r.s}] ${JSON.stringify(r.d)}`);
  }

  // ═══ 18. DEVOLVER LLENOS SOBRANTES (marca en stock_vehiculo, NO devuelve a planta aún) ═══
  log('DEVOLVER LLENOS sobrantes (se marcan, se devuelven al finalizar)');
  if (rutaId) {
    // Stock del vehiculo: cargo 7 bidones, entregó 2. Sobran 5.
    // Bolsas: cargo 15, entregó 3+4=7. Sobran 8.
    r = await api('PUT', `/rutas/${rutaId}/devolver-llenos`, {
      items: [{ presentacion_id: BID, cantidad: 5 }, { presentacion_id: B3K, cantidad: 8 }]
    });
    if (r.ok) ok('Marcó 5 bidones + 8 bolsas como sobrantes'); else warn(`Devolver: [${r.s}] ${JSON.stringify(r.d)}`);
    // Verificar stock_vehiculo tiene llenos_sobrantes correcto
    r = await api('GET', `/rutas/${rutaId}/stock-vehiculo`);
    const sv = r.d?.data || r.d;
    if (Array.isArray(sv)) {
      const svBid = sv.find(s => s.presentacion_id === BID);
      const svB3k = sv.find(s => s.presentacion_id === B3K);
      if (svBid?.llenos_sobrantes === 5) ok('stock_vehiculo bidón sobrantes=5 ✓');
      else bug(`stock_vehiculo bidón sobrantes: esperaba 5, obtuvo ${svBid?.llenos_sobrantes}`);
      if (svB3k?.llenos_sobrantes === 8) ok('stock_vehiculo bolsa sobrantes=8 ✓');
      else bug(`stock_vehiculo bolsa sobrantes: esperaba 8, obtuvo ${svB3k?.llenos_sobrantes}`);
    }
  }

  // ═══ 19. ENTREGAR CAJA REPARTIDOR ═══
  log('ENTREGAR CAJA REPARTIDOR');
  if (rutaId) {
    r = await api('PUT', `/rutas/${rutaId}/solicitar-entrega`, {}, choferToken);
    ok(`Solicitar: ${r.ok ? 'OK' : r.d?.error}`);
    r = await api('POST', `/rutas/${rutaId}/confirmar-entrega`, {});
    ok(`Confirmar: ${r.ok ? 'OK' : r.d?.error}`);
    if (!r.ok) {
      r = await api('POST', `/rutas/${rutaId}/entregar-caja`, {});
      ok(`Entregar directo: ${r.ok ? 'OK' : r.d?.error}`);
    }
  }

  // ═══ 20. FINALIZAR RUTA (devuelve sobrantes a planta + vacios a lavado) ═══
  log('FINALIZAR RUTA');
  const sPre20 = await getStock();
  if (rutaId) {
    r = await api('PUT', `/rutas/${rutaId}/finalizar`, { km_fin: 15080 });
    if (r.ok) ok('Ruta finalizada (80km)'); else warn(`Finalizar: [${r.s}] ${JSON.stringify(r.d)}`);
  }
  const sPost20 = await getStock();
  // Al finalizar: sobrantes llenos vuelven a planta
  chk(BID, 'l', sPre20, sPost20, +5, 'finalizar devuelve bidones llenos a planta');
  chk(B3K, 'l', sPre20, sPost20, +8, 'finalizar devuelve bolsas llenas a planta');

  // ═══ 21. ANULAR VENTA PLANTA ═══
  log('ANULAR VENTA planta (reversar stock)');
  const sPreAnula = await getStock();
  if (ventaId) {
    r = await api('PUT', `/ventas/${ventaId}/cancelar`, { motivo: 'Test anulación' });
    if (r.ok) ok('Venta anulada'); else warn(`Anular: [${r.s}] ${JSON.stringify(r.d)}`);
  }
  const sPostAnula = await getStock();
  // Al anular recarga: llenos deberían volver +3, bolsas +5
  const lDiffA = sPostAnula[BID].l - sPreAnula[BID].l;
  const b3DiffA = sPostAnula[B3K].l - sPreAnula[B3K].l;
  if (lDiffA === 3) ok('Anulación revirtió bidones +3 llenos ✓'); else bug(`Anulación bidones: esperaba +3, obtuvo +${lDiffA}`);
  if (b3DiffA === 5) ok('Anulación revirtió bolsas +5 llenos ✓'); else bug(`Anulación bolsas: esperaba +5, obtuvo +${b3DiffA}`);
  // Los vacios_recibidos (3) que entraron a lavado... ¿se revierten?
  const wDiffA = sPostAnula[BID].w - sPreAnula[BID].w;
  const vDiffA = sPostAnula[BID].v - sPreAnula[BID].v;
  console.log(`  📊 Anulación bidón: vacios=${vDiffA >= 0 ? '+' : ''}${vDiffA}, lavado=${wDiffA >= 0 ? '+' : ''}${wDiffA}`);
  if (wDiffA === -3) ok('Anulación revirtió los 3 vacios recibidos de lavado ✓');
  else if (wDiffA === 0 && vDiffA === 0) warn('Los vacios recibidos NO se revirtieron al anular — puede quedar stock inflado');

  // ═══ 22. VERIFICACIÓN FINAL STOCK ═══
  log('═══ VERIFICACIÓN FINAL DE STOCK ═══');
  const sFinal = await getStock(), iFinal = await getIns();
  ps('FINAL', sFinal, iFinal);

  // Cálculo esperado Bidón 20L:
  // +30 en_lavado (compra) → -25w +25v (lavado) → -15v +15l (prod) → -3l (venta, anulada +3l)
  // -7l (salir ruta) +5l (finalizar devuelve sobrantes)
  // vacios recibidos venta: +3w (luego anulados -3w)
  // Visita planta: 2 vacios del vehiculo → van a en_lavado (sucios), NO a vacios
  // FINAL: llenos= 15-3+3-7+5=13, vacios= 25-15=10, lavado= 30-25+3-3+2=7
  console.log('\n  📊 BALANCE ESPERADO Bidón 20L:');
  console.log(`     Llenos: 0 +15(prod) -3(venta) +3(anulación) -7(salir) +5(finalizar) = 13 | actual: ${sFinal[BID].l}`);
  console.log(`     Vacios: 0 +25(lavado) -15(prod) = 10 | actual: ${sFinal[BID].v}`);
  console.log(`     Lavado: 0 +30(compra) -25(lavado) +3(vacios venta) -3(anulación) +2(visita planta) = 7 | actual: ${sFinal[BID].w}`);

  if (sFinal[BID].l === 13) ok('Bidón llenos: 13 ✓'); else bug(`Bidón llenos: esperaba 13, obtuvo ${sFinal[BID].l}`);
  if (sFinal[BID].v === 10) ok('Bidón vacios: 10 ✓'); else bug(`Bidón vacios: esperaba 10, obtuvo ${sFinal[BID].v}`);
  if (sFinal[BID].w === 7) ok('Bidón lavado: 7 ✓'); else bug(`Bidón lavado: esperaba 7, obtuvo ${sFinal[BID].w}`);

  // Bolsa 3kg:
  // +30(prod) -5(venta, anulada +5) -15(carga) +8(devolver) = 23
  console.log(`\n  📊 BALANCE ESPERADO Bolsa Hielo 3kg:`);
  console.log(`     Llenos: 0 +30(prod) -5(venta) +5(anulación) -15(carga) +8(devolver) = 23 | actual: ${sFinal[B3K].l}`);
  if (sFinal[B3K].l === 23) ok('Bolsa llenos: 23 ✓'); else bug(`Bolsa llenos: esperaba 23, obtuvo ${sFinal[B3K].l}`);

  // Insumos:
  // Bolsas: 0 +50(compra) -30(prod) = 20
  console.log(`\n  📊 BALANCE ESPERADO Insumo Bolsas:`);
  console.log(`     Stock: 0 +50(compra) -30(prod) = 20 | actual: ${iFinal[INS1]?.s}`);
  if (iFinal[INS1]?.s === 20) ok('Insumo bolsas: 20 ✓'); else bug(`Insumo bolsas: esperaba 20, obtuvo ${iFinal[INS1]?.s}`);

  // ═══ 23. VERIFICACIÓN FINAL DINERO ═══
  log('═══ VERIFICACIÓN FINAL DE DINERO ═══');

  // Verificar saldo_ini de la caja
  r = await api('GET', '/caja');
  const cajaInfo = r.d;
  if (cajaInfo) {
    const saldoIni = parseFloat(cajaInfo.saldo_ini_efectivo || 0);
    if (saldoIni === 100) ok(`Caja saldo_ini_efectivo=100 ✓`);
    else bug(`Caja saldo_ini_efectivo: esperaba 100, obtuvo ${saldoIni}`);
  }

  r = await api('GET', '/caja/movimientos');
  const movs = r.d?.data || r.d;
  if (Array.isArray(movs)) {
    console.log(`\n  💰 MOVIMIENTOS DE CAJA (${movs.length}):`);
    let ing = 0, egr = 0;
    for (const m of movs) {
      const monto = parseFloat(m.monto || 0);
      const esIng = m.tipo === 'ingreso' || m.tipo === 'apertura' || m.tipo === 'abono_cliente';
      const esEgr = m.tipo === 'egreso';
      const anulado = m.anulado ? ' [ANULADO]' : '';
      const origen = m.origen ? ` (${m.origen})` : '';
      const entrega = m.estado_entrega ? ` [${m.estado_entrega}]` : '';
      if (!m.anulado) { if (esIng) ing += monto; if (esEgr) egr += monto; }
      console.log(`     ${esIng ? '+' : esEgr ? '-' : '?'}S/${monto.toFixed(2)} ${m.tipo} | ${m.metodo_pago}${origen}${entrega} | ${(m.descripcion || '').substring(0, 40)}${anulado}`);
    }

    console.log(`\n  💰 Ingresos activos: S/${ing.toFixed(2)}`);
    console.log(`  💰 Egresos activos:  S/${egr.toFixed(2)}`);
    console.log(`  💰 Saldo final esperado = S/100 (apertura) + ingresos - egresos`);

    // Verificar movimientos esperados del repartidor
    const movsRepartidor = movs.filter(m => m.origen === 'repartidor');
    const movsApertura = movs.filter(m => m.origen === 'apertura' || m.tipo === 'apertura');
    const movsAnulados = movs.filter(m => m.anulado);
    console.log(`\n  💰 ANÁLISIS DETALLADO:`);
    console.log(`     Movimientos apertura: ${movsApertura.length}`);
    console.log(`     Movimientos repartidor: ${movsRepartidor.length}`);
    console.log(`     Movimientos anulados: ${movsAnulados.length}`);
    console.log(`     Venta planta S/34 → ANULADA (no debe contar)`);
    console.log(`     Repartidor cobró: +22 (pedido) + 8 (VAP) - 15 (gasto) = S/15 neto`);
    console.log(`     Al entregar caja repartidor → S/15 debería ir a caja principal`);

    // Verificar que la entrega del repartidor generó movimiento
    const movEntregaRep = movsRepartidor.filter(m => !m.anulado);
    if (movEntregaRep.length > 0) {
      const totalRep = movEntregaRep.reduce((s, m) => s + parseFloat(m.monto), 0);
      console.log(`     Total transferido del repartidor: S/${totalRep.toFixed(2)}`);
      // Esperado: ingreso de S/30 (22+8 cobrados) + egreso S/15 (gasto) = neto S/15
    } else {
      warn('No se encontraron movimientos del repartidor en caja principal');
    }
  }

  // ═══ 24. CERRAR CAJA ═══
  log('CERRAR CAJA');
  r = await api('PUT', '/caja/cerrar', { observaciones: 'Cierre audit' });
  if (r.ok) ok('Caja cerrada'); else warn(`Cerrar: [${r.s}] ${JSON.stringify(r.d)}`);

  // ═══ 25. DASHBOARD ═══
  log('DASHBOARD FINAL');
  r = await api('GET', '/dashboard');
  const d = r.d;
  console.log(`  📊 Ventas: cant=${d.ventas?.cantidad} total=S/${d.ventas?.total}`);
  console.log(`  📊 Bidones llenos: ${d.bidones_llenos} | prestados: ${d.bidones_prestados}`);
  console.log(`  📊 Lavado: ${d.pendientes_lavado} | Vacios: ${d.vacios_disponibles}`);
  console.log(`  📊 Deuda clientes: S/${d.deuda_clientes} | proveedores: S/${d.deuda_proveedores}`);
  console.log(`  📊 Producción: ${d.produccion?.lotes} lotes, ${d.produccion?.unidades} uds`);

  // Verificar coherencia dashboard vs stock
  if (d.bidones_llenos === sFinal[BID].l) ok(`Dashboard bidones_llenos = stock_llenos (${d.bidones_llenos}) ✓`);
  else bug(`Dashboard bidones_llenos=${d.bidones_llenos} ≠ stock_llenos=${sFinal[BID].l}`);

  // ═══ RESUMEN ═══
  console.log('\n' + '═'.repeat(55));
  console.log('  RESUMEN AUDITORÍA E2E v3');
  console.log('═'.repeat(55));
  console.log(`  Pasos: ${step}`);
  console.log(`  ❌ Errores:  ${errs.length}`);
  console.log(`  🐛 Bugs:     ${bugs.length}`);
  console.log(`  ⚠️  Warnings: ${warns.length}`);
  if (errs.length) { console.log('\n  ERRORES:'); errs.forEach(e => console.log(`    ❌ ${e}`)); }
  if (bugs.length) { console.log('\n  BUGS DE LÓGICA:'); bugs.forEach(b => console.log(`    🐛 ${b}`)); }
  if (warns.length) { console.log('\n  WARNINGS:'); warns.forEach(w => console.log(`    ⚠️  ${w}`)); }
  if (!errs.length && !bugs.length) console.log('\n  🎉 SISTEMA FUNCIONA CORRECTAMENTE');
  console.log('═'.repeat(55));
})().catch(e => { console.error('FATAL:', e.message, e.stack); });
