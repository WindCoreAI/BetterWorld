/**
 * Supported Cities Configuration (Sprint 11 — T040)
 *
 * Cities with local dashboards for Phase 3.
 */

export interface SupportedCity {
  id: string;
  displayName: string;
  center: { lat: number; lng: number };
}

export const SUPPORTED_CITIES: SupportedCity[] = [
  {
    id: "portland",
    displayName: "Portland, OR",
    center: { lat: 45.5152, lng: -122.6784 },
  },
  {
    id: "chicago",
    displayName: "Chicago, IL",
    center: { lat: 41.8781, lng: -87.6298 },
  },
];

/** Lookup map for quick validation */
export const SUPPORTED_CITY_MAP = new Map(
  SUPPORTED_CITIES.map((city) => [city.id, city]),
);
