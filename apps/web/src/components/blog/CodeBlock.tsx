"use client";

import { useCallback, useState } from "react";

interface CodeBlockProps {
  children: string;
  language?: string;
  title?: string;
}

export function CodeBlock({ children, language, title }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(children.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [children]);

  return (
    <div className="relative group my-6 rounded-xl overflow-hidden shadow-neu-sm">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-charcoal text-cream/60 text-xs border-b border-cream/10">
        <span>{title ?? language ?? "code"}</span>
        <button
          onClick={handleCopy}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-cream/50 hover:text-cream"
          aria-label="Copy code"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      {/* Code content */}
      <pre className="bg-charcoal text-cream p-4 overflow-x-auto text-sm leading-relaxed">
        <code className="font-mono">{children.trim()}</code>
      </pre>
    </div>
  );
}
