import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { clientesPrestamos } from '../../services/devolucionesService';
import { miRuta } from '../../services/rutasService';
import { devolverDesdeReparto, bidonPerdidoRuta } from '../../services/devolucionesService';
import { listarPresentaciones } from '../../services/presentacionesService';

const inputCls = `w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
  placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition`;

export default function DevolucionReparto() {
  const navigate = useNavigate();

  const [clientes, setClientes]             = useState([]);
  const [presentaciones, setPresentaciones] = useState([]);
  const [busqueda, setBusqueda]             = useState('');
  const [clienteSel, setClienteSel]         = useState(null);
  const [presentacionId, setPresentacionId] = useState('');
  const [cantidad, setCantidad]             = useState('');
  const [notas, setNotas]                   = useState('');
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState('');
  const [modoPerdido, setModoPerdido]       = useState(false);
  const [montoPerdido, setMontoPerdido]     = useState('');
  const [metodoPerdido, setMetodoPerdido]   = useState('efectivo');
  const [exito, setExito]                   = useState('');
  const [buscando, setBuscando]             = useState(false);
  const [rutaActiva, setRutaActiva]         = useState(null);

  // Cargar ruta activa
  useEffect(() => {
    miRuta().then(r => setRutaActiva(r.data || null)).catch(() => {});
  }, []);

  // Cargar presentaciones retornables
  useEffect(() => {
    listarPresentaciones({ es_retornable: 1, limit: 50 })
      .then(r => setPresentaciones(r.data || []))
      .catch(() => {});
  }, []);

  // Buscar clientes con bidones prestados
  const buscarClientes = useCallback(async (q) => {
    setBuscando(true);
    try {
      const res = await clientesPrestamos({ q, limit: 10 });
      setClientes(res.data || []);
    } catch { setClientes([]); }
    finally { setBuscando(false); }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => buscarClientes(busqueda), 350);
    return () => clearTimeout(t);
  }, [busqueda, buscarClientes]);

  const maxQty = clienteSel ? Number(clienteSel.bidones_prestados) : 0;

  async function handleSubmit(e) {
    e.preventDefault();
    setError(''); setExito('');

    if (!clienteSel)    return setError('Selecciona un cliente');
    if (!presentacionId) return setError('Selecciona una presentacion');
    const qty = Number(cantidad);
    if (!qty || qty <= 0) return setError('La cantidad debe ser mayor a 0');
    if (qty > maxQty) return setError(`Maximo ${maxQty} bidones`);

    if (modoPerdido && (!montoPerdido || Number(montoPerdido) <= 0)) return setError('El monto a cobrar es requerido');

    setLoading(true);
    try {
      if (modoPerdido) {
        await bidonPerdidoRuta({
          cliente_id: clienteSel.id,
          presentacion_id: Number(presentacionId),
          cantidad: qty,
          monto: Number(montoPerdido),
          metodo_pago: metodoPerdido,
          ruta_id: rutaActiva?.id,
          notas: notas.trim() || undefined,
        });
        setExito(`Bidon perdido cobrado: ${qty} bidon(es) de ${clienteSel.nombre} - S/${Number(montoPerdido).toFixed(2)}`);
      } else {
        await devolverDesdeReparto({
          cliente_id: clienteSel.id,
          presentacion_id: Number(presentacionId),
          cantidad: qty,
          notas: notas.trim() || undefined,
        });
        setExito(`Devolucion registrada: ${qty} bidon(es) de ${clienteSel.nombre}`);
      }
      // Reset form
      setClienteSel(null);
      setBusqueda('');
      setPresentacionId('');
      setCantidad('');
      setNotas('');
      setModoPerdido(false);
      setMontoPerdido('');
      buscarClientes('');
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrar devolucion');
    } finally { setLoading(false); }
  }

  return (
    <Layout>
      <div className="max-w-lg mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)}
            className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 transition">
            <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-slate-800">Devolucion de vacios</h1>
        </div>

        {/* Alertas */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>
        )}
        {exito && (
          <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-sm text-green-700">{exito}</div>
        )}

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4">

          {/* Buscar cliente */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Cliente</label>
            {clienteSel ? (
              <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-blue-800">{clienteSel.nombre}</p>
                  <p className="text-xs text-blue-600">{clienteSel.bidones_prestados} bidones prestados</p>
                </div>
                <button type="button" onClick={() => { setClienteSel(null); setBusqueda(''); setCantidad(''); }}
                  className="text-blue-400 hover:text-blue-600 transition">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  className={inputCls}
                  placeholder="Buscar cliente con bidones prestados..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  autoFocus
                />
                {buscando && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                {/* Dropdown de resultados */}
                {!clienteSel && clientes.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {clientes.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setClienteSel(c); setBusqueda(c.nombre); }}
                        className="w-full text-left px-4 py-2.5 hover:bg-blue-50 transition flex items-center justify-between"
                      >
                        <span className="text-sm text-slate-800 truncate">{c.nombre}</span>
                        <span className="text-xs text-amber-600 font-medium shrink-0 ml-2">
                          {c.bidones_prestados} prestados
                        </span>
                      </button>
                    ))}
                  </div>
                )}
                {!clienteSel && busqueda && !buscando && clientes.length === 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3">
                    <p className="text-sm text-slate-400">Sin resultados</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Presentacion */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Presentacion</label>
            <select className={inputCls} value={presentacionId}
              onChange={(e) => setPresentacionId(e.target.value)}>
              <option value="">Seleccionar...</option>
              {presentaciones.map(p => (
                <option key={p.id} value={p.id}>{p.nombre}</option>
              ))}
            </select>
          </div>

          {/* Cantidad */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Cantidad {maxQty > 0 && <span className="text-slate-400 font-normal">(max {maxQty})</span>}
            </label>
            <input
              type="number"
              className={inputCls}
              min="1"
              max={maxQty || undefined}
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value)}
              placeholder="0"
            />
          </div>

          {/* Notas */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Notas <span className="text-slate-400 font-normal">(opcional)</span></label>
            <textarea
              className={inputCls}
              rows={2}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Observaciones..."
            />
          </div>

          {/* Modo: devolucion o bidon perdido */}
          {clienteSel && (
            <div className="flex gap-2">
              <button type="button" onClick={() => setModoPerdido(false)}
                className={`flex-1 py-2 text-sm font-semibold rounded-xl border transition ${!modoPerdido ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600'}`}>
                Devolver vacio
              </button>
              <button type="button" onClick={() => setModoPerdido(true)}
                className={`flex-1 py-2 text-sm font-semibold rounded-xl border transition ${modoPerdido ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-200 text-slate-600'}`}>
                Bidon perdido
              </button>
            </div>
          )}

          {modoPerdido && clienteSel && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Monto a cobrar (S/)</label>
                <input type="number" min="0.01" step="0.01" className={inputCls} value={montoPerdido}
                  onChange={e => setMontoPerdido(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Metodo de pago</label>
                <select className={inputCls} value={metodoPerdido} onChange={e => setMetodoPerdido(e.target.value)}>
                  <option value="efectivo">Efectivo</option>
                  <option value="transferencia">Transferencia</option>
                  <option value="yape">Yape</option>
                </select>
              </div>
            </>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || !clienteSel || !presentacionId || !cantidad || (modoPerdido && !montoPerdido)}
            className={`w-full py-3 text-sm font-semibold text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition flex items-center justify-center gap-2 ${modoPerdido ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Registrando...
              </>
            ) : (
              modoPerdido ? 'Cobrar bidon perdido' : 'Registrar devolucion'
            )}
          </button>
        </form>
      </div>
    </Layout>
  );
}
