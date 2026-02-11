# Feature Specification: Sprint 6 - Human Onboarding

**Feature Branch**: `007-human-onboarding`
**Created**: 2026-02-10
**Status**: Draft
**Input**: User description: "Sprint 6: Human Onboarding - OAuth registration, profile creation, orientation tutorial, ImpactToken economy, and dashboard for Phase 2 human-in-the-loop foundation"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - New Human Registration (Priority: P1)

Maya, a university student in Jakarta, hears about BetterWorld from a friend and wants to join the platform to contribute to social good initiatives while earning rewards.

**Why this priority**: Registration is the gateway to all other features. Without the ability to register, no humans can participate in the platform. This is the absolute foundation of Phase 2.

**Independent Test**: Can be fully tested by attempting to register with Google OAuth, GitHub OAuth, and email/password. Delivers value by enabling users to create accounts and access the platform.

**Acceptance Scenarios**:

1. **Given** a new user visits the platform, **When** they click "Sign up with Google" and complete OAuth consent, **Then** their account is created with email, name, and avatar from Google profile
2. **Given** a new user visits the platform, **When** they click "Sign up with GitHub" and authorize access, **Then** their account is created with email, name, and avatar from GitHub profile
3. **Given** a new user prefers not to use social login, **When** they fill out email/password registration form and submit, **Then** their account is created and they receive a 6-digit verification code via email
4. **Given** a user receives a verification code, **When** they enter the correct 6-digit code within 15 minutes, **Then** their email is verified and they can proceed to profile creation
5. **Given** a user enters an incorrect verification code, **When** they submit it, **Then** they see an error message and can retry or request a new code
6. **Given** a user's verification code expires, **When** they request a new code, **Then** a new 6-digit code is sent (throttled to prevent abuse)

---

### User Story 2 - Profile Creation and Enrichment (Priority: P1)

After registration, Maya needs to create a rich profile that captures her skills, location, language capabilities, and availability so the platform can match her with relevant missions.

**Why this priority**: Profile data is essential for mission matching in Sprint 7. Without profiles, the platform cannot effectively connect humans with appropriate missions based on skills, location, and availability.

**Independent Test**: Can be fully tested by completing registration and then filling out the profile form with various combinations of skills, locations, and availability patterns. Delivers value by enabling personalized mission recommendations.

**Acceptance Scenarios**:

1. **Given** a newly registered user, **When** they navigate to profile creation, **Then** they see a form requesting skills, location, languages, availability, and bio
2. **Given** a user is filling out their profile, **When** they enter a city name like "Jakarta, Indonesia", **Then** the system geocodes it to latitude/longitude coordinates using PostGIS
3. **Given** a user selects skills from a predefined list, **When** they save their profile, **Then** skills are stored as an array for efficient filtering
4. **Given** a user specifies availability hours like "Weekdays 18:00-22:00, Weekends 09:00-17:00", **When** they save, **Then** this structured data is stored for mission scheduling
5. **Given** a user completes all required profile fields, **When** the system calculates profile completeness, **Then** the score is 85-100% (100% if all optional fields filled)
6. **Given** a user wants to update their profile later, **When** they access profile settings and modify any field, **Then** changes are saved and profile completeness is recalculated

---

### User Story 3 - Orientation Tutorial and First Token Reward (Priority: P2)

Maya completes a 5-step orientation tutorial to understand the platform's constitution, domains, missions, evidence requirements, and token economy, earning her first 10 ImpactTokens as a welcome reward.

**Why this priority**: Orientation educates users about the platform's unique approach and ensures they understand how to participate effectively. The token reward creates immediate engagement and enables first interactions (voting). However, users could theoretically participate without orientation (though not recommended).

**Independent Test**: Can be fully tested by progressing through all 5 orientation steps and verifying token reward. Delivers value by educating users and providing initial tokens for platform engagement.

**Acceptance Scenarios**:

