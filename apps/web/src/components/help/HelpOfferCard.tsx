"use client";

interface HelpOfferCardProps {
  offer: {
    id: string;
    helperName: string;
    message: string;
    status: string;
    createdAt: string;
  };
  isClaimOwner: boolean;
  onAccept?: (offerId: string) => void;
  onDecline?: (offerId: string) => void;
}

export function HelpOfferCard({ offer, isClaimOwner, onAccept, onDecline }: HelpOfferCardProps) {
  const statusColors: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-700",
    accepted: "bg-green-100 text-green-700",
    declined: "bg-red-100 text-red-700",
  };

  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium">{offer.helperName}</span>
        <span className={`rounded-full px-2 py-0.5 text-xs ${statusColors[offer.status] ?? "bg-gray-100 text-gray-600"}`}>
          {offer.status}
        </span>
      </div>
      <p className="text-sm text-gray-600 mb-2">{offer.message}</p>
      {isClaimOwner && offer.status === "pending" && (
        <div className="flex gap-2">
          <button
            onClick={() => onAccept?.(offer.id)}
            className="rounded bg-green-600 px-3 py-1 text-xs text-white hover:bg-green-700"
          >
            Accept
          </button>
          <button
            onClick={() => onDecline?.(offer.id)}
            className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-50"
          >
            Decline
          </button>
        </div>
      )}
    </div>
  );
}
