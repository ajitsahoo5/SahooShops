<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Sahoo Shop conventions

Read `.specify/memory/constitution.md` first. In short:

- All Firestore access is server-side (Admin SDK). Route Handlers use `adminRoute()` from `src/server/http.ts`, and pages call `requireAdminPage()`.
- Money is integer paise and quantities are integer thousandths. Use `src/lib/money.ts` and `src/lib/qty.ts`, never floats.
- Anything that changes stock, balances, or cash goes through `runPosting()` and `PostingContext` (`src/server/posting/context.ts`). Do every read before any write, and change stock only through `ctx.move()`.
- Posted records are corrected by reversals, never edited or deleted.
- `cacheComponents` is intentionally off: every page is per-request and authenticated.
- After adding a query with new filter combinations, update `scripts/generate-indexes.mjs` and regenerate `firestore.indexes.json`.
- Run `npm run lint && npm run typecheck && npm test && npm run test:integration` before finishing a change.
