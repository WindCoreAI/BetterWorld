/**
 * Markdown-to-structured-blocks parser.
 * Converts raw markdown into typed block objects that React components render.
 * No dangerouslySetInnerHTML — everything becomes real React elements.
 */

// ── Block Types ──

export type InlineSegment =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  | { type: "italic"; text: string }
  | { type: "bold-italic"; text: string }
  | { type: "code"; text: string }
  | { type: "link"; text: string; href: string }
  | { type: "image"; alt: string; src: string }
  | { type: "footnote-ref"; id: string };

export type Block =
  | { type: "heading"; level: number; id: string; segments: InlineSegment[] }
  | { type: "paragraph"; segments: InlineSegment[] }
  | { type: "code"; language: string; content: string }
  | { type: "blockquote"; segments: InlineSegment[] }
  | { type: "list"; ordered: boolean; items: InlineSegment[][] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "hr" }
  | { type: "footnote-def"; id: string; segments: InlineSegment[] };

// ── Inline Parser ──

export function parseInline(text: string): InlineSegment[] {
  const segments: InlineSegment[] = [];
  // Regex matches in priority order: image, link, footnote-ref, bold-italic, bold, italic, inline code
  const pattern =
    /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|\[\^(\w+)\]|\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|__(.+?)__|\*(.+?)\*|`([^`]+)`/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // Push preceding plain text
    if (match.index > lastIndex) {
      segments.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }

    if (match[1] !== undefined || match[2] !== undefined) {
      // Image: ![alt](src)
      segments.push({ type: "image", alt: match[1] ?? "", src: match[2]! });
    } else if (match[3] !== undefined) {
      // Link: [text](url)
      segments.push({ type: "link", text: match[3], href: match[4]! });
    } else if (match[5] !== undefined) {
      // Footnote reference: [^id]
      segments.push({ type: "footnote-ref", id: match[5] });
    } else if (match[6] !== undefined) {
      // Bold-italic: ***text***
      segments.push({ type: "bold-italic", text: match[6] });
    } else if (match[7] !== undefined) {
      // Bold: **text**
      segments.push({ type: "bold", text: match[7] });
    } else if (match[8] !== undefined) {
      // Bold: __text__
      segments.push({ type: "bold", text: match[8] });
    } else if (match[9] !== undefined) {
      // Italic: *text*
      segments.push({ type: "italic", text: match[9] });
    } else if (match[10] !== undefined) {
      // Inline code: `code`
      segments.push({ type: "code", text: match[10] });
    }

    lastIndex = match.index + match[0].length;
  }

  // Trailing plain text
  if (lastIndex < text.length) {
    segments.push({ type: "text", text: text.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: "text", text }];
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// ── Block Parser ──

interface ParseState {
  blocks: Block[];
  inCodeBlock: boolean;
  codeLanguage: string;
  codeLines: string[];
  inList: boolean;
  listOrdered: boolean;
  listItems: InlineSegment[][];
  inTable: boolean;
  tableHeaders: string[];
  tableRows: string[][];
  tableSepSeen: boolean;
}

function flushList(state: ParseState): void {
  if (state.inList && state.listItems.length > 0) {
    state.blocks.push({ type: "list", ordered: state.listOrdered, items: state.listItems });
    state.inList = false;
    state.listItems = [];
  }
}

function flushTable(state: ParseState): void {
  if (state.inTable && state.tableHeaders.length > 0) {
    state.blocks.push({ type: "table", headers: state.tableHeaders, rows: state.tableRows });
    state.inTable = false;
    state.tableHeaders = [];
    state.tableRows = [];
    state.tableSepSeen = false;
  }
}

function isTableSep(line: string): boolean {
  return /^\|[\s:|-]+\|$/.test(line.trim());
}

function parseTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function handleCodeFence(line: string, state: ParseState): boolean {
  if (line.startsWith("```")) {
    if (!state.inCodeBlock) {
      flushList(state);
      flushTable(state);
      state.inCodeBlock = true;
      state.codeLanguage = line.slice(3).trim();
      state.codeLines = [];
    } else {
      state.blocks.push({ type: "code", language: state.codeLanguage, content: state.codeLines.join("\n") });
      state.inCodeBlock = false;
    }
    return true;
  }
  if (state.inCodeBlock) { state.codeLines.push(line); return true; }
  return false;
}

function handleTableLine(trimmed: string, state: ParseState): boolean {
  if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
    flushList(state);
    if (!state.inTable) {
      state.inTable = true;
      state.tableHeaders = parseTableRow(trimmed);
      state.tableRows = [];
      state.tableSepSeen = false;
      return true;
    }
    if (!state.tableSepSeen && isTableSep(trimmed)) {
      state.tableSepSeen = true;
      return true;
    }
    state.tableRows.push(parseTableRow(trimmed));
    return true;
  }
  return false;
}

function processLine(line: string, state: ParseState): void {
  if (handleCodeFence(line, state)) return;

  const trimmed = line.trim();
  if (handleTableLine(trimmed, state)) return;
  flushTable(state);

  // Horizontal rule
  if (/^(---|\*\*\*|___)$/.test(trimmed)) {
    flushList(state);
    state.blocks.push({ type: "hr" });
    return;
  }

  // Empty line
  if (trimmed === "") { flushList(state); return; }

  // Heading
  const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
  if (headingMatch) {
    flushList(state);
    const rawText = headingMatch[2]!;
    state.blocks.push({
      type: "heading",
      level: headingMatch[1]!.length,
      id: slugify(rawText),
      segments: parseInline(rawText),
    });
    return;
  }

  // Footnote definition: [^id]: text
  const footnoteDefMatch = trimmed.match(/^\[\^(\w+)\]:\s*(.+)$/);
  if (footnoteDefMatch) {
    flushList(state);
    state.blocks.push({ type: "footnote-def", id: footnoteDefMatch[1]!, segments: parseInline(footnoteDefMatch[2]!) });
    return;
  }

  // Blockquote
  if (line.startsWith("> ")) {
    flushList(state);
    state.blocks.push({ type: "blockquote", segments: parseInline(line.slice(2)) });
    return;
  }

  // Unordered list
  const ulMatch = line.match(/^\s*[-*+]\s+(.+)$/);
  if (ulMatch) {
    if (!state.inList || state.listOrdered) { flushList(state); state.inList = true; state.listOrdered = false; state.listItems = []; }
    state.listItems.push(parseInline(ulMatch[1]!));
    return;
  }

  // Ordered list
  const olMatch = line.match(/^\s*\d+\.\s+(.+)$/);
  if (olMatch) {
    if (!state.inList || !state.listOrdered) { flushList(state); state.inList = true; state.listOrdered = true; state.listItems = []; }
    state.listItems.push(parseInline(olMatch[1]!));
    return;
  }

  // Paragraph
  flushList(state);
  state.blocks.push({ type: "paragraph", segments: parseInline(line) });
}

export function parseMarkdown(markdown: string): Block[] {
  const state: ParseState = {
    blocks: [],
    inCodeBlock: false,
    codeLanguage: "",
    codeLines: [],
    inList: false,
    listOrdered: false,
    listItems: [],
    inTable: false,
    tableHeaders: [],
    tableRows: [],
    tableSepSeen: false,
  };

  for (const line of markdown.split("\n")) {
    processLine(line, state);
  }

  flushList(state);
  flushTable(state);
  return state.blocks;
}
