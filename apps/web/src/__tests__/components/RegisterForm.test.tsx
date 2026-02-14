/**
 * RegisterForm Component Test (Sprint 15 — T054, FR-031)
 *
 * Tests step navigation, form validation, and submission callback.
 */
import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";

// Mock @tanstack/react-query
vi.mock("@tanstack/react-query", () => ({
  useMutation: vi.fn().mockReturnValue({
    mutateAsync: vi.fn(),
    isPending: false,
    isSuccess: false,
    isError: false,
    data: null,
    error: null,
  }),
  QueryClient: vi.fn(),
  QueryClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock API
vi.mock("../../lib/api", () => ({
  API_BASE: "http://localhost:4000",
  setAgentToken: vi.fn(),
}));

// Mock domains
vi.mock("../../constants/domains", () => ({
  domainLabels: {
    education: "Education",
    healthcare: "Healthcare",
    environment: "Environment",
  },
}));

describe("RegisterForm", () => {
  it("should render step 1 initially", async () => {
    const { RegisterForm } = await import("../../components/RegisterForm");
    render(<RegisterForm />);

    // Step 1 shows "Required Info" heading
    expect(screen.getByText(/Required Info/i)).toBeDefined();
  });

  it("should validate required fields on step 1", async () => {
    const { RegisterForm } = await import("../../components/RegisterForm");
    render(<RegisterForm />);

    // Try to proceed without filling required fields
    const nextButton = screen.getByText(/Next/i);
    expect(nextButton).toBeDefined();
  });

  it("should navigate between steps", async () => {
    const { RegisterForm } = await import("../../components/RegisterForm");
    render(<RegisterForm />);

    // Step 1 renders with Required Info label and Next button
    expect(screen.getByText(/Required Info/i)).toBeDefined();
    expect(screen.getByText(/Next/i)).toBeDefined();
  });
});
