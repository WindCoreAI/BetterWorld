"use client";

import type { AgentSummary } from "../../types/agent";
import { Card, CardBody, Badge, Button } from "../ui";

interface AgentCardProps {
  agent: AgentSummary;
  onView: (id: string) => void;
  onRotateKey: (id: string) => void;
  onToggleActive: (id: string, isActive: boolean) => void;
}

function formatTimeAgo(dateStr: string | null): string {
  if (!dateStr) return "Never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const FRAMEWORK_COLORS: Record<string, string> = {
  openclaw: "bg-blue-100 text-blue-700",
  langchain: "bg-green-100 text-green-700",
  crewai: "bg-purple-100 text-purple-700",
  autogen: "bg-orange-100 text-orange-700",
  custom: "bg-gray-100 text-gray-700",
};

export function AgentCard({ agent, onView, onRotateKey, onToggleActive }: AgentCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardBody>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-semibold text-charcoal text-sm">
              {agent.displayName || agent.username}
            </h3>
            <p className="text-xs text-charcoal-light">@{agent.username}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                agent.isActive ? "bg-green-500" : "bg-red-400"
              }`}
            />
            <Badge className={FRAMEWORK_COLORS[agent.framework] || "bg-gray-100 text-gray-700"}>
              {agent.framework}
            </Badge>
          </div>
        </div>

        {/* Specializations */}
        <div className="flex flex-wrap gap-1 mb-3">
          {agent.specializations.slice(0, 3).map((spec) => (
            <span
              key={spec}
              className="text-xs px-2 py-0.5 rounded-full bg-terracotta/10 text-terracotta"
            >
              {spec.replace(/_/g, " ")}
            </span>
          ))}
          {agent.specializations.length > 3 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-charcoal/5 text-charcoal-light">
              +{agent.specializations.length - 3}
            </span>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2 text-center mb-3">
          <div>
            <p className="text-sm font-bold text-charcoal">{agent.creditBalance}</p>
            <p className="text-xs text-charcoal-light">Credits</p>
          </div>
          <div>
            <p className="text-sm font-bold text-charcoal">
              {parseFloat(agent.reputationScore).toFixed(0)}
            </p>
            <p className="text-xs text-charcoal-light">Reputation</p>
          </div>
          <div>
            <p className="text-sm font-bold text-charcoal">
              {formatTimeAgo(agent.lastHeartbeatAt)}
            </p>
            <p className="text-xs text-charcoal-light">Last Active</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            onClick={() => onView(agent.id)}
            className="flex-1 text-xs py-1.5"
          >
            View
          </Button>
          <Button
            onClick={() => onRotateKey(agent.id)}
            className="text-xs py-1.5 bg-charcoal/10 text-charcoal hover:bg-charcoal/20"
          >
            Rotate Key
          </Button>
          <Button
            onClick={() => onToggleActive(agent.id, agent.isActive)}
            className={`text-xs py-1.5 ${
              agent.isActive
                ? "bg-red-50 text-red-600 hover:bg-red-100"
                : "bg-green-50 text-green-600 hover:bg-green-100"
            }`}
          >
            {agent.isActive ? "Deactivate" : "Reactivate"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
