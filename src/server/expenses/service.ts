import "server-only";
import type { Query } from "firebase-admin/firestore";
import { monthKeyOf } from "@/lib/dates";
import { DomainError } from "@/lib/errors";
import { formatINR } from "@/lib/money";
import type { ExpenseInput, ExpenseListQuery } from "@/lib/schemas/payment";
import type { Actor } from "../auth";
import { writeAudit } from "../audit";
import { COL, col, nowIso, withId } from "../collections";
import { db } from "../firebaseAdmin";
import { runPosting } from "../posting/context";
import type { ExpenseCategoryDoc, ExpenseDoc, WithId } from "../types";

export async function listExpenseCategories(): Promise<WithId<ExpenseCategoryDoc>[]> {
  const snap = await col(COL.expenseCategories).orderBy("nameLower").limit(500).get();
  return snap.docs.map((d) => withId<ExpenseCategoryDoc>(d));
}

export async function createExpenseCategory(actor: Actor, name: string): Promise<{ id: string }> {
  const nameLower = name.toLowerCase();
  return db().runTransaction(async (tx) => {
    const dup = await tx.get(col(COL.expenseCategories).where("nameLower", "==", nameLower).limit(1));
    if (!dup.empty) throw new DomainError("CONFLICT", `Category "${name}" already exists.`);
    const ref = col(COL.expenseCategories).doc();
    tx.set(ref, { name, nameLower, createdAt: nowIso() } satisfies ExpenseCategoryDoc);
    writeAudit(tx, actor, "expenseCategory.create", "expenseCategory", ref.id, `Created expense category ${name}`);
    return { id: ref.id };
  });
}

export async function renameExpenseCategory(actor: Actor, id: string, name: string): Promise<void> {
  const nameLower = name.toLowerCase();
  await db().runTransaction(async (tx) => {
    const ref = col(COL.expenseCategories).doc(id);
    const [snap, dup] = await Promise.all([
      tx.get(ref),
      tx.get(col(COL.expenseCategories).where("nameLower", "==", nameLower).limit(1)),
    ]);
    if (!snap.exists) throw new DomainError("NOT_FOUND", "Category not found.");
    if (!dup.empty && dup.docs[0].id !== id) throw new DomainError("CONFLICT", `Category "${name}" already exists.`);
    tx.update(ref, { name, nameLower });
    writeAudit(tx, actor, "expenseCategory.rename", "expenseCategory", id, `Renamed expense category to ${name}`);
  });
}

export async function deleteExpenseCategory(actor: Actor, id: string): Promise<void> {
  await db().runTransaction(async (tx) => {
    const ref = col(COL.expenseCategories).doc(id);
    const [snap, used] = await Promise.all([
      tx.get(ref),
      tx.get(col(COL.expenses).where("categoryId", "==", id).limit(1)),
    ]);
    if (!snap.exists) throw new DomainError("NOT_FOUND", "Category not found.");
    if (!used.empty) throw new DomainError("INVALID_STATE", "This category has expenses and cannot be deleted.");
    tx.delete(ref);
    writeAudit(tx, actor, "expenseCategory.delete", "expenseCategory", id, `Deleted expense category ${snap.data()?.name}`);
  });
}

export async function createExpense(actor: Actor, input: ExpenseInput): Promise<{ id: string }> {
  return runPosting(actor, input.idempotencyKey, "expense.create", async (ctx) => {
    const catSnap = await ctx.tx.get(col(COL.expenseCategories).doc(input.categoryId));
    if (!catSnap.exists) throw new DomainError("NOT_FOUND", "Expense category not found.");
    const category = catSnap.data() as ExpenseCategoryDoc;
    const ref = col(COL.expenses).doc();
    const doc: ExpenseDoc = {
      categoryId: input.categoryId,
      categoryName: category.name,
      businessDate: input.businessDate,
      monthKey: monthKeyOf(input.businessDate),
      amountPaise: input.amountPaise,
      method: input.method,
      description: input.description,
      status: "active",
      voidReason: null,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      actorUid: actor.uid,
    };
    ctx.tx.set(ref, doc);
    ctx.summary(input.businessDate, { expensesPaise: input.amountPaise, cashOut: { [input.method]: input.amountPaise } });
    ctx.audit("expense.create", "expense", ref.id, `Expense ${category.name} ${formatINR(input.amountPaise)}`);
    return { id: ref.id };
  });
}

/** Voids an expense entered by mistake, removing it from that day's totals. */
export async function voidExpense(actor: Actor, id: string, reason: string): Promise<void> {
  await runPosting(actor, undefined, "expense.void", async (ctx) => {
    const ref = col(COL.expenses).doc(id);
    const snap = await ctx.tx.get(ref);
    if (!snap.exists) throw new DomainError("NOT_FOUND", "Expense not found.");
    const expense = snap.data() as ExpenseDoc;
    if (expense.status !== "active") throw new DomainError("INVALID_STATE", "This expense is already voided.");
    ctx.tx.update(ref, { status: "voided", voidReason: reason, updatedAt: ctx.now });
    ctx.summary(expense.businessDate, {
      expensesPaise: -expense.amountPaise,
      cashOut: { [expense.method]: -expense.amountPaise },
    });
    ctx.audit("expense.void", "expense", id, `Voided expense ${formatINR(expense.amountPaise)}: ${reason}`);
  });
}

export async function listExpenses(filters: Partial<ExpenseListQuery> & { limit?: number }): Promise<WithId<ExpenseDoc>[]> {
  let query: Query = col(COL.expenses);
  if (filters.categoryId) query = query.where("categoryId", "==", filters.categoryId);
  if (filters.from) query = query.where("businessDate", ">=", filters.from);
  if (filters.to) query = query.where("businessDate", "<=", filters.to);
  const snap = await query.orderBy("businessDate", "desc").limit(filters.limit ?? 500).get();
  return snap.docs
    .map((d) => withId<ExpenseDoc>(d))
    .sort((a, b) => b.businessDate.localeCompare(a.businessDate) || b.createdAt.localeCompare(a.createdAt));
}
