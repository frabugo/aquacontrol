// Genera sonidos con Web Audio API
// Sin archivos externos ni dependencias

let ctx = null;
const getCtx = () => {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return ctx;
};

const reproducir = (frecuencias, duracion = 0.15, tipo = 'sine', volumen = 0.3) => {
  try {
    const audioCtx = getCtx();
    frecuencias.forEach(({ freq, delay = 0 }) => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();

      osc.connect(gain);
      gain.connect(audioCtx.destination);

      osc.type = tipo;
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);

      gain.gain.setValueAtTime(0, audioCtx.currentTime + delay);
      gain.gain.linearRampToValueAtTime(volumen, audioCtx.currentTime + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + delay + duracion);

      osc.start(audioCtx.currentTime + delay);
      osc.stop(audioCtx.currentTime + delay + duracion + 0.05);
    });
  } catch (e) {
    // Silenciar errores de audio
  }
};

export const sonidos = {
  // Repartidor entró en ruta — 3 tonos ascendentes
  repartidorEnLinea: () => reproducir([
    { freq: 523, delay: 0.0 },   // Do
    { freq: 659, delay: 0.15 },  // Mi
    { freq: 784, delay: 0.3 },   // Sol
  ], 0.2, 'sine', 0.25),

  // Repartidor se desconectó — tono descendente
  repartidorOffline: () => reproducir([
    { freq: 440, delay: 0.0 },
    { freq: 330, delay: 0.15 },
  ], 0.25, 'sine', 0.2),

  // Alerta GPS — tono urgente
  alertaGPS: () => reproducir([
    { freq: 880, delay: 0.0 },
    { freq: 880, delay: 0.2 },
    { freq: 880, delay: 0.4 },
  ], 0.15, 'square', 0.15),
};

export default sonidos;