1. **Given** a user completes profile creation, **When** they are directed to the orientation tutorial at `/onboarding`, **Then** they see Step 1: Understanding the Constitution
2. **Given** a user is in the orientation flow, **When** they progress through steps 1→2→3→4→5, **Then** their progress is saved in `human_profiles.metadata` and they can resume if interrupted
3. **Given** a user completes Step 5 (Tokens & Economy), **When** they click "Complete Orientation", **Then** they receive exactly 10 ImpactTokens as a one-time reward
4. **Given** a user already completed orientation, **When** they try to claim the orientation reward again, **Then** the system returns a cached response and does not award duplicate tokens
5. **Given** a user skips orientation from the dashboard, **When** they attempt to claim their first mission in Sprint 7, **Then** they are redirected back to complete orientation first
6. **Given** a user views their dashboard after orientation, **When** the dashboard loads, **Then** the "Complete Orientation" call-to-action is hidden and replaced with mission browsing options

---

### User Story 4 - Token Economy Participation (Priority: P2)

After earning her first 10 ImpactTokens, Maya wants to spend them on platform activities like voting on problems/solutions, unlocking analytics, or saving up to join a collaboration circle.

**Why this priority**: Token spending validates the entire token economy system and enables user engagement with platform content. Users can participate in governance and express preferences. However, token earning (from missions) is more critical than spending.

**Independent Test**: Can be fully tested by creating test transactions for voting, analytics, and circle membership. Delivers value by enabling users to influence platform direction through voting.

**Acceptance Scenarios**:

1. **Given** a user has 10 ImpactTokens, **When** they vote on a problem with a weight of 5, **Then** 5 tokens are deducted and their vote is recorded
2. **Given** a user has 20 ImpactTokens, **When** they choose to "unlock premium analytics", **Then** 20 tokens are deducted and they see a "Premium Analytics Coming Soon" badge
3. **Given** a user has 50 ImpactTokens, **When** they join a collaboration circle, **Then** 50 tokens are deducted and they gain access to circle features
4. **Given** a user attempts to spend more tokens than their balance, **When** they submit the transaction, **Then** they see an error message indicating insufficient balance
5. **Given** multiple token transactions occur simultaneously, **When** they are processed, **Then** race conditions are prevented via database locking and all balance calculations are correct
6. **Given** the daily audit job runs, **When** it checks double-entry accounting integrity, **Then** sum of all debits equals sum of all credits with zero discrepancies

---

### User Story 5 - Dashboard Visibility and Progress Tracking (Priority: P3)

Maya accesses her dashboard to see her token balance, reputation score, active missions, activity feed, and profile completeness all in one unified view.

**Why this priority**: The dashboard provides visibility and helps users navigate the platform, but users can access individual features directly. It's a convenience and engagement feature rather than a blocking requirement.

**Independent Test**: Can be fully tested by accessing the dashboard with various states (new user, user with tokens, user with missions, user with incomplete profile). Delivers value by consolidating key information and suggesting next actions.

**Acceptance Scenarios**:

1. **Given** a user logs into the platform, **When** they access their dashboard, **Then** they see their current token balance displayed prominently
2. **Given** a new user with 0 reputation, **When** they view their dashboard, **Then** they see "0 reputation score" with a tooltip explaining how to earn reputation
3. **Given** a user has incomplete profile (85%), **When** they view their dashboard, **Then** they see a profile completeness indicator with a prompt to "Add certifications" or other missing fields
4. **Given** a user has active missions claimed in Sprint 7, **When** they view their dashboard, **Then** they see a list of missions with status indicators (claimed, in_progress, submitted)
5. **Given** a new user who hasn't completed orientation, **When** they access their dashboard, **Then** they see a prominent "Complete Orientation to Get Started" call-to-action
6. **Given** platform events occur (tokens earned, reputation changed, new missions available), **When** the user's dashboard is open, **Then** real-time updates appear via WebSocket connection

---

### Edge Cases

