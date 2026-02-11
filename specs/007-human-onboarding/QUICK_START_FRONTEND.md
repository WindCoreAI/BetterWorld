# Sprint 6 Frontend - Quick Start Guide

**Status:** Ready to implement
**Estimated Time:** 3-4 days
**Backend:** ✅ 100% complete and tested

---

## 🎯 What You're Building

A complete human onboarding flow:
```
Registration → Email Verify → Login → Profile → Orientation → Dashboard
```

---

## ✅ What's Already Done

### Backend APIs (All Working)
- ✅ Registration (email/password + OAuth)
- ✅ Email verification (6-digit codes)
- ✅ Profile CRUD with geocoding
- ✅ Token system (earn, spend, transactions)
- ✅ Dashboard aggregation API
- ✅ WebSocket activity feed

### Frontend Infrastructure
- ✅ Next.js 15 with App Router
- ✅ Tailwind CSS 4
- ✅ React Query + Zustand
- ✅ UI components: Button, Card, Input, Badge
- ✅ Basic registration page shell

### Test All Backend APIs
```bash
# Terminal 1: Start API
cd /Users/zhiruifeng/Workspace/WindCore/BetterWorld
pnpm --filter @betterworld/api dev

# Terminal 2: Test endpoints (see IMPLEMENTATION_SUMMARY.md for full curl examples)
curl -X POST http://localhost:4000/v1/human-auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"SecurePass123!","displayName":"Test"}'
```

---

## 📋 Implementation Priority Order

### **Priority 1: Core User Flow** (Day 1-2)
Must complete these for users to register and reach dashboard:

1. ✅ **Registration page** (already has basic shell at `/auth/register`)
   - Enhance with validation and error handling

2. 🟡 **Email verification** (`/auth/verify`)
   - 6-digit code input
   - Resend button with throttling

3. 🟡 **Login page** (`/auth/login`)
   - Email/password form
   - OAuth buttons

4. 🟡 **OAuth callback** (`/auth/callback`)
   - Handle OAuth redirect
   - Store JWT token
   - Route to correct page

5. 🟡 **Profile creation** (`/profile/create`)
   - Skills, location, languages, bio
   - Geocoding integration

6. 🟡 **Orientation tutorial** (`/onboarding`)
   - 5-step wizard
   - Claim 10 IT reward

7. 🟡 **Dashboard** (`/dashboard`)
   - Token balance card
   - Profile completeness card
   - Missions card (empty state)
   - Activity feed (WebSocket)

---

## 🚀 Day-by-Day Implementation Plan

### **Day 1: Auth Flow** ⚡
**Goal:** Users can register, verify email, and log in

#### Morning: Complete Registration
File: `apps/web/src/app/auth/register/page.tsx` (already exists)

**Add:**
- Password strength indicator
- Real-time validation
- Better error handling
- Terms of service checkbox

**Time:** 2 hours

---

#### Afternoon: Email Verification + Login
Files to create:
- `apps/web/src/app/auth/verify/page.tsx`
- `apps/web/src/app/auth/login/page.tsx`

**Verify page features:**
```tsx
- 6-digit code input (auto-submit when complete)
- Resend button (60s cooldown)
- Error states: expired, invalid, too many attempts
- Success → redirect to /profile/create
```

**Login page features:**
```tsx
- Email/password form
- OAuth buttons (Google, GitHub)
- "Forgot password?" link
- "Sign up" link
- Error handling
```

**Time:** 4 hours

---

#### Evening: OAuth Callback
File: `apps/web/src/app/auth/callback/page.tsx`

**Features:**
```tsx
- Parse URL params (code, state)
- Store JWT in httpOnly cookie
- Check user state (has profile? completed orientation?)
- Redirect accordingly:
  - No profile → /profile/create
  - No orientation → /onboarding
  - Complete → /dashboard
```

**Time:** 2 hours

**✅ Day 1 Milestone:** Users can register, verify email, and log in via email or OAuth

---

### **Day 2: Profile & Orientation** 🎓
**Goal:** Users can create profile and complete orientation

#### Morning: Profile Creation Form
File: `apps/web/src/app/profile/create/page.tsx`

**Form fields:**
```tsx
✅ Skills (multi-select)
✅ Location (city + country, geocoded via API)
✅ Languages (multi-select)
✅ Availability (day checkboxes + time ranges)
✅ Bio (textarea, 500 chars)
❌ Wallet address (optional)
❌ Certifications (optional)
```

**Features:**
- Real-time profile completeness score (0-100%)
- "Skip for now" button
- Geocoding with Nominatim API
- Form validation with Zod
- Success → redirect to /onboarding

