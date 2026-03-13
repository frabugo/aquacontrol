import { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import FormPresentacion from './FormPresentacion';
import StockRetornable from './StockRetornable';
import { listarPresentaciones, desactivarPresentacion } from '../../services/presentacionesService';

function formatSoles(n) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);
}

export default function Presentaciones() {
  const [presentaciones, setPresentaciones] = useState([]);
  const [total,          setTotal]          = useState(0);
  const [pages,          setPages]          = useState(1);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');

  const [searchInput, setSearchInput] = useState('');
  const [search,      setSearch]      = useState('');
  const [page,        setPage]        = useState(1);

  const [formOpen,    setFormOpen]    = useState(false);
  const [editItem,    setEditItem]    = useState(null);

  const [stockItem,   setStockItem]   = useState(null);  // presentacion seleccionada para ver stock
  const [confirmId,   setConfirmId]   = useState(null);
  const [deleting,    setDeleting]    = useState(false);

  /* ── Fetch ── */
  const fetchPresentaciones = useCallback(async (q, p) => {
    setLoading(true);
    setError('');
    try {
      const res = await listarPresentaciones({ q, page: p, limit: 50 });
      setPresentaciones(Array.isArray(res.data) ? res.data : []);
      setTotal(res.total  ?? 0);
      setPages(res.pages  ?? 1);
    } catch {
      setError('No se pudo cargar las presentaciones');
      setPresentaciones([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const id = setTimeout(() => { setSearch(searchInput); setPage(1); }, 350);
    return () => clearTimeout(id);
  }, [searchInput]);

  useEffect(() => {
    fetchPresentaciones(search, page);
  }, [search, page, fetchPresentaciones]);

  /* ── Acciones ── */
  function handleNueva() { setEditItem(null); setFormOpen(true); }
  function handleEditar(p) { setEditItem(p); setFormOpen(true); }

  function handleSaved(saved, isEdit) {
    if (isEdit) {
      setPresentaciones(prev => prev.map(p => p.id === saved.id ? saved : p));
    } else {
      fetchPresentaciones(search, 1);
      setPage(1);
    }
  }

  function handleStockUpdated(updated) {
    setPresentaciones(prev => prev.map(p => p.id === updated.id ? updated : p));
  }

  async function handleDesactivar() {
    if (!confirmId) return;
    setDeleting(true);
    try {
      await desactivarPresentacion(confirmId);
      setPresentaciones(prev => prev.filter(p => p.id !== confirmId));
      setTotal(t => t - 1);
      setConfirmId(null);
    } catch {
      setConfirmId(null);
    } finally {
      setDeleting(false);
    }
  }

  const canPrev = page > 1;
  const canNext = page < pages;

  return (
    <Layout>
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Presentaciones</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '...' : `${total} producto${total !== 1 ? 's' : ''}`}
          </p>
        </div>
        <button onClick={handleNueva}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition shadow-sm">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Nueva presentación
        </button>
      </div>

      {/* Filtro */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
            fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
            placeholder="Buscar por nombre…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition" />
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">{error}</div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                {['Nombre','Tipo','Unidad','Precio','Stock mín.','Retornable','Stock','Vacíos','Estado',''].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 10 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 animate-pulse rounded" style={{ width: j === 0 ? '120px' : '50px' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : presentaciones.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                    {search ? 'No hay resultados' : 'Sin presentaciones registradas'}
                  </td>
                </tr>
              ) : (
                presentaciones.map(p => (
                  <tr key={p.id} className={`transition-colors hover:bg-slate-50 ${!p.activo ? 'opacity-50' : ''}`}>
                    <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{p.nombre}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize
                        ${p.tipo === 'agua'  ? 'bg-sky-100 text-sky-700' :
                          p.tipo === 'hielo' ? 'bg-blue-100 text-blue-700' :
                          'bg-slate-100 text-slate-600'}`}>
                        {p.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs capitalize">{p.unidad}</td>
                    <td className="px-4 py-3 tabular-nums text-slate-700">{formatSoles(p.precio_base)}</td>
                    <td className="px-4 py-3 text-center tabular-nums text-slate-500">{p.stock_minimo}</td>
                    <td className="px-4 py-3">
                      {p.es_producto_final
                        ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-700">Producto final</span>
                        : p.es_retornable
                        ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Retornable</span>
                        : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500">No retornable</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`font-semibold tabular-nums ${Number(p.stock_llenos) > 0 ? 'text-blue-700' : 'text-slate-400'}`}>{p.stock_llenos}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.es_retornable
                        ? <span className={`tabular-nums ${Number(p.stock_vacios) > 0 ? 'text-slate-700' : 'text-slate-400'}`}>{p.stock_vacios}</span>
                        : <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      {p.activo
                        ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Activo</span>
                        : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-400">Inactivo</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {p.activo && (
                          <button onClick={() => setStockItem(p)} title="Ver detalle de stock"
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-sky-50 hover:text-sky-600 transition">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                            </svg>
                          </button>
                        )}
                        <button onClick={() => handleEditar(p)} title="Editar"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round"
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        {p.activo && (
                          <button onClick={() => setConfirmId(p.id)} title="Desactivar"
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round"
                                d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Paginación */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50">
            <p className="text-xs text-slate-500">Página {page} de {pages}</p>
            <div className="flex gap-2">
              <button disabled={!canPrev} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-white transition">← Anterior</button>
              <button disabled={!canNext} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-white transition">Siguiente →</button>
            </div>
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      <FormPresentacion
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        presentacion={editItem}
        onSaved={handleSaved}
      />

      {/* Panel detalle stock */}
      {stockItem && (
        <StockRetornable
          presentacion={stockItem}
          onClose={() => setStockItem(null)}
          onUpdated={handleStockUpdated}
        />
      )}

      {/* Confirm desactivar */}
      {confirmId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirmId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Desactivar presentación</h3>
                <p className="text-sm text-slate-500">Dejará de aparecer para nuevas ventas.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button type="button" onClick={() => setConfirmId(null)}
                className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition">Cancelar</button>
              <button type="button" onClick={handleDesactivar} disabled={deleting}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded-lg transition">
                {deleting ? 'Desactivando…' : 'Sí, desactivar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
