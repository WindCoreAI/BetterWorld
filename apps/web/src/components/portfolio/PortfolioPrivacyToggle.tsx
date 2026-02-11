"use client";

import { useState } from "react";

import { API_BASE, getHumanToken } from "../../lib/api";

interface PortfolioPrivacyToggleProps {
  currentVisibility: "public" | "private";
  onToggled?: (newVisibility: "public" | "private") => void;
}

export function PortfolioPrivacyToggle({
  currentVisibility,
  onToggled,
}: PortfolioPrivacyToggleProps) {
  const [visibility, setVisibility] = useState(currentVisibility);
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    setLoading(true);
    const newVisibility = visibility === "public" ? "private" : "public";
    try {
      const token = getHumanToken();
      const res = await fetch(`${API_BASE}/api/v1/portfolios/me/visibility`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ visibility: newVisibility }),
      });
      const data = await res.json();
      if (data.ok) {
        setVisibility(newVisibility);
        onToggled?.(newVisibility);
      }
    } catch {
      // Toggle failed — keep current state
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className="flex items-center gap-2 text-sm text-charcoal-light hover:text-charcoal transition-colors disabled:opacity-50"
    >
      <span className={`inline-block w-8 h-4 rounded-full relative transition-colors ${
        visibility === "public" ? "bg-sage" : "bg-gray-300"
      }`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform ${
          visibility === "public" ? "left-4" : "left-0.5"
        }`} />
      </span>
      {visibility === "public" ? "Public" : "Private"}
    </button>
  );
}
