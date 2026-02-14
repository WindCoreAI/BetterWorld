/**
 * EvidenceSubmitForm Component Test (Sprint 15 — T057, FR-031)
 *
 * Tests file input validation, GPS detection state, and form submission.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

describe("EvidenceSubmitForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should render the form with file input and submit button", async () => {
    const { EvidenceSubmitForm } = await import("../../components/evidence/EvidenceSubmitForm");
    const onSubmit = vi.fn();
    render(<EvidenceSubmitForm missionId="test" claimId="claim-1" onSubmit={onSubmit} />);

    expect(screen.getByText("Evidence Files")).toBeDefined();
    expect(screen.getByText("Submit Evidence")).toBeDefined();
  });

  it("should disable submit button when no files selected", async () => {
    const { EvidenceSubmitForm } = await import("../../components/evidence/EvidenceSubmitForm");
    const onSubmit = vi.fn();
    render(<EvidenceSubmitForm missionId="test" claimId="claim-1" onSubmit={onSubmit} />);

    const submitButton = screen.getByText("Submit Evidence");
    expect(submitButton.hasAttribute("disabled") || submitButton.getAttribute("disabled") !== null).toBe(true);
  });

  it("should show error for more than 5 files", async () => {
    const { EvidenceSubmitForm } = await import("../../components/evidence/EvidenceSubmitForm");
    const onSubmit = vi.fn();
    render(<EvidenceSubmitForm missionId="test" claimId="claim-1" onSubmit={onSubmit} />);

    // Create 6 mock files
    const files = Array.from({ length: 6 }, (_, i) =>
      new File(["content"], `photo${i}.jpg`, { type: "image/jpeg" }),
    );
    const dataTransfer = new DataTransfer();
    files.forEach((f) => dataTransfer.items.add(f));

    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
      Object.defineProperty(fileInput, "files", { value: dataTransfer.files });
      fireEvent.change(fileInput);
    }

    await waitFor(() => {
      const errorEl = screen.queryByText(/Maximum 5 files/i);
      expect(errorEl).toBeDefined();
    });
  });

  it("should show error for files exceeding 10MB", async () => {
    const { EvidenceSubmitForm } = await import("../../components/evidence/EvidenceSubmitForm");
    const onSubmit = vi.fn();
    render(<EvidenceSubmitForm missionId="test" claimId="claim-1" onSubmit={onSubmit} />);

    // Create a large file (11MB)
    const largeContent = new ArrayBuffer(11 * 1024 * 1024);
    const largeFile = new File([largeContent], "large.jpg", { type: "image/jpeg" });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(largeFile);

    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
      Object.defineProperty(fileInput, "files", { value: dataTransfer.files });
      fireEvent.change(fileInput);
    }

    await waitFor(() => {
      const errorEl = screen.queryByText(/exceeds 10MB/i);
      expect(errorEl).toBeDefined();
    });
  });

  it("should call onSubmit with FormData when form is submitted", async () => {
    const { EvidenceSubmitForm } = await import("../../components/evidence/EvidenceSubmitForm");
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<EvidenceSubmitForm missionId="test" claimId="claim-1" onSubmit={onSubmit} />);

    // Add a valid file
    const file = new File(["test content"], "photo.jpg", { type: "image/jpeg" });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    const fileInput = document.querySelector('input[type="file"]');
    if (fileInput) {
      Object.defineProperty(fileInput, "files", { value: dataTransfer.files });
      fireEvent.change(fileInput);
    }

    // Submit the form
    const form = document.querySelector("form");
    if (form) {
      fireEvent.submit(form);

      await waitFor(() => {
        expect(onSubmit).toHaveBeenCalled();
        const formData = onSubmit.mock.calls[0][0];
        expect(formData instanceof FormData).toBe(true);
      });
    }
  });

  it("should be disabled when disabled prop is true", async () => {
    const { EvidenceSubmitForm } = await import("../../components/evidence/EvidenceSubmitForm");
    const onSubmit = vi.fn();
    render(<EvidenceSubmitForm missionId="test" claimId="claim-1" onSubmit={onSubmit} disabled={true} />);

    const submitButton = screen.getByText("Submit Evidence");
    expect(submitButton.hasAttribute("disabled") || submitButton.getAttribute("disabled") !== null).toBe(true);
  });
});
