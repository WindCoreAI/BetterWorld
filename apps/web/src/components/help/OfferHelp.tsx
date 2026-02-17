"use client";

import { useState } from "react";

interface OfferHelpProps {
  claimId: string;
  onSubmit: (message: string) => void;
}

export function OfferHelp({ claimId: _claimId, onSubmit }: OfferHelpProps) {
  const [message, setMessage] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="rounded bg-green-50 px-3 py-2 text-sm text-green-700 hover:bg-green-100 border border-green-200"
      >
        Offer to Help
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-4">
      <h4 className="text-sm font-medium text-green-800 mb-2">Offer Help</h4>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Describe how you can help..."
        className="w-full rounded border border-green-300 bg-white px-3 py-2 text-sm"
        rows={3}
        maxLength={500}
      />
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => { onSubmit(message); setMessage(""); setIsOpen(false); }}
          disabled={message.length < 10}
          className="rounded bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700 disabled:opacity-50"
        >
          Send Offer
        </button>
        <button
          onClick={() => setIsOpen(false)}
          className="rounded border border-gray-300 px-3 py-1.5 text-xs text-gray-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
