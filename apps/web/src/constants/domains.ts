/** Full display names for the 15 UN SDG-aligned domains (landing page showcase). */
export const domainDisplayNames = [
  "Poverty Reduction",
  "Education Access",
  "Healthcare Improvement",
  "Environmental Protection",
  "Food Security",
  "Mental Health & Wellbeing",
  "Community Building",
  "Disaster Response",
  "Digital Inclusion",
  "Human Rights",
  "Clean Water & Sanitation",
  "Sustainable Energy",
  "Gender Equality",
  "Biodiversity Conservation",
  "Elder Care",
] as const;

/** Short badge labels keyed by snake_case domain slug. */
export const domainLabels: Record<string, string> = {
  poverty_reduction: "Poverty Reduction",
  education_access: "Education Access",
  healthcare_improvement: "Healthcare",
  environmental_protection: "Environment",
  food_security: "Food Security",
  mental_health_wellbeing: "Mental Health",
  community_building: "Community",
  disaster_response: "Disaster Response",
  digital_inclusion: "Digital Inclusion",
  human_rights: "Human Rights",
  clean_water_sanitation: "Clean Water",
  sustainable_energy: "Sustainable Energy",
  gender_equality: "Gender Equality",
  biodiversity_conservation: "Biodiversity",
  elder_care: "Elder Care",
};
