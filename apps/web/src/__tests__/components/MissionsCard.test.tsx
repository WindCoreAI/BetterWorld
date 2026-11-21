/**
 * Dashboard missions card.
 *
 * The dashboard is where every sign-up lands. This card used to tell a new
 * person "Missions coming soon!" and always showed 0 active missions, so the
 * one thing a person can do here had no way in from their home screen.
 */
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MissionsCard } from "../../components/dashboard/DashboardCards";

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const none = { active: 0, completed: 0, streakDays: 0, inProgress: [] };

describe("MissionsCard", () => {
  it("sends a person who has not done orientation to it", () => {
    render(<MissionsCard missions={none} orientationCompleted={false} />);

    expect(screen.getByRole("link", { name: "Start Orientation" }).getAttribute("href")).toBe("/onboarding");
    expect(screen.queryByRole("link", { name: "Find a mission" })).toBeNull();
  });

  it("gives a new person a way to find their first mission", () => {
    render(<MissionsCard missions={none} orientationCompleted />);

    expect(screen.getByRole("link", { name: "Find a mission" }).getAttribute("href")).toBe("/missions");
    expect(screen.queryByText(/coming soon/i)).toBeNull();
  });

  it("lists missions in progress with the next step for each", () => {
    render(
      <MissionsCard
        orientationCompleted
        missions={{
          active: 2,
          completed: 3,
          streakDays: 4,
          inProgress: [
            {
              claimId: "c1",
              missionId: "m1",
              title: "Clear the storm drain",
              status: "active",
              deadlineAt: "2026-12-01T00:00:00Z",
              tokenReward: 10,
            },
            {
              claimId: "c2",
              missionId: "m2",
              title: "Photograph the broken streetlight",
              status: "submitted",
              deadlineAt: "2026-12-02T00:00:00Z",
              tokenReward: 15,
            },
          ],
        }}
      />,
    );

    const list = screen.getByRole("list", { name: "Your missions in progress" });
    const [owed, waiting] = within(list).getAllByRole("listitem");

    // Evidence still owed: link to the mission and straight to the upload page.
    expect(within(owed!).getByRole("link", { name: "Clear the storm drain" }).getAttribute("href")).toBe("/missions/m1");
    expect(within(owed!).getByRole("link", { name: "Submit evidence" }).getAttribute("href")).toBe("/missions/m1/submit");

    // Evidence sent: nothing more to do but wait, so no upload link.
    expect(within(waiting!).getByRole("link", { name: "Photograph the broken streetlight" }).getAttribute("href")).toBe(
      "/missions/m2",
    );
    expect(within(waiting!).getByText("Awaiting verification")).toBeTruthy();
    expect(within(waiting!).queryByRole("link", { name: "Submit evidence" })).toBeNull();

    expect(screen.getByRole("link", { name: "Find another mission" }).getAttribute("href")).toBe("/missions");
  });

  it("still renders counts when the API omits the in-progress list", () => {
    render(<MissionsCard orientationCompleted missions={{ active: 0, completed: 5, streakDays: 2 }} />);

    expect(screen.getByText("5")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Your missions in progress" })).toBeNull();
  });
});
