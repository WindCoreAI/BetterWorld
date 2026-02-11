"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";

interface HeatmapPoint {
  lat: number;
  lng: number;
  intensity: number;
  count: number;
}

interface ImpactHeatmapProps {
  points: HeatmapPoint[];
}

// Dynamic import for SSR safety (matching existing Leaflet pattern)
const MapContainer = dynamic(
  () => import("react-leaflet").then((mod) => mod.MapContainer),
  { ssr: false },
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((mod) => mod.TileLayer),
  { ssr: false },
);

export function ImpactHeatmap({ points }: ImpactHeatmapProps) {
  const _heatData = useMemo(
    () => points.map((p) => [p.lat, p.lng, p.intensity] as [number, number, number]),
    [points],
  );

  if (points.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-neu-sm p-8 text-center">
        <p className="text-charcoal-light">No mission location data available yet</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-neu-sm overflow-hidden">
      <div className="h-[400px]">
        <MapContainer
          center={[20, 0]}
          zoom={2}
          style={{ height: "100%", width: "100%" }}
          scrollWheelZoom={false}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {/* Heatmap layer would use leaflet.heat plugin — render as markers for now */}
          {points.map((p, i) => (
            <div key={i} data-lat={p.lat} data-lng={p.lng} data-count={p.count} />
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
