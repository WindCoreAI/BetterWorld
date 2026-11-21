"use client";
import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISSED_KEY = "bw_install_prompt_dismissed_at";
const DISMISS_FOR_MS = 14 * 24 * 60 * 60 * 1000;

function wasRecentlyDismissed(): boolean {
  try {
    const at = Number(window.localStorage.getItem(DISMISSED_KEY));
    return Number.isFinite(at) && at > 0 && Date.now() - at < DISMISS_FOR_MS;
  } catch {
    return false;
  }
}

export function InstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      // "Later" means later: it used to come back on every page load.
      if (!wasRecentlyDismissed()) setShowBanner(true);
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

  const handleLater = () => {
    setShowBanner(false);
    try {
      window.localStorage.setItem(DISMISSED_KEY, String(Date.now()));
    } catch {
      // Storage unavailable: hidden for this page view only.
    }
  };

  if (!showBanner) return null;

  return (
    <>
      {/* The banner is fixed to the bottom of the screen. On a phone that is
          exactly where a page's main action sits (e.g. "Claim Mission"), and the
          banner covered it. This in-flow spacer lets the page scroll clear. */}
      <div aria-hidden="true" className="h-28 md:hidden" />
      <div
        role="region"
        aria-label="Install BetterWorld"
        className="fixed bottom-4 left-4 right-4 bg-emerald-600 text-white p-4 rounded-lg shadow-lg flex items-center justify-between z-50 md:left-auto md:right-4 md:w-96"
      >
        <div>
          <p className="font-semibold">Install BetterWorld</p>
          <p className="text-sm text-emerald-100">Add to home screen for quick access</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleLater}
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
    </>
  );
}
