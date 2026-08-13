import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import 'leaflet/dist/leaflet.css';

type MarketPoint = {
  market: string;
  region_name: string;
  province: string;
  city_municipality: string;
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
  market: MarketPoint;
  className?: string;
};

export default function MarketLocationMap({ market, className }: Props) {
  return (
    <div className={className ?? 'market-finder-map-frame'}>
      <MapContainer
        key={`${market.lat.toFixed(5)}-${market.lng.toFixed(5)}`}
        center={[market.lat, market.lng]}
        zoom={14}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={[market.lat, market.lng]}>
          <Popup>
            <strong>{market.market}</strong>
            <br />
            {[market.city_municipality, market.province, market.region_name]
              .filter(Boolean)
              .join(' · ')}
          </Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}
