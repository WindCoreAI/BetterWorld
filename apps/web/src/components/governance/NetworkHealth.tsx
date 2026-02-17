"use client";

interface NetworkHealthProps {
  data: {
    connectionDensity: number;
    totalConnections: number;
    totalParticipants: number;
    totalFollows: number;
    citiesConnected: number;
    reciprocityRate: number;
  };
}

export function NetworkHealth({ data }: NetworkHealthProps) {
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Network Health</h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Connection Density</p>
          <p className="text-lg font-bold">{(data.connectionDensity * 100).toFixed(2)}%</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Total Connections</p>
          <p className="text-lg font-bold">{data.totalConnections}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Participants</p>
          <p className="text-lg font-bold">{data.totalParticipants}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Total Follows</p>
          <p className="text-lg font-bold">{data.totalFollows}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Cities Connected</p>
          <p className="text-lg font-bold">{data.citiesConnected}</p>
        </div>
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs text-gray-500">Reciprocity Rate</p>
          <p className="text-lg font-bold">{(data.reciprocityRate * 100).toFixed(1)}%</p>
        </div>
      </div>
    </div>
  );
}
