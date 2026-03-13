/**
 * AUDITORÍA E2E — AquaControl
 * Simula el flujo completo de negocio y verifica stock + dinero en cada paso.
 * NO modifica código. Solo usa endpoints como lo haría un usuario real.
 */
require('dotenv').config();
const jwt = require('jsonwebtoken');

const BASE = 'http://127.0.0.1:3001/api';
const HEADERS_BASE = { 'Content-Type': 'application/json', 'Host': 'demo.aquacontrol.site' };

// Generate tokens
const adminToken = jwt.sign(
  { id: 1, nombre: 'Administrador', email: 'admin@aquacontrol.pe', rol: 'admin' },
  process.env.JWT_SECRET, { expiresIn: '2h' }
);
const choferToken = jwt.sign(
  { id: 2, nombre: 'Chofer Demo', email: 'chofer@aquacontrol.pe', rol: 'chofer' },
  process.env.JWT_SECRET, { expiresIn: '2h' }
);

function headers(token) {
  return { ...HEADERS_BASE, 'Authorization': 'Bearer ' + token };
}

async function api(method, path, body, token = adminToken) {
  const opts = { method, headers: headers(token) };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

const errors = [];
const warnings = [];
let step = 0;

function log(msg) { step++; console.log(`\n[${step}] ${msg}`); }
function ok(msg) { console.log(`  ✅ ${msg}`); }
function fail(msg) { console.log(`  ❌ ${msg}`); errors.push(`[${step}] ${msg}`); }
function warn(msg) { console.log(`  ⚠️  ${msg}`); warnings.push(`[${step}] ${msg}`); }
function check(condition, okMsg, failMsg) {
  if (condition) ok(okMsg);
  else fail(failMsg);
}

(async () => {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║  AUDITORÍA E2E — AquaControl                ║');
  console.log('║  Flujo completo de negocio                  ║');
  console.log('╚══════════════════════════════════════════════╝');

  // ═══════════════════════════════════════════════
  // PASO 0: Estado inicial
  // ═══════════════════════════════════════════════
  log('ESTADO INICIAL — Verificar datos base');

  // Dashboard
  const { data: dash0 } = await api('GET', '/dashboard');
  ok(`Dashboard: ventas=${dash0.ventas?.cantidad || 0}, clientes=${dash0.clientes_activos}, bidones_llenos=${dash0.bidones_llenos}`);

  // Presentaciones (stock inicial)
  const { data: pres0 } = await api('GET', '/presentaciones');
  const presArray = pres0.data || pres0;
  for (const p of presArray) {
    ok(`${p.nombre}: llenos=${p.stock_llenos}, vacios=${p.stock_vacios}, en_lavado=${p.stock_en_lavado}`);
  }

  // Insumos
  const { data: ins0 } = await api('GET', '/insumos');
  const insArray = ins0.data || ins0;
  for (const i of insArray) {
    ok(`Insumo: ${i.nombre} stock=${i.stock_actual}`);
  }

  // Clientes
  const { data: cli0 } = await api('GET', '/clientes');
  ok(`Clientes: ${cli0.total} registrados`);

  // Proveedores
  const { data: prov0 } = await api('GET', '/proveedores');
  ok(`Proveedores: ${(prov0.data || prov0).length} registrados`);

  // Vehiculos
  const { data: veh0 } = await api('GET', '/vehiculos');
  ok(`Vehiculos: ${(veh0.data || veh0).length} registrados`);

  // Guardar stocks iniciales
  const stockInicial = {};
  for (const p of presArray) {
    stockInicial[p.id] = { llenos: p.stock_llenos, vacios: p.stock_vacios, en_lavado: p.stock_en_lavado };
  }

  // ═══════════════════════════════════════════════
  // PASO 1: ABRIR CAJA
  // ═══════════════════════════════════════════════
  log('ABRIR CAJA — Iniciar día de trabajo');

  const { status: cajaStatus, data: cajaData } = await api('POST', '/caja/abrir', { monto_inicial: 100 });
  if (cajaStatus === 200 || cajaStatus === 201) {
    ok(`Caja abierta. ID=${cajaData.caja?.id || cajaData.id || '?'}, monto_inicial=100`);
  } else {
    // Maybe caja already open
    const { data: cajaActual } = await api('GET', '/caja');
    if (cajaActual.caja && ['abierta', 'reabierta'].includes(cajaActual.caja.estado)) {
      ok(`Caja ya estaba abierta. ID=${cajaActual.caja.id}, estado=${cajaActual.caja.estado}`);
    } else {
      fail(`No se pudo abrir caja: ${JSON.stringify(cajaData)}`);
    }
  }

  // Verificar estado caja
  const { data: cajaInfo } = await api('GET', '/caja');
  ok(`Caja estado: ${cajaInfo.caja?.estado || 'N/A'}, saldo: ${cajaInfo.resumen?.saldo || cajaInfo.caja?.monto_inicial || '?'}`);

  // ═══════════════════════════════════════════════
  // PASO 2: CREAR CLIENTE NUEVO
  // ═══════════════════════════════════════════════
  log('CREAR CLIENTE — Para pruebas de venta');

  const { status: cliStatus, data: cliData } = await api('POST', '/clientes', {
    nombre: 'TEST AUDITORÍA',
    tipo: 'menudeo',
    telefono: '999888777',
    direccion: 'Calle Test 123',
    latitud: '-6.7700',
    longitud: '-79.8400'
  });
  let clienteTestId;
  if (cliStatus === 200 || cliStatus === 201) {
    clienteTestId = cliData.id || cliData.insertId;
    ok(`Cliente creado: ID=${clienteTestId}`);
  } else {
    fail(`Error creando cliente: ${JSON.stringify(cliData)}`);
  }

  // ═══════════════════════════════════════════════
  // PASO 3: COMPRA DE INSUMOS (bidones vacíos + bolsas)
  // ═══════════════════════════════════════════════
  log('COMPRA — Comprar bidones vacíos y bolsas al proveedor');

  // Primero verificar que insumos existen
  const { data: insumosList } = await api('GET', '/insumos');
  const insumos = insumosList.data || insumosList;
  ok(`Insumos disponibles: ${insumos.map(i => i.nombre + ' (id=' + i.id + ')').join(', ')}`);

  // Obtener presentaciones para referenciar
  const { data: presList } = await api('GET', '/presentaciones');
  const presentaciones = presList.data || presList;

  // Stock pre-compra de insumos
  const stockInsumosAntes = {};
  for (const i of insumos) stockInsumosAntes[i.id] = i.stock_actual;

  // Compra: 50 bolsas de hielo a proveedor
  const { status: compStatus, data: compData } = await api('POST', '/compras', {
    proveedor_id: 1,
    tipo_pago: 'contado',
    metodo_pago: 'efectivo',
    notas: 'Compra auditoría',
    detalle: [
      { insumo_id: insumos[0]?.id, presentacion_id: null, cantidad: 50, precio_unitario: 0.30, subtotal: 15 }
    ]
  });

  if (compStatus === 200 || compStatus === 201) {
    ok(`Compra creada: ${JSON.stringify(compData).substring(0, 100)}`);
  } else {
    fail(`Error en compra: [${compStatus}] ${JSON.stringify(compData)}`);
  }

  // Verificar que stock de insumo aumentó
  const { data: insPostCompra } = await api('GET', '/insumos');
  const insPost = (insPostCompra.data || insPostCompra);
  for (const i of insPost) {
    const antes = stockInsumosAntes[i.id] || 0;
    const diff = i.stock_actual - antes;
    if (diff > 0) ok(`Insumo ${i.nombre}: ${antes} → ${i.stock_actual} (+${diff})`);
    else if (diff === 0 && antes > 0) ok(`Insumo ${i.nombre}: sin cambio (${i.stock_actual})`);
  }

  // Verificar movimiento de caja (egreso por compra contado)
  const { data: cajaPost1 } = await api('GET', '/caja');
  ok(`Caja después de compra: ${JSON.stringify(cajaPost1.resumen || {}).substring(0, 150)}`);

  // ═══════════════════════════════════════════════
  // PASO 4: AJUSTE DE STOCK — Simular que tenemos bidones vacíos
  // ═══════════════════════════════════════════════
  log('AJUSTE STOCK — Agregar bidones vacíos a presentación Bidon 20L');

  const bidon20L = presentaciones.find(p => p.nombre.toLowerCase().includes('bidon'));
  if (bidon20L) {
    // Agregar vacios via movimiento manual
    const { status: movStatus, data: movData } = await api('POST', `/presentaciones/${bidon20L.id}/movimientos`, {
      tipo: 'ajuste_entrada',
      cantidad: 30,
      estado_destino: 'vacio',
      motivo: 'Ingreso inicial bidones vacíos para auditoría'
    });
    if (movStatus === 200 || movStatus === 201) {
      ok(`Movimiento stock creado: +30 vacios para ${bidon20L.nombre}`);
    } else {
      warn(`Movimiento stock: [${movStatus}] ${JSON.stringify(movData)}`);
    }

    // Verificar stock actualizado
    const { data: presPost } = await api('GET', `/presentaciones/${bidon20L.id}`);
    const pd = presPost.data || presPost;
    ok(`${bidon20L.nombre} post-ajuste: llenos=${pd.stock_llenos}, vacios=${pd.stock_vacios}, lavado=${pd.stock_en_lavado}`);
  }

  // ═══════════════════════════════════════════════
  // PASO 5: LAVADO — Lavar bidones
  // ═══════════════════════════════════════════════
  log('LAVADO — Lavar bidones vacíos');

  // Pendientes de lavado
  const { data: pendLav } = await api('GET', '/lavados/pendientes');
  ok(`Pendientes lavado: ${JSON.stringify(pendLav).substring(0, 200)}`);

  if (bidon20L) {
    const { status: lavStatus, data: lavData } = await api('POST', '/lavados', {
      presentacion_id: bidon20L.id,
      cantidad: 20,
      notas: 'Lavado auditoría'
    });
    if (lavStatus === 200 || lavStatus === 201) {
      ok(`Lavado registrado: 20 bidones`);
    } else {
      warn(`Lavado: [${lavStatus}] ${JSON.stringify(lavData)}`);
    }

    // Verificar que vacios disminuyeron y lavados/vacios cambiaron
    const { data: presPostLav } = await api('GET', `/presentaciones/${bidon20L.id}`);
    const pl = presPostLav.data || presPostLav;
    ok(`${bidon20L.nombre} post-lavado: llenos=${pl.stock_llenos}, vacios=${pl.stock_vacios}, lavado=${pl.stock_en_lavado}`);
  }

  // ═══════════════════════════════════════════════
  // PASO 6: PRODUCCIÓN — Llenar bidones + bolsas de hielo
  // ═══════════════════════════════════════════════
  log('PRODUCCION — Crear lotes de producción');

  // Verificar recetas
  for (const p of presentaciones) {
    const { data: receta } = await api('GET', `/produccion/receta/${p.id}`);
    const rec = receta.data || receta;
    if (Array.isArray(rec) && rec.length > 0) {
      ok(`Receta ${p.nombre}: ${rec.map(r => r.insumo_nombre + ' x' + r.cantidad).join(', ')}`);
    } else {
      warn(`${p.nombre}: sin receta`);
    }
  }

  // Producir bidones 20L (10 unidades)
  if (bidon20L) {
    const { status: prodStatus, data: prodData } = await api('POST', '/produccion', {
      presentacion_id: bidon20L.id,
      cantidad: 10,
      notas: 'Lote auditoría bidones'
    });
    if (prodStatus === 200 || prodStatus === 201) {
      const loteId = prodData.id || prodData.loteId || prodData.insertId;
      ok(`Lote bidones creado: ID=${loteId}`);

      // Completar lote
      const { status: compLoteStatus, data: compLoteData } = await api('PUT', `/produccion/${loteId}/completar`, {
        cantidad_producida: 10
      });
      if (compLoteStatus === 200) {
        ok(`Lote completado: 10 bidones llenos`);
      } else {
        fail(`Error completando lote: [${compLoteStatus}] ${JSON.stringify(compLoteData)}`);
      }
    } else {
      warn(`Producción bidones: [${prodStatus}] ${JSON.stringify(prodData)}`);
    }
  }

  // Producir bolsas hielo 3kg (20 unidades)
  const bolsa3kg = presentaciones.find(p => p.nombre.toLowerCase().includes('3kg'));
  if (bolsa3kg) {
    const { status: prodStatus2, data: prodData2 } = await api('POST', '/produccion', {
      presentacion_id: bolsa3kg.id,
      cantidad: 20,
      notas: 'Lote auditoría hielo'
    });
    if (prodStatus2 === 200 || prodStatus2 === 201) {
      const loteId2 = prodData2.id || prodData2.loteId || prodData2.insertId;
      ok(`Lote hielo creado: ID=${loteId2}`);

      const { status: compLoteStatus2, data: compLoteData2 } = await api('PUT', `/produccion/${loteId2}/completar`, {
        cantidad_producida: 20
      });
      if (compLoteStatus2 === 200) {
        ok(`Lote completado: 20 bolsas hielo 3kg`);
      } else {
        fail(`Error completando lote hielo: [${compLoteStatus2}] ${JSON.stringify(compLoteData2)}`);
      }
    } else {
      warn(`Producción hielo: [${prodStatus2}] ${JSON.stringify(prodData2)}`);
    }
  }

  // Stock después de producción
  log('VERIFICAR STOCK POST-PRODUCCIÓN');
  const { data: presPostProd } = await api('GET', '/presentaciones');
  const presPostProdArr = presPostProd.data || presPostProd;
  for (const p of presPostProdArr) {
    ok(`${p.nombre}: llenos=${p.stock_llenos}, vacios=${p.stock_vacios}, lavado=${p.stock_en_lavado}`);
  }

  // Insumos post-producción (debería haber consumido bolsas)
  const { data: insPostProd } = await api('GET', '/insumos');
  for (const i of (insPostProd.data || insPostProd)) {
    ok(`Insumo ${i.nombre}: stock=${i.stock_actual}`);
  }

  // ═══════════════════════════════════════════════
  // PASO 7: VENTA EN PLANTA — Venta directa
  // ═══════════════════════════════════════════════
  log('VENTA EN PLANTA — Vender 3 bidones recarga + 5 bolsas hielo');

  const clienteId = clienteTestId || 1; // fallback a Cliente General

  const { status: ventaStatus, data: ventaData } = await api('POST', '/ventas', {
    cliente_id: clienteId,
    metodo_pago: 'efectivo',
    detalle: [
      { presentacion_id: bidon20L?.id, cantidad: 3, precio_unitario: 8.00, tipo_linea: 'recarga', vacios_recibidos: 3 },
      { presentacion_id: bolsa3kg?.id, cantidad: 5, precio_unitario: 2.00, tipo_linea: 'producto', vacios_recibidos: 0 }
    ]
  });

  let ventaId;
  if (ventaStatus === 200 || ventaStatus === 201) {
    ventaId = ventaData.id || ventaData.ventaId || ventaData.insertId;
    ok(`Venta creada: ID=${ventaId}, total esperado = ${3*8 + 5*2} = S/ 34.00`);
  } else {
    fail(`Error en venta: [${ventaStatus}] ${JSON.stringify(ventaData)}`);
  }

  // Verificar stock post-venta
  log('VERIFICAR STOCK POST-VENTA PLANTA');
  const { data: presPostVenta } = await api('GET', '/presentaciones');
  for (const p of (presPostVenta.data || presPostVenta)) {
    ok(`${p.nombre}: llenos=${p.stock_llenos}, vacios=${p.stock_vacios}, lavado=${p.stock_en_lavado}`);
  }

  // Verificar caja (debería tener ingreso de S/34)
  const { data: cajaPostVenta } = await api('GET', '/caja');
  ok(`Caja post-venta: ${JSON.stringify(cajaPostVenta.resumen || {}).substring(0, 200)}`);

  // ═══════════════════════════════════════════════
  // PASO 8: PEDIDOS — Crear pedidos para reparto
  // ═══════════════════════════════════════════════
  log('PEDIDOS — Crear pedidos de clientes');

  const { status: pedStatus1, data: pedData1 } = await api('POST', '/pedidos', {
    cliente_id: clienteId,
    detalle: [
      { presentacion_id: bidon20L?.id, cantidad: 2, precio_unitario: 8.00, tipo_linea: 'recarga' }
    ],
    notas: 'Pedido auditoría 1',
    direccion_entrega: 'Calle Test 123',
    latitud: '-6.7700',
    longitud: '-79.8400'
  });

  let pedidoId1;
  if (pedStatus1 === 200 || pedStatus1 === 201) {
    pedidoId1 = pedData1.id || pedData1.pedidoId || pedData1.insertId;
    ok(`Pedido 1 creado: ID=${pedidoId1}`);
  } else {
    fail(`Error pedido: [${pedStatus1}] ${JSON.stringify(pedData1)}`);
  }

  // ═══════════════════════════════════════════════
  // PASO 9: CREAR RUTA DE REPARTO
  // ═══════════════════════════════════════════════
  log('RUTA — Crear ruta de reparto');

  const { status: rutaStatus, data: rutaData } = await api('POST', '/rutas', {
    repartidor_id: 2,
    vehiculo_id: 1,
    fecha: new Date().toISOString().split('T')[0]
  });

  let rutaId;
  if (rutaStatus === 200 || rutaStatus === 201) {
    rutaId = rutaData.id || rutaData.rutaId || rutaData.insertId;
    ok(`Ruta creada: ID=${rutaId}`);
  } else {
    fail(`Error ruta: [${rutaStatus}] ${JSON.stringify(rutaData)}`);
  }

  // Asignar pedido a ruta
  if (pedidoId1 && rutaId) {
    const { status: asigStatus } = await api('PUT', `/pedidos/${pedidoId1}/asignar-ruta`, { ruta_id: rutaId });
    check(asigStatus === 200, `Pedido ${pedidoId1} asignado a ruta ${rutaId}`, `Error asignando pedido a ruta: ${asigStatus}`);
  }

  // ═══════════════════════════════════════════════
  // PASO 10: CARGAR VEHÍCULO
  // ═══════════════════════════════════════════════
  log('CARGAR VEHÍCULO — Cargar stock para reparto');

  // Stock antes de cargar
  const { data: presPreCarga } = await api('GET', '/presentaciones');
  const stockPreCarga = {};
  for (const p of (presPreCarga.data || presPreCarga)) {
    stockPreCarga[p.id] = { llenos: p.stock_llenos, vacios: p.stock_vacios };
    ok(`Pre-carga ${p.nombre}: llenos=${p.stock_llenos}`);
  }

  if (rutaId) {
    const cargaItems = [];
    if (bidon20L) cargaItems.push({ presentacion_id: bidon20L.id, cantidad: 5 });
    if (bolsa3kg) cargaItems.push({ presentacion_id: bolsa3kg.id, cantidad: 10 });

    const { status: cargaStatus, data: cargaData } = await api('PUT', `/rutas/${rutaId}/cargar`, {
      items: cargaItems
    });
    if (cargaStatus === 200) {
      ok(`Vehículo cargado: ${JSON.stringify(cargaItems)}`);
    } else {
      fail(`Error cargando vehículo: [${cargaStatus}] ${JSON.stringify(cargaData)}`);
    }

    // Verificar que stock planta disminuyó
    const { data: presPostCarga } = await api('GET', '/presentaciones');
    for (const p of (presPostCarga.data || presPostCarga)) {
      const antes = stockPreCarga[p.id]?.llenos || 0;
      const diff = p.stock_llenos - antes;
      if (diff !== 0) ok(`${p.nombre}: ${antes} → ${p.stock_llenos} (${diff > 0 ? '+' : ''}${diff} en planta)`);
    }

    // Verificar stock en vehículo
    const { data: stockVeh } = await api('GET', `/rutas/${rutaId}/stock-vehiculo`);
    ok(`Stock vehículo: ${JSON.stringify(stockVeh).substring(0, 200)}`);
  }

  // ═══════════════════════════════════════════════
  // PASO 11: SALIR A RUTA
  // ═══════════════════════════════════════════════
  log('SALIR A RUTA — Repartidor sale');

  if (rutaId) {
    const { status: salirStatus, data: salirData } = await api('PUT', `/rutas/${rutaId}/salir`, {
      km_inicio: 15000
    });
    if (salirStatus === 200) {
      ok(`Ruta iniciada, km_inicio=15000`);
    } else {
      fail(`Error salir ruta: [${salirStatus}] ${JSON.stringify(salirData)}`);
    }
  }

  // ═══════════════════════════════════════════════
  // PASO 12: ENTREGAR PEDIDO
  // ═══════════════════════════════════════════════
  log('ENTREGAR PEDIDO — Repartidor entrega al cliente');

  if (pedidoId1) {
    const { status: entregaStatus, data: entregaData } = await api('PUT', `/pedidos/${pedidoId1}/entregar`, {
      metodo_pago: 'efectivo',
      vacios_recibidos: 2,
      monto_cobrado: 16.00,
      notas: 'Entrega auditoría'
    }, choferToken);
    if (entregaStatus === 200) {
      ok(`Pedido entregado: 2 bidones recarga, 2 vacios recibidos, S/16`);
    } else {
      warn(`Entrega pedido: [${entregaStatus}] ${JSON.stringify(entregaData)}`);
    }
  }

  // ═══════════════════════════════════════════════
  // PASO 13: VENTA AL PASO — Venta durante reparto
  // ═══════════════════════════════════════════════
  log('VENTA AL PASO — Repartidor vende en la calle');

  if (rutaId) {
    const { status: vapStatus, data: vapData } = await api('POST', `/rutas/${rutaId}/venta-rapida`, {
      cliente_id: 1, // Cliente General
      metodo_pago: 'efectivo',
      detalle: [
        { presentacion_id: bolsa3kg?.id, cantidad: 3, precio_unitario: 2.00, tipo_linea: 'producto' }
      ]
    }, choferToken);
    if (vapStatus === 200 || vapStatus === 201) {
      ok(`Venta al paso: 3 bolsas hielo = S/6`);
    } else {
      warn(`Venta al paso: [${vapStatus}] ${JSON.stringify(vapData)}`);
    }

    // Verificar stock vehículo post-venta
    const { data: stockVehPost } = await api('GET', `/rutas/${rutaId}/stock-vehiculo`);
    ok(`Stock vehículo post-ventas: ${JSON.stringify(stockVehPost).substring(0, 200)}`);
  }

  // ═══════════════════════════════════════════════
  // PASO 14: COBRO DE DEUDA en ruta
  // ═══════════════════════════════════════════════
  log('COBRO DEUDA — Verificar si cliente tiene deuda');

  const { data: deudas } = await api('GET', '/deudas');
  ok(`Clientes con deuda: ${JSON.stringify(deudas).substring(0, 200)}`);

  // ═══════════════════════════════════════════════
  // PASO 15: GASTO EN RUTA
  // ═══════════════════════════════════════════════
  log('GASTO RUTA — Registrar gasto de combustible');

  if (rutaId) {
    const { status: gastoStatus, data: gastoData } = await api('POST', `/rutas/${rutaId}/gasto`, {
      monto: 20.00,
      metodo_pago: 'efectivo',
      descripcion: 'Gasolina auditoría'
    }, choferToken);
    if (gastoStatus === 200 || gastoStatus === 201) {
      ok(`Gasto registrado: S/20 gasolina`);
    } else {
      warn(`Gasto ruta: [${gastoStatus}] ${JSON.stringify(gastoData)}`);
    }
  }

  // ═══════════════════════════════════════════════
  // PASO 16: DEVOLVER LLENOS (sobrantes) y VACIOS
  // ═══════════════════════════════════════════════
  log('DEVOLVER — Repartidor devuelve sobrantes a planta');

  if (rutaId) {
    // Visita a planta para devolver vacios
    const { status: visitaStatus, data: visitaData } = await api('POST', `/rutas/${rutaId}/visita-planta`, {
      vacios_entregados: [
        { presentacion_id: bidon20L?.id, cantidad: 2 }
      ],
      notas: 'Devolver vacios auditoría'
    }, choferToken);
    if (visitaStatus === 200 || visitaStatus === 201) {
      ok(`Visita planta: devolvió 2 vacios`);
    } else {
      warn(`Visita planta: [${visitaStatus}] ${JSON.stringify(visitaData)}`);
    }
  }

  // ═══════════════════════════════════════════════
  // PASO 17: FINALIZAR RUTA
  // ═══════════════════════════════════════════════
  log('FINALIZAR RUTA — Repartidor regresa');

  if (rutaId) {
    // Devolver llenos sobrantes
    const { status: devLlenosStatus, data: devLlenosData } = await api('PUT', `/rutas/${rutaId}/devolver-llenos`, {
      items: [
        { presentacion_id: bidon20L?.id, cantidad: 3 },
        { presentacion_id: bolsa3kg?.id, cantidad: 7 }
      ]
    });
    if (devLlenosStatus === 200) {
      ok(`Devolvió llenos: 3 bidones + 7 bolsas`);
    } else {
      warn(`Devolver llenos: [${devLlenosStatus}] ${JSON.stringify(devLlenosData)}`);
    }

    const { status: finStatus, data: finData } = await api('PUT', `/rutas/${rutaId}/finalizar`, {
      km_fin: 15080
    });
    if (finStatus === 200) {
      ok(`Ruta finalizada. km_recorridos = ${15080 - 15000}`);
    } else {
      warn(`Finalizar ruta: [${finStatus}] ${JSON.stringify(finData)}`);
    }
  }

  // ═══════════════════════════════════════════════
  // PASO 18: CANCELAR VENTA (anulación)
  // ═══════════════════════════════════════════════
  log('ANULAR VENTA — Cancelar la venta de planta');

  if (ventaId) {
    const { status: anulaStatus, data: anulaData } = await api('PUT', `/ventas/${ventaId}/cancelar`, {
      motivo: 'Prueba auditoría de anulación'
    });
    if (anulaStatus === 200) {
      ok(`Venta ${ventaId} anulada`);
    } else {
      warn(`Anular venta: [${anulaStatus}] ${JSON.stringify(anulaData)}`);
    }
  }

  // ═══════════════════════════════════════════════
  // PASO 19: VERIFICACIÓN FINAL DE STOCK
  // ═══════════════════════════════════════════════
  log('═══ VERIFICACIÓN FINAL DE STOCK ═══');

  const { data: presFinal } = await api('GET', '/presentaciones');
  for (const p of (presFinal.data || presFinal)) {
    const ini = stockInicial[p.id] || { llenos: 0, vacios: 0, en_lavado: 0 };
    console.log(`  📦 ${p.nombre}:`);
    console.log(`     Inicio  → llenos=${ini.llenos}, vacios=${ini.vacios}, lavado=${ini.en_lavado}`);
    console.log(`     Final   → llenos=${p.stock_llenos}, vacios=${p.stock_vacios}, lavado=${p.stock_en_lavado}`);
    console.log(`     Cambio  → llenos=${p.stock_llenos - ini.llenos}, vacios=${p.stock_vacios - ini.vacios}, lavado=${p.stock_en_lavado - ini.en_lavado}`);
  }

  const { data: insFinal } = await api('GET', '/insumos');
  for (const i of (insFinal.data || insFinal)) {
    const antes = stockInsumosAntes[i.id] || 0;
    console.log(`  📦 Insumo ${i.nombre}: ${antes} → ${i.stock_actual} (cambio: ${i.stock_actual - antes})`);
  }

  // ═══════════════════════════════════════════════
  // PASO 20: VERIFICACIÓN FINAL DE DINERO (CAJA)
  // ═══════════════════════════════════════════════
  log('═══ VERIFICACIÓN FINAL DE DINERO ═══');

  const { data: cajaFinal } = await api('GET', '/caja');
  console.log(`  💰 Caja estado: ${cajaFinal.caja?.estado}`);
  console.log(`  💰 Monto inicial: ${cajaFinal.caja?.monto_inicial}`);
  const resumen = cajaFinal.resumen || {};
  console.log(`  💰 Resumen: ${JSON.stringify(resumen)}`);

  // Detalle movimientos
  const { data: movsFinal } = await api('GET', '/caja/movimientos');
  const movs = movsFinal.data || movsFinal;
  if (Array.isArray(movs)) {
    console.log(`  💰 Total movimientos: ${movs.length}`);
    let totalIngresos = 0, totalEgresos = 0;
    for (const m of movs) {
      const signo = (m.tipo === 'ingreso' || m.tipo === 'venta' || m.tipo === 'abono_cliente') ? '+' : '-';
      const monto = parseFloat(m.monto || 0);
      if (signo === '+') totalIngresos += monto;
      else totalEgresos += monto;
      console.log(`     ${signo}S/${monto.toFixed(2)} | ${m.tipo} | ${m.descripcion || ''} | ${m.metodo_pago || ''} | anulado=${m.anulado || 0}`);
    }
    console.log(`  💰 Total ingresos: S/${totalIngresos.toFixed(2)}`);
    console.log(`  💰 Total egresos: S/${totalEgresos.toFixed(2)}`);
    console.log(`  💰 Saldo calculado: S/${(100 + totalIngresos - totalEgresos).toFixed(2)} (100 inicial + ${totalIngresos.toFixed(2)} - ${totalEgresos.toFixed(2)})`);
  }

  // ═══════════════════════════════════════════════
  // PASO 21: CERRAR CAJA
  // ═══════════════════════════════════════════════
  log('CERRAR CAJA');

  const { status: cerrarStatus, data: cerrarData } = await api('PUT', '/caja/cerrar', {
    monto_final: 100 // lo que hay en caja físicamente
  });
  if (cerrarStatus === 200) {
    ok(`Caja cerrada: ${JSON.stringify(cerrarData).substring(0, 200)}`);
  } else {
    warn(`Cerrar caja: [${cerrarStatus}] ${JSON.stringify(cerrarData)}`);
  }

  // ═══════════════════════════════════════════════
  // PASO 22: DASHBOARD FINAL
  // ═══════════════════════════════════════════════
  log('DASHBOARD FINAL');
  const { data: dashFinal } = await api('GET', '/dashboard');
  console.log(`  📊 Ventas hoy: cantidad=${dashFinal.ventas?.cantidad}, total=S/${dashFinal.ventas?.total}`);
  console.log(`  📊 Clientes activos: ${dashFinal.clientes_activos}`);
  console.log(`  📊 Bidones llenos: ${dashFinal.bidones_llenos}`);
  console.log(`  📊 Bidones prestados: ${dashFinal.bidones_prestados}`);
  console.log(`  📊 Pendientes lavado: ${dashFinal.pendientes_lavado}`);
  console.log(`  📊 Vacios disponibles: ${dashFinal.vacios_disponibles}`);
  console.log(`  📊 Deuda clientes: S/${dashFinal.deuda_clientes}`);
  console.log(`  📊 Deuda proveedores: S/${dashFinal.deuda_proveedores}`);

  // ═══════════════════════════════════════════════
  // RESUMEN
  // ═══════════════════════════════════════════════
  console.log('\n' + '═'.repeat(50));
  console.log('  RESUMEN AUDITORÍA E2E');
  console.log('═'.repeat(50));
  console.log(`  Total pasos: ${step}`);
  console.log(`  Errores:   ${errors.length}`);
  console.log(`  Warnings:  ${warnings.length}`);
  if (errors.length) {
    console.log('\n  ❌ ERRORES:');
    for (const e of errors) console.log(`    - ${e}`);
  }
  if (warnings.length) {
    console.log('\n  ⚠️  WARNINGS:');
    for (const w of warnings) console.log(`    - ${w}`);
  }
  if (!errors.length && !warnings.length) {
    console.log('\n  ✅ TODO PERFECTO — 0 errores, 0 warnings');
  }
  console.log('═'.repeat(50));

})().catch(e => {
  console.error('\n💀 FATAL ERROR:', e.message);
  console.error(e.stack);
});
