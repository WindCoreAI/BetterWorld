---
description: Interactive browser testing using Playwright MCP. Directly controls a real browser, inspects console logs, checks network requests, and adapts in real-time. Best for debugging, exploratory testing, and investigating why something broke.
handoffs:
  - label: Generate Regression Tests
    agent: generate-e2e
    prompt: Convert the issues found during interactive testing into permanent E2E regression tests
    send: false
  - label: Fix Issues Found
    agent: speckit.implement
    prompt: Fix the bugs and issues discovered during interactive browser testing
    send: false
---

## User Input

```text
$ARGUMENTS
```

## Goal

Interactively test the BetterWorld web application using the **Playwright MCP** browser tools. Unlike the file-based `/run-e2e` skill that executes static test scripts, this skill directly controls a real browser — navigating pages, clicking elements, filling forms, reading console logs, and inspecting network requests in real-time. You adapt your testing based on what you observe.

This is the **debugging and exploratory testing** tool. Use it when:
- Something is broken and you need to see what's happening in the browser
- You want to walk through a user flow and check for issues
- You need to see console errors and failed API calls as they happen
- You want to verify a fix visually before committing

## Argument Parsing

| Argument | Effect |
|----------|--------|
| (empty) | Ask what to test |
| `auth` | Test the authentication flow (register, login, logout) |
| `onboarding` | Test the onboarding wizard and profile creation |
| `agent-management` | Test the /my-agents page (create, manage agents) |
| `problems` | Test the problem board and detail pages |
| `solutions` | Test the solution board and detail pages |
| `missions` | Test the mission marketplace |
| `social` | Test discussions, notifications, follow/connect |
| `community` | Test domain pages, city chapters, leaderboards |
| `dashboard` | Test the main dashboard and sub-pages |
| `admin` | Test admin pages |
| `navigation` | Smoke-test all pages load without errors |
| `<url>` | Test a specific URL (e.g., `/missions`, `http://localhost:3000/dashboard`) |
| `--debug <issue>` | Investigate a specific reported issue |
| `--full` | Walk through all major user flows sequentially |

## MCP Tools Available

You have these Playwright MCP tools for direct browser control:

### Navigation & Pages
- `mcp__playwright__browser_navigate` — Go to a URL
- `mcp__playwright__browser_navigate_back` — Go back
- `mcp__playwright__browser_tabs` — List/create/close/select tabs

### Interaction
- `mcp__playwright__browser_click` — Click elements
- `mcp__playwright__browser_type` — Type text into inputs
- `mcp__playwright__browser_fill_form` — Fill multiple form fields at once
- `mcp__playwright__browser_select_option` — Select dropdown options
- `mcp__playwright__browser_press_key` — Press keyboard keys
- `mcp__playwright__browser_hover` — Hover over elements
- `mcp__playwright__browser_drag` — Drag and drop

### Observation
- `mcp__playwright__browser_snapshot` — **PRIMARY**: Get accessibility tree snapshot (structured text, shows all elements with refs). Always prefer this over screenshots.
- `mcp__playwright__browser_take_screenshot` — Visual screenshot (use for visual verification or to show the user)
- `mcp__playwright__browser_console_messages` — **CRITICAL**: Read all console logs (errors, warnings, info). Filter by level.
- `mcp__playwright__browser_network_requests` — **CRITICAL**: See all network requests (API calls, failed fetches, status codes)
- `mcp__playwright__browser_evaluate` — Run JavaScript in the page context
- `mcp__playwright__browser_wait_for` — Wait for text to appear/disappear

### File Operations
- `mcp__playwright__browser_file_upload` — Upload files through file inputs

## Execution Steps

### Step 1: Navigate to the App

Start by navigating to the BetterWorld web app:

```
mcp__playwright__browser_navigate → http://localhost:3000
```

If the page doesn't load, check if the dev server is running:
```bash
curl -sf http://localhost:3000 -o /dev/null && echo "OK" || echo "NOT RUNNING"
```

If not running, tell the user to start it with `pnpm dev:app` (starts both API on 4000 and Web on 3000).

### Step 2: Take Initial Snapshot

Always start with a snapshot to understand the current page state:

```
mcp__playwright__browser_snapshot
```

This returns the accessibility tree — a structured representation of all elements on the page with `ref` identifiers you can use for clicking, typing, etc.

### Step 3: Check Console and Network

Before any interaction, check for existing errors:

```
mcp__playwright__browser_console_messages → level: "error"
mcp__playwright__browser_network_requests → includeStatic: false
```

Report any pre-existing errors to the user immediately.

### Step 4: Execute the Test Flow

Based on `$ARGUMENTS`, walk through the appropriate user flow. For each step:

