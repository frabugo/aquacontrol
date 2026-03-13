import L from 'leaflet';

const crearIconoVehiculo = (tipo, activo = true) => {
  const emojis = {
    camion:  '\u{1F69B}',
    moto:    '\u{1F3CD}\uFE0F',
    trimoto: '\u{1F6FA}',
    auto:    '\u{1F697}',
  };
  const colores = {
    camion:  '#1D4ED8',
    moto:    '#7C3AED',
    trimoto: '#B45309',
    auto:    '#047857',
  };

  const emoji = emojis[tipo] || '\u{1F697}';
  const color = activo
    ? (colores[tipo] || '#047857')
    : '#9CA3AF';

  // Badge online/offline
  const badge = activo
    ? `<div style="
        position:absolute;top:-4px;right:-4px;
        width:13px;height:13px;
        background:#10B981;
        border-radius:50%;
        border:2px solid white;
        animation:pulse-green 2s infinite;
      "></div>`
    : `<div style="
        position:absolute;top:-4px;right:-4px;
        width:13px;height:13px;
        background:#EF4444;
        border-radius:50%;
        border:2px solid white;
      "></div>`;

  return L.divIcon({
    html: `
      <div style="position:relative;width:40px;height:40px;">
        <div style="
          width:40px;height:40px;
          background:${color};
          border-radius:50% 50% 50% 0;
          transform:rotate(-45deg);
          border:2px solid white;
          box-shadow:0 2px 8px rgba(0,0,0,0.3);
          transition:background 0.5s ease;
        "></div>
        <div style="
          position:absolute;
          top:4px;left:4px;
          width:32px;height:32px;
          display:flex;
          align-items:center;
          justify-content:center;
          font-size:18px;
          transform:rotate(45deg);
        ">${emoji}</div>
        ${badge}
      </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40],
    className: '',
  });
};

export const iconoCentral = L.divIcon({
  html: `
    <div style="position:relative;width:44px;height:44px;">
      <div style="
        width:44px;height:44px;
        background:#1E40AF;
        border-radius:50%;
        border:3px solid white;
        box-shadow:0 2px 10px rgba(30,64,175,0.4);
      "></div>
      <div style="
        position:absolute;
        top:4px;left:4px;
        width:36px;height:36px;
        display:flex;
        align-items:center;
        justify-content:center;
        font-size:22px;
      ">\u{1F3E2}</div>
    </div>`,
  iconSize: [44, 44],
  iconAnchor: [22, 22],
  popupAnchor: [0, -22],
  className: '',
});

export default crearIconoVehiculo;
