import { useEffect, useRef, useState } from 'react';
import { crearPedido, listarRepartidores, getUltimaDireccion } from '../../services/pedidosService';
import { listarClientes, actualizarCliente } from '../../services/clientesService';
import useCajaAbierta from '../../hooks/useCajaAbierta';
import { listarPresentaciones } from '../../services/presentacionesService';
import { getPrecioSugerido } from '../../services/ventasService';
import BuscadorConCrear from '../../components/BuscadorConCrear';
import ClienteModal from '../Clientes/ClienteModal';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ── Product line types ── */
const TIPO_LINEA_RETORNABLE = [
  { value: 'recarga',      label: 'Recarga',         hint: 'Trae su bidon vacio' },
  { value: 'prestamo',     label: 'Prestamo',        hint: 'Le prestamos el bidon' },
  { value: 'compra_bidon', label: 'Bidon completo',  hint: 'Compra el bidon' },
];
const TIPO_LINEA_NORMAL = [
  { value: 'producto', label: 'Producto', hint: 'Venta sin retorno' },
];

function defaultTipoForPres(pres) {
  if (!pres) return 'producto';
  return pres.es_retornable ? 'recarga' : 'producto';
}

function tiposForPres(pres) {
  if (!pres) return TIPO_LINEA_NORMAL;
  return pres.es_retornable ? TIPO_LINEA_RETORNABLE : TIPO_LINEA_NORMAL;
}

// _lineIdRef se inicializa como ref dentro del componente
function newLine(lineIdRef) {
  return {
    id: lineIdRef.current++,
    presentacion: null,
    presInput: '',
    showSugg: false,
    tipo_linea: 'producto',
    cantidad: '1',
    vacios_esperados: '0',
    precio_unitario: '',
    precio_origen: null,
  };
}

function lineSubtotal(l) {
  return (Number(l.precio_unitario) || 0) * (Number(l.cantidad) || 0);
}

/* ═══════════════════════════════════════════════════════
   MapaPedido — Draggable marker + Nominatim search
   Leaflet components defined at module level after load
   ═══════════════════════════════════════════════════════ */
let _rl = null;   // react-leaflet module
let _L  = null;   // leaflet module
let _leafletReady = null; // promise

// Cache GPS a nivel de módulo para reusar entre aperturas del modal
let _gpsCache = null;     // { lat, lng }

function getLeaflet() {
  if (_leafletReady) return _leafletReady;
  // inject CSS once
  if (!document.getElementById('leaflet-css-fp')) {
    const link = document.createElement('link');
    link.id = 'leaflet-css-fp';
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
  }
  _leafletReady = Promise.all([import('react-leaflet'), import('leaflet')]).then(([rl, leaflet]) => {
    delete leaflet.Icon.Default.prototype._getIconUrl;
    leaflet.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });
    _rl = rl;
    _L = leaflet;
    return { rl, L: leaflet };
  });
  return _leafletReady;
}

/* Inner map components — only rendered after leaflet loaded */
function MapClickHandler({ onClick }) {
  _rl.useMapEvents({ click: e => onClick(e.latlng.lat, e.latlng.lng) });
  return null;
}

function MapRecenter({ center, zoom }) {
  const map = _rl.useMap();
  useEffect(() => { map.setView(center, zoom || map.getZoom()); }, [center[0], center[1]]);
  return null;
}

