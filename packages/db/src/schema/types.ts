import { customType } from "drizzle-orm/pg-core";

/**
 * Custom Drizzle type for PostGIS `geography(Point, 4326)` columns.
 *
 * Stores WGS84 geographic points for accurate distance calculations.
 * Use with GIST indexes for efficient spatial queries.
 *
 * @see research.md R1 for implementation rationale
 */
export const geographyPoint = customType<{
  data: string;
  driverData: string;
}>({
  dataType() {
    return "geography(Point, 4326)";
  },
});
