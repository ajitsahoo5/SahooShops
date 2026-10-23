# Sahoo Shop

Inventory, purchases, sales, payments, expenses, and reports for a small retail shop, in Indian Rupees.

- **Stack**: Next.js 16 (App Router) with TypeScript, Tailwind CSS 4, shadcn/ui, Firebase Authentication, Cloud Firestore, Firebase Admin SDK, Zod, Recharts, ExcelJS, PDFKit, Vitest, and Playwright.
- **Hosting**: Firebase App Hosting. See [docs/deployment.md](docs/deployment.md).
- **Specs**: [`specs/`](specs) (GitHub Spec Kit) and the project constitution in [`.specify/memory/constitution.md`](.specify/memory/constitution.md).

## How it works

| Concern | Approach |
| --- | --- |
| Access | One administrator with the `admin` custom claim. No sign-up. httpOnly `__session` cookie. Every page and API calls `requireAdmin()`. Firestore and Storage rules deny all client access. |
| Money and quantities | Integer paise and integer thousandths of a unit (`src/lib/money.ts`, `src/lib/qty.ts`). |
| Stock | Append-only `stockMovements` ledger with weighted-average costing (`src/server/inventory/costing.ts`). Negative stock is blocked by default. |
| Posting | One Firestore transaction per operation through `runPosting()` (`src/server/posting/context.ts`), with idempotency keys, reversals instead of edits, and an audit log. |
| Dashboard | Pre-aggregated `dailySummaries` and `stats/*` documents, so it never scans all transactions. |
| Archive | Logical `archived` flag after a verified Excel export (`src/server/archive`). Nothing is copied or deleted. |

## Local development

Requirements: Node.js 22+, Java 21+ (for the Firebase emulators), and the Firebase CLI.

```bash
npm install
cp .env.example .env.local          # points the app at the local emulators
npm run emulators                    # terminal 1: Auth, Firestore, and Storage emulators (UI on :4000)
npm run create-admin -- admin@sahoo.test "SahooAdmin#2026"
npm run seed:dev                     # optional: 35 days of demo data
npm run dev                          # terminal 2: http://localhost:3000
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev`, `npm run build`, `npm start` | Next.js |
| `npm run lint`, `npm run typecheck` | ESLint and TypeScript |
| `npm test` | Unit tests (money, dates, costing, invoice math, exports) |
| `npm run test:integration` | Integration tests on isolated emulators (`firebase.test.json`): posting, concurrency, idempotency, returns, payments, archive, rules, sessions |
| `npm run test:e2e` / `npm run test:e2e:ci` | Playwright end-to-end test (start the emulators first, or let the `:ci` script start them) |
| `npm run create-admin -- <email> <password>` | Create the administrator or reset its password |
| `npm run verify-ledger` | Read-only integrity check of stock, the ledger, and running totals |
| `npm run seed:dev` | Demo data, emulator only |
| `node scripts/generate-indexes.mjs` | Regenerate `firestore.indexes.json` |

## Project layout

```
src/app/(auth)        login and password reset
src/app/(app)         dashboard, sales, purchases, products, stock, payments, expenses, parties, reports, archive, settings
src/app/api           Route Handlers (all wrapped in adminRoute)
src/server            domain services: posting, inventory, payments, reports, exports, archive
src/lib               shared pure helpers and Zod schemas (used by client and server)
tests/unit            Vitest unit tests
tests/integration     Vitest tests against the Firebase emulators
tests/e2e             Playwright
docs                  deployment guide and backup/restore runbook
```

## Operations
- [Deployment and go-live checklist](docs/deployment.md)
- [Backup and restore runbook](docs/runbooks/backup-restore.md)
