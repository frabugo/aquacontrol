import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '../../components/Layout';
import { compararPrecios } from '../../services/proveedoresService';
import { listarInsumos } from '../../services/insumosService';
import { listarPresentaciones } from '../../services/presentacionesService';

function fmt(n) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(Number(n) || 0);
}

const RANK_STYLES = [
  'bg-amber-400 text-white',   // 1st
  'bg-slate-300 text-slate-700', // 2nd
  'bg-orange-300 text-white',  // 3rd
];

export default function ComparadorPrecios() {
  const navigate = useNavigate();

  const [tipo,      setTipo]      = useState('insumo');       // 'insumo' | 'presentacion'
  const [insumos,   setInsumos]   = useState([]);
  const [presItems, setPresItems] = useState([]);
  const [itemId,    setItemId]    = useState('');
  const [resultado, setResultado] = useState(null);  // { producto, data[] }
  const [loading,   setLoading]   = useState(false);
  const [loadingCat,setLoadingCat]= useState(true);

  // Load catalogs
  useEffect(() => {
    setLoadingCat(true);
    Promise.all([
      listarInsumos({ activo: 1, limit: 200 }).catch(() => ({ data: [] })),
      listarPresentaciones({ activo: 1, limit: 100 }).catch(() => ({ data: [] })),
    ]).then(([ins, pres]) => {
      setInsumos(Array.isArray(ins.data) ? ins.data : []);
      setPresItems(Array.isArray(pres.data) ? pres.data : []);
    }).finally(() => setLoadingCat(false));
  }, []);

  // Reset selection when tipo changes
  useEffect(() => { setItemId(''); setResultado(null); }, [tipo]);

  // Auto-search when item selected
  useEffect(() => {
    if (!itemId) { setResultado(null); return; }
    setLoading(true);
    const params = tipo === 'insumo' ? { insumo_id: itemId } : { presentacion_id: itemId };
    compararPrecios(params)
      .then(res => setResultado(res))
      .catch(() => setResultado({ producto: null, data: [] }))
      .finally(() => setLoading(false));
  }, [itemId, tipo]);

  const catalog = tipo === 'insumo' ? insumos : presItems;

  return (
    <Layout>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => navigate('/proveedores')}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Comparador de precios</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Compara proveedores por producto — más barato primero
          </p>
        </div>
      </div>

      {/* Selector */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-6">
        <div className="flex flex-wrap gap-3 items-end">

          {/* Tipo toggle */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1.5">Tipo de producto</label>
            <div className="flex rounded-lg border border-slate-300 overflow-hidden text-sm">
              {[['insumo', 'Insumo'], ['presentacion', 'Presentación / Envase']].map(([val, label]) => (
                <button key={val} onClick={() => setTipo(val)}
                  className={`px-4 py-2 font-medium transition ${
                    tipo === val
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Item selector */}
          <div className="flex-1 min-w-[220px]">
            <label className="block text-xs font-medium text-slate-500 mb-1.5">
              {tipo === 'insumo' ? 'Insumo' : 'Presentación'}
            </label>
            {loadingCat ? (
              <div className="h-10 bg-slate-100 animate-pulse rounded-lg" />
            ) : (
              <select
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 text-slate-800
                  focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                value={itemId}
                onChange={e => setItemId(e.target.value)}
              >
                <option value="">— Seleccionar {tipo === 'insumo' ? 'insumo' : 'presentación'} —</option>
                {catalog.map(it => (
                  <option key={it.id} value={it.id}>{it.nombre}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Resultados */}
      {!itemId && (
        <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
          <svg className="w-14 h-14 opacity-20" fill="none" stroke="currentColor" strokeWidth="1.2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <p className="text-base font-medium">Selecciona un producto para comparar</p>
          <p className="text-sm">Verás todos los proveedores que lo suministran ordenados por precio</p>
        </div>
      )}

      {itemId && loading && (
        <div className="flex items-center justify-center py-16 text-slate-400 text-sm gap-2">
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          Buscando proveedores…
        </div>
      )}

      {itemId && !loading && resultado && (
        <>
          {/* Producto info */}
          {resultado.producto && (
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round"
                    d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div>
                <div className="font-semibold text-slate-800">{resultado.producto.nombre}</div>
                <div className="text-xs text-slate-400">
                  {resultado.data.length} proveedor{resultado.data.length !== 1 ? 'es' : ''} con precio registrado
                </div>
              </div>
            </div>
          )}

          {resultado.data.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-10 text-center">
              <p className="text-slate-500 text-sm">Ningún proveedor tiene precio registrado para este producto.</p>
              <p className="text-xs text-slate-400 mt-1">Los precios se registran al crear compras con proveedor asignado.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase w-12 text-center">#</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-left">Proveedor</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-left">Contacto</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-left">Teléfono</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-right">Último precio</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-left">Última compra</th>
                    <th className="px-4 py-3 text-xs font-semibold text-slate-500 uppercase text-right">vs. más barato</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {resultado.data.map((row, idx) => {
                    const cheapest = Number(resultado.data[0].ultimo_precio);
                    const diff     = Number(row.ultimo_precio) - cheapest;
                    const pct      = cheapest > 0 ? (diff / cheapest) * 100 : 0;
                    const isFirst  = idx === 0;

                    return (
                      <tr key={row.proveedor_id}
                        className={isFirst ? 'bg-amber-50/60' : 'hover:bg-slate-50 transition-colors'}>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold
                            ${RANK_STYLES[idx] ?? 'bg-slate-100 text-slate-500'}`}>
                            {row.ranking}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-800 flex items-center gap-1.5">
                            {row.proveedor}
                            {isFirst && (
                              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-xs font-semibold">
                                Más barato
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {row.contacto ?? <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {row.telefono ?? <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`font-semibold tabular-nums ${isFirst ? 'text-amber-700' : 'text-slate-800'}`}>
                            {fmt(row.ultimo_precio)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                          {row.fecha_ultima_compra}
                        </td>
                        <td className="px-4 py-3 text-right text-xs tabular-nums">
                          {isFirst ? (
                            <span className="text-slate-400">—</span>
                          ) : (
                            <span className="text-red-600 font-medium">
                              +{fmt(diff)} (+{pct.toFixed(1)}%)
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Footer summary */}
              {resultado.data.length > 1 && (
                <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 text-xs text-slate-500">
                  Ahorro máximo vs. más caro:{' '}
                  <span className="font-semibold text-emerald-600">
                    {fmt(
                      Number(resultado.data[resultado.data.length - 1].ultimo_precio) -
                      Number(resultado.data[0].ultimo_precio)
                    )}{' '}
                    por unidad
                  </span>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
