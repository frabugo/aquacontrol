import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { buscarGlobal } from '../services/buscarService';

const TIPO_CONFIG = {
  cliente:      { label: 'Cliente',      color: 'bg-blue-100 text-blue-700',   ruta: '/clientes' },
  venta:        { label: 'Venta',        color: 'bg-green-100 text-green-700', ruta: '/ventas' },
  pedido:       { label: 'Pedido',       color: 'bg-amber-100 text-amber-700', ruta: '/pedidos' },
  proveedor:    { label: 'Proveedor',    color: 'bg-purple-100 text-purple-700', ruta: '/proveedores' },
  usuario:      { label: 'Usuario',      color: 'bg-slate-100 text-slate-700', ruta: '/usuarios' },
  presentacion: { label: 'Producto',     color: 'bg-cyan-100 text-cyan-700',   ruta: '/presentaciones' },
};

export default function BuscadorGlobal() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const timerRef = useRef(null);

  const doSearch = useCallback(async (q) => {
    if (q.length < 2) { setResults([]); setOpen(false); return; }
    setLoading(true);
    try {
      const res = await buscarGlobal({ q, limit: 5 });
      setResults(res.data || []);
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(timerRef.current);
    if (query.trim().length < 2) { setResults([]); setOpen(false); return; }
    timerRef.current = setTimeout(() => doSearch(query.trim()), 400);
    return () => clearTimeout(timerRef.current);
  }, [query, doSearch]);

  // Close on click outside
  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); setMobileOpen(false); inputRef.current?.blur(); }
  };

  const handleSelect = (item) => {
    const cfg = TIPO_CONFIG[item.tipo];
    if (cfg) navigate(cfg.ruta);
    setOpen(false);
    setQuery('');
    setMobileOpen(false);
  };

  // Group results by tipo
  const grouped = {};
  for (const item of results) {
    if (!grouped[item.tipo]) grouped[item.tipo] = [];
    grouped[item.tipo].push(item);
  }

  return (
    <div ref={containerRef} className="relative flex items-center">
      {/* Mobile toggle */}
      <button
        onClick={() => { setMobileOpen(!mobileOpen); setTimeout(() => inputRef.current?.focus(), 100); }}
        className="md:hidden w-9 h-9 rounded-lg flex items-center justify-center text-slate-500 hover:bg-slate-100 transition"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="m21 21-4.35-4.35" />
        </svg>
      </button>

      {/* Desktop input (always visible) + Mobile input (toggle) */}
      <div className={`${mobileOpen ? 'absolute left-0 right-0 top-0 z-50 bg-white px-2' : 'hidden'} md:block`}>
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" /><path strokeLinecap="round" d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => { if (results.length > 0) setOpen(true); }}
            onKeyDown={handleKeyDown}
            placeholder="Buscar clientes, ventas, pedidos..."
            className="w-full md:w-72 pl-8 pr-3 py-1.5 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
          {loading && (
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
              <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      </div>

      {/* Dropdown */}
      {open && results.length > 0 && (
        <div className="absolute top-full mt-1 right-0 md:left-0 w-80 md:w-96 bg-white rounded-xl shadow-lg border border-slate-200 z-50 max-h-96 overflow-y-auto">
          {Object.entries(grouped).map(([tipo, items]) => {
            const cfg = TIPO_CONFIG[tipo] || { label: tipo, color: 'bg-slate-100 text-slate-600' };
            return (
              <div key={tipo}>
                <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 bg-slate-50 border-b border-slate-100">
                  {cfg.label}s
                </div>
                {items.map(item => (
                  <button
                    key={`${tipo}-${item.id}`}
                    onClick={() => handleSelect(item)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-blue-50 transition text-left border-b border-slate-50"
                  >
                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${cfg.color}`}>
                      {cfg.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-700 truncate">{item.label}</p>
                      {item.sublabel && (
                        <p className="text-xs text-slate-400 truncate">{item.sublabel}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {open && results.length === 0 && query.length >= 2 && !loading && (
        <div className="absolute top-full mt-1 right-0 md:left-0 w-80 bg-white rounded-xl shadow-lg border border-slate-200 z-50 p-4 text-center text-sm text-slate-400">
          Sin resultados para "{query}"
        </div>
      )}
    </div>
  );
}
