"use client";

import { Card, CardBody } from "./ui";

interface StepInstruction {
  step: number;
  instruction: string;
  photoRequired: boolean;
}

interface RequiredPhoto {
  label: string;
  description?: string;
  required: boolean;
}

interface MissionTemplateGuideProps {
  templateName: string;
  stepInstructions: StepInstruction[];
  requiredPhotos: RequiredPhoto[];
  gpsRadiusMeters: number;
  completionCriteria: { criterion: string; required: boolean }[];
  missionLatitude?: number;
  missionLongitude?: number;
}

/**
 * MissionTemplateGuide (Sprint 12 — T077)
 *
 * Displays step-by-step instructions, required photos checklist,
 * and GPS radius indicator when a mission is created from a template.
 */
export default function MissionTemplateGuide({
  templateName,
  stepInstructions,
  requiredPhotos,
  gpsRadiusMeters,
  completionCriteria,
  missionLatitude,
  missionLongitude,
}: MissionTemplateGuideProps) {
  const sorted = [...stepInstructions].sort((a, b) => a.step - b.step);

  return (
    <div className="space-y-4">
      <Card>
        <CardBody>
          <h3 className="text-lg font-semibold mb-2">Mission Guide: {templateName}</h3>
          <p className="text-sm text-gray-500 mb-4">
            Follow the steps below to complete this mission.
          </p>

          {/* Step Instructions */}
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Steps</h4>
            <ol className="space-y-3">
              {sorted.map((s) => (
                <li key={s.step} className="flex items-start gap-3">
                  <span className="flex-shrink-0 w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-medium">
                    {s.step}
                  </span>
                  <div className="flex-1 pt-0.5">
                    <p className="text-sm text-gray-800">{s.instruction}</p>
                    {s.photoRequired && (
                      <span className="inline-block mt-1 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                        Photo required
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          {/* Required Photos */}
          {requiredPhotos.length > 0 && (
            <div className="mb-6">
              <h4 className="text-sm font-medium text-gray-700 mb-3">Required Photos</h4>
              <ul className="space-y-2">
                {requiredPhotos.map((photo, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <span className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 ${photo.required ? "border-red-300 bg-red-50" : "border-gray-300 bg-gray-50"}`} />
                    <div>
                      <span className="font-medium">{photo.label}</span>
                      {photo.required && (
                        <span className="ml-1 text-xs text-red-600">(required)</span>
                      )}
                      {photo.description && (
                        <p className="text-gray-500 text-xs mt-0.5">{photo.description}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* GPS Radius */}
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Location Requirement</h4>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span className="w-3 h-3 rounded-full bg-green-500 flex-shrink-0" />
              <span>
                Must be within <strong>{gpsRadiusMeters}m</strong> of mission location
                {missionLatitude != null && missionLongitude != null && (
                  <span className="text-gray-400 ml-1">
                    ({missionLatitude.toFixed(4)}, {missionLongitude.toFixed(4)})
                  </span>
                )}
              </span>
            </div>
          </div>

          {/* Completion Criteria */}
          {completionCriteria.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-3">Completion Criteria</h4>
              <ul className="space-y-2">
                {completionCriteria.map((c, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    <span className={`mt-0.5 w-4 h-4 rounded border flex-shrink-0 ${c.required ? "border-blue-300 bg-blue-50" : "border-gray-300 bg-gray-50"}`} />
                    <div>
                      <span>{c.criterion}</span>
                      {c.required && (
                        <span className="ml-1 text-xs text-blue-600">(required)</span>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
