"use client";

import { useCallback, useState } from "react";

import type { Block, InlineSegment } from "../../lib/markdown";
import { parseInline } from "../../lib/markdown";

// ── Syntax Highlighting ──

interface Token {
  text: string;
  type: "keyword" | "string" | "comment" | "number" | "type" | "punctuation" | "plain";
}

const TS_KEYWORDS = new Set([
  "const", "let", "var", "function", "return", "if", "else", "for", "while",
  "do", "switch", "case", "break", "continue", "new", "delete", "typeof",
  "instanceof", "in", "of", "void", "throw", "try", "catch", "finally",
  "import", "export", "default", "from", "as", "class", "extends",
  "implements", "interface", "type", "enum", "namespace", "declare",
  "abstract", "async", "await", "yield", "static", "public", "private",
  "protected", "readonly", "override", "get", "set", "constructor", "super",
  "this", "true", "false", "null", "undefined",
]);

const TS_TYPES = new Set([
  "string", "number", "boolean", "object", "any", "void", "never", "unknown",
  "Array", "Record", "Promise", "Partial", "Required", "Readonly", "Pick",
  "Omit", "Exclude", "Extract", "NonNullable", "ReturnType", "Parameters",
]);

function classifyToken(t: string): Token["type"] {
  if (t.startsWith('"') || t.startsWith("'") || t.startsWith("`")) return "string";
  if (/^\d/.test(t)) return "number";
  if (TS_KEYWORDS.has(t)) return "keyword";
  if (TS_TYPES.has(t) || /^[A-Z]/.test(t)) return "type";
  if (/^[{}()[\];:.,<>=!&|?+\-*/^~@%]$/.test(t)) return "punctuation";
  return "plain";
}

function splitCodeAndComment(line: string): { codePart: string; commentPart: string } {
  const commentIdx = line.indexOf("//");
  if (commentIdx < 0) return { codePart: line, commentPart: "" };

  let inStr = false;
  let strChar = "";
  for (let i = 0; i < commentIdx; i++) {
    if (!inStr && (line[i] === '"' || line[i] === "'")) {
      inStr = true;
      strChar = line[i]!;
    } else if (inStr && line[i] === strChar && line[i - 1] !== "\\") {
      inStr = false;
    }
  }
  if (!inStr) return { codePart: line.slice(0, commentIdx), commentPart: line.slice(commentIdx) };
  return { codePart: line, commentPart: "" };
}

function tokenizeLine(line: string): Token[] {
  const tokens: Token[] = [];
  const { codePart, commentPart } = splitCodeAndComment(line);

  const pattern = /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b\d+(?:\.\d+)?\b|\b[a-zA-Z_$]\w*\b|[{}()[\];:.,<>=!&|?+\-*/^~@%])/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(codePart)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({ text: codePart.slice(lastIndex, match.index), type: "plain" });
    }
    tokens.push({ text: match[0], type: classifyToken(match[0]) });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < codePart.length) {
    tokens.push({ text: codePart.slice(lastIndex), type: "plain" });
  }

  if (commentPart) {
    tokens.push({ text: commentPart, type: "comment" });
  }

  return tokens;
}

const TOKEN_CLASSES: Record<Token["type"], string> = {
  keyword: "text-violet-300 font-medium",
  string: "text-emerald-300",
  comment: "text-cream/40 italic",
  number: "text-amber-300",
  type: "text-cyan-300",
  punctuation: "text-cream/60",
  plain: "",
};

