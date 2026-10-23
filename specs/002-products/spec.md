# Feature Specification: Products, categories, and opening stock

**Feature Branch**: `002-products` | **Status**: Implemented

## User Scenarios

### User Story 1 - Add a product with opening stock (P1)
1. **Given** a unique SKU, **When** the owner saves a product with an opening quantity and unit cost, **Then** the product shows that stock, the value equals quantity times cost, and the stock ledger has one `OPENING` movement.
2. **Given** an existing SKU (any letter case), **When** another product uses it, **Then** the save fails with "SKU ... is already used".
3. **Given** a double-clicked Save, **Then** only one product is created (idempotency key).

### User Story 2 - Find products (P1)
1. Search by any prefix of a name or SKU word, for example "moo dal".
2. Filter by category, stock status (in, low, out), and active state.

### User Story 3 - Maintain products and categories (P2)
1. Editing the reorder level immediately recalculates low-stock status.
2. Products with stock history cannot be deleted, only made inactive.
3. Categories with products cannot be deleted.

## Requirements
- **FR-001**: SKUs are normalized to upper case and kept unique through `skuIndex/{SKU}` documents written in the same transaction.
- **FR-002**: Opening stock is only allowed before a product has any movements. Later changes use stock adjustments.
- **FR-003**: Product edits are audited with before and after values of changed fields.
- **FR-004**: Search uses prefix tokens (`searchTokens`) with `array-contains`, then filters extra words in memory, capped at 500 results.
