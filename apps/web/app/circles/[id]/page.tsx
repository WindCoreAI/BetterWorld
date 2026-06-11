"use client";

/**
 * Circle Detail Page (Sprint 18: Cooperative Depth & Governance — US9)
 *
 * Circle overview with members, join/leave, guardrail-gated discussion
 * (posts pending until approved), and missions shared in the circle.
 */
import { useParams } from "next/navigation";
import { useState } from "react";

import { CircleDiscussion } from "@/components/circles/CircleDiscussion";
import { domainLabels } from "@/constants/domains";
import { useCircle, useCirclePosts, useCircleMissions, useCircleMutations } from "@/hooks/useCircles";
import { useHumanAuth } from "@/hooks/useHumanAuth";

interface CircleMember {
  humanId: string;
  role: string;
  displayName: string;
  joinedAt: string;
}

interface SharedMission {
  missionId: string;
  missionTitle: string;
  missionDomain: string;
  sharedByName: string;
  createdAt: string;
}

function MembersList({ members }: { members: CircleMember[] }) {
  return (
    <section className="rounded-lg border border-gray-200 p-4">
      <h2 className="text-sm font-semibold mb-3">Members ({members.length})</h2>
      <div className="space-y-2">
        {members.map((member) => (
          <div key={member.humanId} className="flex items-center justify-between text-sm">
            <span className="text-gray-700">{member.displayName}</span>
            {member.role === "founder" && (
              <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-600">Founder</span>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function SharedMissions({ missions }: { missions: SharedMission[] }) {
  return (
    <section className="rounded-lg border border-gray-200 p-4">
      <h2 className="text-sm font-semibold mb-3">Shared Missions</h2>
      {missions.length === 0 ? (
        <p className="text-sm text-gray-500">No missions shared yet.</p>
      ) : (
        <div className="space-y-2">
          {missions.map((mission) => (
            <a
              key={mission.missionId}
              href={`/missions/${mission.missionId}`}
              className="block rounded border border-gray-100 p-2 hover:border-blue-300 transition-colors"
            >
              <p className="text-sm font-medium">{mission.missionTitle}</p>
              <p className="text-xs text-gray-400">
                Shared by {mission.sharedByName} · {domainLabels[mission.missionDomain] ?? mission.missionDomain}
              </p>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}

// eslint-disable-next-line complexity
export default function CircleDetailPage() {
  const params = useParams<{ id: string }>();
  const circleId = params?.id;

  const { user } = useHumanAuth();
  const circleQuery = useCircle(circleId);
  const postsQuery = useCirclePosts(circleId);
  const missionsQuery = useCircleMissions(circleId);
  const { join, leave, createPost } = useCircleMutations();
  const [postNotice, setPostNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (circleQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-500">
          Loading circle...
        </div>
      </div>
    );
  }

  if (!circleQuery.data?.ok) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <a href="/circles" className="text-sm text-blue-600 hover:text-blue-800">← All Circles</a>
        <div className="mt-4 rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-500">
          Circle not found.
        </div>
      </div>
    );
  }

  const { circle, members } = circleQuery.data.data as {
    circle: { id: string; name: string; description: string | null; domain: string | null; memberCount: number };
    members: CircleMember[];
  };
  const posts = postsQuery.data?.ok ? postsQuery.data.data?.posts ?? [] : [];
  const sharedMissions: SharedMission[] = missionsQuery.data?.ok
    ? missionsQuery.data.data?.missions ?? []
    : [];

  const isMember = !!user && members.some((m) => m.humanId === user.id);

  const handleMembershipAction = () => {
    setActionError(null);
    const mutation = isMember ? leave : join;
    mutation.mutate(circle.id, {
      onSuccess: (res) => {
        if (!res.ok) {
          const code = (res as { error?: { code?: string } | string }).error;
          const codeStr = typeof code === "string" ? code : code?.code;
          setActionError(
            codeStr === "CIRCLE_FULL"
              ? "This circle is full (50 members)."
              : codeStr === "CIRCLE_LIMIT"
                ? "You can be a member of at most 3 circles."
                : "Action failed. Please try again.",
          );
        }
      },
      onError: () => setActionError("Action failed. Please try again."),
    });
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <a href="/circles" className="text-sm text-blue-600 hover:text-blue-800">← All Circles</a>

      <div className="mt-4 mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{circle.name}</h1>
          <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
            {circle.domain && (
              <span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-600">
                {domainLabels[circle.domain] ?? circle.domain}
              </span>
            )}
            <span>{circle.memberCount} member{circle.memberCount === 1 ? "" : "s"}</span>
          </div>
        </div>
        {user && (
          <button
            onClick={handleMembershipAction}
            disabled={join.isPending || leave.isPending}
            className={`shrink-0 rounded px-3 py-1.5 text-sm disabled:opacity-50 ${
              isMember
                ? "border border-gray-300 text-gray-600 hover:bg-gray-50"
                : "bg-blue-600 text-white hover:bg-blue-700"
            }`}
          >
            {isMember ? "Leave Circle" : "Join Circle"}
          </button>
        )}
      </div>

      {circle.description && <p className="mb-6 text-sm text-gray-700">{circle.description}</p>}

      {actionError && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {actionError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-lg font-semibold">Discussion</h2>
          {postNotice && (
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
              {postNotice}
            </div>
          )}
          {isMember ? (
            <CircleDiscussion
              circleId={circle.id}
              posts={posts}
              onCreatePost={(content) => {
                setPostNotice(null);
                createPost.mutate(
                  { id: circle.id, content },
                  {
                    onSuccess: (res) => {
                      if (res.ok) {
                        setPostNotice("Post submitted — it will appear once approved by the content guardrails.");
                      } else {
                        setPostNotice("Post could not be submitted. You may have hit the 10 posts/day limit.");
                      }
                    },
                    onError: () => setPostNotice("Post could not be submitted. Please try again."),
                  },
                );
              }}
            />
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-dashed border-gray-300 p-4 text-center text-sm text-gray-500">
                Join the circle to take part in the discussion.
              </div>
              {posts.map((post: { id: string; authorName: string; content: string; createdAt: string }) => (
                <div key={post.id} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{post.authorName}</span>
                    <span className="text-xs text-gray-400">{new Date(post.createdAt).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-gray-700">{post.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-6">
          <MembersList members={members} />
          <SharedMissions missions={sharedMissions} />
        </div>
      </div>
    </div>
  );
}
