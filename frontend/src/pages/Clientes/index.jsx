import { useCallback, useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import ClienteModal from './ClienteModal';
import { listarClientes, desactivarCliente, cargaInicialCliente, descargarPlantillaDeudas, importarDeudas } from '../../services/clientesService';
import { exportarClientes } from '../../services/reportesService';

/* ── Helpers de presentación ── */
const TIPO_BADGE = {
  mayoreo:  'bg-blue-100 text-blue-700',
  menudeo:  'bg-slate-100 text-slate-600',
  especial: 'bg-purple-100 text-purple-700',
};

const DEUDA_BADGE = {
  al_dia:       { cls: 'bg-green-100 text-green-700',   label: 'Al día' },
  con_deuda:    { cls: 'bg-yellow-100 text-yellow-700', label: 'Con deuda' },
  sobre_limite: { cls: 'bg-red-100 text-red-700',       label: 'Sobre límite' },
};

function Badge({ map, val }) {
  const { cls, label } = map[val] ?? { cls: 'bg-slate-100 text-slate-500', label: val };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>{label}</span>;
}

function formatSoles(n) {
  return Number(n) === 0 ? '—'
    : new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(n);
}

function formatFecha(dt) {
  if (!dt) return '—';
  return new Date(dt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' });
}

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

/* ── Modal carga inicial de deuda/bidones ── */
function CargaInicialModal({ cliente, onClose, onSaved }) {
  const [saldoDinero, setSaldoDinero] = useState(Number(cliente.saldo_dinero) || '');
  const [bidones, setBidones]         = useState(Number(cliente.bidones_prestados) || '');
  const [notas, setNotas]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const updated = await cargaInicialCliente(cliente.id, {
        saldo_dinero: Number(saldoDinero) || 0,
        bidones_prestados: Number(bidones) || 0,
        notas: notas.trim() || null,
      });
      onSaved(updated);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al guardar');
    } finally { setLoading(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Carga inicial</h2>
            <p className="text-sm text-slate-500">{cliente.nombre}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 text-sm text-orange-800">
            Ingresa la deuda y bidones que el cliente ya tiene pendientes. Esto ajusta directamente el saldo sin crear ventas.
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Deuda dinero (S/)</label>
              <input type="number" min="0" step="0.000001" className={inputCls}
                value={saldoDinero} onChange={e => setSaldoDinero(e.target.value)} placeholder="0.00" />
              <p className="text-xs text-slate-400 mt-1">Actual: S/{Number(cliente.saldo_dinero).toFixed(2)}</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Bidones prestados</label>
              <input type="number" min="0" step="1" className={inputCls}
                value={bidones} onChange={e => setBidones(e.target.value)} placeholder="0" />
              <p className="text-xs text-slate-400 mt-1">Actual: {cliente.bidones_prestados}</p>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notas (opcional)</label>
            <input className={inputCls} value={notas} onChange={e => setNotas(e.target.value)}
              placeholder="Ej: Deuda del sistema anterior" />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">
              Cancelar
            </button>
            <button type="submit" disabled={loading}
              className="px-5 py-2 text-sm font-semibold text-white bg-orange-600 hover:bg-orange-700 disabled:bg-orange-400 rounded-lg transition">
              {loading ? 'Guardando...' : 'Guardar saldos'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Modal importar deudas desde Excel ── */
function ImportarDeudasModal({ onClose, onDone }) {
  const [file, setFile]           = useState(null);
  const [loading, setLoading]     = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error, setError]         = useState('');

  async function handleImportar() {
    if (!file) return;
    setError(''); setLoading(true);
    try {
      const res = await importarDeudas(file);
      setResultado(res);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al importar');
    } finally { setLoading(false); }
  }

  const ESTADO_CLS = {
    actualizado:    'text-green-700 bg-green-50',
    no_encontrado:  'text-red-700 bg-red-50',
    error:          'text-red-700 bg-red-50',
    sin_cambios:    'text-slate-500 bg-slate-50',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={!resultado ? onClose : undefined} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
          <h2 className="text-lg font-semibold text-slate-800">Importar deudas desde Excel</h2>
          <button onClick={() => { if (resultado) onDone(); onClose(); }} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">{error}</div>}

          {!resultado ? (
            <>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800 space-y-2">
                <p className="font-semibold">Instrucciones:</p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Descarga la plantilla (ya viene con tus clientes actuales)</li>
                  <li>Llena las columnas <b>DEUDA_DINERO</b> y <b>BIDONES_PRESTADOS</b></li>
                  <li>Sube el archivo completado aqui</li>
                </ol>
                <p className="text-xs text-blue-600 mt-2">Los clientes se buscan por DNI/RUC primero, luego por nombre exacto.</p>
              </div>

              <button onClick={() => descargarPlantillaDeudas().catch(() => {})}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-lg transition w-full justify-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" />
                </svg>
                Descargar plantilla Excel
              </button>

              <div className="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center">
                <input type="file" accept=".xlsx,.xls" onChange={e => setFile(e.target.files?.[0] || null)}
                  className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100" />
                {file && <p className="mt-2 text-sm text-slate-600">{file.name}</p>}
              </div>

              <div className="flex justify-end gap-3">
                <button type="button" onClick={onClose}
                  className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition text-slate-600">
                  Cancelar
                </button>
                <button onClick={handleImportar} disabled={!file || loading}
                  className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition">
                  {loading ? 'Importando...' : 'Importar'}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Resumen */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-green-700">{resultado.resumen.actualizados}</p>
                  <p className="text-xs text-green-600">Actualizados</p>
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-red-700">{resultado.resumen.errores}</p>
                  <p className="text-xs text-red-600">Errores</p>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-slate-600">{resultado.resumen.sin_cambios}</p>
                  <p className="text-xs text-slate-500">Sin cambios</p>
                </div>
              </div>

              {/* Detalle */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 text-left text-xs text-slate-500 uppercase">
                      <th className="px-3 py-2">Fila</th>
                      <th className="px-3 py-2">Cliente</th>
                      <th className="px-3 py-2">Estado</th>
                      <th className="px-3 py-2">Detalle</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {resultado.resultados.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-xs text-slate-400">{r.fila}</td>
                        <td className="px-3 py-2 font-medium text-slate-700 text-xs">{r.nombre}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_CLS[r.estado] || ''}`}>
                            {r.estado === 'actualizado' ? 'Actualizado' : r.estado === 'no_encontrado' ? 'No encontrado' : r.estado === 'sin_cambios' ? 'Sin cambios' : 'Error'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-500">{r.msg}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end">
                <button onClick={() => { onDone(); onClose(); }}
                  className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition">
                  Cerrar
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Componente principal ── */
export default function Clientes() {
  const [clientes,    setClientes]    = useState([]);
  const [total,       setTotal]       = useState(0);
  const [pages,       setPages]       = useState(1);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');

  // Filtros: searchInput es el valor del input, search es el valor debounceado
  const [searchInput, setSearchInput] = useState('');
  const [search,      setSearch]      = useState('');
  const [tipo,        setTipo]        = useState('');
  const [page,        setPage]        = useState(1);

  // Modal crear/editar
  const [modalOpen,   setModalOpen]   = useState(false);
  const [editCliente, setEditCliente] = useState(null);

  // Modal carga inicial
  const [cargaCliente, setCargaCliente] = useState(null);
  // Modal importar Excel
  const [importarOpen, setImportarOpen] = useState(false);

  // Confirm desactivar
  const [confirmId,   setConfirmId]   = useState(null);
  const [deleting,    setDeleting]    = useState(false);

  /* ── Fetch ── */
  const fetchClientes = useCallback(async (q, t, p) => {
    setLoading(true);
    setError('');
    try {
      const res = await listarClientes({ q, tipo: t, page: p, limit: 20 });
      setClientes(res.data);
      setTotal(res.total);
      setPages(res.pages);
    } catch {
      setError('No se pudo cargar la lista de clientes');
      setClientes([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /* ── Debounce en búsqueda ── */
  useEffect(() => {
    const id = setTimeout(() => {
      setSearch(searchInput);
      setPage(1);
    }, 350);
    return () => clearTimeout(id);
  }, [searchInput]);

  /* ── Efecto único de carga ── */
  useEffect(() => {
    fetchClientes(search, tipo, page);
  }, [search, tipo, page, fetchClientes]);

  /* ── Acciones ── */
  function handleNuevo() {
    setEditCliente(null);
    setModalOpen(true);
  }

  function handleEditar(cliente) {
    setEditCliente(cliente);
    setModalOpen(true);
  }

  function handleSaved(saved, isEdit) {
    if (isEdit) {
      setClientes(prev => prev.map(c => c.id === saved.id ? saved : c));
    } else {
      setPage(1);
      fetchClientes(search, tipo, 1);
    }
  }

  async function handleDesactivar() {
    if (!confirmId) return;
    setDeleting(true);
    try {
      await desactivarCliente(confirmId);
      setClientes(prev => prev.filter(c => c.id !== confirmId));
      setTotal(t => t - 1);
      setConfirmId(null);
    } catch {
      setConfirmId(null);
    } finally {
      setDeleting(false);
    }
  }

  /* ── Paginación ── */
  const canPrev = page > 1;
  const canNext = page < pages;

  return (
    <Layout>
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-800">Clientes</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {loading ? '...' : `${total} cliente${total !== 1 ? 's' : ''} activo${total !== 1 ? 's' : ''}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setImportarOpen(true)}
            className="flex items-center gap-2 px-3 py-2 bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium rounded-lg transition shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span className="hidden sm:inline">Importar deudas</span>
          </button>
          <button
            onClick={() => exportarClientes({ q: search || undefined, tipo: tipo || undefined }).catch(() => {})}
            className="flex items-center gap-2 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17v3a2 2 0 002 2h14a2 2 0 002-2v-3" />
            </svg>
            <span className="hidden sm:inline">Exportar</span>
          </button>
          <button
            onClick={handleNuevo}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-lg transition shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            Nuevo cliente
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
            fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="M21 21l-4.35-4.35" />
          </svg>
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Buscar por nombre o DNI…"
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-300 rounded-lg
              focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
          />
        </div>
        <select
          value={tipo}
          onChange={e => { setTipo(e.target.value); setPage(1); }}
          className="px-3 py-2 text-sm border border-slate-300 rounded-lg text-slate-700
            focus:outline-none focus:ring-2 focus:ring-blue-500 transition bg-white"
        >
          <option value="">Todos los tipos</option>
          <option value="menudeo">Menudeo</option>
          <option value="mayoreo">Mayoreo</option>
          <option value="especial">Especial</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-4">
          {error}
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-left">
                {['Nombre', 'DNI', 'Tipo', 'Teléfono', 'Bidones', 'Garantía', 'Deuda', 'Estado', 'Última compra', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3">
                        <div className="h-4 bg-slate-100 animate-pulse rounded" style={{ width: j === 0 ? '140px' : '60px' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : clientes.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-slate-400">
                    {searchInput || tipo ? 'No hay clientes con esos filtros' : 'Aún no hay clientes registrados'}
                  </td>
                </tr>
              ) : (
                clientes.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">{c.nombre}</td>
                    <td className="px-4 py-3 text-slate-500 tabular-nums">{c.dni || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${TIPO_BADGE[c.tipo] ?? ''}`}>
                        {c.tipo}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap">{c.telefono || '—'}</td>
                    <td className="px-4 py-3 text-center">
                      {c.bidones_prestados > 0
                        ? <span className="font-semibold text-orange-600">{c.bidones_prestados}</span>
                        : <span className="text-slate-400">0</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums whitespace-nowrap text-center">
                      {Number(c.saldo_garantia) > 0
                        ? <span className="font-semibold text-purple-600">{formatSoles(c.saldo_garantia)}</span>
                        : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3 tabular-nums whitespace-nowrap">
                      {Number(c.saldo_dinero) > 0
                        ? <span className="text-red-600 font-medium">{formatSoles(c.saldo_dinero)}</span>
                        : <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <Badge map={DEUDA_BADGE} val={c.estado_deuda} />
                    </td>
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap text-xs">{formatFecha(c.ultima_compra)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => setCargaCliente(c)}
                          title="Cargar deuda inicial"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-orange-50 hover:text-orange-600 transition"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round"
                              d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleEditar(c)}
                          title="Editar"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-blue-50 hover:text-blue-600 transition"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round"
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setConfirmId(c.id)}
                          title="Desactivar"
                          className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-500 transition"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round"
                              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                          </svg>
                        </button>
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
            <p className="text-xs text-slate-500">
              Página {page} de {pages} &mdash; {total} clientes
            </p>
            <div className="flex gap-2">
              <button
                disabled={!canPrev}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-white transition"
              >
                ← Anterior
              </button>
              <button
                disabled={!canNext}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg disabled:opacity-40 hover:bg-white transition"
              >
                Siguiente →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal crear/editar */}
      <ClienteModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        cliente={editCliente}
        onSaved={handleSaved}
      />

      {/* Modal importar deudas Excel */}
      {importarOpen && (
        <ImportarDeudasModal
          onClose={() => setImportarOpen(false)}
          onDone={() => fetchClientes(search, tipo, page)}
        />
      )}

      {/* Modal carga inicial */}
      {cargaCliente && (
        <CargaInicialModal
          cliente={cargaCliente}
          onClose={() => setCargaCliente(null)}
          onSaved={(updated) => {
            setClientes(prev => prev.map(c => c.id === updated.id ? updated : c));
            setCargaCliente(null);
          }}
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
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                </svg>
              </div>
              <div>
                <h3 className="font-semibold text-slate-800">Desactivar cliente</h3>
                <p className="text-sm text-slate-500">El cliente dejará de aparecer en el sistema.</p>
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-5">
              <button
                type="button"
                onClick={() => setConfirmId(null)}
                className="px-4 py-2 text-sm border border-slate-300 rounded-lg hover:bg-slate-50 transition"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleDesactivar}
                disabled={deleting}
                className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded-lg transition"
              >
                {deleting ? 'Desactivando…' : 'Sí, desactivar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
