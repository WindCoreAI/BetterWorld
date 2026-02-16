/**
 * Supported Cities Configuration (Sprint 11 — T040, Sprint 17 — T016)
 *
 * Cities with local dashboards for Phase 3.
 * Sprint 17 adds taglines for city chapter identity and Denver.
 */

export interface SupportedCity {
  id: string;
  displayName: string;
  center: { lat: number; lng: number };
  /** Sprint 17: City chapter tagline */
  tagline: string;
}

export const SUPPORTED_CITIES: SupportedCity[] = [
  {
    id: "portland",
    displayName: "Portland, OR",
    center: { lat: 45.5152, lng: -122.6784 },
    tagline: "Keep Portland Better",
  },
  {
    id: "chicago",
    displayName: "Chicago, IL",
    center: { lat: 41.8781, lng: -87.6298 },
    tagline: "Chicago Cares Forward",
  },
  {
    id: "denver",
    displayName: "Denver, CO",
    center: { lat: 39.7392, lng: -104.9903 },
    tagline: "Mile High Impact",
  },
];

/** Lookup map for quick validation */
export const SUPPORTED_CITY_MAP = new Map(
  SUPPORTED_CITIES.map((city) => [city.id, city]),
);
