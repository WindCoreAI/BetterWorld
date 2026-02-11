# Sprint 6 Frontend Implementation Plan

**Goal:** Complete human onboarding flow from registration to dashboard
**Timeline:** 3-4 days
**Priority:** P0 - Blocks Sprint 7

---

## 🎯 Success Criteria

**User Journey:**
1. User visits landing page → clicks "Join as Human"
2. Chooses OAuth (Google/GitHub) or email/password registration
3. Verifies email (6-digit code for email/password)
4. Creates profile (skills, location, languages, bio)
5. Completes orientation tutorial (5 steps, earns 10 IT)
6. Views dashboard (token balance, missions, reputation, activity feed)

**Technical Requirements:**
- All pages follow Next.js 15 App Router conventions
- Tailwind CSS 4 for styling (use existing UI components from `apps/web/src/components/ui/`)
- Zustand for client state management
- React Query for API calls
- WebSocket connection for real-time activity feed
- Mobile-responsive design
- Loading states and error handling on all forms

---

## 📦 Phase 1: Authentication Flow (Day 1)

### 1.1 Email Verification Page
**File:** `apps/web/src/app/auth/verify/page.tsx`

**Features:**
- 6-digit code input (auto-focus, auto-submit when complete)
- Resend code button (disabled for 60s after send)
- Error states: "Code expired" (15min), "Invalid code", "Too many attempts"
- Success redirect to `/profile/create`

**API Integration:**
- `POST /v1/human-auth/verify-email` with `{ email, code }`
- `POST /v1/human-auth/resend-code` with `{ email }`
- Store JWT token in httpOnly cookie on success

**UI Components to use:**
- `Input` from `apps/web/src/components/ui/input.tsx`
- `Button` from `apps/web/src/components/ui/button.tsx`
- `Card` from `apps/web/src/components/ui/card.tsx`

**Acceptance Criteria:**
- [ ] User can enter 6-digit code
- [ ] Code input validates on submit
- [ ] Resend button works with 60s throttle
- [ ] Success redirects to profile creation
- [ ] Error messages display correctly

---

### 1.2 Login Page
**File:** `apps/web/src/app/auth/login/page.tsx`

**Features:**
- Email/password form
- "Forgot password?" link (placeholder for Phase 3)
- OAuth buttons (Google, GitHub)
- "Don't have an account? Sign up" link
- Error states: "Invalid credentials", "Email not verified", "Account locked"

**API Integration:**
- `POST /v1/human-auth/login` with `{ email, password }`
- `GET /v1/human-auth/oauth/google` redirect
- `GET /v1/human-auth/oauth/github` redirect
- Store JWT token in httpOnly cookie on success

**UI Flow:**
- Email/password login → redirect to `/dashboard`
- OAuth login → redirect to `/auth/callback`
- Unverified email → redirect to `/auth/verify?email={email}`
- No profile → redirect to `/profile/create`

**Acceptance Criteria:**
- [ ] Email/password login works
- [ ] OAuth buttons redirect correctly
- [ ] Error states display
- [ ] Redirects to correct page based on user state

---

### 1.3 OAuth Callback Handler
**File:** `apps/web/src/app/auth/callback/page.tsx`

**Features:**
- Parse OAuth callback URL parameters (`code`, `state`)
- Exchange code for JWT token
- Handle errors (state mismatch, code expired, provider error)
- Redirect based on user state:
  - Has profile + completed orientation → `/dashboard`
  - Has profile, no orientation → `/onboarding`
  - No profile → `/profile/create`

**API Integration:**
- Backend handles OAuth token exchange (already implemented)
- Frontend receives JWT via cookie or URL parameter
- `GET /v1/profile` to check profile status
- `GET /v1/dashboard` to check orientation status

**Loading State:**
- Show spinner with "Completing sign-in..."
- Handle callback in useEffect, redirect when ready

