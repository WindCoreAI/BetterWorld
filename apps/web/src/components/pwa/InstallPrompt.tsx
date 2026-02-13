"use client";
import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setShowBanner(true);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") setShowBanner(false);
    setDeferredPrompt(null);
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 bg-emerald-600 text-white p-4 rounded-lg shadow-lg flex items-center justify-between z-50 md:left-auto md:right-4 md:w-96">
      <div>
        <p className="font-semibold">Install BetterWorld</p>
        <p className="text-sm text-emerald-100">Add to home screen for quick access</p>
      </div>
      <div className="flex gap-2">
        <button
          onClick={() => setShowBanner(false)}
          className="text-sm text-emerald-200 hover:text-white px-2 py-1"
        >
          Later
        </button>
        <button
          onClick={handleInstall}
          className="bg-white text-emerald-600 px-3 py-1 rounded text-sm font-medium hover:bg-emerald-50"
        >
          Install
        </button>
      </div>
    </div>
  );
}
