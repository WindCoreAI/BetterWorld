# Deep Scan: Frontend UX Flows & State Management

**Perspective:** User journeys, auth state, error recovery, navigation, offline support, map integration
**Agent:** a19cd67
**Date:** 2026-02-13

---

## 1. Critical User Journeys

### Registration Flow (Register -> Verify -> Profile -> Onboarding -> Dashboard)

**Register** (`/app/auth/human/register/page.tsx`)
- OAuth support properly integrated (Google/GitHub)
- Form validation on submit
- Issue: No client-side password complexity validation before submit

**OAuth Callback** (`/app/auth/human/callback/page.tsx`)
- Exchange flow with authorization code
- Race condition safeguard using `cancelled` flag
- Suspense wrapper for searchParams

**Email Verification** (`/app/auth/human/verify/page.tsx`)
- 6-digit input with auto-focus, paste support, backspace navigation
- 60-second resend cooldown timer
- Good UX: numeric-only input

**Profile Creation** (`/app/auth/human/profile/page.tsx`)
- Auth guard with redirect to login
- Enforces >=1 skill, city/country required, >=1 language
- Issue: No loading feedback during geocoding

**Onboarding** (`/app/onboarding/page.tsx`)
- Completion check and redirect if done
- Progress indicator and step navigation
- Issue: **No explicit enforcement** that onboarding must complete before dashboard access

---

### Mission Marketplace Flow

**Mission List** (`/app/missions/page.tsx`)
- Cursor pagination (does NOT reset cursor on filter change)
- View toggle (List vs Map)
- Issue: **Silent failure on network error** — no retry mechanism

**Mission Detail** (`/app/missions/[id]/page.tsx`)
- Dynamic map with SSR disabled (correct for Leaflet)
- Location privacy: approximate until claimed
- Issue: **No polling for claim status** after evidence submission

**Evidence Submission** (`/app/missions/[id]/submit/page.tsx`)
- GPS detection on mount with 10s timeout
- Real-time validation checklist
- Issue: **Manual auth header** — won't refresh token on expiry

---

### Dispute Filing Flow

**Disputes List** (`/app/disputes/page.tsx`)
- Issue: **Missing `credentials: "include"`** on fetch call

**Dispute Form** (`/src/components/disputes/DisputeForm.tsx`)
- Stake warning with two-step confirmation
- Issue: **No balance check** before showing form

---

## 2. State Management & Token Handling

### Auth Hook (`src/hooks/useHumanAuth.ts`)
- localStorage for access + refresh tokens
- Cross-tab sync via `storage` event
- Issue: localStorage vulnerable to XSS

### API Client (`src/lib/humanApi.ts`)
- Auto-refresh on 401 response, retries with new token
- Issue: **POST retry after refresh could cause duplicate** operations

### React Query Setup (`app/providers.tsx`)
- 60s stale time, 1 retry, no window focus refetch
- Issue: Conservative retry (1 only), no exponential backoff

---

## 3. Error Recovery

- **Missions list:** Silent failure (`catch { }`) — user has no idea why list didn't load
- **Evidence submission:** Throws error with message — user sees error
- **OAuth callback:** Shows error state with retry link — good recovery
- **Evidence form:** Manual header, won't refresh token mid-form

---

## 4. Navigation & Routing

- Root layout properly orders Providers > SW Registration > Offline Indicator > Navigation > children > InstallPrompt > QueueStatus
- Auth-aware navigation handles both agent and human auth states
- Admin layout validates token on mount (no caching — could be slow)

---

## 5. Offline Support & PWA

### Service Worker (`public/sw.js`)
- Network-first for navigation
- Stale-while-revalidate for API reads
- Background sync for observations
- Issue: **SWR could return outdated mission data**

### Offline Queue (`src/lib/offline-queue.ts`)
- IndexedDB storage with max 10 retries
- Exponential backoff up to 5 min
- Issue: **Never removes from queue** — observations pile up if API is down

### PWA Components
- Offline indicator (yellow bar)
- Queue status (polls every 5s)
- Install prompt (beforeinstallprompt event)

---

## 6. Map Integration (Leaflet)

- SSR disabled via `dynamic(() => import(), { ssr: false })` — correct
- Icon URL workaround for Next.js bundler
- Map cleanup on unmount (prevents memory leak)
- XSS prevention: HTML-escapes popup content
- Issue: **No marker clustering** — performance risk with 100+ markers

---

## Key Issues & Recommendations

### Critical
1. **Onboarding enforcement missing** — users can skip onboarding
2. **Token refresh race condition** — POST retry could duplicate operations
3. **Missing credentials on disputes list** — fetch won't include auth
4. **Admin token validation on every page load** — no caching

### High Priority
5. Evidence form has no auth error recovery
6. Missions list has no error message on failure
7. No optimistic UI in claim button
8. Mission detail doesn't poll for updates
9. Offline queue doesn't clean up failed observations
10. Stale-while-revalidate for mission list

### Medium Priority
11. No password validation before registration
12. No retry on OAuth callback failure
13. Dispute form doesn't check balance
14. Evidence form no file preview
15. Marker performance without clustering

### Design/UX
16. 4-page flow before dashboard (consider consolidation)
17. No loading state during geocoding
18. Admin layout makes two network requests per page

---

## Summary

The frontend is well-structured with proper React hooks, Next.js App Router, and TypeScript. Auth flow is robust with token refresh logic. Gaps exist in error handling, offline resilience, and optimistic UI.

**Highest priority fixes:** Token refresh retry safety, error messages on network failures, evidence form auth recovery, onboarding enforcement, offline queue cleanup.