**Acceptance Criteria:**
- [ ] Google OAuth callback works
- [ ] GitHub OAuth callback works
- [ ] State parameter validated
- [ ] Correct redirect based on user state
- [ ] Errors display with retry option

---

### 1.4 Update Registration Page
**File:** `apps/web/src/app/auth/register/page.tsx` (already exists, needs completion)

**Current State:** Basic shell, needs full implementation

**Features:**
- Email/password registration form
- Display name input
- Password strength indicator
- "Already have an account? Log in" link
- OAuth buttons (Google, GitHub)
- Terms of service checkbox

**API Integration:**
- `POST /v1/human-auth/register` with `{ email, password, displayName }`
- On success → redirect to `/auth/verify?email={email}`
- OAuth buttons → same as login page

**Validation:**
- Email format (Zod schema)
- Password requirements: 8+ chars, uppercase, lowercase, number, special char
- Display name 2-50 chars
- Real-time validation feedback

**Acceptance Criteria:**
- [ ] Email/password registration works
- [ ] Password strength indicator updates
- [ ] OAuth buttons work
- [ ] Success redirects to verification
- [ ] Validation errors display inline

---

## 📦 Phase 2: Profile Management (Day 1.5)

### 2.1 Profile Creation Form
**File:** `apps/web/src/app/profile/create/page.tsx`

**Features:**
- **Skills** (multi-select dropdown, from predefined list)
  - List: "python", "javascript", "design", "writing", "research", "community-organizing", "data-analysis", "teaching", "translation"
  - Allow adding custom skills
- **Location** (city + country inputs, geocoded on submit)
  - City autocomplete (optional, via Nominatim search)
  - Country dropdown (ISO 3166-1 alpha-2)
- **Languages** (multi-select, ISO 639-1 codes)
  - Common: "en", "es", "zh", "hi", "ar", "pt", "bn", "ru", "ja", "de", "fr"
- **Availability** (weekly schedule picker)
  - Checkboxes for days (Mon-Sun)
  - Time range picker (start/end hours in local timezone)
- **Bio** (textarea, 500 char limit)
- **Optional fields:**
  - Wallet address (Ethereum address validation)
  - Certifications (multi-select tags)

**API Integration:**
- `POST /v1/profile` with full profile data
- On success → redirect to `/onboarding`
- Handle geocoding failures (show warning, allow save with null location)

**UI Components:**
- Multi-select: Use Headless UI Combobox or custom component
- Time picker: Simple dropdowns (0-23 hours)
- Textarea with character counter

**Profile Completeness Preview:**
- Show real-time completeness score (0-100%)
- "Skip for now" button (redirects to `/onboarding` with incomplete profile)

**Acceptance Criteria:**
- [ ] All fields render correctly
- [ ] Multi-selects work (skills, languages)
- [ ] Location geocoding works
- [ ] Availability schedule saves correctly
- [ ] Profile completeness score updates
- [ ] Success redirects to orientation

---

### 2.2 Profile Settings Page
**File:** `apps/web/src/app/profile/settings/page.tsx`

**Features:**
- Reuse profile creation form components
- Pre-fill with existing profile data
- "Save Changes" button
- Profile completeness card (show score + suggestions)
- Success toast notification

**API Integration:**
- `GET /v1/profile` to fetch current profile
- `PATCH /v1/profile` to update
- `GET /v1/profile/completeness` for detailed breakdown

**Additional Features:**
- Avatar upload placeholder (Phase 3)
- "Delete Account" button (confirmation modal)

**Acceptance Criteria:**
- [ ] Form pre-fills with existing data
- [ ] Updates save correctly
- [ ] Completeness card shows suggestions
- [ ] Success toast displays

---

### 2.3 Profile Completeness Card Component
**File:** `apps/web/src/components/dashboard/ProfileCompletenessCard.tsx`

**Features:**
- Circular progress bar (0-100%)
- Color coding:
  - 0-30%: Red (Incomplete)
  - 31-70%: Yellow (Getting there)
  - 71-100%: Green (Complete)
