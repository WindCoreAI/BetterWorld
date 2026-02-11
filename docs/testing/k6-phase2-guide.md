# k6 Phase 2 Load Test Guide

Load test suite for BetterWorld Phase 2 API endpoints covering leaderboards, impact dashboards, evidence submission, reputation queries, and portfolio views.

## Prerequisites

### Install k6

**macOS (Homebrew):**

```bash
brew install k6
```

**Linux (Debian/Ubuntu):**

```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D68
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

**Docker:**

```bash
docker pull grafana/k6
```

**Verify installation:**

```bash
k6 version
```

### Start the API Server

Make sure the BetterWorld API is running on `http://localhost:4000` (or your target URL):

```bash
# From the project root
pnpm dev
```

## Running the Load Test

### Basic Run (Local API)

```bash
k6 run k6/phase2-load-test.js
```

### Custom Base URL

Override the target API URL for staging or production:

```bash
k6 run -e BASE_URL=https://api.betterworld.com k6/phase2-load-test.js
```

### With Authentication Token

For the evidence submission scenario, provide a real Bearer token:

```bash
k6 run -e AUTH_TOKEN="Bearer eyJhbG..." k6/phase2-load-test.js
```

### Combined Options

```bash
k6 run \
  -e BASE_URL=https://staging-api.betterworld.com \
  -e AUTH_TOKEN="Bearer eyJhbG..." \
  k6/phase2-load-test.js
```

### Using Docker

```bash
docker run --rm -i \
  -v $(pwd)/k6:/scripts \
  --network=host \
  grafana/k6 run /scripts/phase2-load-test.js
```

### Reduced VU Count (Smoke Test)

To verify the test works before a full run, modify VU counts by running a shorter duration:

```bash
k6 run --duration 30s --vus 10 k6/phase2-load-test.js
```

Note: This overrides the scenario-based configuration. For a proper smoke test with all five scenarios at reduced scale, edit the `rampStages()` function temporarily.

## Test Scenarios

| Scenario | Endpoint | VUs | Auth Required |
|---|---|---|---|
| Leaderboard browsing | `GET /api/v1/leaderboards/:type` | 2000 | No |
| Impact Dashboard | `GET /api/v1/impact/dashboard` + `GET /api/v1/impact/heatmap` | 1000 | No |
| Evidence submission | `POST /api/v1/missions/:missionId/evidence` | 500 | Yes |
| Reputation queries | `GET /api/v1/reputation/:humanId` | 500 | No |
| Portfolio views | `GET /api/v1/portfolios/:humanId` | 1000 | No |

**Total: 5000 VUs**

### Load Profile

Each scenario follows the same ramp pattern:

- **Ramp up:** 2 minutes (0 to target VUs)
- **Sustain:** 10 minutes (constant at target VUs)
- **Ramp down:** 1 minute (target VUs to 0)
- **Total duration:** 13 minutes

All five scenarios run concurrently.

## Interpreting Results

### Thresholds (Pass/Fail Criteria)

The test defines the following pass/fail thresholds:

| Metric | Threshold | Description |
|---|---|---|
| `http_req_duration` (p95) | < 3000ms | 95th percentile response time must be under 3 seconds |
| `errors` (rate) | < 1% | Less than 1% of all requests should fail |

Per-scenario p95 thresholds are also tracked independently.

k6 prints threshold results at the end of the run. A `PASS` or `FAIL` is shown next to each:

```
thresholds ........................ 100.00% checks passed
  http_req_duration .............. p(95)=1245.32ms  ✓ p(95)<3000
  errors ......................... 0.23%            ✓ rate<0.01
```

### Key Metrics to Monitor

**Response Time Metrics:**

- `http_req_duration`: Overall request duration (includes DNS, TLS, transfer)
  - `avg`: Average latency
  - `med`: Median latency (p50)
  - `p(90)`: 90th percentile
  - `p(95)`: 95th percentile (primary SLA metric)
  - `p(99)`: 99th percentile (tail latency)
  - `max`: Worst-case latency

**Custom Latency Trends (per scenario):**

- `leaderboard_latency`: Leaderboard endpoint response times
- `impact_dashboard_latency`: Impact dashboard and heatmap response times
- `evidence_submit_latency`: Evidence submission response times
- `reputation_latency`: Reputation query response times
- `portfolio_latency`: Portfolio view response times

**Throughput Metrics:**

- `http_reqs`: Total number of requests made (and requests/sec)
- `iterations`: Total scenario iterations completed
- `vus`: Current number of active virtual users
- `vus_max`: Peak VU count reached

**Error Metrics:**

- `errors` (custom Rate): Percentage of failed checks across all scenarios
- `http_req_failed`: Built-in k6 metric for HTTP-level failures (non-2xx responses)
- `checks`: Total check pass/fail count

### Reading the Summary Output

After the test completes, k6 prints a summary. Here is what to look for:

```
          /\      |‾‾| /‾‾/   /‾‾/
     /\  /  \     |  |/  /   /  /
    /  \/    \    |     (   /   ‾‾\
   /          \   |  |\  \ |  (‾)  |
  / __________ \  |__| \__\ \_____/ .io

  scenarios: (100.00%) 5 scenarios, 5000 max VUs, 14m0s max duration

     ✓ leaderboard: status is 200
     ✓ impact dashboard: status is 200
     ...

     checks.........................: 99.87% ✓ 482341  ✗ 627
     data_received..................: 1.2 GB 1.5 MB/s
     data_sent......................: 245 MB 308 kB/s
     errors.........................: 0.13%  ✓ rate<0.01
     http_req_duration..............: avg=245ms  p(95)=1245ms  ✓ p(95)<3000
     http_reqs......................: 483968 620.47/s
     iterations.....................: 241984 310.23/s
     vus............................: 127    min=0     max=5000
```

**What each line means:**

- `checks`: The percentage of all check() assertions that passed. Anything above 99% is healthy.
- `errors`: The custom error rate. Must stay below 1% to pass.
- `http_req_duration`: The main latency metric. Focus on `p(95)` for SLA compliance.
- `http_reqs`: Total requests and throughput (requests per second).
- `iterations`: How many complete scenario iterations ran.
- `vus`: Virtual user count range during the test.

### Troubleshooting Common Issues

**High error rate (> 1%):**
- Check if the API server is running and reachable
- Verify the `BASE_URL` is correct
- Look at specific check failures to identify which endpoints are failing
- Check API server logs for errors (rate limiting, database connection pool exhaustion)

**High p95 latency (> 3s):**
- Database query performance may be degrading under load
- Redis cache may need tuning
- Connection pool limits may need increasing
- Consider adding database indexes for leaderboard/portfolio queries

**Connection refused errors:**
- Ensure the API server has enough file descriptors (`ulimit -n`)
- Check if the server's connection backlog is large enough
- Verify no firewall rules are blocking connections

## Output Formats

### JSON Output (for CI/CD)

```bash
k6 run --out json=results.json k6/phase2-load-test.js
```

### CSV Output

```bash
k6 run --out csv=results.csv k6/phase2-load-test.js
```

### Grafana Cloud k6 (Dashboard)

```bash
K6_CLOUD_TOKEN=<token> k6 cloud k6/phase2-load-test.js
```

## File Structure

```
k6/
  phase2-load-test.js         # Main load test script (5 scenarios)
  helpers/
    data-generators.js         # Randomized test data generators
```
