import { useEffect, useRef, useCallback } from 'react';
import { getSocket } from './useSocket';
import { useAuth } from '../context/AuthContext';

// Función utilitaria — FUERA del hook
// No usa hooks, solo Promise
export const solicitarGPS = () => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error(
        'GPS no disponible en este dispositivo'
      ));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos),
      (err) => {
        if (err.code === 1) {
          reject(new Error(
            'Permiso de GPS denegado. ' +
            'Debes permitir la ubicación ' +
            'para iniciar la ruta.'
          ));
        } else {
          reject(new Error(
            'No se pudo obtener el GPS'
          ));
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });
};

// Hook personalizado
export const useGeolocalizacion = (activo = false) => {
  // TODOS los hooks al inicio — sin condiciones
  const { user } = useAuth();
  const watchRef = useRef(null);
  const intervaloRef = useRef(null);
  const posActual = useRef(null);
  const socketRef = useRef(getSocket());
  const alertaMostradaRef = useRef(false);
  const ultimaPosicionRef = useRef(Date.now());

  // useCallback también al inicio
  const detener = useCallback(() => {
    if (watchRef.current !== null) {
      navigator.geolocation.clearWatch(watchRef.current);
      watchRef.current = null;
    }
    if (intervaloRef.current) {
      clearInterval(intervaloRef.current);
      intervaloRef.current = null;
    }
    posActual.current = null;
    alertaMostradaRef.current = false;
  }, []);

  const enviar = useCallback(() => {
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

  // useEffect al final — también sin condiciones
  useEffect(() => {
    // La condición va DENTRO del effect, nunca antes de los hooks
    if (!activo || !user?.id) {
      detener();
      return;
    }

    if (!navigator.geolocation) {
      console.warn('Geolocalización no disponible');
      return;
    }

    const socket = socketRef.current;
    if (!socket.connected) socket.connect();

    socket.emit('repartidor:join', {
      repartidor_id: user.id,
    });

    alertaMostradaRef.current = false;
    ultimaPosicionRef.current = Date.now();

    watchRef.current = navigator.geolocation.watchPosition(
      (position) => {
        posActual.current = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          speed: (position.coords.speed || 0) * 3.6,
        };
        ultimaPosicionRef.current = Date.now();

        // Si había alerta, recuperar
        if (alertaMostradaRef.current) {
          alertaMostradaRef.current = false;
          window.dispatchEvent(new CustomEvent('gps:recuperado'));
        }

        enviar();
      },
      (error) => {
        console.error('GPS error:', error.message);

        // Error 1 = permiso revocado en medio de ruta
        if (error.code === 1 && !alertaMostradaRef.current) {
          alertaMostradaRef.current = true;
          window.dispatchEvent(
            new CustomEvent('gps:perdido', {
              detail: { motivo: error.message },
            })
          );
        }
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 10000 }
    );

    // Envío de respaldo cada 5s + detección pérdida GPS
    intervaloRef.current = setInterval(() => {
      const ahora = Date.now();
      if (posActual.current) {
        ultimaPosicionRef.current = ahora;
        enviar();
      } else if (ahora - ultimaPosicionRef.current > 20000) {
        // 20 segundos sin GPS en ruta activa
        if (!alertaMostradaRef.current) {
          alertaMostradaRef.current = true;
          window.dispatchEvent(
            new CustomEvent('gps:perdido', {
              detail: { motivo: 'Sin señal GPS' },
            })
          );
        }
      }
    }, 5000);

    setTimeout(enviar, 1000);

    return detener;
  }, [activo, user?.id, detener, enviar]);

  return { detener };
};
