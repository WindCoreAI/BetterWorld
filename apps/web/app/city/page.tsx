"use client";

/**
 * City Selector Page (Sprint 11 — T046)
 *
 * Lists available cities with cards linking to their dashboards.
 */

import Link from "next/link";
import { useEffect, useState } from "react";

import { API_BASE } from "../../src/lib/api";

interface CityInfo {
  id: string;
  displayName: string;
  center: { lat: number; lng: number };
  totalProblems: number;
}

export default function CitySelectorPage() {
  const [cities, setCities] = useState<CityInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCities = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/v1/city/list`);
        if (res.ok) {
          const data = await res.json();
          setCities(data.data.cities || []);
        }
      } catch {
        // Non-fatal
      } finally {
        setLoading(false);
      }
    };

    fetchCities();
  }, []);

  return (
    <div className="mx-auto max-w-4xl p-8">
      <h1 className="mb-2 text-2xl font-bold text-gray-900">City Dashboards</h1>
      <p className="mb-6 text-sm text-gray-600">
        Explore local problem metrics and community activity for supported cities.
      </p>

      {loading ? (
        <p className="text-gray-500">Loading cities...</p>
      ) : cities.length === 0 ? (
        <p className="text-gray-500">No cities available.</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {cities.map((city) => (
            <Link
              key={city.id}
              href={`/city/${city.id}`}
              className="block rounded-lg border border-gray-200 bg-white p-6 transition hover:border-blue-300 hover:shadow-md"
            >
              <h2 className="text-lg font-semibold text-gray-900">{city.displayName}</h2>
              <p className="mt-1 text-sm text-gray-500">
                {city.totalProblems} problems reported
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
