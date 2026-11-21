/**
 * EvidenceSubmitForm Component Test (Sprint 15 — T057, FR-031)
 *
 * One file per submission (that is what the server stores), a size limit, and
 * the selected file reported to the page for its preview and checklist.
 */
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";

import { EvidenceSubmitForm } from "../../components/evidence/EvidenceSubmitForm";

function chooseFile(file: File) {
  const input = screen.getByLabelText("Evidence photo") as HTMLInputElement;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  fireEvent.change(input);
  return input;
}

const photo = () => new File(["photo-bytes"], "drain.jpg", { type: "image/jpeg" });

describe("EvidenceSubmitForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders a single-file picker that offers both camera and library", () => {
    render(<EvidenceSubmitForm missionId="m1" claimId="" onSubmit={vi.fn()} />);

    const input = screen.getByLabelText("Evidence photo") as HTMLInputElement;
    expect(input.type).toBe("file");
    expect(input.multiple).toBe(false);
    // `capture` would force the camera and block choosing an existing photo
    expect(input.hasAttribute("capture")).toBe(false);
    expect(screen.getByRole("button", { name: "Submit Evidence" })).toBeInTheDocument();
  });

  it("keeps submit disabled until a file is chosen", () => {
    render(<EvidenceSubmitForm missionId="m1" claimId="" onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Submit Evidence" })).toBeDisabled();

    chooseFile(photo());
    expect(screen.getByRole("button", { name: "Submit Evidence" })).toBeEnabled();
  });

  it("reports the chosen file to the page", () => {
    const onFileSelected = vi.fn();
    render(<EvidenceSubmitForm missionId="m1" claimId="" onSubmit={vi.fn()} onFileSelected={onFileSelected} />);

    const file = photo();
    chooseFile(file);
    expect(onFileSelected).toHaveBeenLastCalledWith(file);
  });

  it("refuses a file over 10MB and says why", () => {
    const onFileSelected = vi.fn();
    render(<EvidenceSubmitForm missionId="m1" claimId="" onSubmit={vi.fn()} onFileSelected={onFileSelected} />);

    const large = new File([new ArrayBuffer(11 * 1024 * 1024)], "huge.jpg", { type: "image/jpeg" });
    chooseFile(large);

    expect(screen.getByRole("alert")).toHaveTextContent(/larger than 10MB/i);
    expect(onFileSelected).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole("button", { name: "Submit Evidence" })).toBeDisabled();
  });

  it("submits the file and notes as multipart form data", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<EvidenceSubmitForm missionId="m1" claimId="" onSubmit={onSubmit} />);

    const file = photo();
    chooseFile(file);
    fireEvent.change(screen.getByLabelText("Notes (optional)"), { target: { value: "  Cleared half a bag of leaves.  " } });
    fireEvent.click(screen.getByRole("button", { name: "Submit Evidence" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const formData = onSubmit.mock.calls[0]![0] as FormData;
    expect(formData).toBeInstanceOf(FormData);
    expect(formData.getAll("files")).toHaveLength(1);
    expect((formData.get("files") as File).name).toBe("drain.jpg");
    expect(formData.get("notes")).toBe("Cleared half a bag of leaves.");
  });

  it("omits empty notes", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<EvidenceSubmitForm missionId="m1" claimId="" onSubmit={onSubmit} />);

    chooseFile(photo());
    fireEvent.click(screen.getByRole("button", { name: "Submit Evidence" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect((onSubmit.mock.calls[0]![0] as FormData).has("notes")).toBe(false);
  });

  it("shows the reason when the submission is refused and lets the person try again", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("No active claim on this mission"));
    render(<EvidenceSubmitForm missionId="m1" claimId="" onSubmit={onSubmit} />);

    chooseFile(photo());
    fireEvent.click(screen.getByRole("button", { name: "Submit Evidence" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No active claim on this mission");
    expect(screen.getByRole("button", { name: "Submit Evidence" })).toBeEnabled();
  });

  it("is inert when disabled", () => {
    render(<EvidenceSubmitForm missionId="m1" claimId="" onSubmit={vi.fn()} disabled />);

    expect(screen.getByLabelText("Evidence photo")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Submit Evidence" })).toBeDisabled();
  });
});