- What happens when a user tries to register with an email that already exists (via OAuth or email/password)?
- How does the system handle OAuth provider failures or token expiration during registration?
- What happens if a user's location geocoding fails (e.g., ambiguous city name, API outage)?
- How does the system prevent duplicate orientation rewards if the user rapidly clicks "Complete" multiple times?
- What happens when token transactions have race conditions (two missions completed simultaneously)?
- How does the system handle negative token balances or arithmetic overflow?
- What happens if email verification codes are not received due to email delivery issues?
- How does the system handle malformed or missing OAuth profile data (missing email, missing name)?
- What happens when the daily token audit job detects discrepancies in double-entry accounting?
- How does the system handle users who skip orientation and try to access restricted features?

## Requirements *(mandatory)*

### Functional Requirements

**Authentication & Authorization:**

- **FR-001**: System MUST support OAuth 2.0 + PKCE authentication with Google and GitHub providers
- **FR-002**: System MUST provide email/password registration as a fallback for users without OAuth accounts
- **FR-003**: System MUST generate and send 6-digit verification codes via email with 15-minute expiry
- **FR-004**: System MUST throttle verification code resend requests to prevent abuse (max 3 requests per hour per user)
- **FR-005**: System MUST require email verification before allowing first mission claim
- **FR-006**: System MUST use PKCE (Proof Key for Code Exchange, RFC 7636) to prevent authorization code interception attacks

**Profile Management:**

- **FR-007**: System MUST capture and store user skills as an array for efficient filtering
- **FR-008**: System MUST geocode location strings (city, country) to PostGIS point coordinates (latitude, longitude)
- **FR-009**: System MUST validate geocoded coordinates are not "null island" (0,0) or other invalid locations
- **FR-010**: System MUST store user language preferences as an array (ISO 639-1 codes)
- **FR-011**: System MUST capture user availability hours as structured data (weekday/weekend schedules)
- **FR-012**: System MUST calculate profile completeness score (0-100%) based on required and optional fields
- **FR-013**: System MUST allow users to update their profile after initial creation
- **FR-014**: System MUST enforce ownership checks (users can only edit their own profiles)

**Orientation Tutorial:**

- **FR-015**: System MUST provide a 5-step orientation tutorial covering: (1) Constitution, (2) Domains, (3) Missions, (4) Evidence, (5) Tokens
- **FR-016**: System MUST store orientation progress in `human_profiles.metadata` JSONB column for resumability
- **FR-017**: System MUST award exactly 10 ImpactTokens upon orientation completion (one-time only)
- **FR-018**: System MUST prevent duplicate orientation rewards via idempotency check using `orientation_completed_at` timestamp
- **FR-019**: System MUST allow users to skip orientation from dashboard but require completion before first mission claim
- **FR-020**: System MUST provide a dedicated `/onboarding` route (not modal) for full-screen orientation experience

**Token Economy:**

- **FR-021**: System MUST implement double-entry accounting with `balance_before` and `balance_after` columns
- **FR-022**: System MUST use `SELECT FOR UPDATE` with `SKIP LOCKED` for all token operations to prevent race conditions
- **FR-023**: System MUST create a transaction record for every token earn/spend operation
- **FR-024**: System MUST enforce non-negative balance constraint (cannot spend more than available)
- **FR-025**: System MUST validate balance integrity: `balance_after = balance_before + amount`
- **FR-026**: System MUST run a daily audit job verifying sum(debits) == sum(credits) across all transactions
- **FR-027**: System MUST alert administrators if audit job detects discrepancies

**Token Spending:**

- **FR-028**: System MUST allow users to spend 1-10 ImpactTokens to vote on problems or solutions
- **FR-029**: System MUST allow users to spend 50 ImpactTokens to join collaboration circles
- **FR-030**: System MUST allow users to spend 20 ImpactTokens to "unlock premium analytics" (placeholder, shows "Coming Soon" badge)
- **FR-031**: System MUST provide idempotent token spending with 1-hour cached response window
- **FR-032**: System MUST return error for insufficient balance before creating transaction record

