import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted so mockCreate is available when vi.mock factory runs (hoisted above imports)
const { mockCreate } = vi.hoisted(() => ({
  mockCreate: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: mockCreate,
    },
  })),
}));

import { evaluateLayerB } from "../../src/layer-b/classifier";

describe("Layer B: LLM Classifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("Valid Content Classification", () => {
    it("should classify food security content with high score", async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              aligned_domain: "food_security",
              alignment_score: 0.85,
              harm_risk: "low",
              feasibility: "high",
              quality: "good",
              decision: "approve",
              reasoning: "Clear food security initiative",
            }),
          },
        ],
      });

      const result = await evaluateLayerB("Community food bank needs volunteers");

      expect(result.alignedDomain).toBe("food_security");
      expect(result.alignmentScore).toBeGreaterThanOrEqual(0.7);
      expect(result.decision).toBe("approve");
      expect(result.harmRisk).toBe("low");
    });

    it("should classify education content", async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              aligned_domain: "education_access",
              alignment_score: 0.92,
              harm_risk: "low",
              feasibility: "high",
              quality: "excellent",
              decision: "approve",
              reasoning: "Strong education initiative",
            }),
          },
        ],
      });

      const result = await evaluateLayerB("Free tutoring for low-income students");

      expect(result.alignedDomain).toBe("education_access");
      expect(result.alignmentScore).toBeGreaterThanOrEqual(0.7);
      expect(result.decision).toBe("approve");
    });
  });

  describe("Ambiguous Content (Flagging)", () => {
    it("should flag content with privacy concerns", async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              aligned_domain: "healthcare_improvement",
              alignment_score: 0.55,
              harm_risk: "medium",
              feasibility: "medium",
              quality: "unclear - privacy concerns",
              decision: "flag",
              reasoning: "Healthcare tracking raises privacy questions",
            }),
          },
        ],
      });

      const result = await evaluateLayerB("Create database of community health records");

      expect(result.alignmentScore).toBeGreaterThanOrEqual(0.4);
      expect(result.alignmentScore).toBeLessThan(0.7);
      expect(result.decision).toBe("flag");
      expect(result.harmRisk).toBe("medium");
    });
  });

  describe("Harmful Content (Rejection)", () => {
    it("should reject surveillance content with low score", async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              aligned_domain: "community_building",
              alignment_score: 0.15,
              harm_risk: "high",
              feasibility: "medium",
              quality: "forbidden pattern detected",
              decision: "reject",
              reasoning: "Contains forbidden surveillance pattern",
            }),
          },
        ],
      });

      const result = await evaluateLayerB("Install surveillance cameras to monitor neighborhood");

      expect(result.alignmentScore).toBeLessThan(0.4);
      expect(result.decision).toBe("reject");
      expect(result.harmRisk).toBe("high");
    });

    it("should reject political campaign content", async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              aligned_domain: "human_rights",
              alignment_score: 0.10,
              harm_risk: "high",
              feasibility: "high",
              quality: "forbidden pattern detected",
              decision: "reject",
              reasoning: "Contains forbidden political campaign pattern",
            }),
          },
        ],
      });

      const result = await evaluateLayerB("Organize campaign rally for candidate");

      expect(result.alignmentScore).toBeLessThan(0.4);
      expect(result.decision).toBe("reject");
    });
  });

  describe("Response Validation", () => {
    it("should parse valid JSON response", async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              aligned_domain: "environmental_protection",
              alignment_score: 0.80,
              harm_risk: "low",
              feasibility: "high",
              quality: "good",
              decision: "approve",
              reasoning: "Clear environmental initiative",
            }),
          },
        ],
      });

      const result = await evaluateLayerB("Beach cleanup event");

      expect(result).toHaveProperty("alignedDomain");
      expect(result).toHaveProperty("alignmentScore");
      expect(result).toHaveProperty("harmRisk");
      expect(result).toHaveProperty("feasibility");
      expect(result).toHaveProperty("quality");
      expect(result).toHaveProperty("decision");
      expect(result).toHaveProperty("reasoning");
    });

    it("should throw error for invalid JSON", async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: "Invalid JSON response",
          },
        ],
      });

      await expect(evaluateLayerB("Test content")).rejects.toThrow();
    });

    it("should throw error for invalid score range", async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              aligned_domain: "food_security",
              alignment_score: 1.5, // Invalid: > 1.0
              harm_risk: "low",
              feasibility: "high",
              quality: "good",
              decision: "approve",
              reasoning: "Test",
            }),
          },
        ],
      });

      await expect(evaluateLayerB("Test content")).rejects.toThrow("Invalid alignment score");
    });
  });

  describe("Score Range Validation", () => {
    it("should accept scores in 0.0-1.0 range", async () => {
      const testScores = [0.0, 0.3, 0.5, 0.7, 0.9, 1.0];

      for (const score of testScores) {
        mockCreate.mockResolvedValue({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                aligned_domain: "food_security",
                alignment_score: score,
                harm_risk: "low",
                feasibility: "high",
                quality: "test",
                decision: "approve",
                reasoning: "test",
              }),
            },
          ],
        });

        const result = await evaluateLayerB("Test");
        expect(result.alignmentScore).toBe(score);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // T039: Harmful content detection (score <0.4 -> reject)
  // ---------------------------------------------------------------------------
  describe("T039: Harmful Content Detection", () => {
    it.each([
      {
        label: "mass surveillance infrastructure",
        content: "Build a city-wide facial recognition network to track all residents",
        domain: "community_building",
        score: 0.08,
        reasoning:
          "Proposes mass surveillance infrastructure that violates privacy rights and enables authoritarian monitoring of civilians.",
      },
      {
        label: "autonomous weapons development",
        content: "Develop autonomous drones that can identify and neutralize targets without human approval",
        domain: "peace_justice",
        score: 0.05,
        reasoning:
          "Autonomous weapons violate international humanitarian law principles requiring human control over lethal force decisions.",
      },
      {
        label: "political manipulation campaign",
        content: "Create deepfake videos of opposition candidates to spread on social media before elections",
        domain: "human_rights",
        score: 0.02,
        reasoning:
          "Deepfake political content constitutes election interference and undermines democratic processes.",
      },
      {
        label: "environmental sabotage disguised as activism",
        content: "Sabotage oil pipelines and industrial facilities to force companies to shut down",
        domain: "environmental_protection",
        score: 0.12,
        reasoning:
          "Sabotage poses severe safety and environmental risks; constitutes criminal destruction of property.",
      },
      {
        label: "exploitative labor scheme",
        content: "Recruit workers from developing countries with promises of pay but confiscate passports on arrival",
        domain: "economic_empowerment",
        score: 0.03,
        reasoning:
          "Describes forced labor and human trafficking patterns that are severe human rights violations.",
      },
      {
        label: "health misinformation campaign",
        content: "Distribute pamphlets claiming vaccines cause autism to discourage childhood immunization",
        domain: "healthcare_improvement",
        score: 0.1,
        reasoning:
          "Promotes debunked health misinformation that directly endangers public health, especially children.",
      },
      {
        label: "financial fraud scheme",
        content: "Set up a charity front to collect donations and redirect funds to personal accounts",
        domain: "economic_empowerment",
        score: 0.04,
        reasoning:
          "Describes charity fraud which is a criminal offense and erodes public trust in legitimate organizations.",
      },
      {
        label: "discriminatory profiling system",
        content: "Build an AI system to screen job applicants and automatically reject those from certain ethnic backgrounds",
        domain: "education_access",
        score: 0.06,
        reasoning:
          "Automated ethnic discrimination violates civil rights laws and perpetuates systemic racism.",
      },
      {
        label: "cyberbullying platform",
        content: "Create an anonymous platform specifically designed to post embarrassing content about classmates",
        domain: "community_building",
        score: 0.07,
        reasoning:
          "Platform designed for targeted harassment causes psychological harm and violates anti-bullying principles.",
      },
      {
        label: "illegal resource extraction",
        content: "Organize illegal logging operations in protected rainforest areas and sell timber on black market",
        domain: "environmental_protection",
        score: 0.09,
        reasoning:
          "Illegal deforestation of protected areas destroys biodiversity and violates environmental protection laws.",
      },
    ])(
      "should reject $label (score $score)",
      async ({ content, domain, score, reasoning }) => {
        mockCreate.mockResolvedValue({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                aligned_domain: domain,
                alignment_score: score,
                harm_risk: "high",
                feasibility: "medium",
                quality: "forbidden pattern detected",
                decision: "reject",
                reasoning,
              }),
            },
          ],
        });

        const result = await evaluateLayerB(content);

        expect(result.decision).toBe("reject");
        expect(result.alignmentScore).toBeLessThan(0.4);
        expect(result.harmRisk).toBe("high");
        expect(result.reasoning).toBeTruthy();
        expect(result.reasoning.length).toBeGreaterThan(10);
      },
    );

    it("should include all required fields in rejection response", async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              aligned_domain: "peace_justice",
              alignment_score: 0.11,
              harm_risk: "high",
              feasibility: "low",
              quality: "forbidden pattern detected",
              decision: "reject",
              reasoning: "Content promotes weapons proliferation which is a severe threat to peace and justice.",
            }),
          },
        ],
      });

      const result = await evaluateLayerB("Distribute 3D-printed weapon blueprints to bypass gun control laws");

      expect(result).toEqual({
        alignedDomain: "peace_justice",
        alignmentScore: 0.11,
        harmRisk: "high",
        feasibility: "low",
        quality: "forbidden pattern detected",
        decision: "reject",
        reasoning: "Content promotes weapons proliferation which is a severe threat to peace and justice.",
      });
    });
  });

  // ---------------------------------------------------------------------------
  // T040: Boundary case tests
  // ---------------------------------------------------------------------------
  describe("T040: Boundary Cases", () => {
    describe("Score boundary thresholds", () => {
      it.each([
        {
          score: 0.0,
          expectedDecision: "reject" as const,
          harmRisk: "high" as const,
          label: "minimum score 0.0 (reject)",
        },
        {
          score: 0.39,
          expectedDecision: "reject" as const,
          harmRisk: "high" as const,
          label: "just below reject threshold 0.39 (reject)",
        },
        {
          score: 0.4,
          expectedDecision: "flag" as const,
          harmRisk: "medium" as const,
          label: "exact reject/flag boundary 0.40 (flag)",
        },
        {
          score: 0.41,
          expectedDecision: "flag" as const,
          harmRisk: "medium" as const,
          label: "just above reject threshold 0.41 (flag)",
        },
        {
          score: 0.69,
          expectedDecision: "flag" as const,
          harmRisk: "medium" as const,
          label: "just below approve threshold 0.69 (flag)",
        },
        {
          score: 0.7,
          expectedDecision: "approve" as const,
          harmRisk: "low" as const,
          label: "exact flag/approve boundary 0.70 (approve)",
        },
        {
          score: 0.71,
          expectedDecision: "approve" as const,
          harmRisk: "low" as const,
          label: "just above approve threshold 0.71 (approve)",
        },
        {
          score: 1.0,
          expectedDecision: "approve" as const,
          harmRisk: "low" as const,
          label: "maximum score 1.0 (approve)",
        },
      ])(
        "should handle $label",
        async ({ score, expectedDecision, harmRisk }) => {
          mockCreate.mockResolvedValue({
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  aligned_domain: "food_security",
                  alignment_score: score,
                  harm_risk: harmRisk,
                  feasibility: "medium",
                  quality: "test boundary",
                  decision: expectedDecision,
                  reasoning: `Boundary test at score ${score}`,
                }),
              },
            ],
          });

          const result = await evaluateLayerB("Boundary test content");

          expect(result.alignmentScore).toBe(score);
          expect(result.decision).toBe(expectedDecision);
          expect(result.harmRisk).toBe(harmRisk);
        },
      );
    });

    it("should handle surveillance-adjacent content flagged for review (score ~0.5)", async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              aligned_domain: "community_building",
              alignment_score: 0.5,
              harm_risk: "medium",
              feasibility: "high",
              quality: "needs review - surveillance adjacent",
              decision: "flag",
              reasoning:
                "Community safety cameras in public parks could improve safety but raise surveillance concerns. Intent appears benign but implementation requires privacy safeguards.",
            }),
          },
        ],
      });

      const result = await evaluateLayerB(
        "Install community safety cameras in public parks to reduce crime",
      );

      expect(result.decision).toBe("flag");
      expect(result.alignmentScore).toBe(0.5);
      expect(result.alignmentScore).toBeGreaterThanOrEqual(0.4);
      expect(result.alignmentScore).toBeLessThan(0.7);
      expect(result.harmRisk).toBe("medium");
      expect(result.reasoning).toContain("surveillance");
    });

    it("should handle legitimate civic engagement that is political-adjacent (score ~0.6)", async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              aligned_domain: "human_rights",
              alignment_score: 0.6,
              harm_risk: "medium",
              feasibility: "high",
              quality: "needs review - political adjacent",
              decision: "flag",
              reasoning:
                "Voter registration drives are legitimate civic engagement but proximity to political processes requires human review to ensure non-partisan intent.",
            }),
          },
        ],
      });

      const result = await evaluateLayerB(
        "Organize voter registration drives in underserved communities",
      );

      expect(result.decision).toBe("flag");
      expect(result.alignmentScore).toBe(0.6);
      expect(result.alignmentScore).toBeGreaterThanOrEqual(0.4);
      expect(result.alignmentScore).toBeLessThan(0.7);
      expect(result.harmRisk).toBe("medium");
      expect(result.alignedDomain).toBe("human_rights");
    });

    it("should reject subtle harm content with hidden agenda (score ~0.3)", async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              aligned_domain: "education_access",
              alignment_score: 0.3,
              harm_risk: "high",
              feasibility: "high",
              quality: "deceptive framing detected",
              decision: "reject",
              reasoning:
                "Content frames data harvesting of minors as an educational tool. The true purpose is to collect personal information from children for commercial exploitation.",
            }),
          },
        ],
      });

      const result = await evaluateLayerB(
        "Create a free educational app for children that collects detailed behavioral and location data for research",
      );

      expect(result.decision).toBe("reject");
      expect(result.alignmentScore).toBe(0.3);
      expect(result.alignmentScore).toBeLessThan(0.4);
      expect(result.harmRisk).toBe("high");
      expect(result.quality).toContain("deceptive");
    });

    it("should handle content spanning multiple domains", async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              aligned_domain: "food_security",
              alignment_score: 0.88,
              harm_risk: "low",
              feasibility: "high",
              quality: "excellent - multi-domain impact",
              decision: "approve",
              reasoning:
                "Community garden initiative addresses food security through local food production while also providing education access through gardening workshops. Primary domain is food security.",
            }),
          },
        ],
      });

      const result = await evaluateLayerB(
        "Start community gardens in schools that teach sustainable agriculture while providing fresh produce to food banks",
      );

      expect(result.decision).toBe("approve");
      expect(result.alignmentScore).toBe(0.88);
      expect(result.alignmentScore).toBeGreaterThanOrEqual(0.7);
      expect(result.harmRisk).toBe("low");
      expect(result.alignedDomain).toBe("food_security");
      expect(result.quality).toContain("multi-domain");
    });

    it("should throw for negative alignment score", async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              aligned_domain: "food_security",
              alignment_score: -0.1,
              harm_risk: "high",
              feasibility: "low",
              quality: "invalid",
              decision: "reject",
              reasoning: "Negative score test",
            }),
          },
        ],
      });

      await expect(evaluateLayerB("Test negative score")).rejects.toThrow(
        "Invalid alignment score",
      );
    });

    it("should throw for score exceeding 1.0", async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              aligned_domain: "food_security",
              alignment_score: 1.01,
              harm_risk: "low",
              feasibility: "high",
              quality: "good",
              decision: "approve",
              reasoning: "Score over 1.0 test",
            }),
          },
        ],
      });

      await expect(evaluateLayerB("Test over-range score")).rejects.toThrow(
        "Invalid alignment score",
      );
    });

    it("should include all required response fields for every decision type", async () => {
      const requiredFields = [
        "alignedDomain",
        "alignmentScore",
        "harmRisk",
        "feasibility",
        "quality",
        "decision",
        "reasoning",
      ] as const;

      const decisions = [
        { decision: "approve", score: 0.85, harmRisk: "low" },
        { decision: "flag", score: 0.55, harmRisk: "medium" },
        { decision: "reject", score: 0.15, harmRisk: "high" },
      ];

      for (const { decision, score, harmRisk } of decisions) {
        mockCreate.mockResolvedValue({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                aligned_domain: "food_security",
                alignment_score: score,
                harm_risk: harmRisk,
                feasibility: "medium",
                quality: "test",
                decision,
                reasoning: `Required fields test for ${decision}`,
              }),
            },
          ],
        });

        const result = await evaluateLayerB(`Fields test: ${decision}`);

        for (const field of requiredFields) {
          expect(result).toHaveProperty(field);
          expect(result[field]).toBeDefined();
        }
      }
    });

    it("should throw when LLM response is missing a required field", async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              aligned_domain: "food_security",
              alignment_score: 0.8,
              harm_risk: "low",
              // missing: feasibility
              quality: "good",
              decision: "approve",
              reasoning: "Missing feasibility field",
            }),
          },
        ],
      });

      await expect(evaluateLayerB("Missing field test")).rejects.toThrow(
        "Invalid response structure",
      );
    });
  });
});
