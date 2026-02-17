"use client";

import { useState } from "react";

interface Post {
  id: string;
  authorName: string;
  content: string;
  createdAt: string;
}

interface CircleDiscussionProps {
  circleId: string;
  posts: Post[];
  onCreatePost: (content: string) => void;
}

export function CircleDiscussion({ circleId: _circleId, posts, onCreatePost }: CircleDiscussionProps) {
  const [newPost, setNewPost] = useState("");

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-gray-200 p-3">
        <textarea
          value={newPost}
          onChange={(e) => setNewPost(e.target.value)}
          placeholder="Share something with the circle..."
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          rows={3}
        />
        <div className="mt-2 flex justify-end">
          <button
            onClick={() => { onCreatePost(newPost); setNewPost(""); }}
            disabled={newPost.length < 5}
            className="rounded bg-blue-600 px-3 py-1.5 text-xs text-white hover:bg-blue-700 disabled:opacity-50"
          >
            Post
          </button>
        </div>
      </div>
      {posts.length === 0 ? (
        <p className="text-center text-sm text-gray-500 py-4">No posts yet. Start the discussion!</p>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
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
  );
}
