/**
 * Onboarding Guard Utility (Sprint 15 — T049, FR-023)
 *
 * Client-side hook that checks if the logged-in user has completed onboarding.
 * Returns redirect state for use in protected page components.
 *
 * Usage in page components:
 *   const { shouldRedirect, isChecking } = useOnboardingGuard();
 *   useEffect(() => { if (shouldRedirect) router.push("/onboarding"); }, [shouldRedirect]);
 */
import { useState, useEffect } from "react";

import { getHumanAuthHeaders, getHumanToken } from "./api";

interface OnboardingGuardState {
  /** True if user needs to be redirected to /onboarding */
  shouldRedirect: boolean;
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
    isChecking: true,
  });

  useEffect(() => {
    async function checkOnboarding() {
      const token = getHumanToken();
      if (!token) {
        // Not logged in — don't redirect to onboarding (auth check is separate)
        setState({ shouldRedirect: false, isChecking: false });
        return;
      }

      try {
        const res = await fetch("/api/v1/profile", {
          credentials: "include",
          headers: getHumanAuthHeaders(),
        });

        if (!res.ok) {
          // Profile fetch failed — don't block, let the page handle auth
          setState({ shouldRedirect: false, isChecking: false });
          return;
        }

        const json = await res.json();
        const orientationCompleted =
          json.data?.orientationCompleted ?? false;

        setState({
          shouldRedirect: !orientationCompleted,
          isChecking: false,
        });
      } catch {
        // Network error — don't block, let the page handle it
        setState({ shouldRedirect: false, isChecking: false });
      }
    }

    checkOnboarding();
  }, []);

  return state;
}
