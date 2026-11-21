/**
 * Remember where someone was heading before they were sent to sign in.
 *
 * A person who opens a mission link and taps "Sign in to claim" goes through
 * sign-up, email verification, profile and orientation — and used to end up on
 * the dashboard with no way back to the mission that brought them. Every one of
 * those flows ends at the dashboard, so the dashboard consumes this once and
 * sends them on.
 *
 * Stored per tab (sessionStorage) and only ever a same-site path.
 */
const KEY = "bw_return_to";

function isSafePath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//") && !path.includes("\\") && !path.includes("\n");
}

export function rememberReturnTo(path: string): void {
  if (typeof window === "undefined" || !isSafePath(path)) return;
  try {
    window.sessionStorage.setItem(KEY, path);
  } catch {
    // Storage unavailable (private mode): the person simply lands on the dashboard.
  }
}

/**
 * Take the remembered path now, but only if it is `prefix` or below it;
 * otherwise leave it for the dashboard.
 *
 * Used right after sign-in for the operator area: reviewing content needs no
 * participant profile, so an operator heading to /admin should not be walked
 * through profile creation and orientation first.
 */
export function consumeReturnToUnder(prefix: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(KEY);
    if (value === null || !isSafePath(value)) return null;
    if (value !== prefix && !value.startsWith(`${prefix}/`)) return null;
    window.sessionStorage.removeItem(KEY);
    return value;
  } catch {
    return null;
  }
}

export function consumeReturnTo(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.sessionStorage.getItem(KEY);
    if (value === null) return null;
    window.sessionStorage.removeItem(KEY);
    return isSafePath(value) ? value : null;
  } catch {
    return null;
  }
}
