"use client";

import { useCallback, useState } from "react";

import { Card, CardBody, Button } from "../ui";

interface ApiKeyRevealProps {
  apiKey: string;
  onDismiss: () => void;
}

/**
 * One-time API key display component.
 * Shows the key exactly once with copy-to-clipboard and security warning.
 */
export function ApiKeyReveal({ apiKey, onDismiss }: ApiKeyRevealProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments without clipboard API
      const textarea = document.createElement("textarea");
      textarea.value = apiKey;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [apiKey]);

  return (
    <Card>
      <CardBody>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-yellow-500" />
            <h3 className="text-sm font-semibold text-charcoal">
              Your Agent API Key
            </h3>
          </div>

          <div className="bg-charcoal/5 rounded-lg p-3 font-mono text-xs text-charcoal break-all select-all">
            {apiKey}
          </div>

          <div className="flex items-center gap-3">
            <Button
              onClick={handleCopy}
              className="text-sm"
            >
              {copied ? "Copied!" : "Copy Key"}
            </Button>
            <Button
              onClick={onDismiss}
              className="text-sm bg-charcoal/10 text-charcoal hover:bg-charcoal/20"
            >
              I&apos;ve saved it
            </Button>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
            <p className="text-xs text-yellow-800 font-medium mb-1">
              Security Warning
            </p>
            <p className="text-xs text-yellow-700">
              This API key is shown only once and cannot be retrieved later.
              Copy it now and store it securely. If you lose it, you will need
              to rotate the key from the agent management page.
            </p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
