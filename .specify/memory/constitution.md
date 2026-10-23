# Sahoo Shop Constitution

## Core Principles

### I. Server-Only Data Access (NON-NEGOTIABLE)
All Firestore reads and writes happen on the server through the Firebase Admin SDK, inside
Route Handlers, Server Components, or `src/server/**` services. Firestore security rules deny
all client access. Every server entry point calls `requireAdmin()` before touching data.
Firebase Admin credentials never reach the browser and are never committed.

### II. Integer Money and Quantities
Money is stored and computed as integer paise. Quantities are stored as integer thousandths
of a unit (`qtyMilli`). Floating-point values are only allowed at the UI boundary, where they
are parsed and converted by `src/lib/money.ts` and `src/lib/qty.ts`. Every division rounds
explicitly.

### III. Ledger-First Stock
A product's `stockQtyMilli` and `stockValuePaise` change only through `applyMovement()`, which
also appends a `stockMovements` entry in the same transaction. Inventory uses weighted-average
cost derived from value divided by quantity. The sum of a product's movements always equals
its current balance. Negative stock is rejected unless explicitly enabled in settings.

### IV. Idempotent, Atomic Posting
Every posting, payment, return, and reversal runs in a single Firestore transaction that
checks and records an `idempotencyKeys` document. A retried request with the same key returns
the original result and never applies changes twice.

### V. Reversals, Not Edits
Posted transactions are immutable. Corrections are made with controlled reversals that write
opposite stock movements and balance changes at the original values. Historical records are
never deleted automatically. Archiving is logical (an `archived` flag) and never alters
stock, costs, movements, or balances.

### VI. Business Dates in IST
Business dates are `YYYY-MM-DD` strings computed in `Asia/Kolkata`, with a `monthKey` of
`YYYY-MM`. Reports, daily summaries, and archive eligibility use business dates.

### VII. Tested Integrity
Costing, rounding, profit formulas, and date boundaries have unit tests. Posting, concurrency,
idempotency, reversals, and archiving have integration tests against the Firebase emulators.

## Technology and Cost Constraints

- Next.js App Router (v16) with TypeScript, Tailwind CSS, and shadcn/ui.
- Firebase Authentication (single pre-created admin, no sign-up) and Cloud Firestore.
- Zod validates every request body and query string on the server.
- Recharts for charts, ExcelJS for Excel, PDFKit for PDF.
- Deployment on Firebase App Hosting; secrets in Cloud Secret Manager.
- Prefer reads of pre-aggregated `dailySummaries` over scanning transactions to keep
  Firestore costs low.
- No GST or tax handling in this version.

## Development Workflow

- Features follow the Spec Kit cycle: specify, plan, tasks, implement. Specs live in `specs/`.
- `npm run lint`, `npm run typecheck`, and `npm test` must pass before merging.
- Integration tests run with `npm run test:integration` against the Firestore and Auth
  emulators.

## Governance

This constitution supersedes other practices. Amendments require updating this file, bumping
the version, and recording the reason in the commit message.

**Version**: 1.0.0 | **Ratified**: 2026-10-23 | **Last Amended**: 2026-10-23
