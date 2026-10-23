# Feature Specification: Stock ledger and weighted-average costing

**Feature Branch**: `003-stock-ledger` | **Status**: Implemented

## Costing rules (implemented in `src/server/inventory/costing.ts`)
- Stock in adds an explicit value: purchases at net line cost, opening stock, adjustments at the entered or average cost, and returns or reversals at the original cost of goods.
- Stock out at average: cost of goods is `round(value * qtyOut / qtyOnHand)`. Taking the last unit takes all remaining value, so the value never drifts.
- Purchase reversal removes the original value. It is clamped to the value on hand, and stock that reaches zero leaves zero value. It is always blocked if not enough stock remains.
- Negative stock is rejected unless `settings.allowNegativeStock` is on. Then the excess is costed at the average cost or the last purchase cost.

## User Scenarios
1. **Given** 3 units valued at ₹10.00, **When** they are sold one at a time, **Then** the cost of goods is ₹3.33, ₹3.34, and ₹3.33, and the remaining value is ₹0.00.
2. **Given** 2 units on hand, **When** an adjustment removes 5, **Then** it fails with "Not enough stock" and nothing changes.
3. The stock ledger page lists movements by product, type, and date range, with running quantity and value balances.

## Requirements
- **FR-001**: `PostingContext.move()` is the only code path that changes `stockQtyMilli` or `stockValuePaise`. It writes the movement in the same transaction.
- **FR-002**: `stats/inventory.valuePaise` is incremented by every value change, so the dashboard never scans products.
- **FR-003**: Stock status is recalculated on every movement: out when the quantity is 0 or less, low when it is at or below the reorder level, otherwise ok.
- **FR-004**: Adjustments require a reason and are audited.
