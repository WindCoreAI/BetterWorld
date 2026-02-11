"use client";

import L from "leaflet";
import { useEffect, useRef } from "react";
import "leaflet/dist/leaflet.css";

// Workaround: Leaflet's default icon URL resolution breaks with webpack/Next.js bundling.
// Deleting _getIconUrl forces Leaflet to use the explicit URLs set below via mergeOptions.
// See: https://github.com/Leaflet/Leaflet/issues/4968
// eslint-disable-next-line @typescript-eslint/no-explicit-any
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  title?: string;
  popupContent?: string;
}

interface MapProps {
  center?: [number, number];
  zoom?: number;
  markers?: MapMarker[];
  onMarkerClick?: (id: string) => void;
  className?: string;
  style?: React.CSSProperties;
}

export default function Map({
  center = [20, 0],
  zoom = 2,
  markers = [],
  onMarkerClick,
  className = "",
  style,
}: MapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Store initial values in refs to avoid re-creating the map on prop changes
  const initialCenter = useRef(center);
  const initialZoom = useRef(zoom);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = L.map(containerRef.current).setView(initialCenter.current, initialZoom.current);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapRef.current);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    // Clear existing markers
    mapRef.current.eachLayer((layer) => {
      if (layer instanceof L.Marker) {
        mapRef.current?.removeLayer(layer);
      }
    });

    // Add new markers
    markers.forEach((m) => {
      const marker = L.marker([m.lat, m.lng]).addTo(mapRef.current!);
      if (m.popupContent) {
        marker.bindPopup(m.popupContent);
      }
      if (onMarkerClick) {
        marker.on("click", () => onMarkerClick(m.id));
      }
    });
  }, [markers, onMarkerClick]);

  return <div ref={containerRef} className={`h-full w-full ${className}`} style={style} />;
}
