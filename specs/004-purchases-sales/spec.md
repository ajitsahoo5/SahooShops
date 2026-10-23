# Feature Specification: Purchases and sales

**Feature Branch**: `004-purchases-sales` | **Status**: Implemented

## User Scenarios

### User Story 1 - Sell from the counter (P1)
1. **Given** stock on hand, **When** the owner adds items, chooses cash, UPI, or bank, and posts, **Then** an invoice number `INV-000001` is assigned, stock drops, and the cost of goods is saved on each line.
2. **Given** a walk-in sale (no customer), **When** it is not fully paid, **Then** posting fails. Credit sales need a customer.
3. **Given** a sale for more than the stock on hand, **Then** posting fails with "Not enough stock for ..." and nothing is written.
4. **Given** a double-click or network retry, **Then** the sale is posted once (same idempotency key).

### User Story 2 - Record a purchase (P1)
1. Posting a purchase adds stock at the net line cost (after line and bill discounts), updates the weighted average and last purchase cost, and adds any unpaid part to the supplier payable.

### User Story 3 - Drafts and reversals (P2)
1. Drafts do not touch stock or balances and can be edited, deleted, or posted later.
2. Reversing a sale returns stock at its original cost of goods, clears the receivable, refunds anything paid (today), and removes the sale from its day's totals. Sales with returns cannot be reversed.
3. Reversing a purchase removes the stock at its original value and is blocked if that stock was already sold.

## Requirements
- **FR-001**: Posting happens in one transaction: idempotency check, settings, party, products, and counter are read first, then every write happens once through `PostingContext.commit()`.
- **FR-002**: The bill discount is allocated to lines in proportion to their totals (largest remainder method). Line `netPaise` drives revenue, cost, and returns.
- **FR-003**: Invoices keep `isOpen` (posted with an amount due) for FIFO payment allocation.
- **FR-004**: The daily summary is updated with sales, cost of goods, purchases, cash by method, and per-product sales.
- **FR-005**: Concurrent sales of the same product are serialized by Firestore transactions. With 5 units on hand and 20 parallel single-unit sales, exactly 5 succeed (covered by an integration test).
