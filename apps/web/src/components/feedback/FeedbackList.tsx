"use client";

/**
 * FeedbackList Component (Sprint 17: Community Identity & Visible Growth)
 *
 * Inbox list with unread indicator and type filter.
 */
import { Card } from "../ui";

interface FeedbackItemData {
  id: string;
  feedbackType: string;
  message: string;
  improvementTips: string[] | null;
  referenceId: string | null;
  referenceType: string | null;
  isRead: boolean;
  createdAt: string;
}

interface FeedbackListProps {
  items: FeedbackItemData[];
  onMarkRead?: (id: string) => void;
}

const FEEDBACK_TYPE_LABELS: Record<string, string> = {
  evidence_rejection: "Evidence Feedback",
  review_disagreement: "Review Feedback",
  high_performer_recognition: "Recognition",
};

const FEEDBACK_TYPE_COLORS: Record<string, string> = {
  evidence_rejection: "bg-red-100 text-red-700",
  review_disagreement: "bg-amber-100 text-amber-700",
  high_performer_recognition: "bg-green-100 text-green-700",
};

export function FeedbackList({ items, onMarkRead }: FeedbackListProps) {
  if (items.length === 0) {
    return (
      <Card className="p-6 text-center">
        <p className="text-gray-500">No feedback yet. Keep contributing and you will receive actionable insights.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <FeedbackItem key={item.id} item={item} onMarkRead={onMarkRead} />
      ))}
    </div>
  );
}

function FeedbackItem({
  item,
  onMarkRead,
}: {
  item: FeedbackItemData;
  onMarkRead?: (id: string) => void;
}) {
  const handleClick = () => {
    if (!item.isRead && onMarkRead) {
      onMarkRead(item.id);
    }
  };

  return (
    <Card
      className={`p-4 cursor-pointer transition-colors ${
        item.isRead ? "opacity-70" : "border-l-4 border-l-blue-500"
      }`}
      onClick={handleClick}
    >
      <div className="flex items-start gap-3">
        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            FEEDBACK_TYPE_COLORS[item.feedbackType] ?? "bg-gray-100 text-gray-700"
          }`}
        >
          {FEEDBACK_TYPE_LABELS[item.feedbackType] ?? item.feedbackType}
        </span>
        {!item.isRead && (
          <span className="w-2 h-2 bg-blue-500 rounded-full mt-1 flex-shrink-0" />
        )}
      </div>
      <p className="text-sm text-gray-700 mt-2">{item.message}</p>
      {item.improvementTips && item.improvementTips.length > 0 && (
        <ul className="mt-2 space-y-1">
          {item.improvementTips.map((tip, i) => (
            <li key={i} className="text-xs text-gray-500 flex items-start gap-1">
              <span className="text-blue-400 mt-0.5">&#8226;</span>
              {tip}
            </li>
          ))}
        </ul>
      )}
      <span className="text-xs text-gray-400 mt-2 block">
        {new Date(item.createdAt).toLocaleDateString()}
      </span>
    </Card>
  );
}
