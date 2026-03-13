import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import {
  listarProveedores, crearProveedor, actualizarProveedor,
  desactivarProveedor, obtenerPrecios,
} from '../../services/proveedoresService';
import { consultarRuc } from '../../services/configService';
import { historialPagosProveedor } from '../../services/comprasService';
import { exportarProveedores } from '../../services/reportesService';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

function fmt(n) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);
}

/* ── Modal Ver Precios ── */
function PreciosModal({ proveedor, onClose }) {
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    obtenerPrecios(proveedor.id)
      .then(res => setData(Array.isArray(res.data) ? res.data : []))
      .catch(() => setData([]))
      .finally(() => setLoading(false));
  }, [proveedor.id]);

  const TIPO_BADGE = {
    insumo:       'bg-blue-50 text-blue-600',
    presentacion: 'bg-purple-50 text-purple-600',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">{proveedor.nombre}</h2>
            <p className="text-xs text-slate-400 mt-0.5">Historial de precios registrados</p>
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400 text-sm">Cargando…</div>
          ) : data.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
              <svg className="w-10 h-10 opacity-30" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6M7 4H4a1 1 0 00-1 1v14a1 1 0 001 1h16a1 1 0 001-1V5a1 1 0 00-1-1h-3M9 4h6V2H9v2z" />
              </svg>
              <p className="text-sm">Sin precios registrados aún</p>
              <p className="text-xs">Los precios se actualizan al registrar compras</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-left">Producto</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-right">Último precio</th>
                  <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-left">Última compra</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map(pp => (
                  <tr key={pp.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{pp.producto_nombre}</div>
                      <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-xs font-medium ${TIPO_BADGE[pp.tipo]}`}>
                        {pp.tipo === 'insumo' ? 'Insumo' : 'Envase'} · {pp.unidad}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-800 tabular-nums">
                      {fmt(pp.precio)}
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {pp.fecha_ultima_compra}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Modal crear / editar ── */
function ProveedorModal({ isOpen, proveedor, onClose, onSaved }) {
  const editing = !!proveedor;
  const [form, setForm] = useState({
    nombre: '', ruc: '', telefono: '', email: '',
    direccion: '', contacto: '', notas: '', ubigeo: '',
  });
  const [loading, setLoading]       = useState(false);
  const [error,   setError]         = useState('');
  const [rucLoading, setRucLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setForm(editing
        ? { nombre: proveedor.nombre ?? '', ruc: proveedor.ruc ?? '', telefono: proveedor.telefono ?? '',
            email: proveedor.email ?? '', direccion: proveedor.direccion ?? '',
            contacto: proveedor.contacto ?? '', notas: proveedor.notas ?? '',
            ubigeo: proveedor.ubigeo ?? '' }
        : { nombre: '', ruc: '', telefono: '', email: '', direccion: '', contacto: '', notas: '', ubigeo: '' }
      );
      setError('');
    }
  }, [isOpen, proveedor, editing]);

  if (!isOpen) return null;

  function set(field, val) { setForm(f => ({ ...f, [field]: val })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nombre.trim()) return setError('El nombre es requerido');
    setLoading(true); setError('');
    try {
      const result = editing
        ? await actualizarProveedor(proveedor.id, form)
        : await crearProveedor(form);
      onSaved(result, editing);
      onClose();
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar proveedor');
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-lg font-semibold text-slate-800">
            {editing ? 'Editar proveedor' : 'Nuevo proveedor'}
          </h2>
          <button type="button" onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Nombre *</label>
              <input className={inputCls} value={form.nombre} onChange={e => set('nombre', e.target.value)}
                placeholder="Razón social o nombre comercial" autoFocus />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">RUC</label>
              <div className="flex gap-1.5">
                <input className={`${inputCls} flex-1`} value={form.ruc} onChange={e => set('ruc', e.target.value.replace(/\D/g, '').slice(0, 11))}
                  placeholder="20123456789" maxLength={11} />
                {/^\d{11}$/.test(form.ruc) && (
                  <button type="button" disabled={rucLoading}
                    onClick={async () => {
                      setRucLoading(true);
                      try {
                        const r = await consultarRuc(form.ruc);
                        setForm(f => ({
                          ...f,
                          nombre: r.data.nombre_o_razon_social,
                          direccion: r.data.direccion || '',
                          ubigeo: String(r.data.ubigeo || '').split(',').pop().trim(),
                        }));
                      } catch { /* silent */ }
                      setRucLoading(false);
                    }}
                    className="px-2.5 py-1.5 text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 transition whitespace-nowrap">
                    {rucLoading ? '...' : 'Completar'}
                  </button>
                )}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Teléfono</label>
              <input className={inputCls} value={form.telefono} onChange={e => set('telefono', e.target.value)}
                placeholder="999 888 777" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Email</label>
              <input type="email" className={inputCls} value={form.email} onChange={e => set('email', e.target.value)}
                placeholder="ventas@proveedor.com" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Contacto</label>
              <input className={inputCls} value={form.contacto} onChange={e => set('contacto', e.target.value)}
                placeholder="Nombre del vendedor" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Dirección</label>
              <input className={inputCls} value={form.direccion} onChange={e => set('direccion', e.target.value)}
                placeholder="Av. …" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Ubigeo</label>
              <input className={`${inputCls} bg-slate-50`} value={form.ubigeo} readOnly
                placeholder="—" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 mb-1">Notas</label>
              <textarea rows={2} className={inputCls} value={form.notas} onChange={e => set('notas', e.target.value)}
                placeholder="Condiciones de pago, horarios, etc." />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm text-slate-600 border border-slate-300 rounded-lg hover:bg-slate-50 transition">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="px-6 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 rounded-lg transition">
              {loading ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear proveedor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Popover historial pagos ── */
function PagosPopover({ proveedorId, onClose }) {
  const [pagos, setPagos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    historialPagosProveedor(proveedorId)
      .then(r => setPagos(r.data || []))
      .catch(() => setPagos([]))
      .finally(() => setLoading(false));
  }, [proveedorId]);

  return (
    <>
      <div className="fixed inset-0 z-10" onClick={onClose} />
      <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-xl border border-slate-200 shadow-lg p-3 min-w-[260px] max-h-64 overflow-y-auto">
        <p className="text-xs font-semibold text-slate-500 mb-2">Últimos pagos</p>
        {loading ? (
          <p className="text-xs text-slate-400 py-2">Cargando...</p>
        ) : pagos.length === 0 ? (
          <p className="text-xs text-slate-400 py-2">Sin pagos registrados</p>
        ) : (
          <div className="space-y-1.5">
            {pagos.slice(0, 10).map(p => (
              <div key={p.id} className="flex items-center justify-between text-xs gap-3">
                <div>
                  <span className="text-slate-600">
                    {new Date(p.fecha_hora).toLocaleDateString('es-PE', { day: '2-digit', month: 'short' })}
                  </span>
                  {p.estado === 'anulado' && <span className="ml-1 text-red-400 line-through">anulado</span>}
                </div>
                <span className={`font-semibold tabular-nums ${p.estado === 'anulado' ? 'text-slate-300 line-through' : 'text-green-600'}`}>
                  {fmt(p.monto)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

/* ── Página principal ── */
export default function Proveedores() {
  const navigate = useNavigate();
  const [proveedores, setProveedores] = useState([]);
  const [total,       setTotal]       = useState(0);
  const [pages,       setPages]       = useState(1);
  const [page,        setPage]        = useState(1);
  const [q,           setQ]           = useState('');
  const [loading,     setLoading]     = useState(true);
  const [modalOpen,   setModalOpen]   = useState(false);
  const [editing,     setEditing]     = useState(null);
  const [preciosOf,   setPreciosOf]   = useState(null); // proveedor for PreciosModal
  const [pagosOpenId, setPagosOpenId] = useState(null);

  const fetchProveedores = useCallback(async (query, p) => {
    setLoading(true);
    try {
      const res = await listarProveedores({ q: query || undefined, page: p, limit: 30 });
      setProveedores(Array.isArray(res.data) ? res.data : []);
      setTotal(res.total ?? 0);
      setPages(res.pages ?? 1);
    } catch { setProveedores([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchProveedores(q, page); }, [q, page, fetchProveedores]);

  function openNew()      { setEditing(null); setModalOpen(true); }
  function openEdit(prov) { setEditing(prov); setModalOpen(true); }

  function onSaved(result, wasEditing) {
    if (wasEditing) {
      setProveedores(prev => prev.map(p => p.id === result.id ? { ...p, ...result } : p));
    } else {
      fetchProveedores(q, 1); setPage(1);
    }
  }

  async function handleDeactivate(prov) {
    if (!confirm(`¿Desactivar a "${prov.nombre}"?`)) return;
    try {
      await desactivarProveedor(prov.id);
      setProveedores(prev => prev.filter(p => p.id !== prov.id));
      setTotal(t => t - 1);
    } catch {}
  }

  return (
    <Layout>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Proveedores</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '…' : `${total} proveedor${total !== 1 ? 'es' : ''}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => exportarProveedores({ q: q || undefined }).catch(() => {})}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" />
            </svg>
            <span className="hidden sm:inline">Exportar</span>
          </button>
          <button onClick={() => navigate('/proveedores/comparar')}
            className="flex items-center gap-2 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-lg transition">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span className="hidden sm:inline">Comparar precios</span>
            <span className="sm:hidden">Comparar</span>
          </button>
          <button onClick={openNew}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition shadow-sm">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nuevo
          </button>
        </div>
      </div>

      {/* Buscador */}
      <div className="mb-4">
        <div className="relative max-w-xs">
          <svg className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2"
            fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            className="pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg w-full focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
            placeholder="Buscar por nombre, RUC o contacto…"
            value={q}
            onChange={e => { setQ(e.target.value); setPage(1); }}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                {['Nombre', 'RUC', 'Contacto', 'Teléfono', 'Deuda', 'Estado', 'Acciones'].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 bg-slate-100 animate-pulse rounded"
                        style={{ width: j === 0 ? '140px' : '80px' }} />
                    </td>
                  ))}</tr>
                ))
              ) : proveedores.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                    {q ? 'Sin resultados para la búsqueda' : 'No hay proveedores registrados'}
                  </td>
                </tr>
              ) : proveedores.map(prov => (
                <tr key={prov.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{prov.nombre}</div>
                    {prov.email && <div className="text-xs text-slate-400">{prov.email}</div>}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {prov.ruc ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {prov.contacto ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {prov.telefono ?? <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-right whitespace-nowrap">
                    <div className="relative inline-block">
                      {Number(prov.saldo_deuda) > 0 ? (
                        <button onClick={() => setPagosOpenId(pagosOpenId === prov.id ? null : prov.id)}
                          className="font-semibold text-red-600 hover:underline cursor-pointer">
                          {fmt(prov.saldo_deuda)}
                        </button>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                      {pagosOpenId === prov.id && (
                        <PagosPopover proveedorId={prov.id} onClose={() => setPagosOpenId(null)} />
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      prov.activo
                        ? 'bg-green-100 text-green-700'
                        : 'bg-slate-100 text-slate-400'
                    }`}>
                      {prov.activo ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setPreciosOf(prov)}
                        className="px-2.5 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-50 rounded-lg transition">
                        Ver precios
                      </button>
                      <button onClick={() => openEdit(prov)}
                        className="px-2.5 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition">
                        Editar
                      </button>
                      <button onClick={() => handleDeactivate(prov)}
                        className="px-2.5 py-1 text-xs font-medium text-red-500 hover:bg-red-50 rounded-lg transition">
                        Desactivar
                      </button>
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
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">
                ← Anterior
              </button>
              <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-slate-50 transition">
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>

      <ProveedorModal
        isOpen={modalOpen}
        proveedor={editing}
        onClose={() => setModalOpen(false)}
        onSaved={onSaved}
      />

      {preciosOf && (
        <PreciosModal proveedor={preciosOf} onClose={() => setPreciosOf(null)} />
      )}
    </Layout>
  );
}
