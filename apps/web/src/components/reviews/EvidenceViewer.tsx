"use client";

import { useState } from "react";

interface EvidenceViewerProps {
  contentUrl: string;
  evidenceType: string;
  evidenceLatitude?: number | null;
  evidenceLongitude?: number | null;
  missionLatitude?: number | null;
  missionLongitude?: number | null;
  fileSize?: number;
  capturedAt?: string;
}

export function EvidenceViewer({
  contentUrl,
  evidenceType,
  evidenceLatitude,
  evidenceLongitude,
  missionLatitude,
  missionLongitude,
  fileSize,
  capturedAt,
}: EvidenceViewerProps) {
  const [zoomed, setZoomed] = useState(false);
  const [scale, setScale] = useState(1);

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.5, 4));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.5, 0.5));

  return (
    <div className="space-y-3">
      <div
        className="relative bg-gray-100 rounded-lg overflow-hidden cursor-zoom-in"
        onClick={() => setZoomed(!zoomed)}
      >
        {evidenceType === "photo" || evidenceType === "image" ? (
          <img
            src={contentUrl}
            alt="Evidence"
            className="w-full h-auto transition-transform"
            style={{ transform: zoomed ? `scale(${scale})` : "scale(1)" }}
          />
        ) : (
          <div className="p-8 text-center text-gray-500">
            <p>{evidenceType} file</p>
            <a href={contentUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
              Open file
            </a>
          </div>
        )}
      </div>

      {zoomed && (
        <div className="flex gap-2 justify-center">
          <button onClick={handleZoomOut} className="px-3 py-1 rounded bg-gray-200 text-sm">-</button>
          <button onClick={handleZoomIn} className="px-3 py-1 rounded bg-gray-200 text-sm">+</button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
        {fileSize && (
          <div>Size: {(fileSize / (1024 * 1024)).toFixed(2)} MB</div>
        )}
        {capturedAt && (
          <div>Captured: {new Date(capturedAt).toLocaleString()}</div>
        )}
        {evidenceLatitude !== null && evidenceLatitude !== undefined && (
          <div>Evidence GPS: {evidenceLatitude.toFixed(4)}, {evidenceLongitude?.toFixed(4)}</div>
        )}
        {missionLatitude !== null && missionLatitude !== undefined && (
          <div>Mission GPS: {missionLatitude.toFixed(4)}, {missionLongitude?.toFixed(4)}</div>
        )}
      </div>
    </div>
  );
}