**Time:** 5 hours

---

#### Afternoon: Orientation Wizard (Part 1)
File: `apps/web/src/app/onboarding/page.tsx`

**Layout:**
```tsx
- Progress indicator (5 steps)
- Step container
- Navigation buttons (Back, Next, Skip)
- Step content area
```

**State management:**
```tsx
- Current step (1-5) in Zustand
- Save progress to API after each step
- Resume from saved step on mount
```

**Time:** 2 hours

---

#### Evening: Orientation Steps (Part 2)
Files: `apps/web/src/components/onboarding/OrientationStep[1-5].tsx`

**5 components:**
1. **Constitution** - Welcome + key principles
2. **Domains** - 15 impact domains grid
3. **Missions** - How missions work (4-step diagram)
4. **Evidence** - Verification process
5. **Tokens** - ImpactTokens + "Claim 10 IT" button

**Step 5 integration:**
```tsx
// Call orientation reward API
const claimReward = async () => {
  const response = await fetch('/v1/tokens/orientation-reward', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (response.ok) {
    // Update balance in Zustand
    // Show success animation
    // Redirect to /dashboard
  }
};
```

**Time:** 3 hours

**✅ Day 2 Milestone:** Users can create profile and complete orientation (earn 10 IT)

---

### **Day 3: Dashboard (Part 1)** 📊
**Goal:** Dashboard loads with token balance and profile cards

#### Morning: Dashboard Layout + API Integration
File: `apps/web/src/app/dashboard/page.tsx`

**API call:**
```tsx
const { data } = useQuery({
  queryKey: ['dashboard'],
  queryFn: async () => {
    const response = await fetch('/v1/dashboard', {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.json();
  }
});
```

**Layout:**
```tsx
<div className="grid grid-cols-1 md:grid-cols-2 gap-6">
  <TokenBalanceCard balance={data.tokens.balance} />
  <ReputationCard score={data.user.reputationScore} />
  <ProfileCompletenessCard score={data.profileCompleteness.score} />
  <MissionsCard missions={data.missions} />
  <ActivityFeed events={data.activity} />
</div>
```

**Time:** 3 hours

---

#### Afternoon: Token Balance + Reputation Cards
Files:
- `apps/web/src/components/dashboard/TokenBalanceCard.tsx`
- `apps/web/src/components/dashboard/ReputationCard.tsx`

**Token Balance Card:**
```tsx
- Large balance display: "10 IT"
- Stats: Total earned, Total spent, Pending
- "View Transactions" button
- Gradient background
```

**Reputation Card:**
```tsx
- Score: 0-100
- Rank label: "Newcomer" | "Contributor" | "Champion" | "Legend"
- Percentile: "Top 50%"
- Tooltip explaining reputation
```

**Time:** 3 hours

---

#### Evening: Profile Completeness Card
File: `apps/web/src/components/dashboard/ProfileCompletenessCard.tsx`

**Features:**
```tsx
- Circular progress bar (0-100%)
- Color coding: Red (0-30%), Yellow (31-70%), Green (71-100%)
- Top 3 suggestions:
  - "Add your skills" (+25%)
  - "Set your availability" (+20%)
  - "Complete your bio" (+15%)
- "Edit Profile" button → /profile/settings
```

**Implementation:**
```tsx
// Use conic-gradient for circular progress
background: `conic-gradient(
  from 0deg,
  #10b981 0deg ${percentage * 3.6}deg,
  #e5e7eb ${percentage * 3.6}deg 360deg
)`
```

**Time:** 2 hours

**✅ Day 3 Milestone:** Dashboard displays token balance, reputation, and profile completeness

---

### **Day 4: Dashboard (Part 2)** 🔄
**Goal:** Complete dashboard with missions card and real-time activity feed

#### Morning: Missions Card
File: `apps/web/src/components/dashboard/MissionsCard.tsx`

**Sprint 6 version (empty state):**
```tsx
<Card>
  <CardHeader>
    <h3>Your Missions</h3>
  </CardHeader>
  <CardContent>
    {/* Empty state */}
    <div className="text-center py-8">
      <p className="text-gray-500">Complete orientation to unlock missions</p>
      <Button disabled className="mt-4">
        Browse Missions
        <Tooltip>Available in Sprint 7</Tooltip>
      </Button>
    </div>

    {/* Stats (all 0) */}
    <div className="grid grid-cols-3 gap-4 mt-4">
      <div>
        <p className="text-2xl font-bold">0</p>
        <p className="text-sm text-gray-500">Active</p>
      </div>
      <div>
        <p className="text-2xl font-bold">0</p>
        <p className="text-sm text-gray-500">Completed</p>
      </div>
      <div>
        <p className="text-2xl font-bold">0</p>
        <p className="text-sm text-gray-500">Streak</p>
      </div>
    </div>
  </CardContent>
</Card>
```

