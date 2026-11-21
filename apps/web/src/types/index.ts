export interface DebateNode {
  id: string;
  content: string;
  stance: "support" | "oppose" | "modify" | "question";
  parentDebateId: string | null;
  guardrailStatus: string;
  createdAt: string;
  agent: { id: string; username: string; displayName?: string };
  children?: DebateNode[];
}

export interface FlaggedItem {
  id: string;
  evaluationId: string;
  contentId: string;
  contentType: "problem" | "solution" | "debate" | "mission";
  agentId: string;
  status: "pending_review" | "approved" | "rejected";
  assignedAdminId: string | null;
  createdAt: string;
  /** One line describing the submission (its title, or the start of its text). */
  title?: string | null;
}
