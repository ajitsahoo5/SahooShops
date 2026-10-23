/**
 * Seeds the local emulators with realistic demo data through the real posting services.
 * Refuses to run against a real project.
 *
 *   npm run seed:dev
 */
import { randomUUID } from "node:crypto";
import { addDays, businessDate } from "@/lib/dates";
import { createExpense, createExpenseCategory } from "@/server/expenses/service";
import { createParty } from "@/server/parties/service";
import { recordPartyPayment } from "@/server/payments/service";
import { createCategory } from "@/server/products/categories";
import { createProduct } from "@/server/products/service";
import { createPurchase } from "@/server/purchases/service";
import { createSaleReturn } from "@/server/sales/returns";
import { createSale } from "@/server/sales/service";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("Refusing to seed: FIRESTORE_EMULATOR_HOST is not set.");
  process.exit(1);
}

const actor = { uid: "seed-script", email: "seed@localhost" };
const key = () => randomUUID();
let seed = 42;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)];

async function main() {
  const today = businessDate();
  const start = addDays(today, -35);

  const groceries = (await createCategory(actor, "Groceries")).id;
  const care = (await createCategory(actor, "Personal care")).id;
  const drinks = (await createCategory(actor, "Beverages")).id;

  const catalog = [
    { sku: "RICE-5KG", name: "Basmati Rice 5kg", categoryId: groceries, unit: "pcs", cost: 42_000, price: 52_000, qty: 20, reorder: 5 },
    { sku: "ATTA-10KG", name: "Wheat Atta 10kg", categoryId: groceries, unit: "pcs", cost: 38_000, price: 45_000, qty: 15, reorder: 4 },
    { sku: "DAL-TOOR", name: "Toor Dal (loose)", categoryId: groceries, unit: "kg", cost: 12_000, price: 15_000, qty: 40, reorder: 10 },
    { sku: "SUGAR", name: "Sugar (loose)", categoryId: groceries, unit: "kg", cost: 4_000, price: 4_800, qty: 50, reorder: 15 },
    { sku: "OIL-1L", name: "Sunflower Oil 1L", categoryId: groceries, unit: "pcs", cost: 13_000, price: 15_500, qty: 30, reorder: 8 },
    { sku: "SOAP-100", name: "Bath Soap 100g", categoryId: care, unit: "pcs", cost: 3_200, price: 4_500, qty: 60, reorder: 12 },
    { sku: "PASTE-150", name: "Toothpaste 150g", categoryId: care, unit: "pcs", cost: 8_500, price: 11_000, qty: 25, reorder: 6 },
    { sku: "TEA-250", name: "Tea Leaves 250g", categoryId: drinks, unit: "pcs", cost: 11_000, price: 14_000, qty: 18, reorder: 5 },
    { sku: "COFFEE-100", name: "Instant Coffee 100g", categoryId: drinks, unit: "pcs", cost: 22_000, price: 28_000, qty: 6, reorder: 3 },
  ];
  const products: { id: string; price: number; cost: number; unit: string }[] = [];
  for (const p of catalog) {
    const { id } = await createProduct(actor, {
      sku: p.sku,
      name: p.name,
      categoryId: p.categoryId,
      unit: p.unit,
      purchaseCostPaise: p.cost,
      sellingPricePaise: p.price,
      reorderLevelMilli: p.reorder * 1000,
      active: true,
      openingStock: { qtyMilli: p.qty * 1000, unitCostPaise: p.cost, businessDate: start },
      idempotencyKey: key(),
    });
    products.push({ id, price: p.price, cost: p.cost, unit: p.unit });
  }

  const party = (name: string, phone: string) => ({ name, phone, email: "", address: "", notes: "", active: true });
  const suppliers = [
    (await createParty(actor, "supplier", party("Ganesh Wholesale", "98765 43210"))).id,
    (await createParty(actor, "supplier", party("Lakshmi Distributors", "98111 22233"))).id,
  ];
  const customers = [
    (await createParty(actor, "customer", party("Ravi Kumar", "90000 11111"))).id,
    (await createParty(actor, "customer", party("Meena Stores", "90000 22222"))).id,
    (await createParty(actor, "customer", party("Hotel Annapurna", "90000 33333"))).id,
  ];
  const expenseCats = {
    rent: (await createExpenseCategory(actor, "Rent")).id,
    power: (await createExpenseCategory(actor, "Electricity")).id,
    transport: (await createExpenseCategory(actor, "Transport")).id,
  };

  let saleCount = 0;
  for (let day = 30; day >= 0; day--) {
    const date = addDays(today, -day);
    if (day % 7 === 3) {
      const items = products.slice(0, 6).map((p) => ({ productId: p.id, qtyMilli: 10_000, unitPricePaise: p.cost, discountPaise: 0 }));
      const total = items.reduce((s, i) => s + i.unitPricePaise * 10, 0);
      await createPurchase(actor, {
        action: "post",
        supplierId: pick(suppliers),
        supplierInvoiceNo: `B-${1000 + day}`,
        businessDate: date,
        items,
        billDiscountPaise: 0,
        notes: "",
        payment: { method: "bank", amountPaise: Math.round(total * 0.6) },
        idempotencyKey: key(),
      });
    }
    const salesToday = 2 + Math.floor(rand() * 4);
    for (let s = 0; s < salesToday; s++) {
      const lineCount = 1 + Math.floor(rand() * 3);
      const items = Array.from({ length: lineCount }, () => {
        const p = pick(products.slice(0, 8));
        const qtyMilli = p.unit === "kg" ? 500 + Math.floor(rand() * 4) * 500 : 1000 * (1 + Math.floor(rand() * 2));
        return { productId: p.id, qtyMilli, unitPricePaise: p.price, discountPaise: 0 };
      });
      const unique = [...new Map(items.map((i) => [i.productId, i])).values()];
      const total = unique.reduce((sum, i) => sum + Math.round((i.qtyMilli * i.unitPricePaise) / 1000), 0);
      const credit = rand() < 0.25;
      try {
        await createSale(actor, {
          action: "post",
          customerId: credit ? pick(customers) : null,
          businessDate: date,
          items: unique,
          billDiscountPaise: 0,
          notes: "",
          payment: credit ? null : { method: pick(["cash", "cash", "upi", "upi", "bank"] as const), amountPaise: total },
          idempotencyKey: key(),
        });
        saleCount++;
      } catch (error) {
        if (!String(error).includes("Not enough stock")) throw error;
      }
    }
    if (day % 10 === 5) {
      await createExpense(actor, {
        categoryId: expenseCats.transport,
        businessDate: date,
        amountPaise: 35_000,
        method: "cash",
        description: "Delivery auto",
        idempotencyKey: key(),
      });
    }
  }
  await createExpense(actor, {
    categoryId: expenseCats.rent,
    businessDate: addDays(today, -20),
    amountPaise: 1_200_000,
    method: "bank",
    description: "Shop rent",
    idempotencyKey: key(),
  });
  await createExpense(actor, {
    categoryId: expenseCats.power,
    businessDate: addDays(today, -12),
    amountPaise: 185_000,
    method: "upi",
    description: "Electricity bill",
    idempotencyKey: key(),
  });

  await recordPartyPayment(actor, {
    partyType: "customer",
    partyId: customers[1],
    method: "upi",
    amountPaise: 5_000,
    businessDate: today,
    invoiceId: null,
    notes: "Part payment",
    idempotencyKey: key(),
  }).catch(() => undefined);

  const sale = await createSale(actor, {
    action: "post",
    customerId: null,
    businessDate: addDays(today, -1),
    items: [{ productId: products[5].id, qtyMilli: 3_000, unitPricePaise: products[5].price, discountPaise: 0 }],
    billDiscountPaise: 0,
    notes: "",
    payment: { method: "cash", amountPaise: products[5].price * 3 },
    idempotencyKey: key(),
  });
  await createSaleReturn(actor, sale.id, {
    businessDate: today,
    items: [{ lineIndex: 0, qtyMilli: 1_000 }],
    refundMethod: "cash",
    reason: "Damaged packaging",
    idempotencyKey: key(),
  });

  console.log(`Seeded ${catalog.length} products, ${saleCount + 1} sales, purchases, payments, returns, and expenses.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