- Top 3 suggestions to improve score:
  - "Add your skills" (+25%)
  - "Set your availability" (+20%)
  - "Complete your bio" (+15%)
- "Edit Profile" button → `/profile/settings`

**Implementation:**
- Use Tailwind CSS for circular progress (conic-gradient)
- Fetch completeness data from dashboard API

**Acceptance Criteria:**
- [ ] Progress bar renders correctly
- [ ] Suggestions are relevant
- [ ] Button links to settings page

---

## 📦 Phase 3: Orientation Tutorial (Day 2)

### 3.1 Onboarding Page Layout
**File:** `apps/web/src/app/onboarding/page.tsx`

**Features:**
- 5-step wizard with progress indicator
- "Skip for now" button (warns: "You won't be able to claim missions until orientation is complete")
- Step navigation: "Next", "Previous", "Skip"
- Progress saved to backend after each step
- Final step: "Claim Your Reward" button

**State Management:**
- Zustand store for current step (client-side)
- Sync with backend on step change
- Fetch orientation progress on mount: `GET /v1/dashboard` → `human.orientationCompletedAt`

**API Integration:**
- `PATCH /v1/profile` with `{ metadata: { orientation_step: 1-5 } }`
- `POST /v1/tokens/orientation-reward` on final step

**Progress Indicator:**
- 5 dots/steps at top
- Current step highlighted
- Completed steps with checkmark

**Acceptance Criteria:**
- [ ] 5 steps render correctly
- [ ] Progress saves on navigation
- [ ] Can resume from saved step
- [ ] Skip button works with warning
- [ ] Final step claims reward

---

### 3.2 Orientation Step Components

#### Step 1: Constitution
**File:** `apps/web/src/components/onboarding/OrientationStep1Constitution.tsx`

**Content:**
- Heading: "Welcome to BetterWorld"
- Subheading: "A platform where AI agents and humans collaborate for social good"
- Key points:
  - 15 UN SDG-aligned impact domains
  - 3-layer constitutional guardrails ensure all activity targets social good
  - Agents propose problems and solutions, humans execute missions
  - Earn ImpactTokens for verified contributions
- "Next: Explore Domains" button

---

#### Step 2: Domains
**File:** `apps/web/src/components/onboarding/OrientationStep2Domains.tsx`

**Content:**
- Heading: "15 Impact Domains"
- Grid of domain cards (3x5 layout on desktop, 1 column on mobile):
  1. Clean Water & Sanitation
  2. Affordable Clean Energy
  3. Climate Action
  4. Life Below Water
  5. Life on Land
  6. Zero Hunger
  7. Good Health & Well-Being
  8. Quality Education
  9. Gender Equality
  10. Decent Work & Economic Growth
  11. Industry, Innovation & Infrastructure
  12. Reduced Inequalities
  13. Sustainable Cities & Communities
  14. Responsible Consumption & Production
  15. Peace, Justice & Strong Institutions
- Each card: Icon + Name (no need for descriptions in orientation)
- "Next: Learn About Missions" button

---

#### Step 3: Missions
**File:** `apps/web/src/components/onboarding/OrientationStep3Missions.tsx`

**Content:**
- Heading: "How Missions Work"
- 4-step flow diagram:
  1. **Agents Identify Problems** → AI agents scan data, propose social issues
  2. **Agents Design Solutions** → Solutions decomposed into actionable missions
  3. **Humans Claim Missions** → Browse marketplace, claim based on skills/location
  4. **Evidence Submitted** → Upload photos, documents, or other proof of completion
- "Next: Evidence & Verification" button

---

#### Step 4: Evidence
**File:** `apps/web/src/components/onboarding/OrientationStep4Evidence.tsx`

**Content:**
- Heading: "Evidence & Verification"
- Explanation:
  - All mission completions require evidence (photos, documents, reports)
  - Multi-stage verification pipeline ensures quality
  - Evidence stored permanently on-chain (Phase 3 feature)
  - Verified missions earn ImpactTokens + reputation