1. **Take a snapshot** to see the current state
2. **Perform the action** (click, type, navigate)
3. **Check console** for new errors
4. **Check network** for failed API calls (4xx/5xx)
5. **Take a screenshot** if something looks wrong (to show the user)
6. **Report findings** in real-time

### Step 5: Adapt Based on What You See

This is the key difference from file-based testing. When you encounter:

- **Console error**: Read it, understand it, check if it's a real bug or expected behavior. Report with full context.
- **Failed API call**: Check the request URL, method, status code, and response body. Identify if it's an auth issue, missing data, or server error.
- **Missing element**: The page structure may have changed. Take a snapshot, find the actual element, and adapt.
- **Unexpected redirect**: Check if auth tokens are missing. Look at localStorage via `browser_evaluate`.
- **Loading state stuck**: Check network for pending requests. Look for JavaScript errors blocking rendering.

## Test Flow Details

### Auth Flow (`auth`)
1. Navigate to `/auth/human/register`
2. Snapshot: verify form fields (displayName, email, password)
3. Fill the registration form with test data
4. Click "Create Account"
5. Check console and network for errors
6. Navigate to `/auth/human/login`
7. Fill login form
8. Click "Sign In"
9. Verify redirect to dashboard or expected page
10. Check that tokens are in localStorage:
    ```
    browser_evaluate → () => ({
      access: localStorage.getItem('bw_human_access_token'),
      refresh: localStorage.getItem('bw_human_refresh_token')
    })
    ```

### Navigation Smoke Test (`navigation`)
Visit every major page and check for errors:

```
PUBLIC PAGES (no auth needed):
  / → landing page
  /problems → problem board
  /solutions → solution board
  /missions → mission marketplace
  /domains → domain directory
  /leaderboards → leaderboards
  /activity → activity feed

AUTH PAGES (need tokens in localStorage):
  /dashboard → main dashboard
  /my-agents → agent management
  /notifications → notification center
  /profile → user profile
  /discussions → discussion boards
  /dashboard/network → network dashboard
  /dashboard/growth → growth journey
  /dashboard/feedback → feedback inbox
```

For each page:
1. Navigate
2. Wait for content to load (snapshot shows elements)
3. Check console for errors
4. Check network for failed requests
5. Report: page name, load status, any errors

### Debug Mode (`--debug <issue>`)
1. Navigate to the page where the issue occurs
2. Set up console error collection
3. Set up network request monitoring
4. Reproduce the steps described in the issue
5. Capture all console errors, network failures, and page state
6. Take screenshots at key moments
7. Report a detailed analysis of what went wrong

## Reporting

After each test flow, report findings:

```
## Interactive Test Results: <Flow Name>

### Pages Tested
| Page | Status | Console Errors | Failed Requests |
|------|--------|----------------|-----------------|
| /auth/human/register | ✅ Loads | 0 | 0 |
| /auth/human/login | ✅ Loads | 0 | 0 |
| /dashboard | ⚠️ Loads with errors | 2 | 1 |

### Issues Found

#### Issue 1: Dashboard API call failing
**Page**: /dashboard
**Console Error**: `TypeError: Cannot read properties of undefined (reading 'balance')`
**Failed Request**: GET /api/v1/human/tokens → 401 Unauthorized
**Root Cause**: Auth token not being sent with the API request
**Severity**: High — dashboard is broken for authenticated users

#### Issue 2: ...

### Network Summary
| Endpoint | Method | Status | Duration |
|----------|--------|--------|----------|
| /api/v1/problems?limit=10 | GET | 200 | 142ms |
| /api/v1/human/tokens | GET | 401 | 23ms |

### Screenshots
- dashboard-error.png — Shows the broken dashboard state
```

## Operating Principles

- **Snapshot first, screenshot second**: Always use `browser_snapshot` for understanding page structure. Use `browser_take_screenshot` only when you need to show the user something visual.
- **Check console after every action**: Every click, navigation, and form submission might trigger errors. Always check.
- **Check network after every navigation**: Failed API calls are the #1 cause of page issues. Always check network requests after navigating.
- **Report in real-time**: Don't wait until the end. Tell the user about issues as you find them.
- **Adapt, don't fail**: If a button isn't where you expected, take a snapshot and find it. If a page redirects unexpectedly, investigate why.
- **Be thorough but focused**: Test the requested flow completely, but don't wander into unrelated areas unless you find a connected issue.
- **Preserve evidence**: Take screenshots of bugs. Copy console errors verbatim. Note the exact network request that failed.
- **Suggest fixes**: When you find an issue, don't just report it — suggest where in the codebase the fix should go (file path, line number if possible).
- **Use refs from snapshots**: When clicking or typing, always use the `ref` attribute from the most recent snapshot. Refs change between snapshots, so always take a fresh snapshot before interacting.
