# Feature Specification: Six-month transaction archiving

**Feature Branch**: `008-archiving` | **Status**: Implemented

## Eligibility
A sale or purchase is eligible when it is posted or reversed (never a draft), is not yet archived, and its business date is before the first day of the current IST month minus 6 months. For example, on 23/10/2026 the cutoff is 01/04/2026. Each batch holds up to 2000 of each type.

## Workflow (`/archive`, `src/server/archive/service.ts`)
1. **Preview**: lists eligible IDs, counts, and totals into an `archiveBatches` doc (`pending`). Only one batch can be open at a time.
2. **Generate**: builds an Excel workbook (Summary, Sales, Sale items, Purchases, Purchase items, with exact integer paise and document IDs), uploads it to Cloud Storage under `archives/`, and records its SHA-256 hash.
3. **Verify**: downloads the file, checks the hash, re-parses the workbook, and compares the batch ID, the set of document IDs, counts, and totals against both the batch and the live Firestore records. Any mismatch sets the batch to `failed`, and nothing is archived.
4. **Confirm**: the administrator downloads the file and types the batch ID. Each record is re-checked inside its own transaction, and only `archived`, `archivedAt`, and `archiveBatchId` are set. The batch becomes `committed` once every chunk is written, so a failed commit can be retried safely.

## Guarantees (tested in `tests/integration/archive.test.ts`)
- Products, stock movements, `stats/*`, party balances, and daily summaries are deep-equal before and after archiving.
- Archived invoices disappear from default lists but appear with "Include archived", on party pages, in the archived transactions report, and in all summary-based reports.
- Open archived invoices still receive FIFO payments.
- Editing a record after generation, or altering the stored file, fails verification.
- No transaction data is copied into another collection, and nothing is deleted.
