# Feature Specification: Payments, returns, and expenses

**Feature Branch**: `005-payments-returns-expenses` | **Status**: Implemented

## Concepts
- **Invoice total** is what was billed. **Paid** is money received or paid against it. **Due** is the outstanding part.
- **Credit**: any unpaid part at posting stays due and is added to the customer receivable or supplier payable.
- **Cash movement**: every payment, refund, and expense writes to the day's `cashIn` or `cashOut` by method (cash, UPI, bank).

## User Scenarios
1. **Partial payments**: a customer owes ₹30 on an older invoice and ₹50 on a newer one. Paying ₹40 without choosing an invoice settles the older one and puts ₹10 on the newer one.
2. **Overpayment** is rejected with "Amount is more than the outstanding ₹X".
3. **Payment reversal** (for example a bounced cheque) reopens the invoices, restores the party balance, and corrects that day's cash total. It is blocked when the invoice itself was reversed.
4. **Sales returns**: returned items come back into stock at the cost originally charged. The return value first reduces what is still due, and any excess is refunded by the chosen method. Partial returns add up exactly to the full line value.
5. **Expenses** are recorded by category with a payment method and can be voided with a reason, which removes them from that day's totals.

## Requirements
- **FR-001**: Receipts, supplier payments, refunds, and reversals are all `payments` documents with `kind`, `direction`, `method`, and `allocations`.
- **FR-002**: Reversals mark the original as `reversed` and write a linked `reversal` record. Both stay visible in payment history.
- **FR-003**: Walk-in receipts cannot be reversed on their own. Reverse the sale instead.
- **FR-004**: Party balances and `stats/balances` are only changed inside posting transactions.
