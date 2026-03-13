import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

const getSocketUrl = () => {
  try {
    const guardada = localStorage.getItem('AQUA_API_URL');
    if (guardada) return guardada;
  } catch (e) { /* SSR o sin localStorage */ }

  // En dev con Vite proxy, usar mismo origin
  if (import.meta.env.DEV) return undefined; // socket.io auto-detecta

  return import.meta.env.VITE_SOCKET_URL || `http://${window.location.hostname}:3001`;
};

const SOCKET_URL = getSocketUrl();
let socketInstance = null;

export const getSocket = () => {
  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      autoConnect: false,
      transports: ['websocket'],
    });
  }
  return socketInstance;
};

export const useSocket = () => {
  const socket = useRef(getSocket());

  useEffect(() => {
    if (!socket.current.connected) {
      socket.current.connect();
    }
  }, []);

  return socket.current;
};
