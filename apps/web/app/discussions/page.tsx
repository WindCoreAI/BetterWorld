"use client";

/**
 * Discussion Index Page (Sprint 16: Social Fabric Foundation)
 *
 * Lists all available domain boards and city boards for discovery.
 */
import Link from "next/link";

import { Card, CardBody, Badge } from "../../src/components/ui";

const DOMAIN_BOARDS = [
  { key: "clean_water", label: "Clean Water" },
  { key: "renewable_energy", label: "Renewable Energy" },
  { key: "food_security", label: "Food Security" },
  { key: "affordable_housing", label: "Affordable Housing" },
  { key: "healthcare_access", label: "Healthcare Access" },
  { key: "education_equity", label: "Education Equity" },
  { key: "climate_action", label: "Climate Action" },
  { key: "biodiversity", label: "Biodiversity" },
  { key: "waste_reduction", label: "Waste Reduction" },
  { key: "digital_inclusion", label: "Digital Inclusion" },
  { key: "gender_equality", label: "Gender Equality" },
  { key: "mental_health", label: "Mental Health" },
  { key: "sustainable_transport", label: "Sustainable Transport" },
  { key: "community_safety", label: "Community Safety" },
  { key: "economic_opportunity", label: "Economic Opportunity" },
];

const CITY_BOARDS = [
  { key: "portland", label: "Portland" },
  { key: "chicago", label: "Chicago" },
  { key: "denver", label: "Denver" },
];

export default function DiscussionsIndexPage() {
  return (
    <div className="min-h-screen bg-cream">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-charcoal mb-2">Discussion Spaces</h1>
        <p className="text-sm text-charcoal-light mb-8">
          Join conversations about social good topics and local initiatives.
        </p>

        {/* Domain boards */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-charcoal mb-4">Domain Discussions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {DOMAIN_BOARDS.map((domain) => (
              <Link
                key={domain.key}
                href={`/discussions/domain/${domain.key}`}
                className="block"
              >
                <Card>
                  <CardBody>
                    <div className="flex items-center gap-2">
                      <Badge size="sm">{domain.label}</Badge>
                    </div>
                    <p className="text-xs text-charcoal-light mt-2">
                      Discuss {domain.label.toLowerCase()} challenges and solutions
                    </p>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        </section>

        {/* City boards */}
        <section>
          <h2 className="text-lg font-semibold text-charcoal mb-4">City Discussions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {CITY_BOARDS.map((city) => (
              <Link
                key={city.key}
                href={`/discussions/city/${city.key}`}
                className="block"
              >
                <Card>
                  <CardBody>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-charcoal">{city.label}</span>
                    </div>
                    <p className="text-xs text-charcoal-light mt-2">
                      Local discussions for {city.label}
                    </p>
                  </CardBody>
                </Card>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
