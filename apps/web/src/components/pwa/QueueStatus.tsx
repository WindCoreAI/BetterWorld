"use client";
import { useState, useEffect } from "react";
import { getQueueCount } from "../../lib/offline-queue";

export function QueueStatus() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const update = async () => {
      try {
        const c = await getQueueCount();
        setCount(c);
      } catch {
        // IndexedDB not available
      }
    };
    update();
    const interval = setInterval(update, 5000);
    return () => clearInterval(interval);
  }, []);

  if (count === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-full shadow-lg text-sm z-40">
      {count} observation{count !== 1 ? "s" : ""} queued for upload
    </div>
  );
}
