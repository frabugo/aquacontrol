import { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { getConfig, saveConfig, consultarRuc } from '../../services/configService';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

export default function Facturacion() {
  const [form, setForm] = useState({
    facturacion_url:        '',
    facturacion_series_url: '',
    facturacion_token:      '',
    facturacion_igv:        '18',
    empresa_ruc:            '',
    empresa_razon_social:   '',
    empresa_direccion:      '',
    empresa_ubigeo:         '',
    empresa_email:          '',
    empresa_telefono:       '',
  });
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState('');
  const [rucLoading, setRucLoading] = useState(false);

  useEffect(() => {
    getConfig()
      .then(cfg => {
        setForm(f => ({
          facturacion_url:        cfg.facturacion_url        || f.facturacion_url,
          facturacion_series_url: cfg.facturacion_series_url || f.facturacion_series_url,
          facturacion_token:      cfg.facturacion_token      || f.facturacion_token,
          facturacion_igv:        cfg.facturacion_igv        || f.facturacion_igv,
          empresa_ruc:            cfg.empresa_ruc            || f.empresa_ruc,
          empresa_razon_social:   cfg.empresa_razon_social   || f.empresa_razon_social,
          empresa_direccion:      cfg.empresa_direccion      || f.empresa_direccion,
          empresa_ubigeo:         cfg.empresa_ubigeo         || f.empresa_ubigeo,
          empresa_email:          cfg.empresa_email           || f.empresa_email,
          empresa_telefono:       cfg.empresa_telefono       || f.empresa_telefono,
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
        <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Facturacion Electronica</h1>
        <p className="text-sm text-slate-500 mt-0.5">Configurar conexion a la API de emision de comprobantes</p>
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

        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700">Conexion API</h3>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Token de autorizacion</label>
            <input type="password" className={inputCls} value={form.facturacion_token} onChange={set('facturacion_token')}
              placeholder="Bearer token de la API" />
            <p className="text-xs text-slate-400 mt-0.5">Token compartido para comprobantes y series</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">URL emitir comprobantes</label>
            <input className={inputCls} value={form.facturacion_url} onChange={set('facturacion_url')}
              placeholder="https://api.ejemplo.com/comprobantes" />
            <p className="text-xs text-slate-400 mt-0.5">Endpoint POST para emitir boletas y facturas</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">URL obtener series</label>
            <input className={inputCls} value={form.facturacion_series_url} onChange={set('facturacion_series_url')}
              placeholder="https://api.ejemplo.com/series" />
            <p className="text-xs text-slate-400 mt-0.5">Endpoint GET para listar series. Se agrega ?tipo=boleta o ?tipo=factura</p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Porcentaje IGV (%)</label>
            <input type="number" step="0.000001" min="0" max="100"
              className={`${inputCls} max-w-[120px]`}
              value={form.facturacion_igv} onChange={set('facturacion_igv')}
              placeholder="18" />
            <p className="text-xs text-slate-400 mt-0.5">Se usa para calcular el desglose subtotal/IGV de cada comprobante</p>
          </div>
        </div>

        {/* Datos de la Empresa (Emisor) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-slate-700">Datos de la Empresa (Emisor)</h3>
          <p className="text-xs text-slate-400">Se usan para guias de remision y datos del emisor en comprobantes</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">RUC</label>
              <div className="flex gap-2">
                <input className={`${inputCls} flex-1`} value={form.empresa_ruc} onChange={set('empresa_ruc')}
                  placeholder="20601274133" maxLength={11} />
                {/^\d{11}$/.test(form.empresa_ruc) && (
                  <button type="button" disabled={rucLoading}
                    onClick={async () => {
                      setRucLoading(true);
                      try {
                        const r = await consultarRuc(form.empresa_ruc);
                        const d = r.data || r;
                        setForm(f => ({
                          ...f,
                          empresa_razon_social: d.nombre_o_razon_social || f.empresa_razon_social,
                          empresa_direccion:    d.direccion || f.empresa_direccion,
                          empresa_ubigeo:       String(d.ubigeo || '').split(',').pop().trim() || f.empresa_ubigeo,
                        }));
                      } catch { /* silent */ }
                      setRucLoading(false);
                    }}
                    className="px-3 py-2 text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition whitespace-nowrap">
                    {rucLoading ? '...' : 'Buscar'}
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Razon social</label>
              <input className={inputCls} value={form.empresa_razon_social} onChange={set('empresa_razon_social')}
                placeholder="AQUACONTROL S.A.C" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Direccion</label>
              <input className={inputCls} value={form.empresa_direccion} onChange={set('empresa_direccion')}
                placeholder="Av. Principal 123" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Ubigeo</label>
              <input className={inputCls} value={form.empresa_ubigeo} onChange={set('empresa_ubigeo')}
                placeholder="150101" maxLength={6} />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Telefono</label>
              <input className={inputCls} value={form.empresa_telefono} onChange={set('empresa_telefono')}
                placeholder="01-4271148" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
              <input type="email" className={inputCls} value={form.empresa_email} onChange={set('empresa_email')}
                placeholder="info@aquacontrol.pe" />
            </div>
          </div>
        </div>

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
