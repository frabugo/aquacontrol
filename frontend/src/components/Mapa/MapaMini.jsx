import { useEffect, useState } from 'react';

export default function MapaMini({ lat, lng, height = 200 }) {
  const [MC, setMC] = useState(null);

  useEffect(() => {
    Promise.all([import('react-leaflet'), import('leaflet')]).then(([rl, L]) => {
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
      setMC(rl);
    });
  }, []);

  if (!lat || !lng) {
    return (
      <div className="bg-slate-100 rounded-lg flex items-center justify-center text-xs text-slate-400"
        style={{ height }}>
        Sin coordenadas
      </div>
    );
  }

  if (!MC) {
    return (
      <div className="bg-slate-100 rounded-lg flex items-center justify-center" style={{ height }}>
        <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="rounded-lg overflow-hidden border border-slate-200" style={{ height }}>
      <MC.MapContainer center={[Number(lat), Number(lng)]} zoom={15}
        style={{ height: '100%', width: '100%' }} scrollWheelZoom={false} dragging={false}
        zoomControl={false} doubleClickZoom={false} touchZoom={false}>
        <MC.TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MC.Marker position={[Number(lat), Number(lng)]} />
      </MC.MapContainer>
    </div>
  );
}
