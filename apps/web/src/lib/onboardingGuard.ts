/**
 * Onboarding Guard Utility (Sprint 15 — T049, FR-023)
 *
 * Client-side hook that checks if the logged-in user has completed onboarding.
 * Returns redirect state for use in protected page components.
 *
 * Usage in page components:
 *   const { shouldRedirect, redirectTo, isChecking } = useOnboardingGuard();
 *   useEffect(() => { if (shouldRedirect) router.push(redirectTo); }, [shouldRedirect, redirectTo]);
 */
import { useState, useEffect } from "react";

import { API_BASE, getHumanAuthHeaders, getHumanToken } from "./api";

interface OnboardingGuardState {
  /** True if user needs to be redirected to /onboarding */
  shouldRedirect: boolean;
  /** Where to redirect: /auth/human/profile (no profile) or /onboarding (no orientation) */
  redirectTo: "/auth/human/profile" | "/onboarding";
  /** True while the profile check is in progress */
  isChecking: boolean;
}

/**
 * Hook that checks if the current user has completed orientation.
 * Returns shouldRedirect=true if the user is logged in but hasn't completed onboarding.
 */
export function useOnboardingGuard(): OnboardingGuardState {
  const [state, setState] = useState<OnboardingGuardState>({
    shouldRedirect: false,
    redirectTo: "/onboarding",
    isChecking: true,
  });

  useEffect(() => {
    async function checkOnboarding() {
      const token = getHumanToken();
      if (!token) {
        // Not logged in — don't redirect to onboarding (auth check is separate)
        setState({ shouldRedirect: false, redirectTo: "/onboarding", isChecking: false });
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/api/v1/profile`, {
          credentials: "include",
          headers: getHumanAuthHeaders(),
        });

        if (!res.ok) {
          // Profile fetch failed — don't block, let the page handle auth
          setState({ shouldRedirect: false, redirectTo: "/onboarding", isChecking: false });
          return;
        }

        const json = await res.json();

        // Profile doesn't exist yet — user needs to create profile first
        if (json.ok && json.data === null) {
          setState({ shouldRedirect: true, redirectTo: "/auth/human/profile", isChecking: false });
          return;
        }

        const orientationCompleted =
          json.data?.orientationCompleted ?? !!json.data?.orientationCompletedAt;

        setState({
          shouldRedirect: !orientationCompleted,
          redirectTo: "/onboarding",
          isChecking: false,
        });
      } catch {
        // Network error — don't block, let the page handle it
        setState({ shouldRedirect: false, redirectTo: "/onboarding", isChecking: false });
      }
    }

    checkOnboarding();
  }, []);

  return state;
}
