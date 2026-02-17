/**
 * Sprint 18 Frontend Component Tests
 *
 * Tests rendering and basic interactions for cooperative depth components.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WelcomeCard } from "../components/ambassadors/WelcomeCard";
import { BuddyStatus } from "../components/buddies/BuddyStatus";
import { RewardSplit } from "../components/buddies/RewardSplit";
import { CaseStudyCard } from "../components/case-studies/CaseStudyCard";
import { PersonCard } from "../components/discover/PersonCard";
import { FeedItem } from "../components/feed/FeedItem";
import { NetworkHealth } from "../components/governance/NetworkHealth";

describe("BuddyStatus", () => {
  it("renders buddy name and status", () => {
    render(<BuddyStatus status="accepted" buddyName="Alice" />);
    expect(screen.getByText("Alice")).toBeDefined();
    expect(screen.getByText("Active")).toBeDefined();
  });

  it("renders pending status", () => {
    render(<BuddyStatus status="pending" buddyName="Bob" />);
    expect(screen.getByText("Pending")).toBeDefined();
  });
});

describe("RewardSplit", () => {
  it("renders solo split", () => {
    render(<RewardSplit totalReward={10} hasBuddy={false} hasHelper={false} />);
    expect(screen.getByText("10 tokens")).toBeDefined();
    expect(screen.getByText(/100%/)).toBeDefined();
  });

  it("renders buddy split", () => {
    render(<RewardSplit totalReward={10} hasBuddy={true} hasHelper={false} />);
    expect(screen.getByText(/60%/)).toBeDefined();
    expect(screen.getByText(/40%/)).toBeDefined();
  });

  it("renders helper split", () => {
    render(<RewardSplit totalReward={100} hasBuddy={false} hasHelper={true} />);
    expect(screen.getByText(/75%/)).toBeDefined();
    expect(screen.getByText(/25%/)).toBeDefined();
  });
});

describe("CaseStudyCard", () => {
  it("renders title and domain", () => {
    render(
      <CaseStudyCard
        id="cs-1"
        title="Clean Water Initiative"
        domain="clean_water_sanitation"
        summary="A summary of the initiative"
        readCount={42}
      />,
    );
    expect(screen.getByText("Clean Water Initiative")).toBeDefined();
    expect(screen.getByText("42 reads")).toBeDefined();
  });
});

describe("FeedItem", () => {
  it("renders event with actor name", () => {
    render(
      <FeedItem
        item={{
          id: "feed-1",
          eventType: "mission_claimed",
          actorName: "Charlie",
          targetType: "mission",
          domain: "education_access",
          city: "Portland",
          createdAt: new Date().toISOString(),
        }}
      />,
    );
    expect(screen.getByText("Charlie")).toBeDefined();
    expect(screen.getByText("claimed a mission")).toBeDefined();
  });
});

describe("NetworkHealth", () => {
  it("renders all metrics", () => {
    render(
      <NetworkHealth
        data={{
          connectionDensity: 0.05,
          totalConnections: 100,
          totalParticipants: 500,
          totalFollows: 200,
          citiesConnected: 3,
          reciprocityRate: 0.5,
        }}
      />,
    );
    expect(screen.getByText("Network Health")).toBeDefined();
    expect(screen.getByText("100")).toBeDefined();
    expect(screen.getByText("500")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
  });
});

describe("PersonCard", () => {
  it("renders person info", () => {
    render(
      <PersonCard
        person={{
          id: "p-1",
          displayName: "Diana",
          avatarUrl: null,
          city: "Chicago",
          primaryDomain: "education_access",
          tier: "advocate",
          totalMissionsCompleted: 10,
          reasons: ["Same domain", "Same city"],
        }}
      />,
    );
    expect(screen.getByText("Diana")).toBeDefined();
    expect(screen.getByText("Chicago")).toBeDefined();
    expect(screen.getByText("advocate")).toBeDefined();
    expect(screen.getByText("Same domain")).toBeDefined();
  });
});

describe("WelcomeCard", () => {
  it("renders ambassador stats", () => {
    render(
      <WelcomeCard
        ambassadorName="Eve"
        totalWelcomes={12}
        monthlyTokensEarned={3}
        monthlyLimit={5}
      />,
    );
    expect(screen.getByText(/Eve/)).toBeDefined();
    expect(screen.getByText("12")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText("2")).toBeDefined(); // 5 - 3 remaining
  });
});