function HighlightedCode({ code, language, showLineNumbers }: { code: string; language: string; showLineNumbers?: boolean }) {
  const isSupported = ["typescript", "ts", "javascript", "js", "tsx", "jsx"].includes(
    language.toLowerCase(),
  );

  const lines = code.split("\n");
  const lineNumWidth = String(lines.length).length;

  if (!isSupported) {
    return (
      <code className="font-mono">
        {lines.map((line, li) => (
          <span key={li} className="flex">
            {showLineNumbers && (
              <span className="inline-block text-right select-none text-cream/20 mr-4 shrink-0" style={{ width: `${lineNumWidth}ch` }}>
                {li + 1}
              </span>
            )}
            <span className="flex-1">{line}{li < lines.length - 1 ? "\n" : ""}</span>
          </span>
        ))}
      </code>
    );
  }

  return (
    <code className="font-mono">
      {lines.map((line, li) => (
        <span key={li} className="flex">
          {showLineNumbers && (
            <span className="inline-block text-right select-none text-cream/20 mr-4 shrink-0" style={{ width: `${lineNumWidth}ch` }}>
              {li + 1}
            </span>
          )}
          <span className="flex-1">
            {tokenizeLine(line).map((token, ti) => (
              <span key={ti} className={TOKEN_CLASSES[token.type]}>
                {token.text}
              </span>
            ))}
            {li < lines.length - 1 ? "\n" : ""}
          </span>
        </span>
      ))}
    </code>
  );
}

// ── Inline Renderer ──

function InlineContent({ segments }: { segments: InlineSegment[] }) {
  return (
    <>
      {segments.map((seg, i) => {
        switch (seg.type) {
          case "text":
            return <span key={i}>{seg.text}</span>;
          case "bold":
            return (
              <strong key={i} className="font-semibold text-charcoal">
                {seg.text}
              </strong>
            );
          case "italic":
            return <em key={i}>{seg.text}</em>;
          case "bold-italic":
            return (
              <strong key={i} className="font-semibold text-charcoal">
                <em>{seg.text}</em>
              </strong>
            );
          case "code":
            return (
              <code
                key={i}
                className="bg-charcoal/8 text-charcoal px-1.5 py-0.5 rounded font-mono text-[0.9em]"
              >
                {seg.text}
              </code>
            );
          case "link": {
            const isExternal = !seg.href.startsWith("/");
            return (
              <a
                key={i}
                href={seg.href}
                className="text-terracotta font-medium hover:underline underline-offset-2 transition-colors"
                target={isExternal ? "_blank" : undefined}
                rel={isExternal ? "noopener noreferrer" : undefined}
              >
                <InlineContent segments={parseInline(seg.text)} />
                {isExternal && (
                  <svg className="inline-block ml-0.5 -mt-0.5 opacity-40" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 3H3v10h10V9" />
                    <path d="M9 2h5v5" />
                    <path d="M14 2L7 9" />
                  </svg>
                )}
              </a>
            );
          }
          case "footnote-ref":
            return (
              <sup key={i} id={`fnref-${seg.id}`} className="ml-0.5">
                <a
                  href={`#fn-${seg.id}`}
                  className="text-terracotta text-[0.7em] font-semibold hover:underline"
                  aria-label={`Footnote ${seg.id}`}
                >
                  [{seg.id}]
                </a>
              </sup>
            );
          case "image":
            return (
              <img
                key={i}
                src={seg.src}
                alt={seg.alt}
                className="rounded-xl shadow-neu-md my-4 max-w-full"
                loading="lazy"
              />
            );
        }
      })}
    </>
  );
}

// ── Interactive Code Block ──

