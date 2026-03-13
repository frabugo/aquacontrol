import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';

const PLAN_COLORS = {
  basico: 'bg-slate-100 text-slate-700',
  profesional: 'bg-blue-100 text-blue-700',
  enterprise: 'bg-purple-100 text-purple-700',
};

export default function PanelCentral() {
  const { user, logout } = useAuth();
  const [stats, setStats] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCrear, setShowCrear] = useState(false);
  const [detalle, setDetalle] = useState(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, tenantsRes] = await Promise.all([
        api.get('/central/stats'),
        api.get('/central/tenants'),
      ]);
      setStats(statsRes.data);
      setTenants(tenantsRes.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Error cargando datos');
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const clearMsg = () => { setError(''); setSuccessMsg(''); };

  async function handleToggle(tenant) {
    clearMsg();
    const accion = tenant.activo ? 'suspender' : 'activar';
    if (!window.confirm(`${accion === 'suspender' ? 'Suspender' : 'Activar'} "${tenant.nombre_empresa}"?`)) return;
    try {
      await api.put(`/central/tenants/${tenant.id}/toggle`);
      setSuccessMsg(`Empresa ${accion === 'suspender' ? 'suspendida' : 'activada'}`);
      fetchData();
    } catch (err) {
      setError(err.response?.data?.error || 'Error');
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-slate-800">AquaControl Central</h1>
            <p className="text-sm text-slate-400">Panel de administracion de empresas</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-500">{user?.nombre}</span>
            <button onClick={logout} className="text-sm text-red-600 hover:text-red-700 font-medium">Cerrar sesion</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
            <button onClick={clearMsg} className="float-right font-bold">x</button>
          </div>
        )}
        {successMsg && (
          <div className="bg-green-50 border border-green-200 text-green-700 rounded-lg px-4 py-3 text-sm">
            {successMsg}
            <button onClick={clearMsg} className="float-right font-bold">x</button>
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Empresas" value={stats.total_empresas} color="blue" />
            <StatCard label="Activas" value={stats.activas} color="green" />
            <StatCard label="Suspendidas" value={stats.suspendidas} color="red" />
            <StatCard label="Usuarios totales" value={stats.total_usuarios} color="purple" />
          </div>
        )}

        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">Empresas ({tenants.length})</h2>
          <button onClick={() => { setShowCrear(true); setDetalle(null); clearMsg(); }}
            className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition">
            + Nueva empresa
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Empresa</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Subdominio</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600">Plan</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Modulos</th>
                <th className="text-center px-4 py-3 font-semibold text-slate-600">Estado</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenants.map(t => (
                <tr key={t.id} className="hover:bg-slate-50 transition">
                  <td className="px-4 py-3 font-medium text-slate-800">{t.nombre_empresa}</td>
                  <td className="px-4 py-3">
                    <a href={`https://${t.subdominio}.aquacontrol.site`} target="_blank" rel="noopener noreferrer"
                      className="text-blue-600 hover:underline">{t.subdominio}.aquacontrol.site</a>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${PLAN_COLORS[t.plan] || PLAN_COLORS.basico}`}>{t.plan}</span>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-500">{t.total_modulos}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${t.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {t.activo ? 'Activa' : 'Suspendida'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right space-x-2">
                    <button onClick={() => { setDetalle(t); setShowCrear(false); clearMsg(); }}
                      className="text-blue-600 hover:text-blue-800 text-xs font-medium">Ver</button>
                    <button onClick={() => handleToggle(t)}
                      className={`text-xs font-medium ${t.activo ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'}`}>
                      {t.activo ? 'Suspender' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr><td colSpan="6" className="px-4 py-8 text-center text-slate-400">No hay empresas registradas</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {stats?.servidor && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <h3 className="text-sm font-semibold text-slate-600 mb-2">Servidor</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-slate-500">
              <div>Version: <span className="font-medium text-slate-700">{stats.servidor.version}</span></div>
              <div>Node: <span className="font-medium text-slate-700">{stats.servidor.node}</span></div>
              <div>Hora: <span className="font-medium text-slate-700">{stats.servidor.hora}</span></div>
              <div>Uptime: <span className="font-medium text-slate-700">{Math.round(stats.servidor.uptime / 60)}min</span></div>
            </div>
          </div>
        )}

        {showCrear && <CrearTenantModal onClose={() => setShowCrear(false)} onCreated={() => { setShowCrear(false); fetchData(); }} />}
        {detalle && <DetalleTenantModal tenant={detalle} onClose={() => setDetalle(null)} onUpdated={fetchData} />}
      </main>
    </div>
  );
}

function StatCard({ label, value, color }) {
  const colors = {
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    green: 'bg-green-50 text-green-700 border-green-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    purple: 'bg-purple-50 text-purple-700 border-purple-100',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs opacity-70 mt-1">{label}</p>
    </div>
  );
}

function CrearTenantModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    nombre_empresa: '', subdominio: '', plan: 'basico', max_usuarios: 5,
    admin_nombre: '', admin_email: '', admin_password: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.post('/central/tenants', {
        nombre_empresa: form.nombre_empresa,
        subdominio: form.subdominio,
        plan: form.plan,
        max_usuarios: Number(form.max_usuarios),
        admin: { nombre: form.admin_nombre, email: form.admin_email, password: form.admin_password },
      });
      onCreated();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al crear');
    }
    setLoading(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">Nueva Empresa</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre de empresa</label>
            <input value={form.nombre_empresa} onChange={e => setForm({...form, nombre_empresa: e.target.value})}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Subdominio</label>
            <div className="flex items-center">
              <input value={form.subdominio} onChange={e => setForm({...form, subdominio: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')})}
                className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-l-lg" placeholder="miempresa" required />
              <span className="px-3 py-2 text-sm bg-slate-100 border border-l-0 border-slate-300 rounded-r-lg text-slate-500">.aquacontrol.site</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Plan</label>
              <select value={form.plan} onChange={e => setForm({...form, plan: e.target.value})}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg">
                <option value="basico">Basico</option>
                <option value="profesional">Profesional</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Max usuarios</label>
              <input type="number" min="1" value={form.max_usuarios} onChange={e => setForm({...form, max_usuarios: e.target.value})}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" />
            </div>
          </div>
          <div className="border-t border-slate-200 pt-4">
            <p className="text-sm font-semibold text-slate-600 mb-3">Administrador de la empresa</p>
            <div className="space-y-3">
              <input value={form.admin_nombre} onChange={e => setForm({...form, admin_nombre: e.target.value})}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" placeholder="Nombre completo" required />
              <input type="email" value={form.admin_email} onChange={e => setForm({...form, admin_email: e.target.value})}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" placeholder="Email" required />
              <input type="password" value={form.admin_password} onChange={e => setForm({...form, admin_password: e.target.value})}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg" placeholder="Contrasena" required minLength={6} />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition">Cancelar</button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition">
              {loading ? 'Creando...' : 'Crear empresa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DetalleTenantModal({ tenant, onClose, onUpdated }) {
  const [usuarios, setUsuarios] = useState([]);
  const [modulos, setModulos] = useState([]);
  const [disponibles, setDisponibles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [usersRes, modsRes, dispRes] = await Promise.all([
          api.get(`/central/tenants/${tenant.id}/usuarios`),
          api.get(`/central/tenants/${tenant.id}/modulos`),
          api.get('/central/modulos-disponibles'),
        ]);
        setUsuarios(usersRes.data);
        setModulos(modsRes.data);
        setDisponibles(dispRes.data);
      } catch {}
      setLoading(false);
    })();
  }, [tenant.id]);

  async function toggleModulo(mod) {
    const nuevo = modulos.includes(mod) ? modulos.filter(m => m !== mod) : [...modulos, mod];
    try {
      await api.put(`/central/tenants/${tenant.id}/modulos`, { modulos: nuevo });
      setModulos(nuevo);
      onUpdated();
    } catch {}
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800">{tenant.nombre_empresa}</h2>
            <p className="text-sm text-slate-400">{tenant.subdominio}.aquacontrol.site</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl">&times;</button>
        </div>
        <div className="p-6 space-y-6">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div><p className="text-slate-400">Plan</p><p className="font-semibold text-slate-800">{tenant.plan}</p></div>
                <div><p className="text-slate-400">Max usuarios</p><p className="font-semibold text-slate-800">{tenant.max_usuarios}</p></div>
                <div><p className="text-slate-400">BD</p><p className="font-semibold text-slate-800 text-xs">{tenant.database_name}</p></div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-600 mb-2">Modulos ({modulos.length})</h3>
                <div className="flex flex-wrap gap-2">
                  {disponibles.map(mod => (
                    <button key={mod} onClick={() => toggleModulo(mod)}
                      className={`px-3 py-1 text-xs font-medium rounded-full border transition ${
                        modulos.includes(mod) ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                      }`}>{mod}</button>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-600 mb-2">Usuarios ({usuarios.length})</h3>
                <div className="space-y-2">
                  {usuarios.map(u => (
                    <div key={u.id} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg text-sm">
                      <div>
                        <span className="font-medium text-slate-800">{u.nombre}</span>
                        <span className="text-slate-400 ml-2">{u.email}</span>
                      </div>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.activo ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{u.rol}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
