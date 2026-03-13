import { useState, useEffect } from 'react'
import { useRepartidor } from '../../context/RepartidorContext'
import rutasService from '../../services/rutasService'
import { listarPresentaciones } from '../../services/presentacionesService'

const VisitaPlanta = ({ rutaActiva: rutaProp }) => {
  const { rutaActiva: rutaCtx } = useRepartidor()
  const rutaActiva = rutaProp || rutaCtx

  const [items,    setItems]    = useState([])
  const [notas,    setNotas]    = useState('')
  const [cargando, setCargando] = useState(false)
  const [exito,    setExito]    = useState(false)
  const [historial,setHistorial]= useState([])
  const [loadingStock, setLoadingStock] = useState(true)

  // Productos disponibles en planta (para el selector "Agregar producto")
  const [productosPlanta, setProductosPlanta] = useState([])
  const [showSelector, setShowSelector] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  useEffect(() => {
    if (!rutaActiva?.id) return
    cargarStock()
    cargarHistorial()
  }, [rutaActiva?.id])

  const cargarStock = async () => {
    setLoadingStock(true)
    try {
      const [stockRes, presRes] = await Promise.all([
        rutasService.getStockVehiculo(rutaActiva.id),
        listarPresentaciones({ activo: 1, limit: 200 }),
      ])
      const stock = Array.isArray(stockRes.data || stockRes) ? (stockRes.data || stockRes) : []
      const presAll = Array.isArray(presRes.data) ? presRes.data : []

      // Productos ya en el vehículo
      const itemsVehiculo = stock.map(p => ({
        presentacion_id:    p.presentacion_id,
        nombre:             p.presentacion_nombre || p.nombre,
        es_retornable:      p.es_retornable,
        llenos_disponibles: Math.max(0, p.llenos_disponibles || 0),
        vacios_en_vehiculo: Math.max(0, p.vacios_en_vehiculo || 0),
        stock_planta:       p.stock_planta || 0,
        vacios_devueltos:   0,
        llenos_devueltos:   0,
        llenos_cargados:    0
      }))
      setItems(itemsVehiculo)

      // Guardar todos los de planta con stock para el selector
      const idsEnVehiculo = new Set(stock.map(p => p.presentacion_id))
      setProductosPlanta(presAll.filter(p => !idsEnVehiculo.has(p.id) && p.stock_llenos > 0))
    } finally {
      setLoadingStock(false)
    }
  }

  const cargarHistorial = async () => {
    try {
      const res = await rutasService.getVisitas(rutaActiva.id)
      setHistorial(res.data || res || [])
    } catch(e) {}
  }

  const actualizar = (idx, campo, valor) => {
    setItems(prev => prev.map((item, i) =>
      i !== idx ? item : {
        ...item,
        [campo]: Math.max(0, parseInt(valor) || 0)
      }
    ))
  }

  const agregarProducto = (prod) => {
    setItems(prev => [...prev, {
      presentacion_id:    prod.id,
      nombre:             prod.nombre,
      es_retornable:      prod.es_retornable,
      llenos_disponibles: 0,
      vacios_en_vehiculo: 0,
      stock_planta:       prod.stock_llenos || 0,
      vacios_devueltos:   0,
      llenos_devueltos:   0,
      llenos_cargados:    0,
      _esNuevo:           true,
    }])
    // Quitar del selector
    setProductosPlanta(prev => prev.filter(p => p.id !== prod.id))
    setShowSelector(false)
    setBusqueda('')
  }

  const quitarProductoNuevo = (idx) => {
    const item = items[idx]
    // Devolver al selector
    setProductosPlanta(prev => [...prev, {
      id: item.presentacion_id,
      nombre: item.nombre,
      es_retornable: item.es_retornable,
      stock_llenos: item.stock_planta,
    }])
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  const hayMovimientos = items.some(i =>
    i.vacios_devueltos > 0 ||
    i.llenos_devueltos > 0 ||
    i.llenos_cargados  > 0
  )

  const resumen = items.reduce((acc, i) => ({
    vacios:  acc.vacios  + i.vacios_devueltos,
    llenosD: acc.llenosD + i.llenos_devueltos,
    llenosC: acc.llenosC + i.llenos_cargados
  }), { vacios: 0, llenosD: 0, llenosC: 0 })

  const handleGuardar = async () => {
    if (!hayMovimientos || cargando) return
    setCargando(true)
    try {
      await rutasService.visitaPlanta(rutaActiva.id, { items, notas })
      setExito(true)
      await cargarStock()
      await cargarHistorial()
      setNotas('')
      setTimeout(() => setExito(false), 3000)
    } catch (error) {
      alert(error?.response?.data?.error || 'Error al registrar')
    } finally {
      setCargando(false)
    }
  }

  if (!rutaActiva) {
    return (
      <div style={{ padding: '40px 16px', textAlign: 'center', color: '#94a3b8' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🏭</div>
        <div style={{ fontWeight: 600 }}>No tienes una ruta activa</div>
      </div>
    )
  }

  if (loadingStock) {
    return (
      <div style={{ padding: '40px 16px', textAlign: 'center', color: '#94a3b8' }}>
        Cargando stock...
      </div>
    )
  }

  // Filtrar productos del selector por búsqueda
  const productosFiltrados = busqueda.trim()
    ? productosPlanta.filter(p => p.nombre.toLowerCase().includes(busqueda.toLowerCase()))
    : productosPlanta

  return (
    <div style={{ padding: '0 0 80px 0' }}>

      {exito && (
        <div style={{
          margin: '0 0 16px', padding: '12px 16px',
          background: '#ECFDF5', border: '1px solid #6EE7B7',
          borderRadius: 10, color: '#065F46', fontWeight: 600,
          fontSize: 14, display: 'flex', alignItems: 'center', gap: 8
        }}>
          <span style={{ fontSize: 20 }}>✅</span>
          Movimientos registrados correctamente
        </div>
      )}

      <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
        Llena solo lo que aplica. Los campos en blanco se ignoran.
      </p>

      {items.length === 0 && (
        <div style={{
          padding: '32px 16px', textAlign: 'center', color: '#94a3b8',
          background: '#F8FAFC', borderRadius: 12, fontSize: 14
        }}>
          No hay productos en tu vehículo
        </div>
      )}

      {items.map((item, idx) => (
        <div key={item.presentacion_id} style={{
          background: 'white', border: `1px solid ${item._esNuevo ? '#86EFAC' : '#E2E8F0'}`,
          borderRadius: 14, padding: '14px 14px 16px',
          marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
        }}>

          <div style={{
            fontWeight: 700, fontSize: 15, color: '#1e293b',
            marginBottom: 10, display: 'flex', alignItems: 'center',
            gap: 8, flexWrap: 'wrap'
          }}>
            {item.nombre}
            {item.es_retornable
              ? <span style={{
                  fontSize: 11, background: '#EEF2FF', color: '#4F46E5',
                  padding: '2px 8px', borderRadius: 20, fontWeight: 600
                }}>♻️ Retornable</span>
              : <span style={{
                  fontSize: 11, background: '#F1F5F9', color: '#64748b',
                  padding: '2px 8px', borderRadius: 20, fontWeight: 600
                }}>📦 No retorna</span>
            }
            {item._esNuevo && (
              <span style={{
                fontSize: 11, background: '#ECFDF5', color: '#059669',
                padding: '2px 8px', borderRadius: 20, fontWeight: 600
              }}>Nuevo</span>
            )}
            {item._esNuevo && (
              <button onClick={() => quitarProductoNuevo(idx)} style={{
                marginLeft: 'auto', background: 'none', border: 'none',
                color: '#94a3b8', cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px'
              }} title="Quitar">✕</button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
            {!item._esNuevo && (
              <span style={{
                background: '#EFF6FF', color: '#1D4ED8',
                padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600
              }}>
                🔵 {item.llenos_disponibles} llenos
              </span>
            )}
            {!item._esNuevo && item.es_retornable && (
              <span style={{
                background: '#F1F5F9', color: '#475569',
                padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600
              }}>
                ⚪ {item.vacios_en_vehiculo} vacíos
              </span>
            )}
            <span style={{
              background: '#ECFDF5', color: '#065F46',
              padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600
            }}>
              🏭 {item.stock_planta} en planta
            </span>
          </div>

          {item._esNuevo ? (
            <div>
              <Campo
                label="Cargar al vehículo" emoji="📦" color="#10B981" bgActivo="#ECFDF5"
                max={item.stock_planta} value={item.llenos_cargados}
                onChange={v => actualizar(idx, 'llenos_cargados', v)}
                hint={`Planta tiene ${item.stock_planta}`}
              />
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: item.es_retornable ? '1fr 1fr 1fr' : '1fr 1fr',
              gap: 10
            }}>
              {item.es_retornable && (
                <Campo
                  label="Vacíos a dejar" emoji="⚪" color="#6366F1" bgActivo="#EEF2FF"
                  max={item.vacios_en_vehiculo} value={item.vacios_devueltos}
                  onChange={v => actualizar(idx, 'vacios_devueltos', v)}
                  hint={`Tienes ${item.vacios_en_vehiculo}`}
                />
              )}
              <Campo
                label="Llenos a dejar" emoji="🔵" color="#F59E0B" bgActivo="#FFFBEB"
                max={item.llenos_disponibles} value={item.llenos_devueltos}
                onChange={v => actualizar(idx, 'llenos_devueltos', v)}
                hint={`Tienes ${item.llenos_disponibles}`}
              />
              <Campo
                label="Cargar más" emoji="📦" color="#10B981" bgActivo="#ECFDF5"
                max={item.stock_planta} value={item.llenos_cargados}
                onChange={v => actualizar(idx, 'llenos_cargados', v)}
                hint={`Planta tiene ${item.stock_planta}`}
              />
            </div>
          )}

          {item.vacios_devueltos > item.vacios_en_vehiculo && (
            <Warn texto={`Solo tienes ${item.vacios_en_vehiculo} vacíos en el vehículo`}/>
          )}
          {item.llenos_devueltos > item.llenos_disponibles && (
            <Warn texto={`Solo tienes ${item.llenos_disponibles} llenos disponibles`}/>
          )}
          {item.llenos_cargados > item.stock_planta && (
            <Warn texto={`Planta solo tiene ${item.stock_planta} llenos disponibles`}/>
          )}
        </div>
      ))}

      {/* Botón agregar producto */}
      {productosPlanta.length > 0 && !showSelector && (
        <button onClick={() => setShowSelector(true)} style={{
          width: '100%', padding: '14px 0', marginBottom: 16,
          background: 'white', border: '2px dashed #CBD5E1',
          borderRadius: 12, color: '#475569', fontSize: 14, fontWeight: 600,
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'center', gap: 8, transition: 'all 0.15s'
        }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>+</span>
          Agregar otro producto de planta
        </button>
      )}

      {/* Selector de productos */}
      {showSelector && (
        <div style={{
          background: 'white', border: '2px solid #3B82F6',
          borderRadius: 14, marginBottom: 16, overflow: 'hidden',
          boxShadow: '0 4px 12px rgba(59,130,246,0.15)'
        }}>
          <div style={{
            padding: '12px 14px', borderBottom: '1px solid #E2E8F0',
            display: 'flex', alignItems: 'center', gap: 8
          }}>
            <span style={{ fontSize: 16 }}>🔍</span>
            <input
              type="text" value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="Buscar producto..."
              autoFocus
              style={{
                flex: 1, border: 'none', outline: 'none', fontSize: 14,
                color: '#1e293b', background: 'transparent'
              }}
            />
            <button onClick={() => { setShowSelector(false); setBusqueda('') }} style={{
              background: 'none', border: 'none', color: '#94a3b8',
              cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 4px'
            }}>✕</button>
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {productosFiltrados.length === 0 ? (
              <div style={{ padding: '20px 14px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                {busqueda ? 'Sin resultados' : 'No hay más productos con stock'}
              </div>
            ) : productosFiltrados.map(p => (
              <button key={p.id} onClick={() => agregarProducto(p)} style={{
                width: '100%', padding: '12px 14px', background: 'white',
                border: 'none', borderBottom: '1px solid #F1F5F9',
                cursor: 'pointer', display: 'flex', alignItems: 'center',
                justifyContent: 'space-between', textAlign: 'left',
                transition: 'background 0.1s'
              }}
                onPointerEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                onPointerLeave={e => e.currentTarget.style.background = 'white'}
              >
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{p.nombre}</div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {p.es_retornable ? '♻️ Retornable' : '📦 No retorna'}
                  </div>
                </div>
                <div style={{
                  background: '#ECFDF5', color: '#065F46',
                  padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
                  whiteSpace: 'nowrap'
                }}>
                  {p.stock_llenos} disp.
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginBottom: 16 }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 6 }}>
          Notas (opcional)
        </label>
        <textarea
          value={notas}
          onChange={e => setNotas(e.target.value)}
          placeholder="Ej: Dejé vacíos del cliente García..."
          rows={2}
          style={{
            width: '100%', padding: '10px 14px', border: '1px solid #D1D5DB',
            borderRadius: 10, fontSize: 14, resize: 'none',
            boxSizing: 'border-box', fontFamily: 'inherit'
          }}
        />
      </div>

      {hayMovimientos && (
        <div style={{
          padding: '12px 16px', background: '#F8FAFC',
          border: '1px solid #E2E8F0', borderRadius: 10,
          marginBottom: 16, fontSize: 13
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6, color: '#374151' }}>
            Resumen a registrar:
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            {resumen.vacios > 0 && (
              <span style={{ color: '#6366F1' }}>⚪ {resumen.vacios} vacíos a planta</span>
            )}
            {resumen.llenosD > 0 && (
              <span style={{ color: '#D97706' }}>🔵 {resumen.llenosD} llenos a planta</span>
            )}
            {resumen.llenosC > 0 && (
              <span style={{ color: '#059669' }}>📦 {resumen.llenosC} llenos al carro</span>
            )}
          </div>
        </div>
      )}

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        padding: '12px 16px', background: 'white',
        borderTop: '1px solid #E2E8F0', zIndex: 100
      }}>
        <button
          onClick={handleGuardar}
          disabled={!hayMovimientos || cargando}
          style={{
            width: '100%', padding: '16px 0',
            background: hayMovimientos ? '#2563EB' : '#E2E8F0',
            border: 'none', borderRadius: 12,
            color: hayMovimientos ? 'white' : '#94A3B8',
            fontSize: 16, fontWeight: 700,
            cursor: hayMovimientos ? 'pointer' : 'not-allowed',
            transition: 'all 0.2s'
          }}
        >
          {cargando
            ? '⏳ Registrando...'
            : hayMovimientos
              ? '✅ Registrar movimientos'
              : 'Ingresa al menos un valor'}
        </button>
      </div>

      {historial.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: '#64748b',
            marginBottom: 8, letterSpacing: '0.05em'
          }}>
            VISITAS DE HOY
          </div>
          {historial.map(v => (
            <div key={v.id} style={{
              padding: '10px 14px', background: '#F8FAFC',
              border: '1px solid #E2E8F0', borderRadius: 10,
              marginBottom: 8, fontSize: 13
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ color: '#64748b', fontSize: 12 }}>
                  {new Date(v.fecha_hora).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}
                </span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {v.tipo?.includes('devolucion_vacios') && (
                    <span style={{ fontSize: 11, background: '#EEF2FF', color: '#4F46E5', padding: '1px 8px', borderRadius: 20 }}>⚪ Vacíos</span>
                  )}
                  {v.tipo?.includes('devolucion_llenos') && (
                    <span style={{ fontSize: 11, background: '#FFFBEB', color: '#D97706', padding: '1px 8px', borderRadius: 20 }}>🔵 Llenos</span>
                  )}
                  {v.tipo?.includes('carga_llenos') && (
                    <span style={{ fontSize: 11, background: '#ECFDF5', color: '#065F46', padding: '1px 8px', borderRadius: 20 }}>📦 Carga</span>
                  )}
                </div>
              </div>
              {v.resumen && (
                <div style={{ color: '#64748b', fontSize: 12, lineHeight: 1.4 }}>
                  {v.resumen}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

    </div>
  )
}

const Campo = ({ label, emoji, color, bgActivo, max, value, onChange, hint }) => (
  <div>
    <label style={{
      fontSize: 11, fontWeight: 700, color: '#64748b',
      display: 'block', marginBottom: 4, lineHeight: 1.3
    }}>
      {emoji} {label}
    </label>
    <input
      type="number" inputMode="numeric" min="0"
      value={value || ''} onChange={e => onChange(e.target.value)}
      placeholder="0"
      style={{
        width: '100%', padding: '10px 6px',
        border: value > 0 ? `2px solid ${color}` : '1px solid #D1D5DB',
        borderRadius: 10, fontSize: 18, fontWeight: 700,
        textAlign: 'center', boxSizing: 'border-box',
        background: value > 0 ? bgActivo : 'white',
        color: value > 0 ? color : '#374151',
        transition: 'all 0.15s',
        WebkitAppearance: 'none', MozAppearance: 'textfield'
      }}
    />
    {hint && (
      <div style={{ fontSize: 10, color: '#94a3b8', textAlign: 'center', marginTop: 3 }}>
        {hint}
      </div>
    )}
  </div>
)

const Warn = ({ texto }) => (
  <div style={{
    marginTop: 8, padding: '6px 10px',
    background: '#FEF2F2', border: '1px solid #FECACA',
    borderRadius: 8, fontSize: 12, color: '#991B1B',
    display: 'flex', alignItems: 'center', gap: 6
  }}>
    ⚠️ {texto}
  </div>
)

export default VisitaPlanta
