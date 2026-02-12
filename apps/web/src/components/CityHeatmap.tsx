"use client";

/**
 * CityHeatmap Component (Sprint 11 — T045)
 *
 * Dynamic import of Leaflet + leaflet.heat (SSR-safe).
 * Renders map centered on city coordinates with heatmap layer.
 */

import dynamic from "next/dynamic";

interface HeatmapPoint {
  lat: number;
  lng: number;
  intensity: number;
}

interface CityHeatmapProps {
  center: { lat: number; lng: number };
  heatmapData: HeatmapPoint[];
  zoom?: number;
}

// Lazy-loaded map component (no SSR)
const MapContainer = dynamic(
  () => import("react-leaflet").then((mod) => mod.MapContainer),
  { ssr: false },
);

const TileLayer = dynamic(
  () => import("react-leaflet").then((mod) => mod.TileLayer),
  { ssr: false },
);

export default function CityHeatmap({ center, heatmapData, zoom = 12 }: CityHeatmapProps) {
  const hasData = heatmapData.length > 0;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-lg font-semibold text-gray-900">Problem Density Heatmap</h3>
      <div className="h-[400px] w-full overflow-hidden rounded-lg">
        {typeof window !== "undefined" ? (
          <MapContainer
            center={[center.lat, center.lng]}
            zoom={zoom}
            style={{ height: "100%", width: "100%" }}
            scrollWheelZoom={false}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
          </MapContainer>
        ) : (
          <div className="flex h-full items-center justify-center bg-gray-100 text-gray-500">
            Loading map...
          </div>
        )}
      </div>
      {!hasData && (
        <p className="mt-2 text-sm text-gray-500">No heatmap data available yet.</p>
      )}
      {hasData && (
        <p className="mt-2 text-sm text-gray-500">{heatmapData.length} data points</p>
      )}
    </div>
  );
}
