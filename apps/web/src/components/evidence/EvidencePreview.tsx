"use client";

interface EvidencePreviewProps {
  file: File | null;
  latitude?: number;
  longitude?: number;
  capturedAt?: string;
}

export function EvidencePreview({
  file,
  latitude,
  longitude,
  capturedAt,
}: EvidencePreviewProps) {
  if (!file) return null;

  const previewUrl = URL.createObjectURL(file);
  const isImage = file.type.startsWith("image/");
  const fileSizeMB = (file.size / (1024 * 1024)).toFixed(2);

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <h3 className="text-sm font-medium text-gray-700">Preview</h3>

      {isImage && (
        <div className="relative aspect-video bg-gray-100 rounded overflow-hidden">
          <img
            src={previewUrl}
            alt="Evidence preview"
            className="object-contain w-full h-full"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
        <div>
          <span className="font-medium">File:</span> {file.name}
        </div>
        <div>
          <span className="font-medium">Size:</span> {fileSizeMB} MB
        </div>
        <div>
          <span className="font-medium">Type:</span> {file.type}
        </div>
        {capturedAt && (
          <div>
            <span className="font-medium">Captured:</span>{" "}
            {new Date(capturedAt).toLocaleString()}
          </div>
        )}
        {latitude !== undefined && longitude !== undefined && (
          <div className="col-span-2">
            <span className="font-medium">GPS:</span>{" "}
            {latitude.toFixed(6)}, {longitude.toFixed(6)}
          </div>
        )}
      </div>
    </div>
  );
}
