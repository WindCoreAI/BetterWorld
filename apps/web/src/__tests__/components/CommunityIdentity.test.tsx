/**
 * Community Identity Components Tests (Sprint 17: Community Identity & Visible Growth)
 *
 * Tests critical Sprint 17 UI components:
 * - DomainCard (display, metrics, milestone progress bar, link)
 * - FeedbackList (empty state, items render, mark-read callback, type labels)
 * - ReputationTrend (empty state, bar chart, delta calculation)
 * - MilestoneBanner (celebration display, days remaining)
 */
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { describe, it, expect, vi } from "vitest";

// Mock next/link
vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href} data-testid="next-link">{children}</a>
  ),
}));

// ── DomainCard Tests ────────────────────────────────────────

describe("DomainCard", () => {
  it("renders domain name and metrics", async () => {
    const { DomainCard } = await import("../../components/domains/DomainCard");

    render(
      <DomainCard
        slug="education_access"
        displayName="Education Access"
        memberCount={42}
        missionsCompleted={15}
        problemsResolved={8}
        activeMilestone={null}
      />,
    );

    expect(screen.getByText("Education Access")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
  });

  it("renders milestone progress bar when activeMilestone present", async () => {
    const { DomainCard } = await import("../../components/domains/DomainCard");

    render(
      <DomainCard
        slug="clean_water_sanitation"
        displayName="Clean Water"
        memberCount={20}
        missionsCompleted={10}
        problemsResolved={5}
        activeMilestone={{ type: "missions_completed", target: 50, current: 25 }}
      />,
    );

    expect(screen.getByText("missions completed")).toBeInTheDocument();
    expect(screen.getByText("25/50")).toBeInTheDocument();
  });

  it("does not render milestone section when activeMilestone is null", async () => {
    const { DomainCard } = await import("../../components/domains/DomainCard");

    render(
      <DomainCard
        slug="poverty_reduction"
        displayName="Poverty Reduction"
        memberCount={10}
        missionsCompleted={3}
        problemsResolved={2}
        activeMilestone={null}
      />,
    );

    expect(screen.queryByText(/\//)).toBeNull(); // No "current/target" text
  });

  it("links to the domain community page", async () => {
    const { DomainCard } = await import("../../components/domains/DomainCard");

    render(
      <DomainCard
        slug="education_access"
        displayName="Education Access"
        memberCount={1}
        missionsCompleted={0}
        problemsResolved={0}
        activeMilestone={null}
      />,
    );

    const link = screen.getByTestId("next-link");
    expect(link).toHaveAttribute("href", "/domains/education_access");
  });
});

// ── FeedbackList Tests ──────────────────────────────────────

describe("FeedbackList", () => {
  it("renders empty state message when no items", async () => {
    const { FeedbackList } = await import("../../components/feedback/FeedbackList");

    render(<FeedbackList items={[]} />);

    expect(screen.getByText(/No feedback yet/)).toBeInTheDocument();
  });

  it("renders feedback items with correct type labels", async () => {
    const { FeedbackList } = await import("../../components/feedback/FeedbackList");

    const items = [
      {
        id: "fb-1",
        feedbackType: "high_performer_recognition",
        message: "Excellent work on your submission!",
        improvementTips: null,
        referenceId: "ev-1",
        referenceType: "evidence",
        isRead: false,
        createdAt: "2026-02-15T10:00:00.000Z",
      },
      {
        id: "fb-2",
        feedbackType: "evidence_rejection",
        message: "Your submission needs improvement.",
        improvementTips: ["Be more specific", "Include photos"],
        referenceId: "ev-2",
        referenceType: "evidence",
        isRead: true,
        createdAt: "2026-02-14T10:00:00.000Z",
      },
    ];

    render(<FeedbackList items={items} />);

    expect(screen.getByText("Recognition")).toBeInTheDocument();
    expect(screen.getByText("Evidence Feedback")).toBeInTheDocument();
    expect(screen.getByText("Excellent work on your submission!")).toBeInTheDocument();
    expect(screen.getByText("Your submission needs improvement.")).toBeInTheDocument();
    expect(screen.getByText("Be more specific")).toBeInTheDocument();
    expect(screen.getByText("Include photos")).toBeInTheDocument();
  });

  it("calls onMarkRead when unread item is clicked", async () => {
    const { FeedbackList } = await import("../../components/feedback/FeedbackList");

    const onMarkRead = vi.fn();
    const items = [
      {
        id: "fb-1",
        feedbackType: "high_performer_recognition",
        message: "Great job!",
        improvementTips: null,
        referenceId: "ev-1",
        referenceType: "evidence",
        isRead: false,
        createdAt: "2026-02-15T10:00:00.000Z",
      },
    ];

    render(<FeedbackList items={items} onMarkRead={onMarkRead} />);

    const message = screen.getByText("Great job!");
    fireEvent.click(message.closest("[class*='cursor-pointer']")!);

    expect(onMarkRead).toHaveBeenCalledWith("fb-1");
  });

  it("does not call onMarkRead when already-read item is clicked", async () => {
    const { FeedbackList } = await import("../../components/feedback/FeedbackList");

    const onMarkRead = vi.fn();
    const items = [
      {
        id: "fb-1",
        feedbackType: "high_performer_recognition",
        message: "Great job!",
        improvementTips: null,
        referenceId: "ev-1",
        referenceType: "evidence",
        isRead: true,
        createdAt: "2026-02-15T10:00:00.000Z",
      },
    ];

    render(<FeedbackList items={items} onMarkRead={onMarkRead} />);

    const message = screen.getByText("Great job!");
    fireEvent.click(message.closest("[class*='cursor-pointer']")!);

    expect(onMarkRead).not.toHaveBeenCalled();
  });
});

// ── ReputationTrend Tests ───────────────────────────────────

describe("ReputationTrend", () => {
  it("renders empty state when no trend data", async () => {
    const { ReputationTrend } = await import("../../components/growth/ReputationTrend");

    render(<ReputationTrend trend={[]} />);

    expect(screen.getByText(/Not enough data yet/)).toBeInTheDocument();
  });

  it("renders trend bars and delta for positive growth", async () => {
    const { ReputationTrend } = await import("../../components/growth/ReputationTrend");

    const trend = [
      { date: "2026-01-01", score: 100, tier: "newcomer" },
      { date: "2026-01-15", score: 200, tier: "contributor" },
      { date: "2026-02-01", score: 350, tier: "contributor" },
    ];

    render(<ReputationTrend trend={trend} />);

    expect(screen.getByText("Reputation Trend (90 days)")).toBeInTheDocument();
    expect(screen.getByText("+250 pts")).toBeInTheDocument();
    expect(screen.getByText("2026-01-01")).toBeInTheDocument();
    expect(screen.getByText("2026-02-01")).toBeInTheDocument();
  });

  it("renders negative delta for declining reputation", async () => {
    const { ReputationTrend } = await import("../../components/growth/ReputationTrend");

    const trend = [
      { date: "2026-01-01", score: 300, tier: "contributor" },
      { date: "2026-02-01", score: 250, tier: "contributor" },
    ];

    render(<ReputationTrend trend={trend} />);

    expect(screen.getByText("-50 pts")).toBeInTheDocument();
  });
});

// ── MilestoneBanner Tests ───────────────────────────────────

describe("MilestoneBanner", () => {
  it("renders milestone celebration banners", async () => {
    const { MilestoneBanner } = await import("../../components/milestones/MilestoneBanner");

    const now = new Date();
    const future = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const milestones = [
      {
        id: "m-1",
        milestoneType: "missions_completed",
        targetValue: 50,
        currentValue: 50,
        reachedAt: now.toISOString(),
        bannerExpiresAt: future.toISOString(),
      },
    ];

    render(<MilestoneBanner milestones={milestones} />);

    expect(screen.getByText(/missions completed/i)).toBeInTheDocument();
  });

  it("renders nothing when no milestones", async () => {
    const { MilestoneBanner } = await import("../../components/milestones/MilestoneBanner");

    const { container } = render(<MilestoneBanner milestones={[]} />);

    // Should render empty or minimal markup
    expect(container.textContent?.trim()).toBe("");
  });
});
