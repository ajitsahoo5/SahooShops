# Feature Specification: Project setup and authentication

**Feature Branch**: `001-setup-auth` | **Status**: Implemented

## User Scenarios

### User Story 1 - Administrator signs in (P1)
The shop owner signs in with the pre-created administrator email and password and lands on the dashboard.

**Acceptance Scenarios**:
1. **Given** the admin account exists, **When** the owner submits the correct email and password, **Then** an httpOnly `__session` cookie is set and the dashboard opens.
2. **Given** wrong credentials, **When** the owner submits, **Then** "Incorrect email or password." is shown and no cookie is set.
3. **Given** a Firebase user without the `admin` claim, **When** they sign in, **Then** the server rejects the session with 403.

### User Story 2 - Protected pages and APIs (P1)
**Acceptance Scenarios**:
1. **Given** no session, **When** any app page is requested, **Then** the visitor is redirected to `/login?next=...`.
2. **Given** no session, **When** any `/api/*` endpoint other than auth is called, **Then** it returns 401 JSON.
3. **Given** a cross-site POST with a valid cookie, **Then** it is rejected with 403.

### User Story 3 - Sign out and password reset (P2)
1. Sign out revokes refresh tokens and clears the cookie.
2. The reset page always shows the same confirmation message, whether or not the email exists.

## Requirements
- **FR-001**: No public sign-up. The admin is created with `npm run create-admin -- <email> <password>`, which sets the `admin: true` custom claim.
- **FR-002**: Session cookies are created only from ID tokens issued within the last 5 minutes and last `SESSION_MAX_AGE_DAYS` (default 5).
- **FR-003**: Every Route Handler is wrapped in `adminRoute()`, which verifies the session cookie (with a revocation check) and the origin.
- **FR-004**: Firestore and Storage rules deny all client access.

## Success Criteria
- **SC-001**: Unauthenticated requests never reach Firestore.
- **SC-002**: `npm run lint`, `npm run typecheck`, and `npm test` pass in CI.
