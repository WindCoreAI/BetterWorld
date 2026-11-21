"use client";

import { useState, useRef } from "react";

interface EvidenceSubmitFormProps {
  missionId: string;
  claimId: string;
  onSubmit: (data: FormData) => Promise<void>;
  /** Tells the page which file is selected (for the preview and checklist). */
  onFileSelected?: (file: File | null) => void;
  disabled?: boolean;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;

export function EvidenceSubmitForm({
  missionId: _missionId,
  claimId: _claimId,
  onSubmit,
  onFileSelected,
  disabled = false,
}: EvidenceSubmitFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectFile = (next: File | null) => {
    setFile(next);
    onFileSelected?.(next);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_FILE_BYTES) {
      setError(`"${selected.name}" is larger than 10MB. Choose a smaller file.`);
      selectFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    selectFile(selected);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError("Please choose a photo first");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("files", file);
      if (notes.trim()) formData.append("notes", notes.trim());

      await onSubmit(formData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submission failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="evidence-file" className="block text-sm font-medium text-gray-700 mb-1">
          Evidence photo
        </label>
        {/* No `capture` attribute: on a phone this offers both the camera and the
            photo library, so a photo taken earlier (or offline) can be used. One
            file, because the server stores one file per submission. */}
        <input
          id="evidence-file"
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/heic,application/pdf,video/mp4,video/quicktime"
          onChange={handleFileChange}
          disabled={disabled || submitting}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        <p className="mt-1 text-xs text-gray-500">
          One file, up to 10MB. A photo works best; PDFs and videos are reviewed by a person.
        </p>
      </div>

      <div>
        <label htmlFor="evidence-notes" className="block text-sm font-medium text-gray-700 mb-1">
          Notes (optional)
        </label>
        <textarea
          id="evidence-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={2000}
          rows={3}
          disabled={disabled || submitting}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Add any additional context..."
        />
      </div>

      {error && (
        <div role="alert" className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={disabled || submitting || !file}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {submitting ? "Submitting..." : "Submit Evidence"}
      </button>
    </form>
  );
}
