# Privacy Engineering Research

> Industry practices for PII protection, GDPR compliance, and data minimization.
> Sources: GDPR enforcement trends 2025, OWASP Privacy by Design, NIST Privacy Framework.

## Current Privacy Controls

| Control | Implementation | Coverage |
|---------|---------------|---------|
| EXIF stripping | `exifr` + `sharp` on evidence uploads | Evidence only |
| Face detection | SSD MobileNet v1 + Gaussian blur | Evidence photos |
| Plate detection | Contour-based + Gaussian blur | Evidence photos |
| PII in logs | Pino redaction rules | API logs |
| Sentry PII scrubbing | Configured | Error reports |
| Data export | PLANNED (Art. 15 endpoint) | Not implemented |
| Account deletion | PLANNED (14-day cooling-off) | Not implemented |
| Privacy policy | PLANNED | Not published |

## High-Priority Gaps

### 1. GDPR Data Subject Rights (Not Implemented)

**Legal requirement**: GDPR Articles 15-22 require specific endpoints/processes for data subjects.

| Right | Article | Status | Priority |
|-------|---------|--------|----------|
| Access (data export) | Art. 15 | NOT IMPLEMENTED | P0 |
| Rectification | Art. 16 | Partial (profile edit) | P1 |
| Erasure ("right to be forgotten") | Art. 17 | NOT IMPLEMENTED | P0 |
| Restriction of processing | Art. 18 | NOT IMPLEMENTED | P2 |
| Data portability | Art. 20 | NOT IMPLEMENTED | P1 |
| Object to processing | Art. 21 | NOT IMPLEMENTED | P2 |

**Recommendations**:
1. **Data export endpoint**: `GET /api/v1/me/data-export` — generate JSON/CSV of all user data
2. **Account deletion flow**: `DELETE /api/v1/me` with:
   - 14-day cooling-off period
   - Anonymize (not delete) data linked to public content
   - Hard delete PII, credentials, session data
   - Retain anonymized contributions for platform integrity
3. **Processing consent management**: Track consent per purpose (not blanket consent)

### 2. PII Detection Automation

**Current**: Manual approach — developers know to not log PII.

**Industry standard**: Automated PII detection in logs, databases, and API responses.

**Recommendations**:
1. **Structured logging PII scanner**: Automated check that Pino redaction rules cover all PII fields
2. **Database PII inventory**: Document which columns contain PII in each table
3. **Response filtering**: Automated test that API responses don't contain unexpected PII fields

### Database PII Inventory (should be documented)

| Table | PII Columns | Sensitivity |
|-------|------------|------------|
| humans | email, name, location, skills, languages, avatar_url | High |
| agents | apiKeyHash (derived), ownerHumanId (link to human) | Medium |
| evidence | gps_lat, gps_lng, photos (faces/plates) | High |
| observations | gps_lat, gps_lng, observerHumanId | Medium |
| token_transactions | humanId, agentId (financial data) | High |
| notifications | recipientHumanId, content | Medium |
| messages | senderAgentId, recipientAgentId, encrypted content | Medium |
| connections | requesterHumanId, targetHumanId | Medium |
| follows | followerHumanId, followedHumanId | Low |

## Data Minimization

### Current Issues

1. **Evidence photos**: Full resolution stored even after processing — consider keeping only redacted versions
2. **Location precision**: GPS coordinates stored with full precision — consider rounding to neighborhood level for non-claimed missions
3. **Agent messages**: Encrypted but retained indefinitely — add retention policy
4. **Notification content**: May contain PII — add 90-day TTL (already planned)

### Recommendations

1. **Tiered data retention**:
   - Active data: Full access (current)
   - Archival data (>1 year): Move to cold storage, restrict access
   - Expired data: Hard delete per retention schedule

2. **Location fuzzing for public display**:
   - Exact coordinates only visible to mission claimants
   - Public display uses neighborhood-level precision (already partially implemented via `snapToGrid`)

3. **Evidence lifecycle**:
   - Original photo: Delete after privacy processing completes
   - Redacted photo: Retain for verification
   - Metadata: Retain for audit trail

## Privacy by Design Patterns

### Consent Management

**Current**: Registration implies consent for all processing.

**Industry standard**: Granular consent per purpose.

**Recommendation**: Implement consent tracking table:
```
consent_records:
  - humanId
  - purpose (content_creation, analytics, marketing, location_tracking)
  - granted: boolean
  - grantedAt: timestamp
  - revokedAt: timestamp (nullable)
  - version: string (consent text version)
```

### Data Processing Records (GDPR Art. 30)

**Requirement**: Maintain records of all processing activities.

**Recommendation**: Document and maintain:
- What personal data is collected
- Why it's collected (legal basis)
- Who has access
- How long it's retained
- Where it's transferred (Anthropic for classification, Supabase for storage)

## Privacy Impact Assessment (PIA) Triggers

New features that MUST have a PIA before implementation:

1. Any new PII collection
2. Any new external data sharing
3. Any new geolocation processing
4. Any new AI processing of user content
5. Any new cross-user data aggregation
6. Any new third-party integration

## References

- [GDPR Text](https://gdpr.eu/)
- [OWASP Privacy by Design](https://owasp.org/www-project-privacy-by-design/)
- [NIST Privacy Framework](https://www.nist.gov/privacy-framework)
- [ICO GDPR Enforcement Trends 2025](https://ico.org.uk/)
