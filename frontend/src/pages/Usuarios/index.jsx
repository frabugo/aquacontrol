import { useCallback, useEffect, useRef, useState } from 'react';
import Layout, { getAllModules } from '../../components/Layout';
import {
  listarUsuarios, crearUsuario, actualizarUsuario,
  desactivarUsuario,
} from '../../services/usuariosService';
import api from '../../services/api';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

const ROLES = [
  { value: 'admin',     label: 'Admin' },
  { value: 'encargada', label: 'Encargada' },
  { value: 'vendedor',  label: 'Vendedor' },
  { value: 'operario',  label: 'Operario' },
  { value: 'chofer',    label: 'Chofer' },
];

const ROL_BADGE = {
  admin:     'bg-red-100 text-red-700',
  encargada: 'bg-purple-100 text-purple-700',
  vendedor:  'bg-blue-100 text-blue-700',
  operario:  'bg-amber-100 text-amber-700',
  chofer:    'bg-green-100 text-green-700',
};

/* ═══ Modal Crear/Editar Usuario ═══ */
const ROL_DEFAULTS = {
  admin:     { gps: 0, notif: 0, sesion: 1 },
  encargada: { gps: 0, notif: 0, sesion: 1 },
  vendedor:  { gps: 0, notif: 0, sesion: 1 },
  operario:  { gps: 0, notif: 0, sesion: 1 },
  chofer:    { gps: 1, notif: 1, sesion: 1 },
};

