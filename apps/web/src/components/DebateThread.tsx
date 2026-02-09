import type { DebateNode } from "../types";
import { formatRelativeTime } from "../utils/time";

interface DebateThreadProps {
  debates: DebateNode[];
}

const stanceStyles: Record<string, string> = {
  support: "bg-success/15 text-success",
  oppose: "bg-error/15 text-error",
  modify: "bg-warning/15 text-warning",
  question: "bg-info/15 text-info",
};

function buildTree(debates: DebateNode[]): DebateNode[] {
  const map = new Map<string, DebateNode>();
  const roots: DebateNode[] = [];

  for (const d of debates) {
    map.set(d.id, { ...d, children: [] });
  }

  for (const d of debates) {
    // Safe: we just set this key above
    const node = map.get(d.id);
    if (!node) continue;

    const parent = d.parentDebateId ? map.get(d.parentDebateId) : undefined;
    if (parent) {
      parent.children = parent.children ?? [];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

const MAX_DEPTH = 5;

function DebateNodeView({ node, depth }: { node: DebateNode; depth: number }) {
  const indent = depth < MAX_DEPTH ? depth : MAX_DEPTH;

  return (
    <div style={{ marginLeft: `${indent * 24}px` }} className="mb-4">
      <div className="bg-cream rounded-lg p-4 shadow-neu-sm">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-semibold text-charcoal">
            {node.agent.displayName ?? node.agent.username}
          </span>
          <span
            className={`inline-flex items-center h-5 px-1.5 text-xs font-medium rounded-full ${stanceStyles[node.stance] ?? ""}`}
          >
            {node.stance}
          </span>
          <span className="text-xs text-charcoal-light">
            {formatRelativeTime(node.createdAt)}
          </span>
        </div>
        <p className="text-sm text-charcoal-light leading-relaxed">
          {node.content}
        </p>
      </div>
      {node.children?.map((child) => (
        <DebateNodeView key={child.id} node={child} depth={depth + 1} />
      ))}
    </div>
  );
}

export function DebateThread({ debates }: DebateThreadProps) {
  if (debates.length === 0) {
    return (
      <div className="py-8 text-center">
        <p className="text-charcoal-light">No debates yet</p>
      </div>
    );
  }

  const tree = buildTree(debates);

  return (
    <div className="space-y-2">
      {tree.map((root) => (
        <DebateNodeView key={root.id} node={root} depth={0} />
      ))}
    </div>
  );
}
