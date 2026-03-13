import { useEffect, useState, useRef, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import Layout from '../../components/Layout';
import { useSocket } from '../../hooks/useSocket';
import crearIconoVehiculo, { iconoCentral } from '../../utils/vehiculoIconos';
import sonidos from '../../utils/sonidos';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

const TIMEOUT_MS = 15000;

/* ── Indicador de señal GPS ── */
function SignalIndicator({ timestamp }) {
  const edad = Date.now() - timestamp;
  if (edad < 6000)  return <span className="inline-block w-2 h-2 rounded-full bg-green-500" title="Señal excelente" />;
  if (edad < 10000) return <span className="inline-block w-2 h-2 rounded-full bg-yellow-400" title="Señal débil" />;
  return <span className="inline-block w-2 h-2 rounded-full bg-red-400 animate-pulse" title="Sin señal reciente" />;
}

/* ── Interpolar posición suavemente ── */
const interpolarPosicion = (marker, nuevaLat, nuevaLng, duracion = 1000) => {
  const inicio = marker.getLatLng();
  const startLat = inicio.lat;
  const startLng = inicio.lng;
  const diffLat = nuevaLat - startLat;
  const diffLng = nuevaLng - startLng;
  const startTime = performance.now();

  const animar = (now) => {
    const elapsed = now - startTime;
    const progreso = Math.min(elapsed / duracion, 1);
    // Ease out cúbico — movimiento más natural
    const ease = 1 - Math.pow(1 - progreso, 3);

    marker.setLatLng([
      startLat + diffLat * ease,
      startLng + diffLng * ease,
    ]);

    if (progreso < 1) {
      requestAnimationFrame(animar);
    }
  };

  requestAnimationFrame(animar);
};

/* ── Popup con estado online/offline ── */
const contenidoPopup = (rep, online) => {
  const hace = Math.round((Date.now() - rep.timestamp) / 1000);
  const estadoBadge = online
    ? '<span style="color:#10B981;font-weight:bold">\u{1F7E2} En línea</span>'
    : `<span style="color:#EF4444;font-weight:bold">\u{1F534} Sin señal (hace ${hace}s)</span>`;

  return `
    <div style="min-width:190px;font-family:sans-serif">
      <div style="font-weight:bold;font-size:14px;margin-bottom:8px;color:#1e293b">
        ${rep.nombre}
      </div>
      <div style="display:grid;gap:5px;font-size:12px">
        <div>\u{1F697} <b>Placa:</b> ${rep.placa}</div>
        <div>\u{1F4E6} <b>Vehículo:</b> ${rep.tipo_vehiculo}</div>
        <div>\u26A1 <b>Velocidad:</b> ${Math.round(rep.speed || 0)} km/h</div>
        <div>\u{1F4F6} <b>GPS:</b> ${estadoBadge}</div>
        <div style="color:#94a3b8;font-size:10px;margin-top:4px;border-top:1px solid #f1f5f9;padding-top:4px">
          Última señal: hace ${hace}s
        </div>
      </div>
    </div>`;
};

/* ── Auto-centrar mapa + ubicación de central ── */
function ControlMapa({ repartidores, onUbCentral }) {
  const map = useMap();
  const prevCountRef = useRef(0);
  const centradoRef = useRef(false);

  // Obtener ubicación de la central (encargado)
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = [pos.coords.latitude, pos.coords.longitude];
        onUbCentral(coords);
        if (!centradoRef.current) {
          centradoRef.current = true;
          map.setView(coords, 14, { animate: true });
        }
      },
      () => { /* sin GPS, usa default Lima */ },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [map, onUbCentral]);

  // Ajustar bounds cuando aparecen repartidores
  useEffect(() => {
    const prevCount = prevCountRef.current;
    prevCountRef.current = repartidores.length;

    if (prevCount === 0 && repartidores.length > 0) {
      if (repartidores.length === 1) {
        map.setView([repartidores[0].lat, repartidores[0].lng], 15, { animate: true });
      } else {
        const bounds = L.latLngBounds(repartidores.map((r) => [r.lat, r.lng]));
        map.fitBounds(bounds, { padding: [50, 50], animate: true });
      }
    }
  }, [repartidores, repartidores.length > 0, map]);

  return null;
}

