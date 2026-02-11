"use client";

import { useState, useRef } from "react";

interface EvidenceSubmitFormProps {
  missionId: string;
  claimId: string;
  onSubmit: (data: FormData) => Promise<void>;
  disabled?: boolean;
}

export function EvidenceSubmitForm({
  missionId: _missionId,
  claimId: _claimId,
  onSubmit,
  disabled = false,
}: EvidenceSubmitFormProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    if (selected.length > 5) {
      setError("Maximum 5 files per submission");
      return;
    }
    const oversized = selected.find((f) => f.size > 10 * 1024 * 1024);
    if (oversized) {
      setError(`File "${oversized.name}" exceeds 10MB limit`);
      return;
    }
    setFiles(selected);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) {
      setError("Please select at least one file");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
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
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Evidence Files
        </label>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/heic,application/pdf,video/mp4,video/quicktime"
          capture="environment"
          multiple
          onChange={handleFileChange}
          disabled={disabled || submitting}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />
        <p className="mt-1 text-xs text-gray-500">
          1-5 files, max 10MB each. Photos, PDFs, or videos.
        </p>
      </div>

      {files.length > 0 && (
        <div className="text-sm text-gray-600">
          {files.length} file(s) selected
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Notes (optional)
        </label>
        <textarea
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
        <div className="text-sm text-red-600 bg-red-50 p-3 rounded-md">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={disabled || submitting || files.length === 0}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {submitting ? "Submitting..." : "Submit Evidence"}
      </button>
    </form>
  );
}
