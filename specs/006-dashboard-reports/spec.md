# Feature Specification: Dashboard and reporting

**Feature Branch**: `006-dashboard-reports` | **Status**: Implemented

## Dashboard
- **Today**: net sales, purchases, gross profit, expenses, and net cash movement.
- **Period** (today, 7 days, this month, or custom): net sales, purchases, gross profit, expenses, estimated operating profit, and money in and out per method.
- **Trend**: last 30 days of net sales, gross profit, and expenses (Recharts).
- **Inventory**: product count and inventory value at cost (from `stats/inventory`). Receivables and payables, with the top 5 of each.
- **Alerts**: low and out-of-stock products. **Best sellers** (30 days by revenue). **Slow-moving stock** (in stock, not sold in 30 days, using `products.lastSoldDate`). **Recent activity**.

## Cost model
The dashboard reads about 30 to 60 `dailySummaries` docs, 2 stats docs, and around 60 small query results. It never scans all transactions or products.

## Reports (`src/server/reports/builders.ts`)
Sales, purchases, transaction history, current stock, inventory valuation, expenses, profitability (daily), product sales and profit, cash movement, customer and supplier balances, and archived transactions. Every report returns a `ReportTable` (columns, rows, totals, notes, filter summary, generation time), which drives the on-screen preview and both export formats.

## Definitions
- Net sales = sales - returns.
- Gross profit = net sales - (cost of goods sold - cost of goods returned).
- Operating profit (estimate) = gross profit - recorded expenses.
- Reversed sales and purchases are removed from their original day's totals. Returns and refunds count on the day they happen.
