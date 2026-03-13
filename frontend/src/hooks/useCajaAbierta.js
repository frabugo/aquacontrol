import { useState, useEffect } from 'react';
import { getCajaHoy } from '../services/cajaService';

export default function useCajaAbierta() {
  const [cajaAbierta, setCajaAbierta] = useState(true); // optimista
  const [cargandoCaja, setCargandoCaja] = useState(true);

  useEffect(() => {
    getCajaHoy()
      .then(data => {
        const estado = data?.estado;
        setCajaAbierta(estado === 'abierta' || estado === 'reabierta');
      })
      .catch(() => setCajaAbierta(false))
      .finally(() => setCargandoCaja(false));
  }, []);

  return { cajaAbierta, cargandoCaja };
}