// Pide GPS y centra el mapa directo (patrón MonitoreoMapa)
function GpsCenter({ onGpsReady }) {
  const map = _rl.useMap();
  const doneRef = useRef(false);

  useEffect(() => {
    if (doneRef.current) return;
    // Si ya tenemos cache, usar directo
    if (_gpsCache) {
      doneRef.current = true;
      map.setView([_gpsCache.lat, _gpsCache.lng], 15, { animate: true });
      onGpsReady(_gpsCache);
      return;
    }
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      pos => {
        if (doneRef.current) return;
        doneRef.current = true;
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        _gpsCache = coords;
        map.setView([coords.lat, coords.lng], 15, { animate: true });
        onGpsReady(coords);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [map]);
  return null;
}

function MapaPedido({ lat, lng, direccion, onCoordsChange, onDireccionChange }) {
  const [ready, setReady]       = useState(!!_rl);
  const [searchQ, setSearchQ]   = useState(direccion || '');
  const [myPos, setMyPos]       = useState(_gpsCache);
  const [mapsUrl, setMapsUrl]   = useState('');
  const [mapsLoading, setMapsLoading] = useState(false);
  const [mapsError, setMapsError]     = useState('');
  const markerRef = useRef(null);

  useEffect(() => {
    if (!_rl) getLeaflet().then(() => setReady(true));
  }, []);

  // Sync searchQ when direccion prop changes (e.g. client selected)
  useEffect(() => {
    setSearchQ(direccion || '');
  }, [direccion]);

  const hasCoords = lat && lng;
  // Prioridad: coords del pedido > GPS del usuario > fallback Lima
  const defaultCenter = myPos ? [myPos.lat, myPos.lng] : [-12.0464, -77.0428];
  const center = hasCoords ? [Number(lat), Number(lng)] : defaultCenter;

  // 'none' | 'aproximado' | 'confirmado'
  const [pinStatus, setPinStatus] = useState('none');

  async function reverseGeocode(latV, lngV) {
    const key = import.meta.env.VITE_LOCATIONIQ_KEY;
    if (!key) return;
    try {
      const url = `https://us1.locationiq.com/v1/reverse?key=${key}&lat=${latV}&lon=${lngV}&format=json&accept-language=es`;
      const res = await fetch(url);
      const data = await res.json();
      if (data?.display_name) {
        const addr = data.display_name.split(',').slice(0, 3).join(',').trim();
        setSearchQ(addr);
        onDireccionChange(addr);
      }
    } catch {}
  }

  function handleMapClick(newLat, newLng) {
    onCoordsChange(newLat, newLng);
    setPinStatus('confirmado'); // PASO 5: click directo → verde
    reverseGeocode(newLat, newLng);
  }

  // Aplicar coords desde Google Maps link (PASO 2: aproximado, sin reverse)
  function applyMapsCoords(cLat, cLng) {
    setPinStatus('aproximado');
    onCoordsChange(cLat, cLng);
    setMapsUrl('');
    // NO hacer reverse ni rellenar dirección — operadora debe arrastrar
  }

  async function handleMapsUrl(value) {
    setMapsUrl(value);
    setMapsError('');
    if (!value.trim()) return;

    // Formato A: URL larga con coords
    const coordMatch = value.match(/([-]?\d{1,2}\.\d{4,}),\s*([-]?\d{1,3}\.\d{4,})/);
    if (coordMatch) {
      applyMapsCoords(parseFloat(coordMatch[1]), parseFloat(coordMatch[2]));
      return;
    }

    // Formato B: URL corta → resolver vía backend
    if (/maps\.app\.goo\.gl|goo\.gl\/maps|google\.\w+\/maps/i.test(value)) {
      setMapsLoading(true);
      try {
        const { default: api } = await import('../../services/api');
        const { data } = await api.post('/utils/resolve-maps-url', { url: value.trim() });
        if (data.lat && data.lng) {
          applyMapsCoords(data.lat, data.lng);
        } else {
          setMapsError('No se encontraron coordenadas');
        }
      } catch {
        setMapsError('No se pudo resolver el enlace');
      } finally {
        setMapsLoading(false);
      }
    }
  }

  return (
    <div>
      {/* Dirección — campo editable, se llena con reverse geocode */}
      <div className="mb-2">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
          </svg>
          <input
            className={`${inputCls} pl-9`}
            value={searchQ}
            onChange={e => { setSearchQ(e.target.value); onDireccionChange(e.target.value); }}
            placeholder="Direccion (se llena al confirmar ubicacion)..."
          />
        </div>
      </div>

      {/* Pegar ubicación de Google Maps */}
      <div className="relative mb-2">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.07-9.07l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757" />
          </svg>
          <input
            className={`${inputCls} pl-9 pr-8 ${mapsLoading ? 'border-blue-400' : ''} ${mapsError ? 'border-red-400' : ''}`}
            value={mapsUrl}
            onChange={e => handleMapsUrl(e.target.value)}
            onPaste={e => { setTimeout(() => handleMapsUrl(e.target.value), 50); }}
            placeholder="Pegar enlace de Google Maps..."
          />
          {mapsLoading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
        {mapsError && <p className="text-xs text-red-500 mt-1">{mapsError}</p>}
      </div>

      {/* Map */}
      <div className="rounded-xl overflow-hidden border border-slate-200 relative z-0" style={{ height: 280 }}>
        {!ready ? (
          <div className="bg-slate-100 flex items-center justify-center h-full">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="ml-2 text-xs text-slate-400">Cargando mapa...</span>
          </div>
        ) : (
          <_rl.MapContainer
            center={center}
            zoom={hasCoords ? 16 : (myPos ? 15 : 6)}
            style={{ height: '100%', width: '100%' }}
          >
            <_rl.TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MapClickHandler onClick={handleMapClick} />
            {hasCoords && <MapRecenter center={center} zoom={17} />}
            {!hasCoords && <GpsCenter onGpsReady={pos => setMyPos(pos)} />}
            {hasCoords && (
              <_rl.Marker
                draggable
                ref={markerRef}
                position={center}
                eventHandlers={{
                  dragend() {
                    const marker = markerRef.current;
                    if (marker) {
                      const pos = marker.getLatLng();
                      onCoordsChange(pos.lat, pos.lng);
                      setPinStatus('confirmado'); // PASO 3: soltó → verde + reverse
                      reverseGeocode(pos.lat, pos.lng);
                    }
                  },
                }}
              >
                <_rl.Popup>{pinStatus === 'aproximado' ? 'Arrastra al punto exacto del cliente' : 'Arrastra para ajustar'}</_rl.Popup>
              </_rl.Marker>
            )}
          </_rl.MapContainer>
        )}
      </div>

      {!hasCoords && (
        <p className="text-xs text-slate-400 mt-2 text-center">
          Pega un enlace de Google Maps, busca una dirección o haz clic en el mapa
        </p>
      )}
      {hasCoords && pinStatus === 'aproximado' && (
        <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
          <span className="text-base">&#9888;&#65039;</span>
          <div className="flex-1">
            <p className="text-xs font-medium text-amber-700">Ubicación aproximada — arrastra el pin al lugar exacto del cliente</p>
            <p className="text-[10px] text-amber-500 font-mono mt-0.5">{Number(lat).toFixed(6)}, {Number(lng).toFixed(6)}</p>
          </div>
        </div>
      )}
      {hasCoords && pinStatus === 'confirmado' && (
        <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
          <span className="text-base">&#9989;</span>
          <div className="flex-1">
            <p className="text-xs font-medium text-emerald-700">Ubicación confirmada</p>
            <p className="text-[10px] text-emerald-500 font-mono mt-0.5">{Number(lat).toFixed(6)}, {Number(lng).toFixed(6)}</p>
          </div>
        </div>
      )}
      {hasCoords && pinStatus === 'none' && (
        <div className="mt-2 text-center">
          <span className="text-xs text-slate-400 font-mono">{Number(lat).toFixed(6)}, {Number(lng).toFixed(6)}</span>
          <span className="text-xs text-slate-400 ml-2">Arrastra el marcador para ajustar</span>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   FormPedido — Full-screen two-column pedido form
   ═══════════════════════════════════════════════════════ */
export default function FormPedido({ isOpen, onClose, onSaved }) {
  const { cajaAbierta } = useCajaAbierta();
  // Client
  const [cliente, setCliente]           = useState(null);

  // Coords + direccion
  const [lat, setLat]     = useState('');
  const [lng, setLng]     = useState('');
  const [direccion, setDireccion] = useState('');
  const [coordsChanged, setCoordsChanged] = useState(false);

  // Repartidor / fecha
  const [repartidores, setRepartidores] = useState([]);
  const [repartidorId, setRepartidorId] = useState('');
  const [fecha, setFecha]               = useState(today());
  const [orden, setOrden]               = useState('1');
  const [notas, setNotas]               = useState('');

  // Products
  const [presentaciones, setPresentaciones] = useState([]);
  const [lineas, setLineas] = useState([]);
  const lineRefs = useRef({});
  const lineIdRef = useRef(1);

  // UI
  const [loading, setLoading] = useState(false);
  const [showClienteModal, setShowClienteModal] = useState(false);
  const [error, setError]     = useState('');

  /* ── Init ── */
  useEffect(() => {
    if (!isOpen) return;
    lineIdRef.current = 1;
    setCliente(null);
    setLat(''); setLng(''); setDireccion(''); setCoordsChanged(false);
    setRepartidorId(''); setFecha(today()); setOrden('1'); setNotas('');
    setLineas([]); setError('');

    listarRepartidores().then(r => setRepartidores(r.data || [])).catch(() => setRepartidores([]));
    listarPresentaciones({ activo: 1, limit: 100 })
      .then(r => setPresentaciones(Array.isArray(r.data) ? r.data : []))
      .catch(() => setPresentaciones([]));
  }, [isOpen]);

  /* ── Click outside closes dropdowns ── */
  useEffect(() => {
    function handler(e) {
      setLineas(prev => prev.map(l => {
        const ref = lineRefs.current[l.id];
        if (ref && !ref.contains(e.target)) return { ...l, showSugg: false };
        return l;
      }));
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!isOpen) return null;

  /* ── Client selected/cleared ── */
  async function selectCliente(c) {
    setCliente(c);
    if (c) {
      if (c.latitud) { setLat(String(c.latitud)); setLng(String(c.longitud)); }
      else { setLat(''); setLng(''); }
      setDireccion(c.direccion || '');
      setCoordsChanged(false);
      lineas.forEach(l => {
        if (l.presentacion) fetchPrecio(l.id, c.id, l.presentacion, l.tipo_linea);
      });
      // Pre-llenar con última dirección de entrega usada
      try {
        const res = await getUltimaDireccion(c.id);
        if (res.direccion_entrega) setDireccion(res.direccion_entrega);
      } catch { /* fallback: queda c.direccion */ }
    } else {
      setLat(''); setLng(''); setDireccion(''); setCoordsChanged(false);
    }
  }

  /* ── Coords from map ── */
  function handleCoordsChange(newLat, newLng) {
    setLat(String(newLat));
    setLng(String(newLng));
    setCoordsChanged(true);
  }

  /* ── Product lines ── */
  function addLine() {
    setLineas(prev => [...prev, newLine(lineIdRef)]);
  }
  function updateLine(id, patch) {
    setLineas(prev => prev.map(l => {
      if (l.id !== id) return l;
      const nueva = { ...l, ...patch };
      // Si cambia cantidad y es recarga → sincronizar vacíos
      if ('cantidad' in patch && nueva.tipo_linea === 'recarga') {
        nueva.vacios_esperados = patch.cantidad;
      }
      return nueva;
    }));
  }
  function removeLine(id) {
    setLineas(prev => prev.filter(l => l.id !== id));
  }

  async function fetchPrecio(lineId, clienteId, pres, tipoLinea) {
    if (!pres || !tipoLinea) return;
    try {
      const res = await getPrecioSugerido({
        cliente_id: clienteId || undefined,
        presentacion_id: pres.id,
        tipo_linea: tipoLinea,
      });
      updateLine(lineId, {
        precio_unitario: String(res.precio),
        precio_origen: res.origen || 'base',
      });
    } catch { /* ignore */ }
  }

  function onLinePresSelect(lineId, pres) {
    const tipo = defaultTipoForPres(pres);
    const linea = lineas.find(l => l.id === lineId);
    const cant = linea ? linea.cantidad : '1';
    updateLine(lineId, {
      presentacion: pres,
      presInput: pres.nombre,
      showSugg: false,
      tipo_linea: tipo,
      vacios_esperados: tipo === 'recarga' ? cant : '0',
    });
    fetchPrecio(lineId, cliente?.id, pres, tipo);
  }

  function onLineTipoChange(lineId, newTipo, pres) {
    const linea = lineas.find(l => l.id === lineId);
    const cant = linea ? linea.cantidad : '1';
    updateLine(lineId, {
      tipo_linea: newTipo,
      vacios_esperados: newTipo === 'recarga' ? cant : '0',
    });
    fetchPrecio(lineId, cliente?.id, pres, newTipo);
  }

  /* ── Totals ── */
  const totalCalc = lineas.reduce((s, l) => s + lineSubtotal(l), 0);

  /* ── Submit ── */
  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!cliente) return setError('Selecciona un cliente');
    if (lineas.length === 0) return setError('Agrega al menos un producto');
    if (lineas.some(l => !l.presentacion)) return setError('Completa todos los productos');

    // Auto-save coords to client if changed (silent)
    if (coordsChanged && lat && lng && cliente) {
      try {
        await actualizarCliente(cliente.id, {
          ...cliente,
          latitud: Number(lat),
          longitud: Number(lng),
        });
      } catch { /* ignore save error */ }
    }

    setLoading(true);
    try {
      await crearPedido({
        repartidor_id: repartidorId ? Number(repartidorId) : null,
        cliente_id: cliente.id,
        fecha,
        notas_encargada: notas.trim() || null,
        latitud: lat ? Number(lat) : null,
        longitud: lng ? Number(lng) : null,
        direccion_entrega: direccion.trim() || null,
        orden_entrega: Number(orden) || 1,
        detalle: lineas.map(l => ({
          presentacion_id: l.presentacion.id,
          tipo_linea: l.tipo_linea,
          cantidad: Number(l.cantidad) || 1,
          vacios_esperados: Number(l.vacios_esperados) || 0,
          precio_unitario: Number(l.precio_unitario) || 0,
        })),
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al crear pedido');
    } finally { setLoading(false); }
  }

  /* ── Render ── */
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[1200px] mx-4 max-h-[95vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-lg font-bold text-slate-800">Nuevo Pedido</h2>
            <p className="text-xs text-slate-400 mt-0.5">Asignar pedido de reparto a un cliente</p>
          </div>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col min-h-0">
          {error && (
            <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
          )}

          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-0 lg:gap-0 min-h-0">

              {/* ═══════ COLUMNA IZQUIERDA ═══════ */}
              <div className="px-6 py-5 space-y-5 lg:border-r lg:border-slate-100 overflow-y-auto">

                {/* ── Seccion 1: Cliente ── */}
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Cliente <span className="text-red-400">*</span>
                  </p>
                  <BuscadorConCrear
                    placeholder="Buscar por nombre o DNI…"
                    value={cliente}
                    onChange={selectCliente}
                    onSearch={q => listarClientes({ q, limit: 8 }).then(r => r.data)}
                    onNewClick={() => setShowClienteModal(true)}
                    renderOption={c => (
                      <>
                        <div style={{ minWidth: 0 }}>
                          <span style={{ fontWeight: 500, color: '#1e293b', fontSize: '14px' }}>
                            {c.nombre}
                            {c.dni && <span style={{ color: '#94a3b8', fontSize: '12px', marginLeft: '8px' }}>{c.dni}</span>}
                          </span>
                          {c.direccion && <p style={{ fontSize: '12px', color: '#94a3b8', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.direccion}</p>}
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full capitalize
                          ${c.tipo === 'mayoreo' ? 'bg-blue-100 text-blue-700' :
                            c.tipo === 'especial' ? 'bg-purple-100 text-purple-700' :
                            'bg-slate-100 text-slate-500'}`}>{c.tipo}</span>
                      </>
                    )}
                  />

                  {/* Client info card */}
                  {cliente && (
                    <div className="mt-3 bg-slate-50 border border-slate-200 rounded-xl p-3">
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <span className="text-slate-400">Telefono</span>
                          <p className="font-medium text-slate-700">{cliente.telefono || '—'}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Direccion</span>
                          <p className="font-medium text-slate-700 truncate">{cliente.direccion || '—'}</p>
                        </div>
                        <div>
                          <span className="text-slate-400">Deuda actual</span>
                          <p className={`font-bold ${Number(cliente.saldo_dinero) > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                            S/ {Number(cliente.saldo_dinero || 0).toFixed(2)}
                          </p>
                        </div>
                        <div>
                          <span className="text-slate-400">Bidones prestados</span>
                          <p className={`font-bold ${Number(cliente.bidones_prestados) > 0 ? 'text-blue-600' : 'text-slate-600'}`}>
                            {cliente.bidones_prestados || 0}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Seccion 2: Mapa ── */}
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Ubicacion de entrega
                  </p>
                  <MapaPedido
                    lat={lat}
                    lng={lng}
                    direccion={direccion}
                    onCoordsChange={handleCoordsChange}
                    onDireccionChange={setDireccion}
                  />
                </div>

                {/* ── Seccion 3: Repartidor + Fecha ── */}
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                    Asignacion
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 sm:col-span-1">
                      <label className="block text-xs font-medium text-slate-600 mb-1">Repartidor</label>
                      <select className={inputCls} value={repartidorId} onChange={e => setRepartidorId(e.target.value)}>
                        <option value="">Sin asignar</option>
                        {repartidores.map(r => <option key={r.id} value={String(r.id)}>{r.nombre}</option>)}
                      </select>

                      {/* Stock del vehiculo del repartidor */}
                      {repartidorId && (() => {
                        const rep = repartidores.find(r => String(r.id) === repartidorId);
                        if (!rep) return null;
                        if (!rep.ruta_id) return (
                          <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                            <p className="text-xs text-amber-700 font-medium">Sin ruta activa</p>
                          </div>
                        );
                        if (!rep.stock || rep.stock.length === 0) return (
                          <div className="mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                            <p className="text-xs text-amber-700 font-medium">Sin stock cargado</p>
                          </div>
                        );
                        return (
                          <div className="mt-2 px-3 py-2.5 bg-blue-50 border border-blue-200 rounded-lg">
                            <p className="text-xs text-blue-600 font-semibold mb-1.5">Stock en vehiculo</p>
                            <div className="space-y-1">
                              {rep.stock.map(s => (
                                <div key={s.presentacion_id} className="flex justify-between text-xs">
                                  <span className="text-slate-700">{s.presentacion_nombre}</span>
                                  <span className="font-bold text-blue-700">{s.llenos_disponibles}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Fecha</label>
                      <input type="date" className={inputCls} value={fecha} onChange={e => setFecha(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">Orden</label>
                      <input type="number" min="1" className={inputCls} value={orden} onChange={e => setOrden(e.target.value)} />
                    </div>
                  </div>
                  <div className="mt-3">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Notas para el repartidor</label>
                    <textarea rows={2} className={inputCls} value={notas}
                      onChange={e => setNotas(e.target.value)}
                      placeholder="Instrucciones especiales..." />
                  </div>
                </div>
              </div>

              {/* ═══════ COLUMNA DERECHA ═══════ */}
              <div className="px-6 py-5 space-y-5 overflow-y-auto">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                      Productos del pedido <span className="text-red-400">*</span>
                    </p>
                    <button type="button" onClick={addLine}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Agregar Producto
                    </button>
                  </div>

                  {lineas.length === 0 ? (
                    <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-8 text-center">
                      <svg className="w-10 h-10 mx-auto mb-2 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                      </svg>
                      <p className="text-sm text-slate-400">Sin productos</p>
                      <p className="text-xs text-slate-400 mt-1">Haz clic en "Agregar Producto" para comenzar</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {lineas.map((l, idx) => {
                        const tipos = tiposForPres(l.presentacion);
                        const presFiltradas = presentaciones.filter(p =>
                          !l.presInput || p.nombre.toLowerCase().includes(l.presInput.toLowerCase())
                        );
                        const sub = lineSubtotal(l);

                        return (
                          <div key={l.id} className="border border-slate-200 rounded-xl p-4 bg-white shadow-sm">
                            {/* Header */}
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-xs font-semibold text-slate-500">Producto {idx + 1}</span>
                              <button type="button" onClick={() => removeLine(l.id)}
                                className="text-xs text-red-400 hover:text-red-600 hover:bg-red-50 px-2 py-1 rounded-lg transition font-medium">
                                Quitar
                              </button>
                            </div>

                            {/* Presentacion selector */}
                            <div className="relative mb-2" ref={el => { if (el) lineRefs.current[l.id] = el; }}>
                              {l.presentacion ? (
                                <div className="flex items-center gap-2 px-3 py-2 border border-green-400 bg-green-50 rounded-lg">
                                  <span className="text-sm font-medium text-slate-800 flex-1 truncate">{l.presentacion.nombre}</span>
                                  <span className="text-xs text-slate-500 shrink-0">
                                    {l.presentacion.es_retornable ? 'Retornable' : l.presentacion.tipo}
                                  </span>
                                  <button type="button"
                                    onClick={() => updateLine(l.id, { presentacion: null, presInput: '', tipo_linea: 'producto', precio_unitario: '', precio_origen: null })}
                                    className="text-xs text-slate-400 hover:text-red-500 transition px-1.5 py-0.5 rounded border border-slate-200 bg-white shrink-0">
                                    x
                                  </button>
                                </div>
                              ) : (
                                <>
                                  <input
                                    value={l.presInput}
                                    onChange={e => updateLine(l.id, { presInput: e.target.value, showSugg: true })}
                                    onFocus={() => updateLine(l.id, { showSugg: true })}
                                    placeholder="Buscar producto..."
                                    className={inputCls}
                                  />
                                  {l.showSugg && (
                                    <ul className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden max-h-48 overflow-y-auto">
                                      {presFiltradas.length > 0 ? presFiltradas.map(p => (
                                        <li key={p.id}>
                                          <button type="button" onMouseDown={() => onLinePresSelect(l.id, p)}
                                            className="w-full text-left px-3 py-2 hover:bg-blue-50 transition flex items-center justify-between gap-2">
                                            <div className="min-w-0">
                                              <span className="text-sm font-medium text-slate-800 block truncate">{p.nombre}</span>
                                              <span className="text-xs text-slate-400">{p.tipo} &middot; {p.unidad}</span>
                                            </div>
                                            <div className="shrink-0 flex items-center gap-1.5">
                                              {p.es_retornable && (
                                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">Retornable</span>
                                              )}
                                              <span className="text-xs font-medium text-slate-600">S/ {Number(p.precio_base).toFixed(2)}</span>
                                            </div>
                                          </button>
                                        </li>
                                      )) : (
                                        <li className="px-3 py-2 text-sm text-slate-400 text-center">Sin resultados</li>
                                      )}
                                    </ul>
                                  )}
                                </>
                              )}
                            </div>

                            {/* Tipo de linea (only for retornables) */}
                            {l.presentacion && l.presentacion.es_retornable && (
                              <div className="mb-3">
                                <p className="text-xs text-slate-500 mb-1.5">Tipo de entrega:</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {tipos.map(t => (
                                    <button key={t.value} type="button"
                                      onClick={() => onLineTipoChange(l.id, t.value, l.presentacion)}
                                      className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition
                                        ${l.tipo_linea === t.value
                                          ? 'border-blue-500 bg-blue-50 text-blue-700'
                                          : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                                      {t.label}
                                      <span className="text-slate-400 font-normal ml-1">({t.hint})</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Cantidad + Vacíos (si recarga) */}
                            <div className={`grid gap-3 mb-3 ${l.tipo_linea === 'recarga' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                              <div>
                                <label className="block text-xs text-slate-500 mb-0.5">Cantidad</label>
                                <input type="number" inputMode="numeric" min="1" step="1"
                                  className={`${inputCls} text-center text-lg font-bold`}
                                  value={l.cantidad}
                                  onChange={e => updateLine(l.id, { cantidad: e.target.value })} />
                              </div>
                              {l.tipo_linea === 'recarga' && (
                                <div>
                                  <label className="block text-xs text-indigo-600 font-medium mb-0.5">Vacios a devolver</label>
                                  <input type="number" inputMode="numeric" min="0" step="1"
                                    className={`${inputCls} text-center text-lg font-bold border-indigo-300 bg-indigo-50 text-indigo-700`}
                                    value={l.vacios_esperados}
                                    onChange={e => updateLine(l.id, { vacios_esperados: e.target.value })} />
                                  {String(l.vacios_esperados) !== String(l.cantidad) && (
                                    <p className="text-xs text-amber-500 mt-0.5">Difiere de la cantidad</p>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Precio + Subtotal */}
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <label className="block text-xs text-slate-500 mb-0.5">
                                  Precio unit.
                                  {l.precio_origen === 'especial' && (
                                    <span className="ml-1.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-semibold">Precio especial</span>
                                  )}
                                  {l.precio_origen === 'base' && (
                                    <span className="ml-1.5 text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded-full font-medium">Precio base</span>
                                  )}
                                </label>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-sm font-semibold text-slate-400">S/</span>
                                  <input type="number" inputMode="decimal" min="0" step="0.50"
                                    className={`${inputCls} flex-1 text-right text-lg font-bold ${
                                      l.precio_origen === 'especial' ? 'border-amber-300 bg-amber-50' : ''
                                    }`}
                                    value={l.precio_unitario}
                                    onChange={e => updateLine(l.id, { precio_unitario: e.target.value, precio_origen: null })}
                                    placeholder="0.00" />
                                </div>
                              </div>
                              <div className="flex items-end">
                                <div className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-right">
                                  <div className="text-xs text-slate-400">Subtotal</div>
                                  <div className="text-sm font-bold text-slate-800">S/ {sub.toFixed(2)}</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* ── Total summary ── */}
                {lineas.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-blue-600 font-medium">
                          {lineas.length} producto{lineas.length !== 1 ? 's' : ''} en el pedido
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-blue-600">Total estimado</p>
                        <p className="text-2xl font-bold text-blue-800">S/ {totalCalc.toFixed(2)}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl shrink-0">

            <button type="button" onClick={onClose}
              className="px-5 py-2.5 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-100 transition">
              Cancelar
            </button>
            <button type="submit" disabled={loading || lineas.length === 0}

              className="px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition flex items-center gap-2">
              {loading && (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              )}
              {loading ? 'Creando...' : 'Crear Pedido'}
            </button>
          </div>
        </form>
      </div>

      <ClienteModal
        isOpen={showClienteModal}
        onClose={() => setShowClienteModal(false)}
        onSaved={(saved) => { selectCliente(saved); setShowClienteModal(false); }}
      />
    </div>
  );
}