- Example evidence types:
  - Before/after photos
  - Receipts or invoices
  - Sign-in sheets
  - Testimonials or survey results
- "Next: ImpactTokens" button

---

#### Step 5: Tokens
**File:** `apps/web/src/components/onboarding/OrientationStep5Tokens.tsx`

**Content:**
- Heading: "ImpactTokens (IT)"
- Explanation:
  - ImpactTokens are the platform currency
  - Earned by completing verified missions
  - Spent on: voting (1-10 IT), joining circles (50 IT), premium analytics (20 IT)
  - Cannot be transferred or sold (soulbound in Phase 3)
- **Reward section:**
  - "Congratulations! You've completed orientation."
  - "Claim your 10 ImpactTokens to get started."
  - Big "Claim 10 IT" button
- On success:
  - Show success animation (confetti or checkmark)
  - Display updated balance: "Your balance: 10 IT"
  - "Go to Dashboard" button

**API Integration:**
- `POST /v1/tokens/orientation-reward`
- Handle idempotency (if already claimed, show "Already claimed" message)
- Update Zustand store with new balance

**Acceptance Criteria:**
- [ ] Reward claim button works
- [ ] Success animation displays
- [ ] Balance updates correctly
- [ ] Redirect to dashboard works
- [ ] Duplicate claims prevented

---

## 📦 Phase 4: Human Dashboard (Day 3-4)

### 4.1 Dashboard Layout
**File:** `apps/web/src/app/dashboard/page.tsx`

**Layout:** Responsive grid (2 columns on desktop, 1 column on mobile)

**Top Row:**
- Profile header (avatar, display name, email)
- "Edit Profile" button

**Grid Cards:**
1. **TokenBalanceCard** (top-left)
2. **ReputationCard** (top-right)
3. **ProfileCompletenessCard** (middle-left)
4. **MissionsCard** (middle-right)
5. **ActivityFeed** (bottom, full-width)

**API Integration:**
- `GET /v1/dashboard` (single aggregated request)
- WebSocket connection for real-time activity feed

**Loading State:**
- Skeleton loaders for each card
- Progressive rendering as data arrives

**Acceptance Criteria:**
- [ ] Dashboard loads data from API
- [ ] All cards render correctly
- [ ] Layout is mobile-responsive
- [ ] Loading states display

---

### 4.2 Token Balance Card
**File:** `apps/web/src/components/dashboard/TokenBalanceCard.tsx`

**Features:**
- Large balance display: "10 IT"
- Stats:
  - Total earned: 10 IT
  - Total spent: 0 IT
  - Pending: 0 IT (from unclaimed missions, Sprint 7)
- "View Transactions" button → `/tokens/transactions`

**Styling:**
- Use gradient background (purple/blue)
- Large token icon
- Responsive text sizing

**Acceptance Criteria:**
- [ ] Balance displays correctly
- [ ] Stats are accurate
- [ ] Button links to transactions page

---

### 4.3 Reputation Card
**File:** `apps/web/src/components/dashboard/ReputationCard.tsx`

**Features:**
- Reputation score: 0-100 (default: 50 for new users)
- Rank label: "Newcomer", "Contributor", "Champion", "Legend"
- Percentile: "Top 50%"
- Factors affecting reputation:
  - Missions completed
  - Evidence quality
  - Community engagement
- "Learn More" tooltip

**Implementation:**
- Fetch from dashboard API: `user.reputationScore`
- Rank calculation:
  - 0-25: Newcomer
  - 26-50: Contributor
  - 51-75: Champion
  - 76-100: Legend

**Acceptance Criteria:**
- [ ] Score displays correctly
- [ ] Rank label is accurate
- [ ] Tooltip explains reputation system

---

### 4.4 Missions Card
**File:** `apps/web/src/components/dashboard/MissionsCard.tsx`

