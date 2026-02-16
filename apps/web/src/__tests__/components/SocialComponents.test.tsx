/**
 * Social Components Tests (Sprint 16: Social Fabric Foundation)
 *
 * Tests critical social UI components:
 * - FollowButton (follow/unfollow toggle, 200-limit error)
 * - ConnectButton (state transitions: none/pending/accepted)
 * - NotificationBell (unread count badge, dropdown)
 * - CheerButton (gift toggle, insufficient balance)
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, fireEvent } from "@testing-library/react";
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Shared test utilities ─────────────────────────────────

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = createQueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

// ── FollowButton Tests ──────────────────────────────────

// Mock the useFollows hook
const mockFollow = vi.fn();
const mockUnfollow = vi.fn();

vi.mock("../../hooks/useFollows", () => ({
  useFollows: vi.fn(() => ({
    isFollowing: false,
    follow: mockFollow,
    unfollow: mockUnfollow,
    isFollowPending: false,
    isUnfollowPending: false,
    statusLoading: false,
    followError: null,
  })),
}));

// Mock the useConnections hook
const mockRequest = vi.fn();
const mockAccept = vi.fn();
const mockDecline = vi.fn();
const mockRemove = vi.fn();

vi.mock("../../hooks/useConnections", () => ({
  useConnections: vi.fn(() => ({
    connectionStatus: "none",
    connectionId: null,
    direction: undefined,
    statusLoading: false,
    request: mockRequest,
    accept: mockAccept,
    decline: mockDecline,
    remove: mockRemove,
    isRequestPending: false,
    isAcceptPending: false,
    isDeclinePending: false,
    isRemovePending: false,
    requestError: null,
  })),
}));

// Mock the useNotifications hook
vi.mock("../../hooks/useNotifications", () => ({
  useNotifications: vi.fn(() => ({
    notifications: [],
    unreadCount: 0,
    markRead: vi.fn(),
    markAllRead: vi.fn(),
    isLoading: false,
  })),
}));

// Mock humanApi for CheerButton
vi.mock("../../lib/humanApi", () => ({
  careApi: {
    sendCheer: vi.fn().mockResolvedValue({ ok: true, data: { cheerId: "n-1", giftSent: false } }),
    sendCelebrate: vi.fn().mockResolvedValue({ ok: true }),
  },
}));

// Mock next/link
vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ children, href, ...props }: { children: React.ReactNode; href: string; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe("FollowButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Follow button in default state", async () => {
    const { FollowButton } = await import("../../components/social/FollowButton");
    render(
      <Wrapper>
        <FollowButton targetHumanId="target-123" />
      </Wrapper>,
    );

    const button = screen.getByRole("button", { name: /follow/i });
    expect(button).toBeDefined();
    expect(button.textContent).toBe("Follow");
  });

  it("renders Following button when already following", async () => {
    const { useFollows } = await import("../../hooks/useFollows");
    (useFollows as ReturnType<typeof vi.fn>).mockReturnValue({
      isFollowing: true,
      follow: mockFollow,
      unfollow: mockUnfollow,
      isFollowPending: false,
      isUnfollowPending: false,
      statusLoading: false,
      followError: null,
    });

    const { FollowButton } = await import("../../components/social/FollowButton");
    render(
      <Wrapper>
        <FollowButton targetHumanId="target-123" />
      </Wrapper>,
    );

    const button = screen.getByRole("button", { name: /unfollow/i });
    expect(button.textContent).toBe("Following");
  });

  it("displays loading state when status is loading", async () => {
    const { useFollows } = await import("../../hooks/useFollows");
    (useFollows as ReturnType<typeof vi.fn>).mockReturnValue({
      isFollowing: false,
      follow: mockFollow,
      unfollow: mockUnfollow,
      isFollowPending: false,
      isUnfollowPending: false,
      statusLoading: true,
      followError: null,
    });

    const { FollowButton } = await import("../../components/social/FollowButton");
    render(
      <Wrapper>
        <FollowButton targetHumanId="target-123" />
      </Wrapper>,
    );

    const button = screen.getByRole("button");
    expect(button).toBeDefined();
    expect(button.hasAttribute("disabled") || button.getAttribute("aria-disabled") === "true").toBe(true);
  });

  it("calls follow on click when not following", async () => {
    const { useFollows } = await import("../../hooks/useFollows");
    (useFollows as ReturnType<typeof vi.fn>).mockReturnValue({
      isFollowing: false,
      follow: mockFollow,
      unfollow: mockUnfollow,
      isFollowPending: false,
      isUnfollowPending: false,
      statusLoading: false,
      followError: null,
    });

    const { FollowButton } = await import("../../components/social/FollowButton");
    render(
      <Wrapper>
        <FollowButton targetHumanId="target-123" />
      </Wrapper>,
    );

    fireEvent.click(screen.getByRole("button", { name: /follow/i }));
    expect(mockFollow).toHaveBeenCalledWith("target-123");
  });

  it("shows 200 follow limit error message", async () => {
    const { useFollows } = await import("../../hooks/useFollows");
    (useFollows as ReturnType<typeof vi.fn>).mockReturnValue({
      isFollowing: false,
      follow: mockFollow,
      unfollow: mockUnfollow,
      isFollowPending: false,
      isUnfollowPending: false,
      statusLoading: false,
      followError: new Error("FOLLOW_LIMIT_REACHED"),
    });

    const { FollowButton } = await import("../../components/social/FollowButton");
    render(
      <Wrapper>
        <FollowButton targetHumanId="target-123" />
      </Wrapper>,
    );

    const errorText = screen.getByText(/200 follow limit/i);
    expect(errorText).toBeDefined();
  });
});

describe("ConnectButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Connect button in none state", async () => {
    const { useConnections } = await import("../../hooks/useConnections");
    (useConnections as ReturnType<typeof vi.fn>).mockReturnValue({
      connectionStatus: "none",
      connectionId: null,
      direction: undefined,
      statusLoading: false,
      request: mockRequest,
      accept: mockAccept,
      decline: mockDecline,
      remove: mockRemove,
      isRequestPending: false,
      isAcceptPending: false,
      isDeclinePending: false,
      isRemovePending: false,
      requestError: null,
    });

    const { ConnectButton } = await import("../../components/social/ConnectButton");
    render(
      <Wrapper>
        <ConnectButton targetHumanId="target-456" />
      </Wrapper>,
    );

    expect(screen.getByText("Connect")).toBeDefined();
  });

  it("renders Request Sent in pending-sent state", async () => {
    const { useConnections } = await import("../../hooks/useConnections");
    (useConnections as ReturnType<typeof vi.fn>).mockReturnValue({
      connectionStatus: "pending",
      connectionId: "conn-1",
      direction: "sent",
      statusLoading: false,
      request: mockRequest,
      accept: mockAccept,
      decline: mockDecline,
      remove: mockRemove,
      isRequestPending: false,
      isAcceptPending: false,
      isDeclinePending: false,
      isRemovePending: false,
      requestError: null,
    });

    const { ConnectButton } = await import("../../components/social/ConnectButton");
    render(
      <Wrapper>
        <ConnectButton targetHumanId="target-456" />
      </Wrapper>,
    );

    expect(screen.getByText("Request Sent")).toBeDefined();
  });

  it("renders Accept/Decline in pending-received state", async () => {
    const { useConnections } = await import("../../hooks/useConnections");
    (useConnections as ReturnType<typeof vi.fn>).mockReturnValue({
      connectionStatus: "pending",
      connectionId: "conn-1",
      direction: "received",
      statusLoading: false,
      request: mockRequest,
      accept: mockAccept,
      decline: mockDecline,
      remove: mockRemove,
      isRequestPending: false,
      isAcceptPending: false,
      isDeclinePending: false,
      isRemovePending: false,
      requestError: null,
    });

    const { ConnectButton } = await import("../../components/social/ConnectButton");
    render(
      <Wrapper>
        <ConnectButton targetHumanId="target-456" />
      </Wrapper>,
    );

    expect(screen.getByText("Accept")).toBeDefined();
    expect(screen.getByText("Decline")).toBeDefined();
  });

  it("renders Connected in accepted state", async () => {
    const { useConnections } = await import("../../hooks/useConnections");
    (useConnections as ReturnType<typeof vi.fn>).mockReturnValue({
      connectionStatus: "accepted",
      connectionId: "conn-1",
      direction: undefined,
      statusLoading: false,
      request: mockRequest,
      accept: mockAccept,
      decline: mockDecline,
      remove: mockRemove,
      isRequestPending: false,
      isAcceptPending: false,
      isDeclinePending: false,
      isRemovePending: false,
      requestError: null,
    });

    const { ConnectButton } = await import("../../components/social/ConnectButton");
    render(
      <Wrapper>
        <ConnectButton targetHumanId="target-456" />
      </Wrapper>,
    );

    expect(screen.getByText("Connected")).toBeDefined();
  });

  it("calls request on Connect click", async () => {
    const { useConnections } = await import("../../hooks/useConnections");
    (useConnections as ReturnType<typeof vi.fn>).mockReturnValue({
      connectionStatus: "none",
      connectionId: null,
      direction: undefined,
      statusLoading: false,
      request: mockRequest,
      accept: mockAccept,
      decline: mockDecline,
      remove: mockRemove,
      isRequestPending: false,
      isAcceptPending: false,
      isDeclinePending: false,
      isRemovePending: false,
      requestError: null,
    });

    const { ConnectButton } = await import("../../components/social/ConnectButton");
    render(
      <Wrapper>
        <ConnectButton targetHumanId="target-456" />
      </Wrapper>,
    );

    fireEvent.click(screen.getByText("Connect"));
    expect(mockRequest).toHaveBeenCalledWith("target-456");
  });
});

describe("NotificationBell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders bell icon with no badge when unread count is 0", async () => {
    const { useNotifications } = await import("../../hooks/useNotifications");
    (useNotifications as ReturnType<typeof vi.fn>).mockReturnValue({
      notifications: [],
      unreadCount: 0,
      markRead: vi.fn(),
      markAllRead: vi.fn(),
      isLoading: false,
    });

    const { NotificationBell } = await import("../../components/notifications/NotificationBell");
    render(
      <Wrapper>
        <NotificationBell />
      </Wrapper>,
    );

    const bell = screen.getByRole("button", { name: /notifications/i });
    expect(bell).toBeDefined();
    // Should NOT have a badge
    expect(bell.querySelector(".bg-terracotta")).toBeNull();
  });

  it("displays unread count badge when > 0", async () => {
    const { useNotifications } = await import("../../hooks/useNotifications");
    (useNotifications as ReturnType<typeof vi.fn>).mockReturnValue({
      notifications: [
        { id: "n-1", type: "follow", message: "Alice followed you", isRead: false, aggregationCount: 1, createdAt: new Date().toISOString() },
      ],
      unreadCount: 3,
      markRead: vi.fn(),
      markAllRead: vi.fn(),
      isLoading: false,
    });

    const { NotificationBell } = await import("../../components/notifications/NotificationBell");
    render(
      <Wrapper>
        <NotificationBell />
      </Wrapper>,
    );

    const bell = screen.getByRole("button", { name: /3 unread/i });
    expect(bell).toBeDefined();
    // Badge should show "3"
    expect(bell.textContent).toContain("3");
  });

  it("displays 9+ for unread count above 9", async () => {
    const { useNotifications } = await import("../../hooks/useNotifications");
    (useNotifications as ReturnType<typeof vi.fn>).mockReturnValue({
      notifications: [],
      unreadCount: 15,
      markRead: vi.fn(),
      markAllRead: vi.fn(),
      isLoading: false,
    });

    const { NotificationBell } = await import("../../components/notifications/NotificationBell");
    render(
      <Wrapper>
        <NotificationBell />
      </Wrapper>,
    );

    const bell = screen.getByRole("button", { name: /15 unread/i });
    expect(bell.textContent).toContain("9+");
  });

  it("opens dropdown on click and shows empty state", async () => {
    const { useNotifications } = await import("../../hooks/useNotifications");
    (useNotifications as ReturnType<typeof vi.fn>).mockReturnValue({
      notifications: [],
      unreadCount: 0,
      markRead: vi.fn(),
      markAllRead: vi.fn(),
      isLoading: false,
    });

    const { NotificationBell } = await import("../../components/notifications/NotificationBell");
    render(
      <Wrapper>
        <NotificationBell />
      </Wrapper>,
    );

    fireEvent.click(screen.getByRole("button", { name: /notifications/i }));
    expect(screen.getByText("No notifications yet")).toBeDefined();
    expect(screen.getByText("View all notifications")).toBeDefined();
  });
});

describe("CheerButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders Cheer button with gift toggle checkbox", async () => {
    const { CheerButton } = await import("../../components/care/CheerButton");
    render(
      <Wrapper>
        <CheerButton targetHumanId="target-789" />
      </Wrapper>,
    );

    expect(screen.getByText("Cheer")).toBeDefined();
    expect(screen.getByText(/Include 1 IT gift/i)).toBeDefined();
  });

  it("renders gift checkbox that can be toggled", async () => {
    const { CheerButton } = await import("../../components/care/CheerButton");
    render(
      <Wrapper>
        <CheerButton targetHumanId="target-789" />
      </Wrapper>,
    );

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeDefined();
    expect((checkbox as HTMLInputElement).checked).toBe(false);

    fireEvent.click(checkbox);
    expect((checkbox as HTMLInputElement).checked).toBe(true);
  });

  it("accepts optional notificationId prop", async () => {
    const { CheerButton } = await import("../../components/care/CheerButton");
    render(
      <Wrapper>
        <CheerButton targetHumanId="target-789" notificationId="notif-1" />
      </Wrapper>,
    );

    // Component renders correctly with notificationId
    expect(screen.getByText("Cheer")).toBeDefined();
  });
});
