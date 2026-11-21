/**
 * MissionClaimButton Component Test (Sprint 15 — T056, FR-031)
 *
 * The button used to send the claim with no credentials, so every claim failed
 * with 401. These tests pin the behaviour that matters: a signed-in person's
 * claim carries their token, a signed-out person is sent to sign in (and
 * brought back), and failures are shown.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import MissionClaimButton from "../../components/missions/MissionClaimButton";

const mockFetch = vi.fn();
globalThis.fetch = mockFetch;

/** A structurally valid JWT that expires an hour from now (no refresh needed). */
function sessionToken(): string {
  const encode = (value: object) => btoa(JSON.stringify(value)).replace(/=+$/, "");
  return `${encode({ alg: "HS256" })}.${encode({ userId: "u1", exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;
}

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

describe("MissionClaimButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("shows that the mission is already claimed", () => {
    render(<MissionClaimButton missionId="m1" slotsAvailable={5} isClaimed />);
    expect(screen.getByText("Already Claimed")).toBeInTheDocument();
  });

  it("shows that no slots are left", () => {
    render(<MissionClaimButton missionId="m1" slotsAvailable={0} />);
    expect(screen.getByText("Fully Claimed")).toBeInTheDocument();
  });

  describe("signed out", () => {
    it("offers sign-in instead of a claim that cannot succeed", async () => {
      render(<MissionClaimButton missionId="m1" slotsAvailable={2} />);

      const signIn = await screen.findByRole("link", { name: "Sign in to claim this mission" });
      expect(signIn).toHaveAttribute("href", "/auth/human/login");
      expect(screen.getByRole("link", { name: "Create an account" })).toHaveAttribute("href", "/auth/human/register");
      expect(screen.queryByRole("button", { name: "Claim Mission" })).not.toBeInTheDocument();
    });

    it("remembers the mission so the person comes back to it after signing in", async () => {
      render(<MissionClaimButton missionId="m1" slotsAvailable={2} />);

      fireEvent.click(await screen.findByRole("link", { name: "Sign in to claim this mission" }));
      expect(sessionStorage.getItem("bw_return_to")).toBe("/missions/m1");
    });
  });

  describe("signed in", () => {
    beforeEach(() => {
      localStorage.setItem("bw_human_access_token", sessionToken());
    });

    it("sends the claim with the person's credentials", async () => {
      mockFetch.mockResolvedValue(jsonResponse(201, { ok: true, data: { claimId: "c1" } }));
      const onClaimed = vi.fn();
      render(<MissionClaimButton missionId="m1" slotsAvailable={2} onClaimed={onClaimed} />);

      fireEvent.click(await screen.findByRole("button", { name: "Claim Mission" }));

      await waitFor(() => expect(onClaimed).toHaveBeenCalledTimes(1));
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toMatch(/\/api\/v1\/missions\/m1\/claim$/);
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${localStorage.getItem("bw_human_access_token")}`);
    });

    it("shows a loading state while the claim is in flight", async () => {
      mockFetch.mockImplementation(() => new Promise(() => {})); // never resolves
      render(<MissionClaimButton missionId="m1" slotsAvailable={2} />);

      fireEvent.click(await screen.findByRole("button", { name: "Claim Mission" }));

      const busy = await screen.findByRole("button", { name: "Claiming..." });
      expect(busy).toBeDisabled();
    });

    it("shows the server's reason when a claim is refused, and does not report success", async () => {
      mockFetch.mockResolvedValue(
        jsonResponse(403, { ok: false, error: { code: "FORBIDDEN", message: "Maximum 3 active missions reached" } }),
      );
      const onClaimed = vi.fn();
      render(<MissionClaimButton missionId="m1" slotsAvailable={2} onClaimed={onClaimed} />);

      fireEvent.click(await screen.findByRole("button", { name: "Claim Mission" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Maximum 3 active missions reached");
      expect(onClaimed).not.toHaveBeenCalled();
    });

    it("shows a message when the server cannot be reached", async () => {
      mockFetch.mockRejectedValue(new TypeError("Failed to fetch"));
      render(<MissionClaimButton missionId="m1" slotsAvailable={2} />);

      fireEvent.click(await screen.findByRole("button", { name: "Claim Mission" }));

      expect(await screen.findByRole("alert")).toHaveTextContent(/unable to connect/i);
    });
  });
});