**Time:** 2 hours

---

#### Afternoon: WebSocket Client
File: `apps/web/src/lib/websocket.ts`

**Implementation:**
```tsx
class ActivityFeedClient {
  private ws: WebSocket | null = null;

  connect(token: string) {
    this.ws = new WebSocket(
      `${process.env.NEXT_PUBLIC_WS_URL}/activity?token=${token}`
    );

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      useActivityStore.getState().addEvent(data);
    };

    this.ws.onerror = () => this.reconnect();
  }

  reconnect() {
    setTimeout(() => this.connect(/* token */), 5000);
  }
}
```

**Zustand store:**
```tsx
// apps/web/src/stores/activity.ts
export const useActivityStore = create((set) => ({
  events: [],
  addEvent: (event) => set((state) => ({
    events: [event, ...state.events].slice(0, 10) // Keep last 10
  }))
}));
```

**Time:** 3 hours

---

#### Evening: Activity Feed Component
File: `apps/web/src/components/dashboard/ActivityFeed.tsx`

**Features:**
```tsx
- Connect to WebSocket on mount
- Display last 10 events
- Event types:
  - token_earned: "You earned 10 IT from Orientation Reward"
  - token_spent: "You spent 5 IT on Voting"
  - mission_completed: "You completed Mission: ..." (Sprint 7)
- Icons for each event type
- Human-readable timestamps ("2 minutes ago")
- Smooth animation on new events
```

**Event rendering:**
```tsx
{events.map((event) => (
  <div key={event.id} className="flex items-start gap-3 p-3">
    <Icon type={event.type} />
    <div>
      <p className="text-sm">{event.description}</p>
      <p className="text-xs text-gray-500">{formatTimestamp(event.timestamp)}</p>
    </div>
  </div>
))}
```

**Time:** 3 hours

**✅ Day 4 Milestone:** Dashboard complete with all cards and real-time activity feed

---

### **Day 5: Polish & Testing** ✨
**Goal:** All pages production-ready, integration tests passing

#### Morning: Refinements
- [ ] Add loading states to all forms
- [ ] Add error boundaries
- [ ] Mobile responsiveness testing
- [ ] Accessibility improvements (ARIA labels)
- [ ] Toast notifications for success/error states

**Time:** 3 hours

---

#### Afternoon: Profile Settings Page
File: `apps/web/src/app/profile/settings/page.tsx`

**Features:**
```tsx
- Reuse profile creation form
- Pre-fill with existing data from GET /v1/profile
- "Save Changes" button → PATCH /v1/profile
- Profile completeness card
- Success toast on save
```

**Time:** 2 hours

---

#### Evening: Transaction History Page
File: `apps/web/src/app/tokens/transactions/page.tsx`

**Features:**
```tsx
- Fetch GET /v1/tokens/transactions
- Cursor pagination ("Load More" button)
- Filter by type: All, Earned, Spent
- Table columns: Type, Amount, Description, Timestamp
```

**Time:** 2 hours

**Remaining time:** Test full user journey end-to-end

**✅ Day 5 Milestone:** All Sprint 6 frontend pages complete and working

---

## 🧪 Testing Checklist

### Manual Testing
- [ ] Register with email/password
- [ ] Verify email with 6-digit code
- [ ] Resend verification code
- [ ] Log in with email/password
- [ ] Register with Google OAuth
- [ ] Register with GitHub OAuth
- [ ] Create profile with all fields
- [ ] Skip profile fields (test completeness score)
- [ ] Complete orientation (5 steps)
- [ ] Claim 10 IT reward
- [ ] View dashboard (all cards load)
- [ ] WebSocket events update in real-time
- [ ] Update profile in settings
- [ ] View transaction history
- [ ] Mobile responsive on all pages

### Integration Tests (Backend)
These tests already exist or need to be written:
- [ ] Registration → verification → login flow
- [ ] OAuth flow (Google, GitHub)
- [ ] Profile creation with geocoding
- [ ] Orientation reward (one-time, idempotent)
- [ ] Token spending with idempotency
- [ ] Concurrent token operations (race conditions)

---

## 🛠️ Development Commands

```bash
# Start everything
docker-compose up -d              # PostgreSQL + Redis
pnpm --filter @betterworld/api dev  # API on :4000
pnpm --filter @betterworld/web dev  # Web on :3000

# Test backend APIs
curl http://localhost:4000/v1/dashboard \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Check database
docker exec betterworld-postgres psql -U betterworld -d betterworld \
  -c "SELECT email, email_verified FROM humans LIMIT 5;"

# Run tests
pnpm test --filter @betterworld/api
pnpm test:coverage
```

