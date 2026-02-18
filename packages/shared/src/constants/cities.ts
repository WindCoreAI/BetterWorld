/**
 * Supported Cities Configuration (Sprint 11 — T040, Sprint 17 — T016)
 *
 * Cities with local dashboards for Phase 3.
 * Sprint 17 adds taglines for city chapter identity and Seattle.
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
    id: "sanfrancisco",
    displayName: "San Francisco, CA",
    center: { lat: 37.7749, lng: -122.4194 },
    tagline: "Bay Area Builds Better",
  },
  {
    id: "newyork",
    displayName: "New York, NY",
    center: { lat: 40.7128, lng: -74.006 },
    tagline: "New York Acts Now",
  },
  {
    id: "seattle",
    displayName: "Seattle, WA",
    center: { lat: 47.6062, lng: -122.3321 },
    tagline: "Seattle Leads Forward",
  },
];

/** Lookup map for quick validation */
export const SUPPORTED_CITY_MAP = new Map(
  SUPPORTED_CITIES.map((city) => [city.id, city]),
);
