"use client";

/**
 * Validator Affinity Settings Page (Sprint 11 — T038)
 *
 * Allows validators to manage their home regions (1-3 cities).
 */

import { useEffect, useState } from "react";

import ValidatorTierBadge from "../../../src/components/ValidatorTierBadge";
import { API_BASE, getAgentToken, getAuthHeaders } from "../../../src/lib/api";

interface HomeRegion {
  name: string;
  lat: number;
  lng: number;
}

interface ValidatorData {
  tier: string;
  homeRegions: HomeRegion[];
}

interface NominatimResult {
  display_name: string;
  lat: string;
  lon: string;
}

export default function ValidatorAffinityPage() {
  const [validator, setValidator] = useState<ValidatorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<NominatimResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const fetchValidator = async () => {
      const token = getAgentToken();
      const headers = getAuthHeaders(token);

      try {
        const res = await fetch(`${API_BASE}/api/v1/validator/stats`, { headers });
        if (res.ok) {
          const data = await res.json();
          setValidator({
            tier: data.data.tier,
            homeRegions: data.data.homeRegions || [],
          });
        } else if (res.status === 404) {
          setError("You are not in the validator pool");
        }
      } catch {
        setError("Network error");
      } finally {
        setLoading(false);
      }
    };

    fetchValidator();
  }, []);

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQuery)}&limit=5`,
      );
      const results: NominatimResult[] = await res.json();
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const addRegion = async (result: NominatimResult) => {
    if (!validator) return;
    if (validator.homeRegions.length >= 3) {
      setError("Maximum 3 home regions allowed");
      return;
    }

    const newRegion: HomeRegion = {
      name: result.display_name.split(",").slice(0, 2).join(",").trim(),
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
    };

    const updated = [...validator.homeRegions, newRegion];
    await saveRegions(updated);
  };

  const removeRegion = async (index: number) => {
    if (!validator) return;
    const updated = validator.homeRegions.filter((_, i) => i !== index);
    await saveRegions(updated);
  };

  const saveRegions = async (regions: HomeRegion[]) => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    const token = getAgentToken();
    const headers = getAuthHeaders(token);

    try {
      const res = await fetch(`${API_BASE}/api/v1/validator/affinity`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ homeRegions: regions }),
      });

      if (res.ok) {
        setValidator((prev) => prev ? { ...prev, homeRegions: regions } : prev);
        setSuccess("Home regions updated successfully");
        setSearchResults([]);
        setSearchQuery("");
      } else {
        const data = await res.json();
        setError(data.error?.message || "Failed to update");
      }
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Validator Affinity Settings</h1>
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  if (!validator) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <h1 className="mb-6 text-2xl font-bold text-gray-900">Validator Affinity Settings</h1>
        <p className="text-red-500">{error || "Not found"}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="mb-6 flex items-center gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Validator Affinity Settings</h1>
        <ValidatorTierBadge tier={validator.tier} />
      </div>

      <p className="mb-6 text-sm text-gray-600">
        Declare up to 3 home regions to receive evaluation assignments for local content.
      </p>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}
      {success && (
        <div className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-700">{success}</div>
      )}

      {/* Current regions */}
      <div className="mb-6">
        <h2 className="mb-3 text-lg font-semibold text-gray-900">
          Home Regions ({validator.homeRegions.length}/3)
        </h2>
        {validator.homeRegions.length === 0 ? (
          <p className="text-sm text-gray-500">No home regions declared yet.</p>
        ) : (
          <div className="space-y-2">
            {validator.homeRegions.map((region, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3"
              >
                <span className="text-sm text-gray-800">{region.name}</span>
                <button
                  onClick={() => removeRegion(idx)}
                  disabled={saving}
                  className="text-sm text-red-600 hover:text-red-800 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Search for new region */}
      {validator.homeRegions.length < 3 && (
        <div>
          <h2 className="mb-3 text-lg font-semibold text-gray-900">Add Region</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Search for a city..."
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <button
              onClick={handleSearch}
              disabled={searching}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {searching ? "..." : "Search"}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div className="mt-2 space-y-1">
              {searchResults.map((result, idx) => (
                <button
                  key={idx}
                  onClick={() => addRegion(result)}
                  disabled={saving}
                  className="w-full rounded-lg border border-gray-200 bg-white p-2 text-left text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {result.display_name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
