# Feature Specification: Security testing, backup/restore, and deployment

**Feature Branch**: `009-hardening-deploy` | **Status**: Implemented

## Security and integrity tests (`tests/integration/hardening.test.ts`)
- **Rules**: a browser SDK client gets `permission-denied` for reads and writes.
- **Sessions**: a cookie without the `admin` claim is rejected. Admin cookies stop working after `revokeRefreshTokens`. Invalid and missing cookies are rejected.
- **Failure injection**: a posting that throws after changing stock leaves no product, summary, or idempotency changes, and the same key works on retry.
- **Idempotency**: a key reused for a different operation is rejected.
- **Concurrency**: competing full payments (only one succeeds), a return racing a reversal (one wins and the totals stay consistent), and a burst of 24 mixed purchases and sales followed by `checkIntegrity()`.
- **CSRF**: `adminRoute()` rejects cross-site requests and mismatched `Origin` headers (checked manually against the dev server: 403).

## Integrity tooling
`npm run verify-ledger` (`src/server/inventory/integrity.ts`) recomputes product stock from the ledger, inventory value from products, and receivables and payables from parties.

## Backup and restore
[docs/runbooks/backup-restore.md](../../docs/runbooks/backup-restore.md): daily (14 days) and weekly (14 weeks) managed Firestore backups, an optional monthly export, Storage versioning for archive workbooks, and restore into a new database. The app can be pointed at the restored database with `FIRESTORE_DATABASE_ID` after `verify-ledger` passes.

## Deployment
[docs/deployment.md](../../docs/deployment.md): Firebase App Hosting (`apphosting.yaml`, region `asia-south1`, `minInstances: 0`), web config held in Secret Manager, Application Default Credentials (no key files), rules and indexes deployed with the Firebase CLI, sign-up disabled, budget alerts, and a go-live checklist.

## CI
`.github/workflows/ci.yml` runs lint, typecheck, unit tests, integration tests (isolated emulators from `firebase.test.json`), and the build, then a Playwright end-to-end job against the emulators.
