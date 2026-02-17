/**
 * My Agents Frontend Component Tests (Sprint 19 — T029)
 *
 * Tests AgentCard, ApiKeyReveal, CreateAgentModal, and MyAgentsCard components.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock clipboard API
const mockClipboard = {
  writeText: vi.fn().mockResolvedValue(undefined),
};
Object.defineProperty(navigator, "clipboard", {
  value: mockClipboard,
  writable: true,
});

// Mock next/link
vi.mock("next/link", () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode; [key: string]: unknown }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

describe("AgentCard", () => {
  const mockAgent = {
    id: "agent-1",
    username: "test_agent",
    displayName: "Test Agent",
    framework: "openclaw",
    specializations: ["healthcare_improvement", "education_access"],
    claimStatus: "verified",
    isActive: true,
    creditBalance: 50,
    reputationScore: "72.5",
    lastHeartbeatAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };

  it("renders agent card with username and display name", async () => {
    const { AgentCard } = await import("../../components/agents/AgentCard");
    const onView = vi.fn();
    const onRotateKey = vi.fn();
    const onToggleActive = vi.fn();

    render(
      <AgentCard
        agent={mockAgent}
        onView={onView}
        onRotateKey={onRotateKey}
        onToggleActive={onToggleActive}
      />
    );

    expect(screen.getByText("Test Agent")).toBeDefined();
    expect(screen.getByText("@test_agent")).toBeDefined();
  });

  it("renders framework badge", async () => {
    const { AgentCard } = await import("../../components/agents/AgentCard");
    render(
      <AgentCard
        agent={mockAgent}
        onView={vi.fn()}
        onRotateKey={vi.fn()}
        onToggleActive={vi.fn()}
      />
    );

    expect(screen.getByText("openclaw")).toBeDefined();
  });

  it("renders specialization chips", async () => {
    const { AgentCard } = await import("../../components/agents/AgentCard");
    render(
      <AgentCard
        agent={mockAgent}
        onView={vi.fn()}
        onRotateKey={vi.fn()}
        onToggleActive={vi.fn()}
      />
    );

    expect(screen.getByText("healthcare improvement")).toBeDefined();
    expect(screen.getByText("education access")).toBeDefined();
  });

  it("shows credit balance", async () => {
    const { AgentCard } = await import("../../components/agents/AgentCard");
    render(
      <AgentCard
        agent={mockAgent}
        onView={vi.fn()}
        onRotateKey={vi.fn()}
        onToggleActive={vi.fn()}
      />
    );

    expect(screen.getByText("50")).toBeDefined();
    expect(screen.getByText("Credits")).toBeDefined();
  });

  it("shows Deactivate button for active agent", async () => {
    const { AgentCard } = await import("../../components/agents/AgentCard");
    render(
      <AgentCard
        agent={mockAgent}
        onView={vi.fn()}
        onRotateKey={vi.fn()}
        onToggleActive={vi.fn()}
      />
    );

    expect(screen.getByText("Deactivate")).toBeDefined();
  });

  it("shows Reactivate button for inactive agent", async () => {
    const { AgentCard } = await import("../../components/agents/AgentCard");
    render(
      <AgentCard
        agent={{ ...mockAgent, isActive: false }}
        onView={vi.fn()}
        onRotateKey={vi.fn()}
        onToggleActive={vi.fn()}
      />
    );

    expect(screen.getByText("Reactivate")).toBeDefined();
  });

  it("calls onView when View button clicked", async () => {
    const { AgentCard } = await import("../../components/agents/AgentCard");
    const onView = vi.fn();
    render(
      <AgentCard
        agent={mockAgent}
        onView={onView}
        onRotateKey={vi.fn()}
        onToggleActive={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("View"));
    expect(onView).toHaveBeenCalledWith("agent-1");
  });

  it("calls onRotateKey when Rotate Key button clicked", async () => {
    const { AgentCard } = await import("../../components/agents/AgentCard");
    const onRotateKey = vi.fn();
    render(
      <AgentCard
        agent={mockAgent}
        onView={vi.fn()}
        onRotateKey={onRotateKey}
        onToggleActive={vi.fn()}
      />
    );

    fireEvent.click(screen.getByText("Rotate Key"));
    expect(onRotateKey).toHaveBeenCalledWith("agent-1");
  });
});

describe("ApiKeyReveal", () => {
  const testApiKey = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the API key", async () => {
    const { ApiKeyReveal } = await import("../../components/agents/ApiKeyReveal");
    render(<ApiKeyReveal apiKey={testApiKey} onDismiss={vi.fn()} />);

    expect(screen.getByText(testApiKey)).toBeDefined();
  });

  it("shows security warning", async () => {
    const { ApiKeyReveal } = await import("../../components/agents/ApiKeyReveal");
    render(<ApiKeyReveal apiKey={testApiKey} onDismiss={vi.fn()} />);

    expect(screen.getByText("Security Warning")).toBeDefined();
    expect(screen.getByText(/shown only once/)).toBeDefined();
  });

  it("copies key to clipboard", async () => {
    const { ApiKeyReveal } = await import("../../components/agents/ApiKeyReveal");
    render(<ApiKeyReveal apiKey={testApiKey} onDismiss={vi.fn()} />);

    fireEvent.click(screen.getByText("Copy Key"));

    await waitFor(() => {
      expect(mockClipboard.writeText).toHaveBeenCalledWith(testApiKey);
    });
  });

  it("calls onDismiss when dismissed", async () => {
    const { ApiKeyReveal } = await import("../../components/agents/ApiKeyReveal");
    const onDismiss = vi.fn();
    render(<ApiKeyReveal apiKey={testApiKey} onDismiss={onDismiss} />);

    fireEvent.click(screen.getByText(/saved it/i));
    expect(onDismiss).toHaveBeenCalled();
  });
});

describe("MyAgentsCard (Dashboard)", () => {
  it("shows empty state CTA when no agents", async () => {
    const { MyAgentsCard } = await import("../../components/dashboard/DashboardCards");
    render(<MyAgentsCard agentCount={0} />);

    expect(screen.getByText("Create Agent")).toBeDefined();
    expect(screen.getByText(/first AI agent/)).toBeDefined();
  });

  it("shows agent count when agents exist", async () => {
    const { MyAgentsCard } = await import("../../components/dashboard/DashboardCards");
    render(<MyAgentsCard agentCount={3} />);

    expect(screen.getByText("3")).toBeDefined();
    expect(screen.getByText("Agents registered")).toBeDefined();
  });

  it("shows singular form for 1 agent", async () => {
    const { MyAgentsCard } = await import("../../components/dashboard/DashboardCards");
    render(<MyAgentsCard agentCount={1} />);

    expect(screen.getByText("1")).toBeDefined();
    expect(screen.getByText("Agent registered")).toBeDefined();
  });

  it("links to my-agents page", async () => {
    const { MyAgentsCard } = await import("../../components/dashboard/DashboardCards");
    render(<MyAgentsCard agentCount={2} />);

    const link = screen.getByText("Manage agents");
    expect(link.closest("a")?.getAttribute("href")).toBe("/my-agents");
  });
});
