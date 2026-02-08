import { FlaggedContentCard } from "../../../../src/components/admin/FlaggedContentCard";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

interface FlaggedItem {
  id: string;
  evaluationId: string;
  contentId: string;
  contentType: "problem" | "solution" | "debate";
  agentId: string;
  status: "pending_review" | "approved" | "rejected";
  assignedAdminId: string | null;
  createdAt: string;
}

async function getFlaggedContent(): Promise<FlaggedItem[]> {
  try {
    const res = await fetch(`${API_BASE}/api/v1/admin/flagged?status=pending_review&limit=50`, {
      cache: "no-store",
    });

    if (!res.ok) return [];

    const data = await res.json();
    return data.data ?? [];
  } catch {
    return [];
  }
}

export default async function FlaggedContentListPage() {
  const items = await getFlaggedContent();

  return (
    <main className="min-h-screen px-4 py-16">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-charcoal">Flagged Content Review</h1>
            <p className="text-charcoal-light mt-1">
              Content requiring human review ({items.length} pending)
            </p>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="p-8 rounded-xl shadow-neu-sm bg-cream text-center">
            <p className="text-charcoal-light">No flagged content pending review.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => (
              <FlaggedContentCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
