import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { getConfig, saveConfig, cambiarModo, restaurarBd, listarBackups, crearBackup, restaurarBackup } from '../../services/configService';

function Toggle({ label, description, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {description && <p className="text-xs text-slate-400 mt-0.5">{description}</p>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          checked ? 'bg-blue-600' : 'bg-slate-300'
        }`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
          checked ? 'translate-x-5' : ''
        }`} />
      </button>
    </div>
  );
}

export default function ConfigGeneral() {
  const [form, setForm] = useState({
    vender_sin_stock: true,
    entregar_sin_stock: true,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [error, setError]     = useState('');

  /* Modo del sistema */
  const [modo, setModo] = useState('demo'); // 'demo' | 'produccion'

  /* Cambiar modo */
  const [showCambiarModo, setShowCambiarModo] = useState(false);
  const [modoPin, setModoPin]                 = useState('');
  const [modoConfirm, setModoConfirm]         = useState('');
  const [modoLoading, setModoLoading]         = useState(false);
  const [modoErr, setModoErr]                 = useState('');

  /* Restaurar BD */
  const [showRestore, setShowRestore]   = useState(false);
  const [restoreText, setRestoreText]   = useState('');
  const [restoring, setRestoring]       = useState(false);
  const [restoreOk, setRestoreOk]       = useState(null);
  const [restoreErr, setRestoreErr]     = useState('');

  /* Backups */
  const [backups, setBackups]                   = useState([]);
  const [backupsLoading, setBackupsLoading]     = useState(false);
  const [backupRestoring, setBackupRestoring]   = useState(null); // nombre del backup restaurándose
  const [backupConfirm, setBackupConfirm]       = useState('');
  const [backupSelected, setBackupSelected]     = useState(null); // nombre del backup seleccionado
  const [backupMsg, setBackupMsg]               = useState('');
  const [backupErr, setBackupErr]               = useState('');
  const [creandoBackup, setCreandoBackup]       = useState(false);

  function cargarBackups() {
    setBackupsLoading(true);
    listarBackups()
      .then(setBackups)
      .catch(() => {})
      .finally(() => setBackupsLoading(false));
  }

  useEffect(() => {
    getConfig()
      .then(cfg => {
        setForm({
          vender_sin_stock:   cfg.vender_sin_stock !== '0',
          entregar_sin_stock: cfg.entregar_sin_stock !== '0',
        });
        setModo(cfg.modo_sistema || 'demo');
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    cargarBackups();
  }, []);

  async function handleSave() {
    setSaving(true); setError(''); setSaved(false);
    try {
      await saveConfig({
        vender_sin_stock:   form.vender_sin_stock ? '1' : '0',
        entregar_sin_stock: form.entregar_sin_stock ? '1' : '0',
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar');
    } finally { setSaving(false); }
  }

  const isDemo = modo === 'demo';
  const modoDestino = isDemo ? 'produccion' : 'demo';
  const textoConfirmRequerido = isDemo ? 'PRODUCCION' : 'VOLVER A DEMO';

  async function handleCambiarModo() {
    setModoErr('');
    if (!modoPin.trim()) return setModoErr('Ingrese el PIN maestro');
    if (modoConfirm !== textoConfirmRequerido) return setModoErr(`Debe escribir exactamente: ${textoConfirmRequerido}`);
    setModoLoading(true);
    try {
      await cambiarModo(modoDestino, modoPin, modoConfirm);
      setModo(modoDestino);
      setShowCambiarModo(false);
      setModoPin(''); setModoConfirm('');
    } catch (err) {
      setModoErr(err.response?.data?.error || 'Error al cambiar modo');
    } finally { setModoLoading(false); }
  }

  async function handleRestaurar() {
    if (restoreText !== 'RESTAURAR') return setRestoreErr('Debe escribir RESTAURAR exactamente');
    setRestoring(true); setRestoreErr(''); setRestoreOk(null);
    try {
      const result = await restaurarBd('RESTAURAR');
      setRestoreOk(result);
      setShowRestore(false);
      cargarBackups(); // recargar lista de backups
    } catch (err) {
      setRestoreErr(err.response?.data?.error || 'Error al restaurar');
    } finally { setRestoring(false); }
  }

  async function handleRestaurarBackup() {
    if (backupConfirm !== 'RESTAURAR') return setBackupErr('Debe escribir RESTAURAR exactamente');
    setBackupRestoring(backupSelected); setBackupErr(''); setBackupMsg('');
    try {
      const result = await restaurarBackup(backupSelected, 'RESTAURAR');
      setBackupMsg(result.mensaje || 'Backup restaurado exitosamente');
      setBackupSelected(null);
      setBackupConfirm('');
    } catch (err) {
      setBackupErr(err.response?.data?.error || 'Error al restaurar backup');
    } finally { setBackupRestoring(null); }
  }

  async function handleCrearBackup() {
    setCreandoBackup(true); setBackupErr(''); setBackupMsg('');
    try {
      await crearBackup();
      setBackupMsg('Copia de seguridad creada exitosamente');
      cargarBackups();
    } catch (err) {
      setBackupErr(err.response?.data?.error || 'Error al crear copia');
    } finally { setCreandoBackup(false); }
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20 text-slate-400">Cargando...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Configuracion General</h1>
        <p className="text-sm text-slate-500 mt-0.5">Ajustes globales del sistema</p>
      </div>

      <div className="max-w-2xl space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
        )}
        {saved && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
            Configuracion guardada correctamente
          </div>
        )}

        {/* ── Modo del sistema ── */}
        <div className={`rounded-2xl border-2 p-5 ${isDemo ? 'bg-amber-50/50 border-amber-300' : 'bg-green-50/50 border-green-300'}`}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDemo ? 'bg-amber-100' : 'bg-green-100'}`}>
                {isDemo ? (
                  <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                ) : (
                  <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622A11.99 11.99 0 0020.402 6a11.959 11.959 0 00-8.402-3.286z" />
                  </svg>
                )}
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">Modo del sistema</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {isDemo ? 'Modo de pruebas — se puede restaurar la BD' : 'Modo productivo — datos reales protegidos'}
                </p>
              </div>
            </div>
            <span className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${
              isDemo ? 'bg-amber-200 text-amber-800' : 'bg-green-200 text-green-800'
            }`}>
              {isDemo ? 'DEMO' : 'PRODUCCION'}
            </span>
          </div>

          {!showCambiarModo ? (
            <button
              onClick={() => { setShowCambiarModo(true); setModoPin(''); setModoConfirm(''); setModoErr(''); }}
              className={`text-sm font-medium px-4 py-2 rounded-lg border transition ${
                isDemo
                  ? 'border-green-400 text-green-700 hover:bg-green-100'
                  : 'border-amber-400 text-amber-700 hover:bg-amber-100'
              }`}
            >
              {isDemo ? 'Cambiar a PRODUCCION' : 'Volver a DEMO'}
            </button>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 mt-2">
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                {isDemo ? 'Activar modo produccion' : 'Volver a modo demo'}
              </p>

              {isDemo && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <p className="text-xs text-amber-700">
                    En modo produccion, <span className="font-bold">restaurar BD quedara bloqueado</span>.
                    Solo se podra volver a demo con el PIN maestro.
                  </p>
                </div>
              )}
              {!isDemo && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  <p className="text-xs text-red-700">
                    Al volver a demo, se habilitara la opcion de restaurar BD.
                    <span className="font-bold"> Esto NO borra datos automaticamente</span>, solo desbloquea la opcion.
                  </p>
                </div>
              )}

              {modoErr && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{modoErr}</div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">PIN maestro</label>
                <input
                  type="password"
                  value={modoPin}
                  onChange={e => setModoPin(e.target.value)}
                  placeholder="Ingrese el PIN"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">
                  Escriba <span className="font-bold text-slate-800">{textoConfirmRequerido}</span> para confirmar
                </label>
                <input
                  type="text"
                  value={modoConfirm}
                  onChange={e => setModoConfirm(e.target.value)}
                  placeholder={textoConfirmRequerido}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button onClick={() => setShowCambiarModo(false)}
                  className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">
                  Cancelar
                </button>
                <button
                  onClick={handleCambiarModo}
                  disabled={modoLoading || modoConfirm !== textoConfirmRequerido || !modoPin.trim()}
                  className={`flex-1 px-4 py-2 text-sm font-semibold rounded-lg transition flex items-center justify-center gap-2 ${
                    modoConfirm === textoConfirmRequerido && modoPin.trim()
                      ? isDemo
                        ? 'text-white bg-green-600 hover:bg-green-700 disabled:bg-green-400'
                        : 'text-white bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400'
                      : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                  }`}
                >
                  {modoLoading && (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                  )}
                  Confirmar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Copias de seguridad ── */}
        {isDemo && (
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Copias de seguridad</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Se crean automaticamente antes de restaurar. Puede crear una copia manual en cualquier momento.
                  </p>
                </div>
              </div>
              <button
                onClick={handleCrearBackup}
                disabled={creandoBackup}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition flex items-center gap-2 shrink-0"
              >
                {creandoBackup ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                )}
                {creandoBackup ? 'Creando...' : 'Crear copia'}
              </button>
            </div>

            {backupMsg && (
              <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-4">
                <p className="text-sm font-semibold text-green-800">{backupMsg}</p>
                <p className="text-xs text-green-700 mt-1">Recarga la pagina para ver los datos restaurados.</p>
              </div>
            )}

            {backupErr && (
              <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{backupErr}</div>
            )}

            {backupsLoading ? (
              <p className="text-sm text-slate-400">Cargando copias...</p>
            ) : backups.length === 0 ? (
              <div className="bg-slate-50 rounded-lg px-4 py-6 text-center">
                <p className="text-sm text-slate-400">No hay copias de seguridad aun</p>
                <p className="text-xs text-slate-400 mt-1">Se creara una automaticamente cuando restaure la BD</p>
              </div>
            ) : (
              <div className="space-y-2">
                {backups.map(b => (
                  <div key={b.nombre} className="border border-slate-200 rounded-lg p-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-700">
                          {new Date(b.fecha).toLocaleString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {b.tablas} tablas · {b.registros} registros · {(b.peso / 1024).toFixed(0)} KB
                        </p>
                      </div>
                      {backupSelected !== b.nombre && (
                        <button
                          onClick={() => { setBackupSelected(b.nombre); setBackupConfirm(''); setBackupErr(''); setBackupMsg(''); }}
                          disabled={!!backupRestoring}
                          className="px-3 py-1.5 text-xs font-semibold text-blue-600 border border-blue-300 rounded-lg hover:bg-blue-50 transition disabled:opacity-50"
                        >
                          Restaurar esta copia
                        </button>
                      )}
                    </div>

                    {backupSelected === b.nombre && (
                      <div className="mt-3 pt-3 border-t border-slate-200 space-y-3">
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                          <p className="text-xs text-amber-700">
                            Esto reemplazara <span className="font-bold">TODOS</span> los datos actuales con los de esta copia.
                          </p>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Escriba <span className="font-bold text-slate-800">RESTAURAR</span> para confirmar
                          </label>
                          <input
                            type="text"
                            value={backupConfirm}
                            onChange={e => setBackupConfirm(e.target.value)}
                            placeholder="RESTAURAR"
                            className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-800 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            autoFocus
                          />
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => setBackupSelected(null)}
                            className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">
                            Cancelar
                          </button>
                          <button
                            onClick={handleRestaurarBackup}
                            disabled={backupRestoring === b.nombre || backupConfirm !== 'RESTAURAR'}
                            className={`flex-1 px-3 py-2 text-sm font-semibold rounded-lg transition flex items-center justify-center gap-2 ${
                              backupConfirm === 'RESTAURAR'
                                ? 'text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400'
                                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            {backupRestoring === b.nombre && (
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                              </svg>
                            )}
                            Restaurar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Stock ── */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <h3 className="text-sm font-semibold text-slate-700 mb-1">Control de Stock</h3>
          <p className="text-xs text-slate-400 mb-3">
            Permite o bloquea ventas y entregas cuando no hay stock suficiente
          </p>

          <div className="divide-y divide-slate-100">
            <Toggle
              label="Permitir vender sin stock"
              description="Si esta desactivado, no se podran crear ventas cuando el stock en planta sea insuficiente"
              checked={form.vender_sin_stock}
              onChange={v => setForm(f => ({ ...f, vender_sin_stock: v }))}
            />
            <Toggle
              label="Permitir entregar sin stock"
              description="Si esta desactivado, los repartidores no podran entregar pedidos si no tienen stock suficiente en el vehiculo"
              checked={form.entregar_sin_stock}
              onChange={v => setForm(f => ({ ...f, entregar_sin_stock: v }))}
            />
          </div>
        </div>

        {/* Save config */}
        <div className="flex justify-end">
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition">
            {saving ? 'Guardando...' : 'Guardar configuracion'}
          </button>
        </div>

        {/* ── Restaurar BD ── */}
        <div className={`rounded-2xl border-2 p-5 mt-4 ${isDemo ? 'border-red-200 bg-white' : 'border-slate-200 bg-slate-50'}`}>
          <div className="flex items-start gap-3 mb-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isDemo ? 'bg-red-100' : 'bg-slate-200'}`}>
              {isDemo ? (
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                </svg>
              )}
            </div>
            <div>
              <h3 className={`text-sm font-bold ${isDemo ? 'text-red-700' : 'text-slate-400'}`}>Restaurar base de datos</h3>
              <p className={`text-xs mt-0.5 ${isDemo ? 'text-slate-500' : 'text-slate-400'}`}>
                {isDemo
                  ? 'Elimina TODOS los datos y deja solo datos iniciales de prueba.'
                  : 'Bloqueado en modo produccion. Cambie a modo demo para habilitar.'}
              </p>
            </div>
          </div>

          {/* Solo mostrar contenido de restaurar si estamos en DEMO */}
          {isDemo ? (
            <>
              <div className="bg-red-50 rounded-lg px-4 py-3 mb-4">
                <p className="text-xs font-semibold text-red-800 mb-1.5">Se conservara unicamente:</p>
                <ul className="text-xs text-red-700 space-y-0.5 list-disc list-inside">
                  <li>Usuario admin (admin@aquacontrol.pe)</li>
                  <li>Chofer de prueba (chofer@aquacontrol.pe / Chofer123!)</li>
                  <li>Presentaciones: Bidon 20L, Bolsa Hielo 3kg, Bolsa Hielo 5kg</li>
                  <li>Cliente General y Proveedor General</li>
                  <li>1 vehiculo de prueba (ABC-123)</li>
                  <li>Configuracion del sistema (modo, APIs, etc.)</li>
                </ul>
              </div>

              {restoreOk && (
                <div className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 mb-4">
                  <p className="text-sm font-semibold text-green-800">Base de datos restaurada exitosamente</p>
                  <p className="text-xs text-green-700 mt-1">Recarga la pagina para ver los datos limpios.</p>
                </div>
              )}

              {restoreErr && (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{restoreErr}</div>
              )}

              {!showRestore ? (
                <button onClick={() => { setShowRestore(true); setRestoreText(''); setRestoreErr(''); setRestoreOk(null); }}
                  className="px-4 py-2 text-sm font-semibold text-red-600 border-2 border-red-300 rounded-lg hover:bg-red-50 transition">
                  Restaurar BD a modo demo
                </button>
              ) : (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-red-700 mb-1">
                      Escribe <span className="font-bold">RESTAURAR</span> para confirmar
                    </label>
                    <input
                      type="text"
                      value={restoreText}
                      onChange={e => setRestoreText(e.target.value)}
                      placeholder="RESTAURAR"
                      className="w-full px-3 py-2 text-sm border-2 border-red-300 rounded-lg text-slate-800 placeholder-red-300 focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setShowRestore(false)}
                      className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">
                      Cancelar
                    </button>
                    <button
                      onClick={handleRestaurar}
                      disabled={restoring || restoreText !== 'RESTAURAR'}
                      className={`flex-1 px-4 py-2 text-sm font-semibold rounded-lg transition flex items-center justify-center gap-2 ${
                        restoreText === 'RESTAURAR'
                          ? 'text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400'
                          : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      {restoring && (
                        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                        </svg>
                      )}
                      Restaurar ahora
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2 text-slate-400 bg-slate-100 rounded-lg px-4 py-3">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <p className="text-sm">Restaurar BD esta bloqueado en modo produccion</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
