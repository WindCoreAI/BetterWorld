"use client";

import { useEffect, useState } from "react";

import { Card, CardBody } from "../ui";

interface CityMetric {
  id: string;
  name: string;
  problems: number;
  problemsPerCapita: number;
  observations: number;
  validatorCount: number;
  validatorDensity: number;
  population: number;
}

export default function CrossCityDashboard() {
  const [cities, setCities] = useState<CityMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchData() {
      try {
        setLoading(true);
        const res = await fetch("/api/v1/cross-city/compare");
        if (!res.ok) throw new Error("Failed to fetch cross-city data");
        const json = await res.json();
        if (!cancelled) setCities(json.data?.cities ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchData();
    return () => { cancelled = true; };
  }, []);

  if (loading) return <Card><CardBody><p className="text-gray-500">Loading cross-city data...</p></CardBody></Card>;
  if (error) return <Card><CardBody><p className="text-red-500">{error}</p></CardBody></Card>;

  const maxProblems = Math.max(...cities.map(c => c.problemsPerCapita), 1);
  const maxValidators = Math.max(...cities.map(c => c.validatorDensity), 1);

  return (
    <div className="space-y-6">
      <Card>
        <CardBody>
          <h3 className="text-lg font-semibold mb-4">Cross-City Comparison</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="pb-2 font-medium text-gray-500">City</th>
                  <th className="pb-2 font-medium text-gray-500 text-right">Population</th>
                  <th className="pb-2 font-medium text-gray-500 text-right">Problems</th>
                  <th className="pb-2 font-medium text-gray-500 text-right">Per Capita</th>
                  <th className="pb-2 font-medium text-gray-500 text-right">Observations</th>
                  <th className="pb-2 font-medium text-gray-500 text-right">Validators</th>
                </tr>
              </thead>
              <tbody>
                {cities.map((city) => (
                  <tr key={city.id} className="border-b last:border-0">
                    <td className="py-3 font-medium">{city.name}</td>
                    <td className="py-3 text-right text-gray-600">{city.population.toLocaleString()}</td>
                    <td className="py-3 text-right">{city.problems}</td>
                    <td className="py-3 text-right">{(city.problemsPerCapita * 100000).toFixed(1)}/100K</td>
                    <td className="py-3 text-right">{city.observations}</td>
                    <td className="py-3 text-right">{city.validatorCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Problems Per Capita</h4>
          <div className="space-y-3">
            {cities.map((city) => (
              <div key={city.id} className="flex items-center gap-3">
                <span className="w-24 text-sm text-gray-600">{city.name}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-4">
                  <div
                    className="bg-emerald-500 rounded-full h-4 transition-all"
                    style={{ width: `${(city.problemsPerCapita / maxProblems) * 100}%` }}
                  />
                </div>
                <span className="w-20 text-right text-sm text-gray-500">
                  {(city.problemsPerCapita * 100000).toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
          <h4 className="text-sm font-medium text-gray-700 mb-3">Validator Density</h4>
          <div className="space-y-3">
            {cities.map((city) => (
              <div key={city.id} className="flex items-center gap-3">
                <span className="w-24 text-sm text-gray-600">{city.name}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-4">
                  <div
                    className="bg-blue-500 rounded-full h-4 transition-all"
                    style={{ width: `${(city.validatorDensity / maxValidators) * 100}%` }}
                  />
                </div>
                <span className="w-20 text-right text-sm text-gray-500">
                  {(city.validatorDensity * 100000).toFixed(1)}
                </span>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
