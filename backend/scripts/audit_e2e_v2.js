/**
 * AUDITORÍA E2E v2 — AquaControl
 * Flujo completo de negocio con payloads correctos.
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');

const BASE = 'http://127.0.0.1:3001/api';
const HEADERS_BASE = { 'Content-Type': 'application/json', 'Host': 'demo.aquacontrol.site' };

const adminToken = jwt.sign(
  { id: 1, nombre: 'Administrador', email: 'admin@aquacontrol.pe', rol: 'admin' },
  process.env.JWT_SECRET, { expiresIn: '2h' }
);
const choferToken = jwt.sign(
  { id: 2, nombre: 'Chofer Demo', email: 'chofer@aquacontrol.pe', rol: 'chofer' },
  process.env.JWT_SECRET, { expiresIn: '2h' }
);

function headers(token) { return { ...HEADERS_BASE, 'Authorization': 'Bearer ' + token }; }

async function api(method, path, body, token = adminToken) {
  const opts = { method, headers: headers(token) };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (res.status >= 400) {
    return { status: res.status, data, ok: false };
  }
  return { status: res.status, data, ok: true };
}

const errors = [];
const warnings = [];
const stockLog = [];
let step = 0;

function log(msg) { step++; console.log(`\n[${step}] ${msg}`); }
function ok(msg) { console.log(`  ✅ ${msg}`); }
function fail(msg) { console.log(`  ❌ ${msg}`); errors.push(`[${step}] ${msg}`); }
function warn(msg) { console.log(`  ⚠️  ${msg}`); warnings.push(`[${step}] ${msg}`); }

async function getStock() {
  const { data } = await api('GET', '/presentaciones');
  const arr = data.data || data;
  const result = {};
  for (const p of arr) {
    result[p.id] = { nombre: p.nombre, llenos: p.stock_llenos, vacios: p.stock_vacios, lavado: p.stock_en_lavado };
  }
  return result;
}

async function getInsumos() {
  const { data } = await api('GET', '/insumos');
  const arr = data.data || data;
  const result = {};
  for (const i of arr) result[i.id] = { nombre: i.nombre, stock: parseFloat(i.stock_actual) };
  return result;
}

function printStock(label, stock, insumos) {
  console.log(`  📦 [${label}]`);
  for (const [id, s] of Object.entries(stock)) {
    console.log(`     ${s.nombre}: llenos=${s.llenos} vacios=${s.vacios} lavado=${s.lavado}`);
  }
  if (insumos) {
    for (const [id, i] of Object.entries(insumos)) {
      console.log(`     INS ${i.nombre}: stock=${i.stock}`);
    }
  }
}

function diffStock(label, before, after) {
  console.log(`  📊 Cambio de stock [${label}]:`);
  for (const id of Object.keys(after)) {
    const b = before[id] || { llenos: 0, vacios: 0, lavado: 0 };
    const a = after[id];
    const dl = a.llenos - b.llenos;
    const dv = a.vacios - b.vacios;
    const dw = a.lavado - b.lavado;
    if (dl || dv || dw) {
      console.log(`     ${a.nombre}: llenos ${dl >= 0 ? '+' : ''}${dl}, vacios ${dv >= 0 ? '+' : ''}${dv}, lavado ${dw >= 0 ? '+' : ''}${dw}`);
    }
  }
}

(async () => {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║  AUDITORÍA E2E v2 — AquaControl                 ║');
  console.log('║  Flujo completo: Compra→Lavado→Producción→Venta ║');
  console.log('╚══════════════════════════════════════════════════╝');

  // IDs que iremos recogiendo
  let clienteId, ventaPlantaId, pedidoId, rutaId;
  const bidonId = 1, bolsa3kgId = 2, bolsa5kgId = 3;
  const insumoId = 1; // BOLSA PARA HIELO 3KG

  // ═══ 0. ESTADO INICIAL ═══
  log('ESTADO INICIAL');
  const stock0 = await getStock();
  const ins0 = await getInsumos();
  printStock('Inicio', stock0, ins0);

  // ═══ 1. ABRIR CAJA ═══
  log('ABRIR CAJA');
  let r = await api('POST', '/caja/abrir', { monto_inicial: 100 });
  if (r.ok) {
    ok(`Caja abierta con S/100`);
  } else {
    // Si ya hay caja
    r = await api('GET', '/caja');
    if (r.data?.caja?.estado) ok(`Caja ya abierta: ${r.data.caja.estado}`);
    else fail(`No se pudo abrir caja: ${JSON.stringify(r.data)}`);
  }

  // ═══ 2. CREAR CLIENTE ═══
  log('CREAR CLIENTE TEST');
  r = await api('POST', '/clientes', {
    nombre: 'CLIENTE AUDITORÍA', tipo: 'menudeo',
    telefono: '999888777', direccion: 'Calle Audit 123',
    latitud: '-6.7700', longitud: '-79.8400'
  });
  if (r.ok) { clienteId = r.data.id || r.data.insertId; ok(`Cliente ID=${clienteId}`); }
  else fail(`Crear cliente: ${JSON.stringify(r.data)}`);

  // ═══ 3. COMPRAR INSUMOS (50 bolsas + bidones como presentación) ═══
  log('COMPRA — 50 bolsas hielo al proveedor');
  const stockPre3 = await getStock();
  const insPre3 = await getInsumos();

  r = await api('POST', '/compras', {
    proveedor_id: 1,
    items: [
      { tipo_item: 'insumo', insumo_id: insumoId, cantidad: 50, precio_unitario: 0.30 }
    ]
  });
  if (r.ok) ok(`Compra creada: ${r.data.numero || r.data.id || 'OK'}`);
  else fail(`Compra: ${JSON.stringify(r.data)}`);

  const insPost3 = await getInsumos();
  const bolsaDiff = (insPost3[insumoId]?.stock || 0) - (insPre3[insumoId]?.stock || 0);
  if (bolsaDiff === 50) ok(`Insumo bolsas: 0 → 50 (+50 correcto)`);
  else fail(`Insumo bolsas esperaba +50, obtuvo +${bolsaDiff}`);

  // ═══ 4. AGREGAR BIDONES VACÍOS (compra_empresa) ═══
  log('STOCK — Ingresar 30 bidones vacíos');
  const stockPre4 = await getStock();

  r = await api('POST', `/presentaciones/${bidonId}/movimientos`, {
    tipo: 'compra_empresa', cantidad: 30, motivo: 'Compra bidones vacíos auditoría'
  });
  if (r.ok) ok('Movimiento compra_empresa registrado');
  else fail(`Movimiento: ${JSON.stringify(r.data)}`);

  const stockPost4 = await getStock();
  const vaciosDiff = stockPost4[bidonId].vacios - stockPre4[bidonId].vacios;
  if (vaciosDiff === 30) ok(`Bidón vacios: 0 → 30 (+30 correcto)`);
  else fail(`Bidón vacios esperaba +30, obtuvo +${vaciosDiff}`);

  // ═══ 5. LAVADO — enviar a lavado y completar ═══
  log('LAVADO — Enviar 20 bidones a lavado');
  const stockPre5 = await getStock();

  // Primero mover de vacio a en_lavado
  r = await api('POST', `/presentaciones/${bidonId}/movimientos`, {
    tipo: 'lavado_inicio', cantidad: 20, motivo: 'Enviar a lavado'
  });
  if (r.ok) ok('20 bidones enviados a lavado');
  else fail(`Lavado inicio: ${JSON.stringify(r.data)}`);

  const stockMid5 = await getStock();
  diffStock('Post lavado_inicio', stockPre5, stockMid5);

  // Ahora completar lavado
  r = await api('POST', '/lavados', {
    presentacion_id: bidonId, cantidad: 20, notas: 'Lavado auditoría'
  });
  if (r.ok) ok('Lavado completado: 20 bidones limpios');
  else fail(`Lavado: ${JSON.stringify(r.data)}`);

  const stockPost5 = await getStock();
  diffStock('Post lavado completo', stockPre5, stockPost5);
  // Esperado: vacios +0 neto (perdió 20 al enviar, ganó 20 al completar), lavado neto 0
  // Trigger trg_lavado_a_insumo: vacios += cantidad, en_lavado -= cantidad

  // ═══ 6. PRODUCCIÓN — Llenar 10 bidones + 20 bolsas hielo ═══
  log('PRODUCCIÓN — Lote 1: 10 bidones 20L');
  const stockPre6 = await getStock();

  r = await api('POST', '/produccion', {
    presentacion_id: bidonId, turno: 'mañana', cantidad_producida: 0, notas: 'Lote bidones audit'
  });
  let loteIdBidon;
  if (r.ok) { loteIdBidon = r.data.id || r.data.loteId || r.data.insertId; ok(`Lote creado ID=${loteIdBidon}`); }
  else fail(`Crear lote bidones: ${JSON.stringify(r.data)}`);

  if (loteIdBidon) {
    r = await api('PUT', `/produccion/${loteIdBidon}/completar`, { cantidad_producida: 10 });
    if (r.ok) ok('Lote completado: +10 bidones llenos');
    else fail(`Completar lote: ${JSON.stringify(r.data)}`);
  }

  const stockMid6 = await getStock();
  diffStock('Post prod bidones', stockPre6, stockMid6);

  log('PRODUCCIÓN — Lote 2: 20 bolsas hielo 3kg');
  r = await api('POST', '/produccion', {
    presentacion_id: bolsa3kgId, turno: 'mañana', cantidad_producida: 0, notas: 'Lote hielo audit'
  });
  let loteIdHielo;
  if (r.ok) { loteIdHielo = r.data.id || r.data.loteId || r.data.insertId; ok(`Lote creado ID=${loteIdHielo}`); }
  else fail(`Crear lote hielo: ${JSON.stringify(r.data)}`);

  if (loteIdHielo) {
    r = await api('PUT', `/produccion/${loteIdHielo}/completar`, { cantidad_producida: 20 });
    if (r.ok) ok('Lote completado: +20 bolsas hielo');
    else fail(`Completar lote hielo: ${JSON.stringify(r.data)}`);
  }

  const stockPost6 = await getStock();
  const insPost6 = await getInsumos();
  diffStock('Post toda producción', stockPre6, stockPost6);
  // Insumo bolsas debió consumirse: 20 bolsas (1 por bolsa hielo)
  const bolsasConsumo = (insPost6[insumoId]?.stock || 0) - (insPost3[insumoId]?.stock || 0);
  ok(`Insumo bolsas: 50 → ${insPost6[insumoId]?.stock} (consumo: ${-bolsasConsumo})`);

  printStock('POST-PRODUCCIÓN', stockPost6, insPost6);

  // ═══ 7. VENTA EN PLANTA ═══
  log('VENTA PLANTA — 3 recargas bidón + 5 bolsas hielo');
  const stockPre7 = await getStock();

  r = await api('POST', '/ventas', {
    cliente_id: clienteId || 1,
    lineas: [
      { presentacion_id: bidonId, tipo_linea: 'recarga', cantidad: 3, precio_unitario: 8.00, vacios_recibidos: 3 },
      { presentacion_id: bolsa3kgId, tipo_linea: 'producto', cantidad: 5, precio_unitario: 2.00 }
    ],
    pagos: [{ metodo: 'efectivo', monto: 34.00 }]
  });
  if (r.ok) {
    ventaPlantaId = r.data.id || r.data.ventaId || r.data.insertId;
    ok(`Venta creada ID=${ventaPlantaId}, total=S/34`);
  } else fail(`Venta: ${JSON.stringify(r.data)}`);

  const stockPost7 = await getStock();
  diffStock('Post venta planta', stockPre7, stockPost7);
  // Esperado: bidon llenos -3, bolsa3kg llenos -5
  // vacios_recibidos=3 en recarga → trigger mueve a lavado o vacios

  // Verificar caja
  r = await api('GET', '/caja');
  ok(`Caja: ${JSON.stringify(r.data?.resumen || {}).substring(0, 200)}`);

  // ═══ 8. PEDIDO ═══
  log('PEDIDO — 2 recargas bidón para delivery');
  r = await api('POST', '/pedidos', {
    cliente_id: clienteId || 1,
    detalle: [
      { presentacion_id: bidonId, cantidad: 2, precio_unitario: 8.00, tipo_linea: 'recarga' }
    ],
    notas: 'Pedido auditoría', direccion_entrega: 'Calle Audit 123',
    latitud: '-6.7700', longitud: '-79.8400'
  });
  if (r.ok) { pedidoId = r.data.id || r.data.pedidoId || r.data.insertId; ok(`Pedido ID=${pedidoId}`); }
  else fail(`Pedido: ${JSON.stringify(r.data)}`);

  // ═══ 9. CREAR RUTA ═══
  log('CREAR RUTA de reparto');
  r = await api('POST', '/rutas', {
    repartidor_id: 2, vehiculo_id: 1,
    fecha: new Date().toISOString().split('T')[0]
  });
  if (r.ok) { rutaId = r.data.id || r.data.rutaId || r.data.insertId; ok(`Ruta ID=${rutaId}`); }
  else fail(`Ruta: ${JSON.stringify(r.data)}`);

  // Asignar pedido a ruta
  if (pedidoId && rutaId) {
    r = await api('PUT', `/pedidos/${pedidoId}/asignar-ruta`, { ruta_id: rutaId });
    if (r.ok) ok(`Pedido ${pedidoId} → Ruta ${rutaId}`);
    else fail(`Asignar pedido: ${JSON.stringify(r.data)}`);
  }

  // ═══ 10. CARGAR VEHÍCULO ═══
  log('CARGAR VEHÍCULO — 5 bidones + 8 bolsas');
  const stockPre10 = await getStock();

  if (rutaId) {
    r = await api('PUT', `/rutas/${rutaId}/cargar`, {
      items: [
        { presentacion_id: bidonId, cantidad: 5 },
        { presentacion_id: bolsa3kgId, cantidad: 8 }
      ]
    });
    if (r.ok) ok('Vehículo cargado');
    else fail(`Cargar: ${JSON.stringify(r.data)}`);
  }

  const stockPost10 = await getStock();
  diffStock('Post carga vehículo', stockPre10, stockPost10);
  // Esperado: bidon llenos -5, bolsa3kg llenos -8 (van al vehículo)

  // ═══ 11. SALIR A RUTA ═══
  log('SALIR A RUTA');
  if (rutaId) {
    r = await api('PUT', `/rutas/${rutaId}/salir`, { km_inicio: 15000 });
    if (r.ok) ok('Ruta iniciada km=15000');
    else fail(`Salir: ${JSON.stringify(r.data)}`);
  }

  // ═══ 12. ENTREGAR PEDIDO (como chofer) ═══
  log('ENTREGAR PEDIDO');
  if (pedidoId) {
    r = await api('PUT', `/pedidos/${pedidoId}/entregar`, {
      metodo_pago: 'efectivo', vacios_recibidos: 2,
      monto_cobrado: 16.00, notas: 'Entrega audit'
    }, choferToken);
    if (r.ok) ok('Pedido entregado: 2 recargas, 2 vacios, S/16');
    else warn(`Entregar pedido: [${r.status}] ${JSON.stringify(r.data)}`);
  }

  // ═══ 13. VENTA AL PASO (como chofer) ═══
  log('VENTA AL PASO — 3 bolsas hielo en la calle');
  if (rutaId) {
    r = await api('POST', `/rutas/${rutaId}/venta-rapida`, {
      cliente_id: 1,
      lineas: [
        { presentacion_id: bolsa3kgId, tipo_linea: 'producto', cantidad: 3, precio_unitario: 2.00 }
      ],
      pagos: [{ metodo: 'efectivo', monto: 6.00 }]
    }, choferToken);
    if (r.ok) ok('Venta al paso: 3 bolsas = S/6');
    else warn(`Venta al paso: [${r.status}] ${JSON.stringify(r.data)}`);

    // Stock vehículo
    r = await api('GET', `/rutas/${rutaId}/stock-vehiculo`);
    const sv = r.data?.data || r.data;
    if (Array.isArray(sv)) {
      for (const s of sv) ok(`Vehículo: ${s.nombre || s.presentacion_id} = ${s.cantidad_actual || s.cantidad}`);
    }
  }

  // ═══ 14. GASTO EN RUTA ═══
  log('GASTO EN RUTA — S/20 combustible');
  if (rutaId) {
    r = await api('POST', `/rutas/${rutaId}/gasto`, {
      tipo: 'combustible', monto: 20.00, descripcion: 'Gasolina audit'
    }, choferToken);
    if (r.ok) ok('Gasto S/20 registrado');
    else warn(`Gasto: [${r.status}] ${JSON.stringify(r.data)}`);
  }

  // ═══ 15. VISITA PLANTA — devolver vacios ═══
  log('VISITA PLANTA — devolver 2 vacios');
  if (rutaId) {
    r = await api('POST', `/rutas/${rutaId}/visita-planta`, {
      items: [
        { presentacion_id: bidonId, vacios_devueltos: 2, llenos_devueltos: 0, llenos_cargados: 0 }
      ],
      notas: 'Devolver vacios audit'
    }, choferToken);
    if (r.ok) ok('Visita planta: 2 vacios devueltos');
    else warn(`Visita planta: [${r.status}] ${JSON.stringify(r.data)}`);
  }

  // ═══ 16. DEVOLVER LLENOS SOBRANTES ═══
  log('DEVOLVER LLENOS sobrantes al almacén');
  if (rutaId) {
    r = await api('PUT', `/rutas/${rutaId}/devolver-llenos`, {
      items: [
        { presentacion_id: bidonId, cantidad: 3 },
        { presentacion_id: bolsa3kgId, cantidad: 5 }
      ]
    });
    if (r.ok) ok('Devolvió 3 bidones + 5 bolsas');
    else warn(`Devolver llenos: [${r.status}] ${JSON.stringify(r.data)}`);
  }

  // ═══ 17. ENTREGAR CAJA REPARTIDOR ═══
  log('ENTREGAR CAJA REPARTIDOR');
  if (rutaId) {
    // Primero solicitar entrega
    r = await api('PUT', `/rutas/${rutaId}/solicitar-entrega`, {}, choferToken);
    if (r.ok) ok('Entrega caja solicitada');
    else warn(`Solicitar entrega: [${r.status}] ${JSON.stringify(r.data)}`);

    // Confirmar entrega (admin)
    r = await api('POST', `/rutas/${rutaId}/confirmar-entrega`, {});
    if (r.ok) ok('Entrega caja confirmada');
    else {
      warn(`Confirmar entrega: [${r.status}] ${JSON.stringify(r.data)}`);
      // Intentar entregar-caja directamente
      r = await api('POST', `/rutas/${rutaId}/entregar-caja`, {});
      if (r.ok) ok('Caja entregada directamente');
      else warn(`Entregar caja: [${r.status}] ${JSON.stringify(r.data)}`);
    }
  }

  // ═══ 18. FINALIZAR RUTA ═══
  log('FINALIZAR RUTA');
  if (rutaId) {
    r = await api('PUT', `/rutas/${rutaId}/finalizar`, { km_fin: 15080 });
    if (r.ok) ok('Ruta finalizada km=15080 (80km recorridos)');
    else warn(`Finalizar: [${r.status}] ${JSON.stringify(r.data)}`);
  }

  // ═══ 19. ANULAR VENTA PLANTA ═══
  log('ANULAR VENTA de planta');
  if (ventaPlantaId) {
    const stockPreAnula = await getStock();
    r = await api('PUT', `/ventas/${ventaPlantaId}/cancelar`, { motivo: 'Prueba anulación audit' });
    if (r.ok) ok(`Venta ${ventaPlantaId} anulada`);
    else warn(`Anular venta: [${r.status}] ${JSON.stringify(r.data)}`);

    const stockPostAnula = await getStock();
    diffStock('Post anulación', stockPreAnula, stockPostAnula);
    // ¿Se devolvió el stock? Verificar si bidon llenos subió +3 y bolsa +5
  }

  // ═══ 20. DEVOLUCIÓN DE BIDONES ═══
  log('DEVOLUCIÓN — Cliente devuelve 1 bidón prestado');
  if (clienteId) {
    r = await api('POST', '/devoluciones', {
      cliente_id: clienteId,
      presentacion_id: bidonId,
      cantidad: 1,
      motivo: 'Devolución auditoría'
    });
    if (r.ok) ok('Devolución registrada: 1 bidón');
    else warn(`Devolución: [${r.status}] ${JSON.stringify(r.data)}`);
  }

  // ═══ 21. MOVIMIENTO MANUAL DE CAJA ═══
  log('MOVIMIENTO CAJA — Ingreso manual S/50');
  r = await api('POST', '/caja/movimientos', {
    tipo: 'ingreso', metodo_pago: 'efectivo', monto: 50.00,
    descripcion: 'Ingreso manual auditoría'
  });
  if (r.ok) ok('Ingreso manual S/50');
  else warn(`Movimiento caja: [${r.status}] ${JSON.stringify(r.data)}`);

  // ═══ VERIFICACIONES FINALES ═══
  log('═══ VERIFICACIÓN FINAL DE STOCK ═══');
  const stockFinal = await getStock();
  const insFinal = await getInsumos();
  printStock('FINAL', stockFinal, insFinal);

  console.log('\n  📊 RESUMEN DE CAMBIOS DESDE INICIO:');
  for (const id of Object.keys(stockFinal)) {
    const ini = stock0[id] || { llenos: 0, vacios: 0, lavado: 0 };
    const fin = stockFinal[id];
    console.log(`     ${fin.nombre}:`);
    console.log(`       Llenos: ${ini.llenos} → ${fin.llenos} (${fin.llenos - ini.llenos >= 0 ? '+' : ''}${fin.llenos - ini.llenos})`);
    console.log(`       Vacios: ${ini.vacios} → ${fin.vacios} (${fin.vacios - ini.vacios >= 0 ? '+' : ''}${fin.vacios - ini.vacios})`);
    console.log(`       Lavado: ${ini.lavado} → ${fin.lavado} (${fin.lavado - ini.lavado >= 0 ? '+' : ''}${fin.lavado - ini.lavado})`);
  }

  // Lógica esperada para Bidón 20L:
  // +30 vacios (compra_empresa) → -20 vacios +20 lavado (lavado_inicio) → -20 lavado +20 vacios (lavado_fin)
  // Producción: -10 vacios +10 llenos
  // Venta planta: -3 llenos +3 vacios (recarga con vacios_recibidos=3)
  // Cargar vehiculo: -5 llenos
  // Pedido entregado: -2 de vehiculo, +2 vacios en vehiculo
  // Visita planta: +2 vacios devueltos
  // Devolver llenos: +3 llenos
  // Anulación: +3 llenos +5 bolsas? (depende de si hay lógica de reversa)
  // Esperado final bidones: llenos ~5-8, vacios ~22-25 (depende de anulación)

  log('═══ VERIFICACIÓN FINAL DE DINERO ═══');
  r = await api('GET', '/caja');
  const caja = r.data;
  console.log(`  💰 Estado: ${caja.caja?.estado}`);
  console.log(`  💰 Monto inicial: S/${caja.caja?.monto_inicial}`);
  console.log(`  💰 Resumen: ${JSON.stringify(caja.resumen)}`);

  r = await api('GET', '/caja/movimientos');
  const movs = r.data?.data || r.data;
  if (Array.isArray(movs) && movs.length) {
    console.log(`\n  💰 MOVIMIENTOS DE CAJA (${movs.length}):`);
    let ingresos = 0, egresos = 0;
    for (const m of movs) {
      const monto = parseFloat(m.monto || 0);
      const esIngreso = ['ingreso', 'venta', 'abono_cliente', 'venta_reparto'].includes(m.tipo);
      if (esIngreso && !m.anulado) ingresos += monto;
      else if (!m.anulado) egresos += monto;
      console.log(`     ${esIngreso ? '+' : '-'}S/${monto.toFixed(2)} | ${m.tipo} | ${(m.descripcion || '').substring(0, 40)} | anulado=${m.anulado || 0}`);
    }
    console.log(`\n  💰 Total ingresos: S/${ingresos.toFixed(2)}`);
    console.log(`  💰 Total egresos:  S/${egresos.toFixed(2)}`);
    console.log(`  💰 Saldo esperado: S/${(100 + ingresos - egresos).toFixed(2)}`);
  }

  // ═══ 22. CERRAR CAJA ═══
  log('CERRAR CAJA');
  r = await api('PUT', '/caja/cerrar', { observaciones: 'Cierre auditoría' });
  if (r.ok) ok('Caja cerrada correctamente');
  else warn(`Cerrar caja: [${r.status}] ${JSON.stringify(r.data)}`);

  // ═══ DASHBOARD FINAL ═══
  log('DASHBOARD FINAL');
  r = await api('GET', '/dashboard');
  const d = r.data;
  console.log(`  📊 Ventas: cantidad=${d.ventas?.cantidad}, total=S/${d.ventas?.total}`);
  console.log(`  📊 Clientes activos: ${d.clientes_activos}`);
  console.log(`  📊 Bidones llenos: ${d.bidones_llenos}`);
  console.log(`  📊 Bidones prestados: ${d.bidones_prestados}`);
  console.log(`  📊 Pendientes lavado: ${d.pendientes_lavado}`);
  console.log(`  📊 Vacios disponibles: ${d.vacios_disponibles}`);
  console.log(`  📊 Deuda clientes: S/${d.deuda_clientes}`);
  console.log(`  📊 Deuda proveedores: S/${d.deuda_proveedores}`);
  console.log(`  📊 Producción: lotes=${d.produccion?.lotes}, unidades=${d.produccion?.unidades}`);

  // ═══ RESUMEN ═══
  console.log('\n' + '═'.repeat(55));
  console.log('  RESUMEN AUDITORÍA E2E v2');
  console.log('═'.repeat(55));
  console.log(`  Pasos ejecutados: ${step}`);
  console.log(`  ❌ Errores:  ${errors.length}`);
  console.log(`  ⚠️  Warnings: ${warnings.length}`);
  if (errors.length) {
    console.log('\n  ERRORES:');
    for (const e of errors) console.log(`    ❌ ${e}`);
  }
  if (warnings.length) {
    console.log('\n  WARNINGS:');
    for (const w of warnings) console.log(`    ⚠️  ${w}`);
  }
  if (!errors.length && !warnings.length) {
    console.log('\n  🎉 TODO PERFECTO — Sistema funciona correctamente');
  }
  console.log('═'.repeat(55));

})().catch(e => {
  console.error('\n💀 FATAL:', e.message);
  console.error(e.stack);
});
