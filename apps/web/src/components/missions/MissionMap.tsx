"use client";

import dynamic from "next/dynamic";

import type { MapMarker } from "../ui/Map";

const Map = dynamic(() => import("../ui/Map"), { ssr: false, loading: () => <div className="flex h-full w-full items-center justify-center bg-gray-100 text-gray-400">Loading map...</div> });

/** Escape HTML entities to prevent XSS in Leaflet popups */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface MissionMapProps {
  missions: Array<{
    id: string;
    title: string;
    tokenReward: number;
    approximateLatitude: number | null;
    approximateLongitude: number | null;
    slotsAvailable: number;
  }>;
  onMissionClick?: (id: string) => void;
  className?: string;
}

export default function MissionMap({ missions, onMissionClick, className }: MissionMapProps) {
  const markers: MapMarker[] = missions
    .filter((m) => m.approximateLatitude != null && m.approximateLongitude != null)
    .map((m) => ({
      id: m.id,
      lat: m.approximateLatitude!,
      lng: m.approximateLongitude!,
      title: m.title,
      popupContent: `<div><strong>${escapeHtml(m.title)}</strong><br/>${m.tokenReward} IT · ${m.slotsAvailable} slots<br/><a href="/missions/${encodeURIComponent(m.id)}">View Details</a></div>`,
    }));

  if (markers.length === 0) {
    return (
      <div className={`flex items-center justify-center bg-gray-50 text-gray-400 ${className ?? ""}`}>
        No missions with location data
      </div>
    );
  }

  return <Map markers={markers} onMarkerClick={onMissionClick} className={className} />;
}
