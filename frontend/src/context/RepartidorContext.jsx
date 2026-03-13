import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { getSocket } from '../hooks/useSocket';
import { useAuth } from './AuthContext';
import { miRuta } from '../services/rutasService';
import useNotificaciones from '../hooks/useNotificaciones';

const RepartidorContext = createContext(null);

export const RepartidorProvider = ({ children }) => {
  // ── Estado global del repartidor ──────────────
  const { user } = useAuth();
  const [rutaActiva, setRutaActiva] = useState(null);
  const [gpsActivo, setGpsActivo] = useState(false);
  const [ubicacion, setUbicacion] = useState(null);
  const [cargando, setCargando] = useState(true);

  // ── Refs para GPS — no se destruyen al navegar ─
  const watchRef = useRef(null);
  const intervaloRef = useRef(null);
  const posActual = useRef(null);
  const alertaMostrada = useRef(false);
  const socketRef = useRef(getSocket());

  // ── Enviar ubicación al backend ────────────────
  const enviarUbicacion = useCallback(() => {
    if (!posActual.current) return;
    if (!socketRef.current?.connected) return;
    if (!user?.id) return;

    socketRef.current.emit('ubicacion:update', {
      repartidor_id: user.id,
      lat: posActual.current.lat,
      lng: posActual.current.lng,
      speed: posActual.current.speed,
    });
  }, [user?.id]);

  // ── Iniciar GPS ────────────────────────────────
  const iniciarGPS = useCallback(() => {
    console.log('[GPS] iniciarGPS llamado', {
      geolocation: !!navigator.geolocation,
      watchActivo: watchRef.current !== null,
      userId: user?.id,
      protocol: window.location.protocol,
      isSecure: window.isSecureContext,
    });

    if (!navigator.geolocation) {
      console.error('[GPS] navigator.geolocation no disponible');
      return;
    }
    if (watchRef.current !== null) {
      console.log('[GPS] Ya hay un watch activo, ignorando');
      return;
    }

    const socket = socketRef.current;
    if (!socket.connected) socket.connect();

    alertaMostrada.current = false;

    socket.emit('repartidor:join', {
      repartidor_id: user?.id,
    });

    console.log('[GPS] Iniciando watchPosition...');
    watchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        posActual.current = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          speed: (position.coords.speed || 0) * 3.6,
        };
        console.log('[GPS] Posición recibida:', posActual.current.lat.toFixed(5), posActual.current.lng.toFixed(5));
        setUbicacion({ ...posActual.current });
        setGpsActivo(true);

        // Notificar recuperación si había alerta
        if (alertaMostrada.current) {
          alertaMostrada.current = false;
          window.dispatchEvent(new CustomEvent('gps:recuperado'));
        }

        enviarUbicacion();
      },
      (error) => {
        console.error('[GPS] Error watchPosition:', error.code, error.message);
        setGpsActivo(false);
        if (!alertaMostrada.current) {
          alertaMostrada.current = true;
          window.dispatchEvent(
            new CustomEvent('gps:perdido', {
              detail: { motivo: error.message },
            })
          );
        }
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
    );

    // Respaldo cada 5 segundos
    intervaloRef.current = setInterval(() => {
      if (posActual.current) {
        enviarUbicacion();
      } else if (!alertaMostrada.current) {
        alertaMostrada.current = true;
        window.dispatchEvent(
          new CustomEvent('gps:perdido', {
            detail: { motivo: 'Sin señal GPS' },
          })
        );
      }
    }, 5000);
  }, [user?.id, enviarUbicacion]);

  // ── Detener GPS ────────────────────────────────
  const detenerGPS = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    if (intervaloRef.current) {
      clearInterval(intervaloRef.current);
      intervaloRef.current = null;
    }
    posActual.current = null;
    setGpsActivo(false);
    setUbicacion(null);
  }, []);

  // ── Al iniciar ruta: activar GPS ───────────────
  const activarRuta = useCallback((ruta) => {
    setRutaActiva(ruta);
    if (ruta?.estado === 'en_ruta' || ruta?.estado === 'regresando') {
      iniciarGPS();
    }
  }, [iniciarGPS]);

  // ── Al finalizar ruta: detener GPS ────────────
  const finalizarRutaCtx = useCallback(() => {
    detenerGPS();
    setRutaActiva(null);
  }, [detenerGPS]);

  // ── Socket: unirse al room + escuchar pedido:nuevo (siempre montado) ──
  const { notificarNuevoPedido } = useNotificaciones();

  useEffect(() => {
    if (!user?.id || !user?.notif_pedidos) return;
    const socket = socketRef.current;
    if (!socket.connected) socket.connect();
    socket.emit('repartidor:join', { repartidor_id: user.id });

    const handler = (data) => {
      notificarNuevoPedido(data);
      // Emitir evento DOM para que las páginas refresquen su lista
      window.dispatchEvent(new CustomEvent('pedido:nuevo-recibido', { detail: data }));
    };
    socket.on('pedido:nuevo', handler);
    return () => { socket.off('pedido:nuevo', handler); };
  }, [user?.id, user?.notif_pedidos, notificarNuevoPedido]);

  // ── Al cargar la app: recuperar ruta activa ───
  useEffect(() => {
    if (!user?.id || !user?.gps_obligatorio) {
      setCargando(false);
      return;
    }

    const recuperarRuta = async () => {
      try {
        const res = await miRuta();
        const rutaData = res.data || null;

        if (rutaData && (rutaData.estado === 'en_ruta' || rutaData.estado === 'regresando')) {
          setRutaActiva(rutaData);
          iniciarGPS();
        }
      } catch {
        // No hay ruta activa, ok
      } finally {
        setCargando(false);
      }
    };

    recuperarRuta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.gps_obligatorio]);

  // ── Limpiar al cerrar sesión ───────────────────
  useEffect(() => {
    if (!user) {
      detenerGPS();
    }
  }, [user, detenerGPS]);

  return (
    <RepartidorContext.Provider value={{
      rutaActiva,
      gpsActivo,
      ubicacion,
      cargando,
      activarRuta,
      finalizarRutaCtx,
      iniciarGPS,
      detenerGPS,
      setRutaActiva,
    }}>
      {children}
    </RepartidorContext.Provider>
  );
};

export const useRepartidor = () => {
  const ctx = useContext(RepartidorContext);
  if (!ctx) throw new Error('useRepartidor debe usarse dentro de RepartidorProvider');
  return ctx;
};

export default RepartidorContext;