---

## 📦 Required NPM Packages (Already Installed)

- ✅ `next` (15.1.6)
- ✅ `react` (19.0.0)
- ✅ `react-dom` (19.0.0)
- ✅ `@tanstack/react-query` (5.66.0)
- ✅ `zustand` (5.0.3)
- ✅ `tailwindcss` (4.0.6)

**No additional packages needed!**

---

## 🎨 UI Components Available

**Location:** `apps/web/src/components/ui/`

- ✅ `Button` - Primary, secondary, outline variants
- ✅ `Card` - Card, CardHeader, CardTitle, CardContent
- ✅ `Input` - Text input with validation states
- ✅ `Badge` - Tag/badge component

**To create:**
- Multi-select dropdown (for skills, languages)
- Time picker (for availability)
- Circular progress (for profile completeness)
- Toast notifications (for success/error)

---

## 🚨 Common Issues & Solutions

### 1. **"Cannot read properties of undefined (reading 'user')"**
**Fix:** Add loading state to dashboard
```tsx
if (!data) return <div>Loading...</div>;
```

### 2. **WebSocket connection fails**
**Fix:** Check API WebSocket route is running
```bash
# Test WebSocket connection
wscat -c ws://localhost:4000/v1/ws/activity?token=YOUR_TOKEN
```

### 3. **OAuth redirect fails**
**Fix:** Ensure OAuth providers are configured
- Google: Google Cloud Console → OAuth 2.0 credentials
- GitHub: GitHub Settings → Developer Settings → OAuth Apps

### 4. **Geocoding returns null**
**Fix:** Check Nominatim API is accessible
```bash
curl "https://nominatim.openstreetmap.org/search?q=Jakarta,Indonesia&format=json"
```

### 5. **CORS errors on API calls**
**Fix:** API already has CORS configured, check `.env`:
```bash
NEXT_PUBLIC_API_URL=http://localhost:4000/v1
```

---

## ✅ Sprint 6 Exit Criteria Tracking

| Criterion | Status | Page |
|-----------|--------|------|
| Database migration | ✅ Done | N/A |
| Registration | ⏳ Day 1 | `/auth/register` |
| Email verification | ⏳ Day 1 | `/auth/verify` |
| Login | ⏳ Day 1 | `/auth/login` |
| OAuth callback | ⏳ Day 1 | `/auth/callback` |
| Profile creation | ⏳ Day 2 | `/profile/create` |
| Orientation | ⏳ Day 2 | `/onboarding` |
| Dashboard | ⏳ Day 3-4 | `/dashboard` |
| Token balance | ⏳ Day 3 | Component |
| Profile completeness | ⏳ Day 3 | Component |
| Activity feed | ⏳ Day 4 | Component |
| WebSocket | ⏳ Day 4 | `/lib/websocket.ts` |
| Profile settings | ⏳ Day 5 | `/profile/settings` |
| Transaction history | ⏳ Day 5 | `/tokens/transactions` |
| Integration tests | ⏳ Backend | API tests |

**After Day 5: 15/15 (100%)**

---

## 🎯 Success Metrics

**User can complete this journey without errors:**
1. ✅ Visit `/auth/register`
2. ✅ Register with Google OAuth
3. ✅ Redirect to `/profile/create`
4. ✅ Fill profile (skills, location, languages)
5. ✅ Redirect to `/onboarding`
6. ✅ Complete 5 steps
7. ✅ Claim 10 IT reward
8. ✅ Redirect to `/dashboard`
9. ✅ See token balance: 10 IT
10. ✅ See activity: "You earned 10 IT from Orientation Reward"

**Time from registration to dashboard: < 5 minutes**

---

## 📞 Need Help?

**Documentation:**
- API routes: `specs/007-human-onboarding/IMPLEMENTATION_SUMMARY.md`
- Full plan: `specs/007-human-onboarding/FRONTEND_PLAN.md`
- Backend testing: `specs/007-human-onboarding/IMPLEMENTATION_SUMMARY.md` (curl examples)

**Quick Reference:**
- Backend API base: `http://localhost:4000/v1`
- WebSocket URL: `ws://localhost:4000/v1/ws/activity`
- Database: PostgreSQL on `localhost:5432`
- Redis: `localhost:6379`

---

**Last Updated:** 2026-02-10
**Start Date:** 2026-02-11 (recommended)
**Target Completion:** 2026-02-15
**Sprint 7 Start:** 2026-02-17