/* ── Marcadores con animación suave ── */
function MarcadoresRepartidores({ repartidores }) {
  const map = useMap();
  const marcadoresRef = useRef({});

  useEffect(() => {
    const ahora = Date.now();

    repartidores.forEach((rep) => {
      const id = String(rep.repartidor_id);
      const online = ahora - rep.timestamp < TIMEOUT_MS;
      const icono = crearIconoVehiculo(rep.tipo_vehiculo, online);

      if (marcadoresRef.current[id]) {
        const marker = marcadoresRef.current[id];

        // Animación suave hacia nueva posición
        interpolarPosicion(marker, rep.lat, rep.lng);

        // Actualizar ícono (online/offline)
        marker.setIcon(icono);

        // Actualizar popup
        if (marker.getPopup()) {
          marker.getPopup().setContent(contenidoPopup(rep, online));
        }
      } else {
        // Primer marcador — sin animación
        const marker = L.marker([rep.lat, rep.lng], { icon: icono })
          .bindPopup(contenidoPopup(rep, online))
          .addTo(map);
        marcadoresRef.current[id] = marker;
      }
    });

    // Remover marcadores que ya no están
    Object.keys(marcadoresRef.current).forEach((id) => {
      if (!repartidores.find((r) => String(r.repartidor_id) === id)) {
        marcadoresRef.current[id].remove();
        delete marcadoresRef.current[id];
      }
    });
  }, [repartidores, map]);

  return null;
}

/* ── Página principal ── */
export default function MonitoreoMapa() {
  const socket = useSocket();
  const [repartidores, setRepartidores] = useState([]);
  const [ubCentral, setUbCentral] = useState(null);

  // Filtrar stale y forzar re-render para actualizar indicadores
  const limpiarStale = useCallback(() => {
    setRepartidores((prev) => {
      const ahora = Date.now();
      const filtrados = prev.filter((r) => ahora - r.timestamp < TIMEOUT_MS);
      return filtrados.length !== prev.length ? filtrados : prev;
    });
  }, []);

  useEffect(() => {
    socket.emit('central:join');

    socket.on('ubicaciones:todas', (todas) => {
      setRepartidores(todas);
    });

    socket.on('ubicacion:update', (info) => {
      // Ignorar si ya es stale
      if (Date.now() - info.timestamp > TIMEOUT_MS) return;

      setRepartidores((prev) => {
        const existe = prev.find((r) => r.repartidor_id === info.repartidor_id);
        // Solo suena si es repartidor NUEVO
        if (!existe) {
          sonidos.repartidorEnLinea();
        }

        const idx = prev.findIndex((r) => r.repartidor_id === info.repartidor_id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = info;
          return next;
        }
        return [...prev, info];
      });
    });

    socket.on('ubicacion:offline', ({ repartidor_id }) => {
      sonidos.repartidorOffline();
      setRepartidores((prev) =>
        prev.filter((r) => String(r.repartidor_id) !== String(repartidor_id))
      );
    });

    // Limpiar inactivos cada 5s + actualizar indicadores
    const intervalo = setInterval(limpiarStale, 5000);

    return () => {
      socket.off('ubicaciones:todas');
      socket.off('ubicacion:update');
      socket.off('ubicacion:offline');
      clearInterval(intervalo);
    };
  }, [socket, limpiarStale]);

  const conectados = repartidores.length;

  return (
    <Layout>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Monitoreo en Tiempo Real</h1>
          <p className="text-sm text-slate-500 mt-0.5">Ubicación de repartidores activos</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="px-3 py-1.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">
            {conectados} en ruta
          </span>
          <span className="px-3 py-1.5 rounded-full text-xs bg-slate-100 text-slate-500">
            Timeout: 15 seg
          </span>
        </div>
      </div>

      <div className="flex gap-4" style={{ height: 'calc(100vh - 200px)' }}>
        {/* Panel lateral */}
        <div className="w-64 shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-y-auto hidden lg:block">
          <div className="px-4 py-3 border-b border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Repartidores activos</p>
          </div>
          <div className="p-3 space-y-2">
            {conectados === 0 ? (
              <p className="text-sm text-slate-400 text-center py-6">Sin repartidores activos</p>
            ) : repartidores.map((rep) => (
              <div key={rep.repartidor_id} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-sm text-slate-800">{rep.nombre}</p>
                  <SignalIndicator timestamp={rep.timestamp} />
                </div>
                <p className="text-xs text-slate-500 mt-1">{rep.placa} &middot; {rep.tipo_vehiculo}</p>
                <p className="text-xs text-slate-500">{Math.round(rep.speed || 0)} km/h</p>
                <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                  En ruta
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Mapa */}
        <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <MapContainer
            center={[-12.0464, -77.0428]}
            zoom={12}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <ControlMapa repartidores={repartidores} onUbCentral={setUbCentral} />
            <MarcadoresRepartidores repartidores={repartidores} />
            {ubCentral && (
              <Marker position={ubCentral} icon={iconoCentral}>
                <Popup>
                  <div style={{ fontFamily: 'sans-serif', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                    {'\u{1F3E2}'} Central AquaControl
                  </div>
                </Popup>
              </Marker>
            )}
          </MapContainer>
        </div>
      </div>
    </Layout>
  );
}
