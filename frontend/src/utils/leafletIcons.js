import L from 'leaflet';
import iconUrl from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
  iconUrl,
  shadowUrl: iconShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
});

L.Marker.prototype.options.icon = DefaultIcon;

const crearIcono = (color) => L.divIcon({
  html: `<div style="
    background:${color};
    width:20px;height:20px;
    border-radius:50%;
    border:2px solid white;
    box-shadow:0 2px 4px rgba(0,0,0,0.3)
  "></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
  popupAnchor: [0, -10],
  className: '',
});

export const iconoPendiente   = crearIcono('#3B82F6');
export const iconoEnCamino    = crearIcono('#F59E0B');
export const iconoEntregado   = crearIcono('#10B981');
export const iconoNoEntregado = crearIcono('#EF4444');
