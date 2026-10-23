# Feature Specification: Excel and PDF exports

**Feature Branch**: `007-exports` | **Status**: Implemented

## Behaviour
- `GET /api/exports?report=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD&includeArchived=true&format=xlsx|pdf` downloads the same data shown on the Reports page. Add `inline=1` to open a PDF in the browser.
- Each file includes the shop name, report title, filter summary, generation time (IST), column headers, data, totals, and notes.
- **Excel**: real numbers in rupees with `₹#,##0.00`, quantities with up to 3 decimals, real date cells (`dd/mm/yyyy`), a frozen header, and auto-filter.
- **PDF**: A4 (landscape when there are more than 6 columns), headers repeated on every page, zebra rows, a bold totals row, and "Page X of Y" footers. Noto Sans is embedded (`assets/fonts`, SIL OFL 1.1) so the ₹ sign renders. Without the font, the export falls back to Helvetica with "Rs.".
- Every export is written to the audit log. Ranges are limited to two years.
- Email delivery is deferred.
