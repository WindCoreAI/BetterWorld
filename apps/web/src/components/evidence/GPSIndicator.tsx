"use client";

interface GPSIndicatorProps {
  status: "detecting" | "detected" | "denied" | "unavailable";
  latitude?: number;
  longitude?: number;
}

export function GPSIndicator({ status, latitude, longitude }: GPSIndicatorProps) {
  const statusConfig = {
    detecting: {
      bgColor: "bg-yellow-100",
      textColor: "text-yellow-800",
      icon: "...",
      label: "Detecting GPS...",
    },
    detected: {
      bgColor: "bg-green-100",
      textColor: "text-green-800",
      icon: "OK",
      label: `GPS: ${latitude?.toFixed(4)}, ${longitude?.toFixed(4)}`,
    },
    denied: {
      bgColor: "bg-red-100",
      textColor: "text-red-800",
      icon: "!",
      label: "GPS denied - enable location access",
    },
    unavailable: {
      bgColor: "bg-gray-100",
      textColor: "text-gray-800",
      icon: "i",
      label: "GPS unavailable - EXIF data will be used",
    },
  };

  const config = statusConfig[status];

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${config.bgColor} ${config.textColor}`}>
      <span className="font-bold">{config.icon}</span>
      <span>{config.label}</span>
    </div>
  );
}
