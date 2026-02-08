import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

/**
 * Few-shot examples for Layer B classifier
 * 7 examples total: 3 approve, 2 flag, 2 reject
 */
export const fewShotExamples: MessageParam[] = [
  // Example 1: Approve - Food Security (score 0.85)
  {
    role: "user",
    content: "Community food bank needs volunteers to distribute meals to families in need",
  },
  {
    role: "assistant",
    content: JSON.stringify({
      aligned_domain: "food_security",
      alignment_score: 0.85,
      harm_risk: "low",
      feasibility: "high",
      quality: "good - clear action and impact",
      decision: "approve",
      reasoning: "Clear food security initiative with direct community benefit. Well-defined action (distribute meals) with specific beneficiaries (families in need). Low harm risk, high feasibility.",
    }),
  },

  // Example 2: Approve - Education Access (score 0.92)
  {
    role: "user",
    content: "Free tutoring program for low-income students struggling with math and science",
  },
  {
    role: "assistant",
    content: JSON.stringify({
      aligned_domain: "education_access",
      alignment_score: 0.92,
      harm_risk: "low",
      feasibility: "high",
      quality: "excellent - specific subjects and target group",
      decision: "approve",
      reasoning: "Strong education access initiative targeting underserved students with specific subjects (math, science). Clear social good impact with low risk and high feasibility.",
    }),
  },

  // Example 3: Approve - Environmental Protection (score 0.88)
  {
    role: "user",
    content: "Weekly beach cleanup to remove plastic waste and protect marine life",
  },
  {
    role: "assistant",
    content: JSON.stringify({
      aligned_domain: "environmental_protection",
      alignment_score: 0.88,
      harm_risk: "low",
      feasibility: "high",
      quality: "good - recurring activity with clear goal",
      decision: "approve",
      reasoning: "Environmental protection initiative with concrete action (beach cleanup) and clear impact (protect marine life). Recurring nature (weekly) shows commitment. Low risk, high feasibility.",
    }),
  },

  // Example 4: Flag - Healthcare with Privacy Concerns (score 0.55)
  {
    role: "user",
    content: "Create database of community health records to track disease patterns",
  },
  {
    role: "assistant",
    content: JSON.stringify({
      aligned_domain: "healthcare_improvement",
      alignment_score: 0.55,
      harm_risk: "medium",
      feasibility: "medium",
      quality: "unclear - potential privacy concerns",
      decision: "flag",
      reasoning: "Healthcare tracking aligns with social good, but collecting health data raises privacy questions. The proposal lacks details about consent, anonymization, and data protection measures. Needs human review to determine if privacy safeguards are adequate.",
    }),
  },

  // Example 5: Flag - Surveillance-Adjacent Community Safety (score 0.45)
  {
    role: "user",
    content: "Track local crime patterns using neighborhood watch reports",
  },
  {
    role: "assistant",
    content: JSON.stringify({
      aligned_domain: "community_building",
      alignment_score: 0.45,
      harm_risk: "medium",
      feasibility: "medium",
      quality: "ambiguous - close to surveillance boundary",
      decision: "flag",
      reasoning: "Community safety is valid, but 'tracking crime patterns' is surveillance-adjacent. The line between legitimate neighborhood watch and privacy violation is unclear. Needs human review to assess if implementation would violate boundaries.",
    }),
  },

  // Example 6: Reject - Surveillance (score 0.15)
  {
    role: "user",
    content: "Install surveillance cameras to monitor all neighborhood entrances and exits",
  },
  {
    role: "assistant",
    content: JSON.stringify({
      aligned_domain: "community_building",
      alignment_score: 0.15,
      harm_risk: "high",
      feasibility: "medium",
      quality: "forbidden pattern detected",
      decision: "reject",
      reasoning: "Contains forbidden surveillance pattern. Monitoring people's movements violates privacy boundaries. Even if framed as community safety, this crosses into surveillance territory.",
    }),
  },

  // Example 7: Reject - Political Manipulation (score 0.10)
  {
    role: "user",
    content: "Organize campaign rally to elect our preferred candidate for city council",
  },
  {
    role: "assistant",
    content: JSON.stringify({
      aligned_domain: "human_rights",
      alignment_score: 0.10,
      harm_risk: "high",
      feasibility: "high",
      quality: "forbidden pattern detected",
      decision: "reject",
      reasoning: "Contains forbidden political campaign pattern. Platform prohibits political campaigns and partisan activities to maintain focus on social good initiatives.",
    }),
  },
];
