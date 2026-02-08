// Approved domains constants - matches config/domains.yaml and database enum

export const APPROVED_DOMAINS = [
  "poverty_reduction",
  "education_access",
  "healthcare_improvement",
  "environmental_protection",
  "food_security",
  "mental_health_wellbeing",
  "community_building",
  "disaster_response",
  "digital_inclusion",
  "human_rights",
  "clean_water_sanitation",
  "sustainable_energy",
  "gender_equality",
  "biodiversity_conservation",
  "elder_care",
] as const;

export type ApprovedDomainKey = (typeof APPROVED_DOMAINS)[number];

export const APPROVED_DOMAIN_NAMES: Record<ApprovedDomainKey, string> = {
  poverty_reduction: "Poverty Reduction",
  education_access: "Education Access",
  healthcare_improvement: "Healthcare Improvement",
  environmental_protection: "Environmental Protection",
  food_security: "Food Security",
  mental_health_wellbeing: "Mental Health & Wellbeing",
  community_building: "Community Building",
  disaster_response: "Disaster Response",
  digital_inclusion: "Digital Inclusion",
  human_rights: "Human Rights",
  clean_water_sanitation: "Clean Water & Sanitation",
  sustainable_energy: "Sustainable Energy",
  gender_equality: "Gender Equality",
  biodiversity_conservation: "Biodiversity Conservation",
  elder_care: "Elder Care",
};

export const APPROVED_DOMAIN_DESCRIPTIONS: Record<ApprovedDomainKey, string> = {
  poverty_reduction: "Initiatives that reduce economic hardship and improve access to basic needs",
  education_access: "Programs that increase access to quality education for underserved communities",
  healthcare_improvement: "Initiatives that improve healthcare access and outcomes",
  environmental_protection: "Projects that protect ecosystems and combat climate change",
  food_security: "Programs ensuring access to nutritious food",
  mental_health_wellbeing: "Support for mental health and emotional wellness",
  community_building: "Initiatives that strengthen social connections and neighborhoods",
  disaster_response: "Emergency aid and disaster recovery efforts",
  digital_inclusion: "Bridging the digital divide and increasing tech access",
  human_rights: "Protecting and advancing fundamental human rights",
  clean_water_sanitation: "Ensuring access to safe water and sanitation",
  sustainable_energy: "Promoting renewable energy and energy efficiency",
  gender_equality: "Advancing gender equality and women's empowerment",
  biodiversity_conservation: "Protecting wildlife and natural habitats",
  elder_care: "Supporting the health and dignity of older adults",
};

// UN SDG alignment mapping
export const APPROVED_DOMAIN_SDG_MAPPING: Record<ApprovedDomainKey, number[]> = {
  poverty_reduction: [1, 10],
  education_access: [4],
  healthcare_improvement: [3],
  environmental_protection: [13, 15],
  food_security: [2],
  mental_health_wellbeing: [3],
  community_building: [11],
  disaster_response: [11],
  digital_inclusion: [9],
  human_rights: [16],
  clean_water_sanitation: [6],
  sustainable_energy: [7],
  gender_equality: [5],
  biodiversity_conservation: [14, 15],
  elder_care: [3],
};