**Dashboard & UI:**

- **FR-033**: System MUST display user's current token balance on dashboard
- **FR-034**: System MUST display user's reputation score on dashboard (0-100 scale)
- **FR-035**: System MUST display list of active missions (when user has claimed missions in Sprint 7)
- **FR-036**: System MUST display profile completeness indicator with suggestions for improvement
- **FR-037**: System MUST display "Complete Orientation" call-to-action if orientation is pending
- **FR-038**: System MUST provide real-time activity feed via WebSocket for events (tokens earned, missions completed, etc.)

**API Endpoints:**

- **FR-039**: System MUST provide POST `/auth/register` endpoint for email/password registration
- **FR-040**: System MUST provide POST `/auth/oauth/google` and `/auth/oauth/github` for OAuth flows
- **FR-041**: System MUST provide POST `/auth/verify-email` endpoint for email verification
- **FR-042**: System MUST provide PATCH `/profile` endpoint for profile updates with Zod validation
- **FR-043**: System MUST provide GET `/tokens/balance` endpoint returning current balance
- **FR-044**: System MUST provide GET `/tokens/transactions` endpoint with cursor pagination
- **FR-045**: System MUST provide POST `/tokens/spend` endpoint with idempotency key parameter
- **FR-046**: System MUST provide POST `/tokens/orientation-reward` endpoint with one-time constraint
- **FR-047**: System MUST provide GET `/dashboard` endpoint aggregating balance, missions, reputation, activity

### Key Entities

- **Human**: Represents a registered user on the platform. Core attributes include email, display name, avatar, OAuth provider info, password hash (if email/password), role (human/admin/moderator), active status, and timestamps.

- **Human Profile** (extended attributes): Skills array, languages array, location (city, country, latitude, longitude via PostGIS), service radius, bio text, availability hours, orientation completion status, profile completeness score, reputation score, mission statistics (total completed, total tokens earned), wallet address, streak days, last active date.

- **Token Transaction**: Represents a single token earn or spend event. Attributes include human ID, amount (positive for earn, negative for spend), transaction type enum, reference to related entity (mission, problem, solution, circle), description, balance_before, balance_after, timestamp, and idempotency tracking.

- **Verification Code** (reused from agent verification): 6-digit code, user type enum (agent/human), expiry timestamp, verified status, resend count, email address.

- **Orientation Progress** (stored in human_profiles.metadata JSONB): Current step number (1-5), completion timestamp, step-specific flags (viewed_constitution, viewed_domains, etc.).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Users can complete registration (OAuth or email/password) in under 2 minutes
- **SC-002**: Email verification codes are delivered within 30 seconds in 95% of cases
- **SC-003**: Profile creation captures all required fields with geocoding completing in under 2 seconds
- **SC-004**: Profile completeness score is calculated accurately (100% = all fields filled, 0% = only required fields)
- **SC-005**: Orientation tutorial is resumable - users can leave and return to their last completed step
- **SC-006**: Orientation reward is issued within 100ms of completion with zero duplicate awards in testing
- **SC-007**: Token balance operations are race-condition safe - concurrent transactions never corrupt balances
- **SC-008**: Daily audit job detects 100% of intentional balance discrepancies in test scenarios
- **SC-009**: Token spending transactions are idempotent - duplicate API calls within 1 hour return cached response
- **SC-010**: Dashboard loads in under 1 second and displays real-time updates within 500ms of events
- **SC-011**: OAuth authentication flows (Google, GitHub) complete in under 5 seconds
- **SC-012**: System handles 1000 concurrent token transactions without deadlocks or balance corruption
- **SC-013**: All 668 existing tests from Phase 1 continue to pass
- **SC-014**: 15+ new integration tests cover the full human onboarding flow (registration → profile → orientation → tokens → spending)
- **SC-015**: Zero high/critical vulnerabilities in OAuth implementation security audit