function ToggleConfig({ label, desc, valor, onChange }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-sm font-semibold text-slate-800">{label}</div>
        <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
      </div>
      <button type="button" onClick={() => onChange(!valor)}
        className="flex-shrink-0" style={{
          width: 48, height: 26, background: valor ? '#2563EB' : '#CBD5E1',
          border: 'none', borderRadius: 20, cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
        }}>
        <div style={{
          position: 'absolute', top: 3, left: valor ? 25 : 3,
          width: 20, height: 20, background: 'white', borderRadius: '50%',
          transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </button>
    </div>
  );
}

function UsuarioModal({ isOpen, onClose, onSaved, editUser }) {
  const [nombre, setNombre]     = useState('');
  const [email, setEmail]       = useState('');
  const [telefono, setTelefono] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol]           = useState('vendedor');
  const [modulos, setModulos]   = useState([]);
  const [gpsOblig, setGpsOblig] = useState(0);
  const [notifPed, setNotifPed] = useState(0);
  const [sesUnica, setSesUnica] = useState(1);
  const allModulos = getAllModules();
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    if (isOpen) {
      if (editUser) {
        setNombre(editUser.nombre || '');
        setEmail(editUser.email || '');
        setTelefono(editUser.telefono || '');
        setRol(editUser.rol || 'vendedor');
        setModulos(editUser.modulos || []);
        setGpsOblig(editUser.gps_obligatorio ?? 0);
        setNotifPed(editUser.notif_pedidos ?? 0);
        setSesUnica(editUser.sesion_unica ?? 1);
        setPassword('');
      } else {
        setNombre(''); setEmail(''); setTelefono(''); setPassword('');
        setRol('vendedor'); setModulos([]);
        setGpsOblig(0); setNotifPed(0); setSesUnica(1);
      }
      setError('');
    }
  }, [isOpen, editUser]);

  function handleRolChange(r) {
    setRol(r);
    if (!editUser) {
      const d = ROL_DEFAULTS[r] || ROL_DEFAULTS.vendedor;
      setGpsOblig(d.gps); setNotifPed(d.notif); setSesUnica(d.sesion);
    }
  }

  function toggleModulo(key) {
    setModulos(prev => prev.includes(key) ? prev.filter(m => m !== key) : [...prev, key]);
  }

  function selectAll() {
    setModulos(allModulos.map(m => m.key));
  }

  function clearAll() {
    setModulos([]);
  }

  if (!isOpen) return null;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!nombre.trim()) return setError('El nombre es requerido');
    if (!email.trim()) return setError('El email es requerido');
    if (!editUser && !password.trim()) return setError('La contraseña es requerida');

    setError(''); setLoading(true);
    try {
      const data = {
        nombre: nombre.trim(), email: email.trim(), telefono, rol, modulos,
        gps_obligatorio: gpsOblig ? 1 : 0, notif_pedidos: notifPed ? 1 : 0, sesion_unica: sesUnica ? 1 : 0,
      };
      if (password.trim()) data.password = password.trim();

      if (editUser) {
        await actualizarUsuario(editUser.id, data);
      } else {
        await crearUsuario(data);
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar');
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-base font-semibold text-slate-800">
            {editUser ? 'Editar usuario' : 'Nuevo usuario'}
          </h2>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Nombre <span className="text-red-400">*</span></label>
              <input className={inputCls} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre completo" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email <span className="text-red-400">*</span></label>
              <input type="email" className={inputCls} value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@ejemplo.com" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Teléfono</label>
              <input className={inputCls} value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="Opcional" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Rol <span className="text-red-400">*</span></label>
              <select className={inputCls} value={rol} onChange={e => handleRolChange(e.target.value)}>
                {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              {editUser ? 'Nueva contraseña (dejar vacío para no cambiar)' : 'Contraseña *'}
            </label>
            <input type="password" className={inputCls} value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={editUser ? 'Sin cambios' : 'Mínimo 6 caracteres'} />
          </div>

          {/* Módulos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-600">Módulos de acceso</label>
              <div className="flex gap-2">
                <button type="button" onClick={selectAll} className="text-xs text-blue-600 hover:underline">Todos</button>
                <button type="button" onClick={clearAll} className="text-xs text-slate-400 hover:underline">Ninguno</button>
              </div>
            </div>
            <div className="space-y-3">
              {Object.entries(
                allModulos.reduce((acc, m) => {
                  const g = m.group || 'General';
                  (acc[g] = acc[g] || []).push(m);
                  return acc;
                }, {})
              ).map(([group, items]) => (
                <div key={group}>
                  <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider mb-1.5">{group}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {items.map(m => (
                      <label key={m.key}
                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm cursor-pointer transition ${
                          modulos.includes(m.key)
                            ? 'bg-blue-50 border-blue-300 text-blue-700'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}>
                        <input type="checkbox" className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          checked={modulos.includes(m.key)}
                          onChange={() => toggleModulo(m.key)} />
                        <span className="text-xs">{m.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Configuración */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Configuración</p>
            <ToggleConfig label="📍 GPS obligatorio" desc="Se le pide activar GPS al iniciar ruta"
              valor={!!gpsOblig} onChange={v => setGpsOblig(v ? 1 : 0)} />
            <ToggleConfig label="🔔 Notificaciones de pedidos" desc="Recibe alertas cuando le asignan pedidos"
              valor={!!notifPed} onChange={v => setNotifPed(v ? 1 : 0)} />
            <ToggleConfig label="🔒 Sesión única" desc="Solo un dispositivo activo a la vez"
              valor={!!sesUnica} onChange={v => setSesUnica(v ? 1 : 0)} />
          </div>

          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">Cancelar</button>
            <button type="submit" disabled={loading}
              className="flex-1 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition">
              {loading ? 'Guardando...' : editUser ? 'Guardar cambios' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ═══ Página principal ═══ */
export default function Usuarios() {
  const [usuarios, setUsuarios] = useState([]);
  const [total, setTotal]   = useState(0);
  const [pages, setPages]   = useState(1);
  const [page, setPage]     = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [filterRol, setFilterRol] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser]   = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => { setSearch(searchInput); setPage(1); }, 350);
    return () => clearTimeout(timer.current);
  }, [searchInput]);

  const fetch = useCallback(async (q, r, p) => {
    setLoading(true);
    try {
      const res = await listarUsuarios({ q: q || undefined, rol: r || undefined, page: p, limit: 20 });
      setUsuarios(Array.isArray(res.data) ? res.data : []);
      setTotal(res.total ?? 0);
      setPages(res.pages ?? 1);
    } catch { setUsuarios([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(search, filterRol, page); }, [search, filterRol, page, fetch]);

  function openEdit(u) { setEditUser(u); setModalOpen(true); }
  function openCreate() { setEditUser(null); setModalOpen(true); }

  async function handleToggleConfig(id, campo, valor) {
    try {
      await api.put(`/usuarios/${id}/configuracion`, { [campo]: valor ? 1 : 0 });
      fetch(search, filterRol, page);
    } catch { alert('Error al actualizar configuración'); }
  }

  async function handleDeactivate(u) {
    if (!window.confirm(`¿Desactivar al usuario "${u.nombre}"?`)) return;
    try {
      await desactivarUsuario(u.id);
      fetch(search, filterRol, page);
    } catch (err) { alert(err.response?.data?.error || 'Error'); }
  }

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Usuarios</h1>
          <p className="text-sm text-slate-500 mt-0.5">{loading ? '...' : `${total} usuario${total !== 1 ? 's' : ''}`}</p>
        </div>
        <button onClick={openCreate}
          className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition shadow-sm self-start sm:self-auto">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" /></svg>
          Nuevo usuario
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
          <input className="pl-10 pr-4 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition w-full sm:w-64"
            value={searchInput} onChange={e => setSearchInput(e.target.value)} placeholder="Buscar por nombre o email..." />
        </div>
        <select value={filterRol} onChange={e => { setFilterRol(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition">
          <option value="">Todos los roles</option>
          {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                {['Nombre', 'Email', 'Rol', 'Config', 'Módulos', 'Estado', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-slate-100 animate-pulse rounded" style={{ width: j === 0 ? '140px' : '80px' }} /></td>
                  ))}</tr>
                ))
              ) : usuarios.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-slate-400">No hay usuarios</td></tr>
              ) : usuarios.map(u => (
                <tr key={u.id} className={`transition-colors ${!u.activo ? 'opacity-50' : 'hover:bg-slate-50'}`}>
                  <td className="px-4 py-3 font-medium text-slate-800">{u.nombre}</td>
                  <td className="px-4 py-3 text-slate-500">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROL_BADGE[u.rol] || 'bg-slate-100 text-slate-600'}`}>
                      {u.rol}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => handleToggleConfig(u.id, 'gps_obligatorio', !u.gps_obligatorio)}
                        title="GPS obligatorio" className={`px-2 py-0.5 rounded-full text-xs font-semibold border-none cursor-pointer transition ${u.gps_obligatorio ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                        📍 GPS
                      </button>
                      <button onClick={() => handleToggleConfig(u.id, 'notif_pedidos', !u.notif_pedidos)}
                        title="Notificaciones de pedidos" className={`px-2 py-0.5 rounded-full text-xs font-semibold border-none cursor-pointer transition ${u.notif_pedidos ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                        🔔 Notif
                      </button>
                      <button onClick={() => handleToggleConfig(u.id, 'sesion_unica', !u.sesion_unica)}
                        title="Sesión única" className={`px-2 py-0.5 rounded-full text-xs font-semibold border-none cursor-pointer transition ${u.sesion_unica ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                        {u.sesion_unica ? '🔒 1 sesión' : '🔓 Multi'}
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1 max-w-xs">
                      {(u.modulos || []).slice(0, 5).map(m => (
                        <span key={m} className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-xs">{m}</span>
                      ))}
                      {(u.modulos || []).length > 5 && (
                        <span className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-xs">+{u.modulos.length - 5}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.activo ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'
                    }`}>
                      {u.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(u)}
                        className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-lg transition font-medium">
                        Editar
                      </button>
                      {u.activo && (
                        <button onClick={() => handleDeactivate(u)}
                          className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 border border-red-200 rounded-lg transition font-medium">
                          Desactivar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
            <p className="text-xs text-slate-500">Página {page} de {pages}</p>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">Anterior</button>
              <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">Siguiente</button>
            </div>
          </div>
        )}
      </div>

      <UsuarioModal isOpen={modalOpen} onClose={() => { setModalOpen(false); setEditUser(null); }}
        onSaved={() => fetch(search, filterRol, page)} editUser={editUser} />
    </Layout>
  );
}
