/**
 * MissionClaimButton Component Test (Sprint 15 — T056, FR-031)
 *
 * Tests loading state, success state, and error state display.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fetch
const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

describe("MissionClaimButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render Claim Mission button when slots available", async () => {
    const MissionClaimButton = (await import("../../components/missions/MissionClaimButton")).default;
    render(<MissionClaimButton missionId="test-id" slotsAvailable={5} />);

    expect(screen.getByText("Claim Mission")).toBeDefined();
  });

  it("should render Already Claimed when isClaimed is true", async () => {
    const MissionClaimButton = (await import("../../components/missions/MissionClaimButton")).default;
    render(<MissionClaimButton missionId="test-id" slotsAvailable={5} isClaimed={true} />);

    expect(screen.getByText("Already Claimed")).toBeDefined();
  });

  it("should render Fully Claimed when no slots available", async () => {
    const MissionClaimButton = (await import("../../components/missions/MissionClaimButton")).default;
    render(<MissionClaimButton missionId="test-id" slotsAvailable={0} />);

    expect(screen.getByText("Fully Claimed")).toBeDefined();
  });

  it("should show loading state when claiming", async () => {
    mockFetch.mockImplementation(() => new Promise(() => {})); // Never resolves
    const MissionClaimButton = (await import("../../components/missions/MissionClaimButton")).default;
    render(<MissionClaimButton missionId="test-id" slotsAvailable={5} />);

    const button = screen.getByText("Claim Mission");
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText("Claiming...")).toBeDefined();
    });
  });

  it("should display error on failed claim", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 409,
      json: () => Promise.resolve({ error: { message: "Mission is fully claimed" } }),
    });

    const MissionClaimButton = (await import("../../components/missions/MissionClaimButton")).default;
    render(<MissionClaimButton missionId="test-id" slotsAvailable={5} />);

    const button = screen.getByText("Claim Mission");
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText("Mission is fully claimed")).toBeDefined();
    });
  });
});