**Features (Sprint 6):**
- **Empty state:** "Complete orientation to unlock missions"
- Stats (all 0 for Sprint 6):
  - Active missions: 0
  - Completed missions: 0
  - Streak: 0 days
- "Browse Missions" button (disabled with tooltip: "Available in Sprint 7")

**Features (Sprint 7):**
- List of active missions (mission name, progress, deadline)
- "Browse Missions" button → `/missions`

**Acceptance Criteria:**
- [ ] Empty state displays for new users
- [ ] Button is disabled with tooltip
- [ ] Ready for Sprint 7 data integration

---

### 4.5 Activity Feed Component
**File:** `apps/web/src/components/dashboard/ActivityFeed.tsx`

**Features:**
- Real-time updates via WebSocket
- Show last 10 events:
  - `token_earned`: "You earned 10 IT from Orientation Reward"
  - `token_spent`: "You spent 5 IT on Voting"
  - `mission_completed`: "You completed Mission: Clean Local Park" (Sprint 7)
- Each event: Icon + Description + Timestamp
- "View All Activity" link → `/activity` (Phase 3)

**WebSocket Events:**
- Connect to `wss://api.betterworld.ai/v1/ws/activity`
- Subscribe to user-specific events
- Handle reconnection on disconnect

**Styling:**
- Scrollable list (max-height: 400px)
- Newest events at top
- Smooth animation on new event

**Acceptance Criteria:**
- [ ] WebSocket connection works
- [ ] Events display in real-time
- [ ] Timestamps are human-readable
- [ ] Scrolling works correctly

---

### 4.6 WebSocket Client
**File:** `apps/web/src/lib/websocket.ts`

**Features:**
- Connect to WebSocket endpoint
- Authenticate with JWT token
- Handle events: `token_earned`, `token_spent`, `mission_completed`
- Auto-reconnect on disconnect (exponential backoff)
- Update Zustand store on events

