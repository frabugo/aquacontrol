import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../hooks/useSocket';
import { obtenerAlertasTodas } from '../services/programacionMantService';

const STORAGE_KEY = 'mant_alertas_vistas';
const POLL_MS = 5 * 60 * 1000; // 5 minutos

function getVistas() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch { return []; }
}

function setVistas(ids) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(ids)); } catch {}
}

export default function CampanaMant() {
  const { user } = useAuth();
  const socket = useSocket();
  const navigate = useNavigate();
  const [alertas, setAlertas] = useState([]);
  const [open, setOpen] = useState(false);
  const [vistas, setVistasState] = useState(getVistas);
  const ref = useRef(null);

  // Solo admin y encargada
  if (!user || !['admin', 'encargada'].includes(user.rol)) return null;

  const fetchAlertas = useCallback(async () => {
    try {
      const data = await obtenerAlertasTodas();
      setAlertas(Array.isArray(data) ? data : []);
    } catch { /* silenciar */ }
  }, []);

  // Fetch inicial + polling
  useEffect(() => {
    fetchAlertas();
    const interval = setInterval(fetchAlertas, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchAlertas]);

  // Socket listener
  useEffect(() => {
    if (!socket) return;
    const handler = () => fetchAlertas();
    socket.on('mantenimiento:alerta', handler);
    return () => socket.off('mantenimiento:alerta', handler);
  }, [socket, fetchAlertas]);

  // Click fuera cierra dropdown
  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  const alertaKey = (a) => `${a.origen}-${a.id}`;
  const noVistas = alertas.filter(a => !vistas.includes(alertaKey(a)));

  function handleOpen() {
    setOpen(prev => !prev);
  }

  function marcarVistas() {
    const ids = alertas.map(alertaKey);
    setVistas(ids);
    setVistasState(ids);
  }

  function handleClickAlerta() {
    marcarVistas();
    setOpen(false);
    navigate('/mantenimientos');
  }

  function handleVerTodo() {
    marcarVistas();
    setOpen(false);
    navigate('/mantenimientos');
  }

  return (
    <div className="relative" ref={ref}>
      {/* Campana */}
      <button
        onClick={handleOpen}
        className="relative w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 transition"
        title="Alertas de mantenimiento"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {/* Badge */}
        {noVistas.length > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
            {noVistas.length > 99 ? '99+' : noVistas.length}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
            <span className="text-sm font-semibold text-slate-700">Alertas de mantenimiento</span>
            <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Lista */}
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
            {alertas.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-slate-400">
                Sin alertas de mantenimiento
              </div>
            ) : (
              alertas.map((a) => {
                const esVencido = a.nivel === 'vencido';
                const kmActual = a.proximo_km != null ? Number(a.proximo_km) - Number(a.km_restante) : null;
                return (
                  <button
                    key={alertaKey(a)}
                    onClick={handleClickAlerta}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors ${
                      esVencido ? 'bg-red-50' : 'bg-amber-50'
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <span className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${esVencido ? 'bg-red-500' : 'bg-amber-400'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">
                          {a.placa} — {a.tipo}{a.categoria ? ` (${a.categoria})` : ''}
                        </p>
                        <p className={`text-xs mt-0.5 ${esVencido ? 'text-red-600' : 'text-amber-600'}`}>
                          {esVencido
                            ? a.proximo_km != null
                              ? `Vencido — debio ser a ${Number(a.proximo_km).toLocaleString()} km, va en ${kmActual.toLocaleString()} km (+${Math.abs(a.km_restante).toLocaleString()} km pasado)`
                              : `Vencido${a.proximo_fecha ? ` — fecha: ${a.proximo_fecha}` : ''}`
                            : a.proximo_km != null
                              ? `Faltan ${Math.max(0, a.km_restante).toLocaleString()} km — toca a ${Number(a.proximo_km).toLocaleString()} km (va en ${kmActual.toLocaleString()} km)`
                              : `Proximo${a.proximo_fecha ? ` — fecha: ${a.proximo_fecha}` : ''}`
                          }
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Footer */}
          {alertas.length > 0 && (
            <div className="border-t border-slate-100">
              <button
                onClick={handleVerTodo}
                className="w-full px-4 py-2.5 text-sm text-blue-600 font-medium hover:bg-blue-50 transition-colors text-center"
              >
                Ver todo →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
