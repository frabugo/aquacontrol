import { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { miVehiculo, vehiculosDisponibles } from '../../services/vehiculosService';
import { miRuta, crearRuta, cargarVehiculo, salirRuta } from '../../services/rutasService';
import { listarPresentaciones } from '../../services/presentacionesService';
import { solicitarGPS } from '../../hooks/useGeolocalizacion';
import { useRepartidor } from '../../context/RepartidorContext';
import { useSocket } from '../../hooks/useSocket';
import FinalizarRuta from './FinalizarRuta';
import VisitaPlanta from './VisitaPlanta';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

const PASO_LABELS = ['Vehiculo', 'Cargar Stock', 'Salir a ruta'];

export default function MiVehiculo() {
  const { activarRuta: activarRutaCtx, gpsActivo, ubicacion } = useRepartidor();
  const socket = useSocket();
  const [loading, setLoading]     = useState(true);
  const [vehiculo, setVehiculo]   = useState(null);
  const [vehiculos, setVehiculos] = useState([]);
  const [ruta, setRuta]           = useState(null);
  const [paso, setPaso]           = useState(1);
  const [error, setError]         = useState('');

  // Stock loading
  const [presentaciones, setPresentaciones] = useState([]);
  const [items, setItems]       = useState([]);
  const [stockCargado, setStockCargado] = useState([]);
  const [loadingAction, setLoadingAction] = useState(false);
  const [showFinalizar, setShowFinalizar] = useState(false);
  const [gpsError, setGpsError] = useState('');
  const [tabActiva, setTabActiva] = useState('stock');
  const [kmInicio, setKmInicio] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [vehRes, rutaRes] = await Promise.all([
        miVehiculo(),
        miRuta().catch(() => ({ data: null })),
      ]);
      setVehiculo(vehRes.data || null);
      const rutaData = rutaRes.data || null;
      setRuta(rutaData);

      if (rutaData) {
        // Already have a ruta today
        if (rutaData.estado === 'en_ruta' || rutaData.estado === 'regresando') {
          setPaso(3); // Already on route
        } else if (rutaData.estado === 'preparando') {
          setPaso(2); // Loading stock phase
        } else {
          setPaso(3);
        }
        setStockCargado(rutaData.stock || []);
      } else if (vehRes.data) {
        setPaso(1); // Has vehicle, needs to create ruta
      } else {
        setPaso(1); // Needs to select vehicle
      }
    } catch {
      setVehiculo(null);
      setRuta(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Load available vehicles for selection
  useEffect(() => {
    vehiculosDisponibles().then(r => setVehiculos(r.data || [])).catch(() => setVehiculos([]));
  }, []);

  // Load presentaciones for stock loading
  useEffect(() => {
    listarPresentaciones({ activo: 1, limit: 100 })
      .then(r => {
        const data = Array.isArray(r.data) ? r.data : [];
        setPresentaciones(data.filter(p => p.stock_llenos > 0));
      })
      .catch(() => setPresentaciones([]));
  }, []);

  function updateItem(presId, qty) {
    setItems(prev => {
      const exists = prev.find(i => i.presentacion_id === presId);
      if (exists) {
        return qty <= 0
          ? prev.filter(i => i.presentacion_id !== presId)
          : prev.map(i => i.presentacion_id === presId ? { ...i, cantidad: qty } : i);
      }
      return qty > 0 ? [...prev, { presentacion_id: presId, cantidad: qty }] : prev;
    });
  }

  function getItemQty(presId) {
    return items.find(i => i.presentacion_id === presId)?.cantidad || 0;
  }

  /* ── Step 1: Create ruta with selected vehicle ── */
  async function handleCrearRuta(vehiculoId) {
    setError('');
    setLoadingAction(true);
    try {
      const res = await crearRuta({ vehiculo_id: vehiculoId });
      setRuta(res);
      setPaso(2);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al crear ruta');
    }
    setLoadingAction(false);
  }

  /* ── Step 2: Load stock onto vehicle ── */
  async function handleCargar() {
    if (items.length === 0) return setError('Selecciona al menos un producto');
    setError('');
    setLoadingAction(true);
    try {
      const res = await cargarVehiculo(ruta.id, { items });
      setStockCargado(res.stock || []);
      setItems([]);
      // Refresh presentaciones stock
      const presRes = await listarPresentaciones({ activo: 1, limit: 100 });
      const data = Array.isArray(presRes.data) ? presRes.data : [];
      setPresentaciones(data.filter(p => p.stock_llenos > 0));
    } catch (err) {
      setError(err.response?.data?.error || 'Error al cargar stock');
    }
    setLoadingAction(false);
  }

  /* ── Step 3: Start route (requiere GPS) ── */
  async function handleSalir() {
    if (!window.confirm('¿Listo para salir a ruta? El stock quedara registrado.')) return;
    setError('');
    setGpsError('');
    setLoadingAction(true);

    // Verificar GPS antes de salir
    try {
      await solicitarGPS();
    } catch (gpsErr) {
      setGpsError(gpsErr.message);
      setLoadingAction(false);
      return;
    }

    try {
      await salirRuta(ruta.id, { km_inicio: kmInicio ? Number(kmInicio) : null });
      const rutaEnRuta = { ...ruta, estado: 'en_ruta', km_inicio: kmInicio ? Number(kmInicio) : null };
      setRuta(rutaEnRuta);
      setPaso(3);
      // Activar GPS en contexto global — persiste al navegar
      activarRutaCtx(rutaEnRuta);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar ruta');
    }
    setLoadingAction(false);
  }

  const rutaActiva = ruta && (ruta.estado === 'en_ruta' || ruta.estado === 'regresando');

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-lg font-bold text-slate-800">Mi Vehiculo</h1>
          <p className="text-sm text-slate-400">Prepara tu vehiculo antes de salir a ruta</p>
        </div>

        {/* Badge GPS — solo cuando está en ruta */}
        {rutaActiva && (
          <div className={`px-4 py-2.5 rounded-xl mb-4 ${
            gpsActivo ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
          }`}>
            <div className="flex items-center gap-2 text-sm">
              <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                gpsActivo ? 'bg-green-500' : 'bg-red-500'
              }`} style={gpsActivo ? { animation: 'pulse-green 2s infinite' } : {}} />
              <span className={gpsActivo ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>
                {gpsActivo ? 'GPS activo — Central te puede ver' : 'GPS inactivo'}
              </span>
            </div>
            {gpsActivo && ubicacion && (
              <p className="text-xs text-green-600 mt-1 ml-4.5 pl-0.5">
                {ubicacion.lat.toFixed(5)}, {ubicacion.lng.toFixed(5)}
                {ubicacion.speed > 0 && ` · ${Math.round(ubicacion.speed)} km/h`}
              </p>
            )}
            {!gpsActivo && (
              <p className="text-xs text-red-500 mt-1 ml-4.5 pl-0.5">
                {!window.isSecureContext
                  ? 'Requiere HTTPS — pide al admin activar SSL'
                  : 'Verifica permisos de ubicación en tu navegador'}
              </p>
            )}
            <p className="text-xs mt-1 ml-4.5 pl-0.5 text-slate-400">
              Socket: {socket?.connected ? 'conectado' : 'desconectado'}
              {' · '}{window.isSecureContext ? 'HTTPS' : 'HTTP'}
            </p>
          </div>
        )}

        {/* Tabs — solo en ruta */}
        {rutaActiva && (
          <div className="flex bg-slate-100 rounded-xl p-1 mb-4">
            {[
              { id: 'stock', label: 'Mi Stock' },
              { id: 'visita', label: 'Visita a Planta' },
            ].map(tab => (
              <button key={tab.id} onClick={() => setTabActiva(tab.id)}
                className={`flex-1 py-2 text-sm font-semibold rounded-lg transition ${
                  tabActiva === tab.id
                    ? 'bg-white text-blue-700 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700'
                }`}>
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* Progress steps */}
        <div className="flex items-center gap-2 mb-6">
          {PASO_LABELS.map((label, i) => {
            const num = i + 1;
            const active = paso === num;
            const done = paso > num || rutaActiva;
            return (
              <div key={num} className="flex items-center gap-2 flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition
                  ${done ? 'bg-green-500 text-white' : active ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400'}`}>
                  {done ? (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  ) : num}
                </div>
                <span className={`text-xs font-medium ${active ? 'text-slate-800' : 'text-slate-400'}`}>{label}</span>
                {i < 2 && <div className={`flex-1 h-0.5 ${done ? 'bg-green-300' : 'bg-slate-200'}`} />}
              </div>
            );
          })}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>
        )}

        {gpsError && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
            <div className="flex items-start gap-2">
              <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-amber-800">GPS requerido</p>
                <p className="text-sm text-amber-700 mt-0.5">{gpsError}</p>
                <button onClick={() => { setGpsError(''); handleSalir(); }}
                  className="mt-2 text-xs font-semibold text-amber-700 underline hover:text-amber-900">
                  Reintentar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══ PASO 1: Vehiculo ═══ */}
        {paso === 1 && !rutaActiva && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
              Seleccionar vehiculo
            </p>

            {vehiculo ? (
              /* Has assigned vehicle */
              <div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-blue-800">{vehiculo.placa}</p>
                      <p className="text-sm text-blue-600">
                        {[vehiculo.marca, vehiculo.modelo, vehiculo.color].filter(Boolean).join(' · ') || 'Sin datos adicionales'}
                      </p>
                    </div>
                  </div>
                </div>
                <button onClick={() => handleCrearRuta(vehiculo.id)} disabled={loadingAction}
                  className="w-full px-5 py-3 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-xl transition">
                  {loadingAction ? 'Creando ruta...' : 'Usar este vehiculo y continuar'}
                </button>
              </div>
            ) : (
              /* No assigned vehicle — select from available */
              <div>
                {vehiculos.length === 0 ? (
                  <div className="text-center py-8">
                    <svg className="w-12 h-12 mx-auto text-slate-300 mb-3" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                    </svg>
                    <p className="text-sm text-slate-500">No hay vehiculos disponibles</p>
                    <p className="text-xs text-slate-400 mt-1">Contacta a la encargada para que te asigne uno</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {vehiculos.map(v => (
                      <button key={v.id} onClick={() => handleCrearRuta(v.id)} disabled={loadingAction}
                        className="w-full flex items-center gap-3 px-4 py-3 border border-slate-200 rounded-xl hover:bg-blue-50 hover:border-blue-300 transition text-left disabled:opacity-50">
                        <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
                          <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                          </svg>
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{v.placa}</p>
                          <p className="text-xs text-slate-500">
                            {[v.marca, v.modelo, v.color].filter(Boolean).join(' · ') || 'Sin datos'}
                          </p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ═══ PASO 2: Cargar Stock ═══ */}
        {paso === 2 && ruta && ruta.estado === 'preparando' && (
          <div className="space-y-4">
            {/* Currently loaded stock */}
            {stockCargado.length > 0 && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                  Stock ya cargado
                </p>
                <div className="space-y-2">
                  {stockCargado.map(s => (
                    <div key={s.presentacion_id || s.id} className="flex items-center justify-between px-3 py-2 bg-green-50 rounded-lg">
                      <span className="text-sm text-green-800 font-medium">{s.presentacion_nombre}</span>
                      <span className="text-sm font-bold text-green-700">{s.llenos_cargados} uds</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Load more stock */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Cargar productos al vehiculo
              </p>
              {presentaciones.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No hay stock disponible en planta</p>
              ) : (
                <div className="space-y-3">
                  {presentaciones.map(p => {
                    const qty = getItemQty(p.id);
                    return (
                      <div key={p.id} className="flex items-center gap-3 py-2 border-b border-slate-100 last:border-0">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate">{p.nombre}</p>
                          <p className="text-xs text-slate-400">
                            Planta: <span className="font-medium text-slate-600">{p.stock_llenos}</span> disponibles
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button type="button" onClick={() => updateItem(p.id, Math.max(0, qty - 1))}
                            className="w-8 h-8 rounded-lg border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition">
                            -
                          </button>
                          <input type="number" min="0" max={p.stock_llenos}
                            value={qty || ''}
                            onChange={e => updateItem(p.id, Math.min(p.stock_llenos, Math.max(0, Number(e.target.value) || 0)))}
                            className="w-16 text-center px-2 py-1.5 text-sm border border-slate-300 rounded-lg"
                            placeholder="0" />
                          <button type="button" onClick={() => updateItem(p.id, Math.min(p.stock_llenos, qty + 1))}
                            className="w-8 h-8 rounded-lg border border-slate-300 flex items-center justify-center text-slate-600 hover:bg-slate-100 transition">
                            +
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-3 mt-4">
                {items.length > 0 && (
                  <button onClick={handleCargar} disabled={loadingAction}
                    className="flex-1 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-xl transition">
                    {loadingAction ? 'Cargando...' : `Cargar ${items.reduce((s, i) => s + i.cantidad, 0)} unidades`}
                  </button>
                )}
              </div>
            </div>

            {/* KM inicio + Start route button */}
            {stockCargado.length > 0 && (() => {
              const kmActual = ruta?.kilometraje_actual || 0;
              const ultimaRuta = ruta?.ultima_ruta_finalizada;
              const kmInicioNum = kmInicio ? Number(kmInicio) : null;
              const kmInicioInvalido = kmInicioNum != null && kmInicioNum < kmActual;
              const diferencia = kmInicioNum != null && kmActual > 0 && !kmInicioInvalido ? kmInicioNum - kmActual : null;
              const hayDiferencia = diferencia != null && diferencia > 0;
              return (
                <div className="space-y-3">
                  <div className={`bg-white rounded-2xl border shadow-sm p-5 ${kmInicioInvalido ? 'border-red-300' : 'border-slate-200'}`}>
                    {/* Registro de la última ruta finalizada */}
                    {ultimaRuta && (
                      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4">
                        <div className="flex items-center gap-2 mb-1.5">
                          <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <p className="text-xs font-semibold text-blue-700">Ultima ruta finalizada</p>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-lg font-bold text-blue-800">{Number(ultimaRuta.km_fin).toLocaleString()} km</p>
                            <p className="text-xs text-blue-600">
                              Ruta {ultimaRuta.numero} — {ultimaRuta.fecha}
                              {ultimaRuta.hora_regreso ? ` a las ${new Date(ultimaRuta.hora_regreso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}` : ''}
                              {ultimaRuta.repartidor_nombre ? ` — ${ultimaRuta.repartidor_nombre}` : ''}
                            </p>
                          </div>
                          <svg className="w-6 h-6 text-blue-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
                          </svg>
                        </div>
                      </div>
                    )}

                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Kilometraje de salida</p>

                    {/* Último km registrado — prominente */}
                    {kmActual > 0 && (
                      <div className="bg-slate-50 rounded-xl px-4 py-3 mb-3 flex items-center justify-between">
                        <div>
                          <p className="text-xs text-slate-500">Ultimo km registrado</p>
                          <p className="text-lg font-bold text-slate-800">{Number(kmActual).toLocaleString()} km</p>
                        </div>
                        <svg className="w-6 h-6 text-slate-300" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                        </svg>
                      </div>
                    )}

                    <p className="text-xs text-slate-500 mb-1.5">Escribe el km actual del odometro *</p>
                    <input type="number" min={kmActual} className={`${inputCls} text-lg font-bold ${kmInicioInvalido ? '!border-red-400 !ring-red-300' : ''}`} value={kmInicio}
                      onChange={e => setKmInicio(e.target.value)} placeholder="Ej: 25430" />

                    {kmInicioInvalido && (
                      <p className="text-xs text-red-600 mt-1.5 font-medium">No puede ser menor al ultimo registrado ({Number(kmActual).toLocaleString()} km)</p>
                    )}

                    {/* Diferencia detectada */}
                    {hayDiferencia && (
                      <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                        <div className="flex items-start gap-2">
                          <svg className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                          </svg>
                          <div>
                            <p className="text-sm font-semibold text-amber-800">Diferencia detectada: +{diferencia.toLocaleString()} km</p>
                            <p className="text-xs text-amber-700 mt-0.5">
                              El vehiculo se movio {diferencia.toLocaleString()} km desde la ultima ruta. Esto quedara registrado.
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Todo OK */}
                    {kmInicioNum != null && diferencia === 0 && (
                      <div className="mt-3 bg-green-50 border border-green-200 rounded-xl px-3 py-2 flex items-center gap-2">
                        <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                        </svg>
                        <p className="text-xs text-green-700 font-medium">Km coincide con el ultimo registro</p>
                      </div>
                    )}
                  </div>
                  <button onClick={handleSalir} disabled={loadingAction || kmInicioInvalido || !kmInicio}
                    className="w-full px-5 py-3 text-sm font-bold text-white bg-green-600 hover:bg-green-700 disabled:bg-green-300 rounded-xl transition shadow-sm flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.581-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                    </svg>
                    {loadingAction ? 'Iniciando ruta...' : !kmInicio ? 'Ingresa el km para continuar' : kmInicioInvalido ? 'Km menor al registrado' : 'Salir a ruta'}
                  </button>
                </div>
              );
            })()}
          </div>
        )}

        {/* ═══ PASO 3: En ruta — Tab Stock ═══ */}
        {(rutaActiva || (ruta && ruta.estado === 'finalizada')) && tabActiva === 'stock' && (
          <div className="space-y-4">
            {/* Status card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 text-center">
              {ruta.estado === 'finalizada' ? (
                <>
                  <div className="w-16 h-16 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-green-700 mb-1">Ruta finalizada</h2>
                  <p className="text-sm text-slate-400">Entrega tu caja a la encargada desde "Mi Caja"</p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 mx-auto bg-blue-100 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-blue-700 mb-1">En ruta</h2>
                  <p className="text-sm text-slate-400 mb-1">Ruta: {ruta.numero}</p>
                  {stockCargado.length > 0 && (
                    <div className="mt-4 bg-blue-50 rounded-xl p-4 text-left">
                      <p className="text-xs font-semibold text-blue-600 uppercase tracking-wider mb-2">Stock en vehiculo</p>
                      <div className="space-y-1">
                        {stockCargado.map(s => {
                          const disponibles = s.llenos_disponibles ?? (s.llenos_cargados - s.llenos_entregados);
                          const vacios = s.vacios_en_vehiculo ?? ((s.vacios_recogidos || 0) - (s.vacios_devueltos || 0));
                          return (
                            <div key={s.presentacion_id || s.id} className="flex items-center justify-between text-sm">
                              <span className="text-blue-700">{s.presentacion_nombre}</span>
                              <div className="text-right">
                                <span className="font-bold text-blue-800">
                                  {disponibles} / {s.llenos_cargados}
                                </span>
                                {vacios > 0 && (
                                  <span className="ml-2 text-xs text-slate-500">
                                    ({vacios} vacíos)
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  <p className="text-xs text-slate-400 mt-4">Ve a "Mis Pedidos" para gestionar entregas</p>
                </>
              )}
            </div>

            {/* Finalizar Ruta — only when en_ruta or regresando */}
            {rutaActiva && !showFinalizar && (
              <button onClick={() => setShowFinalizar(true)}
                className="w-full px-5 py-3 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-xl transition shadow-sm flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 7.5A2.25 2.25 0 017.5 5.25h9a2.25 2.25 0 012.25 2.25v9a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25v-9z" />
                </svg>
                Finalizar Ruta
              </button>
            )}

            {/* Finalizar form */}
            {showFinalizar && rutaActiva && (
              <FinalizarRuta ruta={{ ...ruta, stock: stockCargado }} onRefresh={fetchData} />
            )}
          </div>
        )}

        {/* ═══ Tab Visita a Planta ═══ */}
        {rutaActiva && tabActiva === 'visita' && (
          <VisitaPlanta rutaActiva={ruta} />
        )}
      </div>
    </Layout>
  );
}