**Implementation:**
```typescript
export class ActivityFeedClient {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;

  connect(token: string) {
    this.ws = new WebSocket(`wss://api.betterworld.ai/v1/ws/activity?token=${token}`);
    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      // Update Zustand store
      useActivityStore.getState().addEvent(data);
    };
    this.ws.onerror = () => this.reconnect();
  }

  reconnect() {
    setTimeout(() => {
      this.reconnectAttempts++;
      this.connect(/* token */);
    }, Math.min(1000 * 2 ** this.reconnectAttempts, 30000));
  }
}
```

**Zustand Store:**
- `activityEvents`: Array of events
- `addEvent()`: Prepend new event
- `clearEvents()`: Reset feed

**Acceptance Criteria:**
- [ ] WebSocket connects successfully
- [ ] Events update Zustand store
- [ ] Auto-reconnect works
- [ ] No memory leaks on disconnect

---

### 4.7 Transaction History Page
**File:** `apps/web/src/app/tokens/transactions/page.tsx`

**Features:**
- Cursor-paginated list of transactions
- Columns: Type, Amount, Description, Timestamp
- Filter by type: All, Earned, Spent
- "Load More" button for pagination

**API Integration:**
- `GET /v1/tokens/transactions?limit=20&cursor={cursor}`
- Next cursor from API response

**Transaction Types:**
- `earn_orientation`: "+10 IT • Orientation Reward"
- `earn_mission`: "+25 IT • Completed Mission: ..." (Sprint 7)
- `spend_vote`: "-5 IT • Voted on Problem #123"
- `spend_circle`: "-50 IT • Joined Circle: ..."
- `spend_analytics`: "-20 IT • Unlocked Premium Analytics"

**Acceptance Criteria:**
- [ ] Transactions load from API
- [ ] Pagination works
- [ ] Filter by type works
- [ ] Timestamps are readable

---

## 📦 Phase 5: Integration Tests (Day 5)

### 5.1 Test Files to Create

**Location:** `apps/api/src/__tests__/integration/human/`

1. **emailPasswordFlow.test.ts**
   - Register → verify email → login → create profile → orientation → dashboard

2. **googleOAuthFlow.test.ts**
   - Mock Google OAuth callback → profile creation → orientation → dashboard

3. **githubOAuthFlow.test.ts**
   - Mock GitHub OAuth callback → profile creation → orientation → dashboard

4. **profileCompleteness.test.ts**
   - Create profile with 0%, 50%, 75%, 100% completeness
   - Verify scoring algorithm

5. **orientationReward.test.ts**
   - Complete orientation → claim 10 IT
   - Verify duplicate claim fails
   - Verify idempotency

6. **tokenSpending.test.ts**
   - Spend tokens on voting, circles, analytics
   - Test insufficient balance error
   - Test idempotency with same key

7. **concurrentTokens.test.ts**
   - Launch 1000 concurrent token operations
   - Verify no deadlocks, p95 < 500ms

8. **geocodingFlow.test.ts**
   - Valid city → geocoded correctly
   - Invalid city → location null
   - Redis cache hit rate > 80%

9. **verificationExpiry.test.ts**
   - Code expires after 15 minutes
   - Resend throttling (3/hour)

10. **dashboardAggregation.test.ts**
    - Verify all data in one request
    - Incomplete profile → suggestions shown
    - Pending orientation → CTA shown

### 5.2 Test Coverage Requirements

**Target Coverage (from spec):**
- Guardrails: >= 95%
- Tokens: >= 90%
- Database: >= 85%
- API: >= 80%
- Global: >= 75%

**Sprint 6 New Code:**
- Auth routes: >= 80%
- Profile routes: >= 80%
- Token routes: >= 90% (critical path)
- Dashboard route: >= 80%

**Run Tests:**
```bash
pnpm test --filter @betterworld/api
pnpm test:coverage
```

**Acceptance Criteria:**
- [ ] 15+ integration tests written
- [ ] All tests pass
- [ ] Coverage meets requirements
- [ ] No regressions in Phase 1 tests (652 tests)

---

## 📦 Shared UI Components Inventory

**Already exist in:** `apps/web/src/components/ui/`

- ✅ `button.tsx` - Button component (primary, secondary, outline variants)
- ✅ `card.tsx` - Card, CardHeader, CardTitle, CardContent
- ✅ `input.tsx` - Input field with validation states
- ✅ `badge.tsx` - Badge component for tags
- ✅ Additional components: (check directory for full list)

**Need to create:**
- [ ] `multi-select.tsx` - Multi-select dropdown (for skills, languages)
- [ ] `progress-circle.tsx` - Circular progress indicator (for completeness)
- [ ] `time-picker.tsx` - Time range picker (for availability)
- [ ] `modal.tsx` - Modal/dialog component (for confirmations)
- [ ] `toast.tsx` - Toast notification system (for success messages)

---

## 🔧 Development Setup

### Prerequisites
- Node.js 22+
- pnpm 8+
- Docker (for PostgreSQL + Redis)

### Environment Variables
**File:** `apps/web/.env.local`
```bash
NEXT_PUBLIC_API_URL=http://localhost:4000/v1
NEXT_PUBLIC_WS_URL=ws://localhost:4000/v1/ws
```

### Start Development
```bash
# Start database services
docker-compose up -d

# Install dependencies
pnpm install --frozen-lockfile

# Start API (terminal 1)
pnpm --filter @betterworld/api dev

# Start Web (terminal 2)
pnpm --filter @betterworld/web dev

# Visit http://localhost:3000
```

### Testing Backend APIs
```bash
# Test registration
curl -X POST http://localhost:4000/v1/human-auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"SecurePass123!","displayName":"Test User"}'

# Check logs for verification code
# Complete flow as documented in IMPLEMENTATION_SUMMARY.md
```

---

## 📋 Task Dependencies

```
Phase 1: Authentication
├─ 1.1 Email Verification Page
├─ 1.2 Login Page
├─ 1.3 OAuth Callback Handler
└─ 1.4 Update Registration Page
    ↓
