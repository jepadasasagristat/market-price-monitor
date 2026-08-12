import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';

type MarketPoint = {
  region_name: string;
  province: string;
  city_municipality: string;
  market: string;
  lat: number;
  lng: number;
};

const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

type Props = {
  markets: MarketPoint[];
};

export default function MarketsMap({ markets }: Props) {
  if (!markets.length) {
    return <p className="empty-state">No mapped markets in this filter.</p>;
  }

  const centerLat = markets.reduce((sum, m) => sum + m.lat, 0) / markets.length;
  const centerLng = markets.reduce((sum, m) => sum + m.lng, 0) / markets.length;

  return (
    <div className="map-frame">
      <MapContainer
        key={`${centerLat.toFixed(3)}-${centerLng.toFixed(3)}-${markets.length}`}
        center={[centerLat, centerLng]}
        zoom={markets.length === 1 ? 12 : 6}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {markets.map((market) => (
          <Marker key={`${market.region_name}-${market.market}`} position={[market.lat, market.lng]}>
            <Popup>
              <strong>{market.market}</strong>
              <br />
              {[market.city_municipality, market.province, market.region_name]
                .filter(Boolean)
                .join(' · ')}
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
