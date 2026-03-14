import { useCallback, useEffect, useState } from 'react';
import { obtenerRentabilidad } from '../../services/reportesService';

function fS(n) { return 'S/ ' + Number(n || 0).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function hace30() { const d = new Date(); d.setDate(d.getDate()-30); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }

const ESTADO_CLS = {
  activo:     'bg-green-100 text-green-700',
  regular:    'bg-blue-100 text-blue-700',
  en_riesgo:  'bg-amber-100 text-amber-700',
  perdido:    'bg-red-100 text-red-700',
  sin_compras:'bg-slate-100 text-slate-500',
};
const ESTADO_LABEL = {
  activo: 'Activo', regular: 'Regular', en_riesgo: 'En riesgo', perdido: 'Perdido', sin_compras: 'Sin compras',
};

export default function RentabilidadClientes() {
  const [fi, setFi] = useState(hace30());
  const [ff, setFf] = useState(today());
  const [orden, setOrden] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [data, setData] = useState([]);
  const [totales, setTotales] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await obtenerRentabilidad({ fecha_inicio: fi, fecha_fin: ff, orden });
      setData(res.data || []);
      setTotales(res.totales || null);
    } catch { setData([]); setTotales(null); }
    setLoading(false);
  }, [fi, ff, orden]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = filtroEstado ? data.filter(d => d.estado === filtroEstado) : data;

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={fi} onChange={e => setFi(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
        <span className="text-slate-400">-</span>
        <input type="date" value={ff} onChange={e => setFf(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm" />
        <select value={orden} onChange={e => setOrden(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm">
          <option value="">Mayor facturado</option>
          <option value="deuda">Mayor deuda</option>
          <option value="frecuencia">Mas frecuente</option>
          <option value="inactivos">Mas inactivos</option>
        </select>
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm">
          <option value="">Todos</option>
          <option value="activo">Activos</option>
          <option value="regular">Regulares</option>
          <option value="en_riesgo">En riesgo</option>
          <option value="perdido">Perdidos</option>
          <option value="sin_compras">Sin compras</option>
        </select>
      </div>

      {/* Totales */}
      {totales && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MiniCard label="Clientes" value={totales.total_clientes} color="slate" />
          <MiniCard label="Con compras" value={totales.con_compras} color="blue" />
          <MiniCard label="Facturado" value={fS(totales.facturado_total)} color="emerald" />
          <MiniCard label="Cobrado" value={fS(totales.cobrado_total)} color="green" />
          <MiniCard label="Deuda total" value={fS(totales.deuda_total)} color="red" />
          <MiniCard label="Bidones prest." value={totales.bidones_prestados_total} color="amber" />
        </div>
      )}

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b border-slate-200">
            <tr>
              {['Cliente', 'Tipo', 'Estado', 'Ventas', 'Facturado', 'Cobrado', 'Deuda', 'Bidones', 'Dias s/comprar', 'Ultima compra'].map(h => (
                <th key={h} className="px-3 py-2.5 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap text-left">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>{Array.from({ length: 10 }).map((_, j) => <td key={j} className="px-3 py-2.5"><div className="h-4 bg-slate-100 animate-pulse rounded w-16" /></td>)}</tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-8 text-center text-slate-400">Sin datos</td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} className="hover:bg-slate-50 transition">
                <td className="px-3 py-2.5">
                  <div className="font-medium text-slate-800 truncate max-w-[200px]">{c.nombre}</div>
                  {c.dni && <div className="text-xs text-slate-400">{c.dni}</div>}
                </td>
                <td className="px-3 py-2.5">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    c.tipo === 'mayoreo' ? 'bg-blue-100 text-blue-700' : c.tipo === 'especial' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-600'
                  }`}>{c.tipo}</span>
                </td>
                <td className="px-3 py-2.5">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_CLS[c.estado]}`}>{ESTADO_LABEL[c.estado]}</span>
                </td>
                <td className="px-3 py-2.5 text-center font-medium text-slate-700">{c.total_ventas}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-emerald-700 tabular-nums whitespace-nowrap">{fS(c.facturado)}</td>
                <td className="px-3 py-2.5 text-right font-medium text-green-600 tabular-nums whitespace-nowrap">{fS(c.cobrado)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">
                  <span className={c.deuda_actual > 0 ? 'font-semibold text-red-600' : 'text-slate-400'}>{fS(c.deuda_actual)}</span>
                </td>
                <td className="px-3 py-2.5 text-center">
                  {Number(c.bidones_prestados) > 0 ? (
                    <span className="font-bold text-amber-700">{c.bidones_prestados}</span>
                  ) : <span className="text-slate-300">0</span>}
                </td>
                <td className="px-3 py-2.5 text-center">
                  {c.dias_sin_comprar != null ? (
                    <span className={c.dias_sin_comprar > 30 ? 'font-semibold text-red-600' : c.dias_sin_comprar > 7 ? 'text-amber-600' : 'text-green-600'}>
                      {c.dias_sin_comprar}d
                    </span>
                  ) : <span className="text-slate-300">-</span>}
                </td>
                <td className="px-3 py-2.5 text-xs text-slate-500 whitespace-nowrap">
                  {c.ultima_venta ? new Date(c.ultima_venta).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400 text-right">{filtered.length} clientes</p>
    </div>
  );
}

function MiniCard({ label, value, color }) {
  const colors = {
    slate: 'bg-slate-50 text-slate-700 border-slate-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    green: 'bg-green-50 text-green-700 border-green-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
  };
  return (
    <div className={`rounded-xl border p-3 ${colors[color]}`}>
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs opacity-70">{label}</p>
    </div>
  );
}