function InteractiveCodeBlock({ language, content }: { language: string; content: string }) {
  const [copied, setCopied] = useState(false);
  const lineCount = content.split("\n").length;

  const handleCopy = useCallback(() => {
    void navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [content]);

  return (
    <div className="relative group my-6 rounded-xl overflow-hidden shadow-neu-sm border border-cream/5">
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#1e1e2e] text-cream/50 text-xs border-b border-cream/5">
        <span className="font-medium uppercase tracking-wider text-cream/40">
          {language || "code"}
        </span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-cream/40 hover:text-cream hover:bg-cream/10 transition-all"
          aria-label="Copy code"
        >
          {copied ? (
            <>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M13 4L6 11L3 8" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="5" y="5" width="9" height="9" rx="1.5" />
                <path d="M11 5V3.5A1.5 1.5 0 009.5 2h-6A1.5 1.5 0 002 3.5v6A1.5 1.5 0 003.5 11H5" />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>
      <pre className="bg-[#1e1e2e] text-cream/90 p-5 overflow-x-auto text-sm leading-relaxed">
        <HighlightedCode code={content} language={language} showLineNumbers={lineCount >= 3} />
      </pre>
    </div>
  );
}

// ── Table Block (with inline markdown parsing) ──

function TableBlock({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="my-6 overflow-x-auto rounded-xl shadow-neu-sm border border-charcoal/5">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-charcoal/[0.04] border-b border-charcoal/10">
            {headers.map((h, i) => (
              <th
                key={i}
                className="px-4 py-3 text-left font-semibold text-charcoal"
              >
                <InlineContent segments={parseInline(h)} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr
              key={ri}
              className={`border-b border-charcoal/5 transition-colors hover:bg-charcoal/[0.02] ${ri % 2 === 1 ? "bg-charcoal/[0.02]" : ""}`}
            >
              {row.map((cell, ci) => (
                <td
                  key={ci}
                  className="px-4 py-3 text-charcoal-light"
                >
                  <InlineContent segments={parseInline(cell)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Extracted Block Components ──

function ParagraphBlock({ block, isFirstParagraph }: { block: Extract<Block, { type: "paragraph" }>; isFirstParagraph?: boolean }) {
  if (isFirstParagraph && block.segments.length > 0) {
    const firstSeg = block.segments[0]!;
    const firstChar = firstSeg.type === "text" ? firstSeg.text[0] ?? "" : "";
    const restText = firstSeg.type === "text" ? firstSeg.text.slice(1) : "";
    const restSegments = firstChar
      ? [{ ...firstSeg, text: restText } as InlineSegment, ...block.segments.slice(1)]
      : block.segments;

    return (
      <p className="text-lg text-charcoal-light leading-relaxed mb-6">
        {firstChar && (
          <span className="float-left text-[3.5rem] font-bold leading-[0.8] mr-3 mt-1.5 text-terracotta/80 font-serif select-none">
            {firstChar}
          </span>
        )}
        <InlineContent segments={restSegments} />
      </p>
    );
  }
  return (
    <p className="text-lg text-charcoal-light leading-relaxed mb-6">
      <InlineContent segments={block.segments} />
    </p>
  );
}

function BlockquoteBlock({ block }: { block: Extract<Block, { type: "blockquote" }> }) {
  const rawText = block.segments.map((s) => "text" in s ? s.text : "").join("");
  const isPullQuote = rawText.length < 120;

  if (isPullQuote) {
    return (
      <blockquote className="my-10 text-center px-8">
        <div className="inline-block w-8 h-[2px] bg-terracotta/40 mb-4" />
        <p className="text-xl md:text-2xl font-medium text-charcoal leading-relaxed italic">
          <InlineContent segments={block.segments} />
        </p>
        <div className="inline-block w-8 h-[2px] bg-terracotta/40 mt-4" />
      </blockquote>
    );
  }

  return (
    <blockquote className="relative border-l-4 border-terracotta/60 pl-6 italic text-charcoal-light bg-gradient-to-r from-terracotta/[0.06] to-transparent py-4 pr-4 rounded-r-xl my-6">
      <svg className="absolute -top-2 left-2 w-6 h-6 text-terracotta/20" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 01-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179zm10 0C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311 1.804.167 3.226 1.648 3.226 3.489a3.5 3.5 0 01-3.5 3.5c-1.073 0-2.099-.49-2.748-1.179z" />
      </svg>
      <p className="leading-relaxed">
        <InlineContent segments={block.segments} />
      </p>
    </blockquote>
  );
}

// ── Block Renderer ──

function BlockRenderer({ block, isFirstParagraph }: { block: Block; isFirstParagraph?: boolean }) {
  switch (block.type) {
    case "heading": {
      const Tag = `h${block.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      const classes: Record<number, string> = {
        1: "text-4xl font-bold text-charcoal mt-12 mb-6",
        2: "text-2xl font-bold text-charcoal mt-12 mb-4 pb-3 border-b border-charcoal/10",
        3: "text-xl font-semibold text-charcoal mt-8 mb-3",
        4: "text-lg font-semibold text-charcoal mt-6 mb-2",
        5: "text-base font-semibold text-charcoal mt-4 mb-2",
        6: "text-sm font-semibold text-charcoal-light mt-4 mb-2",
      };
      return (
        <Tag id={block.id} className={classes[block.level]}>
          <InlineContent segments={block.segments} />
        </Tag>
      );
    }

    case "paragraph":
      return <ParagraphBlock block={block} isFirstParagraph={isFirstParagraph} />;

    case "code":
      return <InteractiveCodeBlock language={block.language} content={block.content} />;

    case "blockquote":
      return <BlockquoteBlock block={block} />;

    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      const markerClass = block.ordered ? "list-decimal" : "list-disc";
      return (
        <Tag className={`ml-6 space-y-2 my-4 ${markerClass} marker:text-terracotta`}>
          {block.items.map((item, i) => (
            <li key={i} className="text-lg text-charcoal-light leading-relaxed pl-1">
              <InlineContent segments={item} />
            </li>
          ))}
        </Tag>
      );
    }

    case "table":
      return <TableBlock headers={block.headers} rows={block.rows} />;

    case "hr":
      return (
        <div className="my-12 flex items-center justify-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-terracotta/30" />
          <span className="w-1.5 h-1.5 rounded-full bg-terracotta/50" />
          <span className="w-1.5 h-1.5 rounded-full bg-terracotta/30" />
        </div>
      );

    case "footnote-def":
      return null;
  }
}

// ── Footnotes Section ──

function FootnotesSection({ footnotes }: { footnotes: Array<{ id: string; segments: InlineSegment[] }> }) {
  return (
    <section className="mt-12 pt-8 border-t border-charcoal/10" aria-label="Footnotes">
      <h2 className="text-xs font-semibold text-charcoal-light/50 uppercase tracking-wider mb-4">Sources & References</h2>
      <ol className="space-y-2.5">
        {footnotes.map((fn) => (
          <li key={fn.id} id={`fn-${fn.id}`} className="text-sm text-charcoal-light/80 leading-relaxed flex gap-2.5 group">
            <span className="text-terracotta/50 font-medium shrink-0 tabular-nums">{fn.id}.</span>
            <span>
              <InlineContent segments={fn.segments} />
              <a
                href={`#fnref-${fn.id}`}
                className="ml-1.5 text-terracotta/30 hover:text-terracotta transition-colors"
                aria-label="Back to reference"
              >
                ↩
              </a>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ── Main Renderer ──

export function MarkdownRenderer({ blocks }: { blocks: Block[] }) {
  let foundFirstParagraph = false;

  // Separate footnote definitions from content blocks
  const contentBlocks = blocks.filter((b) => b.type !== "footnote-def");
  const footnoteDefs = blocks.filter((b): b is Extract<Block, { type: "footnote-def" }> => b.type === "footnote-def");

  return (
    <div data-blog-content>
      {contentBlocks.map((block, i) => {
        let isFirst = false;
        if (!foundFirstParagraph && block.type === "paragraph") {
          foundFirstParagraph = true;
          isFirst = true;
        }
        return <BlockRenderer key={i} block={block} isFirstParagraph={isFirst} />;
      })}
      {footnoteDefs.length > 0 && <FootnotesSection footnotes={footnoteDefs} />}
    </div>
  );
}