Phase 2: Profile
├─ 2.1 Profile Creation Form (depends on 1.3)
├─ 2.2 Profile Settings Page (depends on 2.1)
└─ 2.3 Profile Completeness Card (depends on 2.1)
    ↓
Phase 3: Orientation
├─ 3.1 Onboarding Layout (depends on 2.1)
└─ 3.2 Step Components (5 components, parallel)
    ↓
Phase 4: Dashboard
├─ 4.1 Dashboard Layout (depends on 3.1)
├─ 4.2 Token Balance Card
├─ 4.3 Reputation Card
├─ 4.4 Missions Card
├─ 4.5 Activity Feed Component
├─ 4.6 WebSocket Client (depends on 4.5)
└─ 4.7 Transaction History Page
    ↓
Phase 5: Tests
└─ 10 integration test files (parallel)
```

---

## ✅ Daily Milestones

**Day 1: Authentication Flow**
- [ ] Registration page complete
- [ ] Email verification page complete
- [ ] Login page complete
- [ ] OAuth callback handler complete
- [ ] Can register and verify email

**Day 2: Profile & Orientation**
- [ ] Profile creation form complete
- [ ] Profile settings page complete
- [ ] Onboarding layout complete
- [ ] 5 orientation steps complete
- [ ] Can create profile and complete orientation

**Day 3: Dashboard (Part 1)**
- [ ] Dashboard layout complete
- [ ] Token balance card complete
- [ ] Reputation card complete
- [ ] Profile completeness card complete

**Day 4: Dashboard (Part 2)**
- [ ] Missions card complete
- [ ] Activity feed complete
- [ ] WebSocket client complete
- [ ] Transaction history page complete
- [ ] Full user journey works end-to-end

**Day 5: Testing**
- [ ] 15+ integration tests complete
- [ ] All tests passing
- [ ] Coverage requirements met
- [ ] Sprint 6 exit criteria satisfied

---

## 🎯 Sprint 6 Exit Criteria (Updated)

| # | Criterion | Status | Evidence |
|---|-----------|--------|----------|
| 1 | Database migration deployed | ✅ Done | 5 tables in production |
| 2 | Humans can register | ⏳ Backend done | Frontend: Days 1-2 |
| 3 | Email verification | ⏳ Backend done | Frontend: Day 1 |
| 4 | Profile creation | ⏳ Backend done | Frontend: Day 2 |
| 5 | Orientation tutorial | ⏳ Backend done | Frontend: Day 2 |
| 6 | Human dashboard | ⏳ Backend done | Frontend: Days 3-4 |
| 7 | ImpactToken accounting | ✅ Done | Double-entry enforced |
| 8 | Token spending | ✅ Done | Voting, circles, analytics |
| 9 | Token ledger API | ✅ Done | Pagination, idempotency |
| 10 | Profile completeness | ✅ Done | Weighted scoring |
| 11 | All tests pass | ✅ Done (652) | Phase 1 baseline |
| 12 | **15+ integration tests** | ⏳ Pending | Day 5 |
| 13 | OAuth PKCE | ✅ Done | Security verified |

**After completion: 13/13 (100%)**

---

## 📞 Questions & Clarifications

**Before starting implementation:**
1. OAuth provider credentials ready? (Google Cloud Console + GitHub Developer Settings)
2. Design mockups available? (or use Tailwind default styling)
3. Icon library preference? (Heroicons, Lucide, or custom)
4. Toast notification library? (react-hot-toast, sonner, or custom)
5. State management: Zustand already in project?

**Next Steps:**
- Review this plan
- Get answers to questions above
- Start implementation (Phase 1, Day 1)

---

**Last Updated:** 2026-02-10
**Estimated Completion:** 2026-02-14 (5 days)
**Sprint 7 Start:** 2026-02-17
