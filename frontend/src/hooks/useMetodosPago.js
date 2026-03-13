import { useEffect, useState } from 'react';
import { listarMetodos } from '../services/metodosPagoService';

/**
 * Hook that caches active payment methods.
 * Returns:
 *   metodos      – all active methods sorted by orden
 *   metodosPago  – active methods excluding 'credito' (for payment forms)
 *   metodosAbono – same as metodosPago (for debt payments)
 *   loading
 *   refresh()    – force re-fetch
 */
export default function useMetodosPago() {
  const [metodos, setMetodos] = useState([]);
  const [loading, setLoading] = useState(true);

  function fetch() {
    setLoading(true);
    listarMetodos()
      .then(data => setMetodos(Array.isArray(data) ? data : []))
      .catch(() => setMetodos([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { fetch(); }, []);

  const metodosPago = metodos.filter(m => m.nombre !== 'credito');
  const metodosAbono = metodosPago;

  return { metodos, metodosPago, metodosAbono, loading, refresh: fetch };
}
