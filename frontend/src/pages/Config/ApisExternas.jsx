import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { getConfig, saveConfig, consultarDni, consultarRuc } from '../../services/configService';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

export default function ApisExternas() {
  const [form, setForm] = useState({
    api_dni_url:   'https://apiperu.dev/api/dni',
    api_dni_token: '',
    api_ruc_url:   'https://apiperu.dev/api/ruc',
    api_ruc_token: '',
  });
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saved, setSaved]       = useState(false);
  const [testDni, setTestDni]   = useState('');
  const [testRuc, setTestRuc]   = useState('');
  const [dniResult, setDniResult] = useState(null);
  const [rucResult, setRucResult] = useState(null);
  const [dniLoading, setDniLoading] = useState(false);
  const [rucLoading, setRucLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getConfig()
      .then(cfg => {
        setForm(f => ({
          api_dni_url:   cfg.api_dni_url   || f.api_dni_url,
          api_dni_token: cfg.api_dni_token  || '',
          api_ruc_url:   cfg.api_ruc_url   || f.api_ruc_url,
          api_ruc_token: cfg.api_ruc_token || '',
        }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function set(key) {
    return e => setForm(f => ({ ...f, [key]: e.target.value }));
  }

  async function handleSave() {
    setSaving(true); setError(''); setSaved(false);
    try {
      await saveConfig(form);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar');
    } finally { setSaving(false); }
  }

  async function handleTestDni() {
    if (!/^\d{8}$/.test(testDni)) return;
    setDniLoading(true); setDniResult(null);
    try {
      const res = await consultarDni(testDni);
      setDniResult(res.data);
    } catch (err) {
      setDniResult({ error: err.response?.data?.error || 'Error al consultar' });
    } finally { setDniLoading(false); }
  }

  async function handleTestRuc() {
    if (!/^\d{11}$/.test(testRuc)) return;
    setRucLoading(true); setRucResult(null);
    try {
      const res = await consultarRuc(testRuc);
      setRucResult(res.data);
    } catch (err) {
      setRucResult({ error: err.response?.data?.error || 'Error al consultar' });
    } finally { setRucLoading(false); }
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
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">APIs Externas</h1>
        <p className="text-sm text-slate-500 mt-0.5">Configurar conexiones a APIs de consulta DNI y RUC</p>
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

        {/* API DNI */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">API Consulta DNI</h3>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">URL</label>
            <input className={inputCls} value={form.api_dni_url} onChange={set('api_dni_url')}
              placeholder="https://apiperu.dev/api/dni" />
            <p className="text-xs text-slate-400 mt-0.5">Se envía POST con {"{ dni }"} en el body</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Token</label>
            <input type="password" className={inputCls} value={form.api_dni_token} onChange={set('api_dni_token')}
              placeholder="Token de autorizacion" />
          </div>

          {/* Test DNI */}
          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500 mb-2">Probar consulta</p>
            <div className="flex gap-2">
              <input className={`${inputCls} max-w-[160px]`} value={testDni} onChange={e => setTestDni(e.target.value)}
                placeholder="DNI 8 digitos" maxLength={8} />
              <button type="button" onClick={handleTestDni}
                disabled={dniLoading || !/^\d{8}$/.test(testDni)}
                className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg transition">
                {dniLoading ? 'Consultando...' : 'Probar'}
              </button>
            </div>
            {dniResult && (
              <div className={`mt-2 p-3 rounded-lg text-sm ${dniResult.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {dniResult.error
                  ? dniResult.error
                  : <><strong>{dniResult.nombre_completo}</strong> ({dniResult.nombres} {dniResult.apellido_paterno} {dniResult.apellido_materno})</>
                }
              </div>
            )}
          </div>
        </div>

        {/* API RUC */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
          <h3 className="text-sm font-semibold text-slate-700">API Consulta RUC</h3>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">URL</label>
            <input className={inputCls} value={form.api_ruc_url} onChange={set('api_ruc_url')}
              placeholder="https://apiperu.dev/api/ruc" />
            <p className="text-xs text-slate-400 mt-0.5">Se envía POST con {"{ ruc }"} en el body</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Token</label>
            <input type="password" className={inputCls} value={form.api_ruc_token} onChange={set('api_ruc_token')}
              placeholder="Token de autorizacion" />
          </div>

          {/* Test RUC */}
          <div className="pt-2 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500 mb-2">Probar consulta</p>
            <div className="flex gap-2">
              <input className={`${inputCls} max-w-[180px]`} value={testRuc} onChange={e => setTestRuc(e.target.value)}
                placeholder="RUC 11 digitos" maxLength={11} />
              <button type="button" onClick={handleTestRuc}
                disabled={rucLoading || !/^\d{11}$/.test(testRuc)}
                className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg transition">
                {rucLoading ? 'Consultando...' : 'Probar'}
              </button>
            </div>
            {rucResult && (
              <div className={`mt-2 p-3 rounded-lg text-sm ${rucResult.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {rucResult.error
                  ? rucResult.error
                  : <><strong>{rucResult.nombre_o_razon_social}</strong><br />{rucResult.direccion}</>
                }
              </div>
            )}
          </div>
        </div>

        {/* Save button */}
        <div className="flex justify-end">
          <button onClick={handleSave} disabled={saving}
            className="px-6 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition">
            {saving ? 'Guardando...' : 'Guardar configuracion'}
          </button>
        </div>
      </div>
    </Layout>
  );
}
