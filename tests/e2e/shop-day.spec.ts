import { expect, test, type Page } from "@playwright/test";
import { E2E_ADMIN } from "./global-setup";

async function login(page: Page) {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Email").fill(E2E_ADMIN.email);
  await page.getByLabel("Password").fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

test("a day at the shop: product, purchase, sale, payment, report, sign out", async ({ page }) => {
  const suffix = Date.now().toString(36).toUpperCase();
  const sku = `E2E-${suffix}`;
  const productName = `E2E Ghee 500ml ${suffix}`;

  await test.step("rejects a wrong password", async () => {
    await page.goto("/login");
    await page.getByLabel("Email").fill(E2E_ADMIN.email);
    await page.getByLabel("Password").fill("not-the-password");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  });

  await test.step("signs in", () => login(page));

  await test.step("creates a product with opening stock", async () => {
    await page.goto("/products");
    await page.getByRole("button", { name: "New product" }).click();
    await page.getByLabel("SKU").fill(sku);
    await page.getByLabel("Name").fill(productName);
    await page.getByLabel("Purchase cost (per unit)").fill("250");
    await page.getByLabel("Selling price (per unit)").fill("320");
    await page.getByLabel("Reorder level").fill("2");
    await page.getByLabel("Quantity").fill("10");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: productName })).toBeVisible();
    await expect(page.getByText("10 pcs").first()).toBeVisible();
    await expect(page.getByText("₹2,500.00").first()).toBeVisible();
  });

  const customer = `E2E Customer ${suffix}`;
  await test.step("adds a customer", async () => {
    await page.goto("/customers");
    await page.getByRole("button", { name: "New customer" }).click();
    await page.getByLabel("Name").fill(customer);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: customer })).toBeVisible();
  });

  await test.step("buys more stock from a supplier", async () => {
    const supplier = `E2E Supplier ${suffix}`;
    await page.goto("/suppliers");
    await page.getByRole("button", { name: "New supplier" }).click();
    await page.getByLabel("Name").fill(supplier);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("heading", { name: supplier })).toBeVisible();

    await page.goto("/purchases/new");
    await page.getByLabel("Supplier", { exact: true }).selectOption({ label: supplier });
    await page.getByLabel("Search products").fill(sku);
    await page.getByRole("option").filter({ hasText: productName }).click();
    await page.getByLabel("Quantity line 1").fill("5");
    await page.getByLabel("Price line 1").fill("260");
    await expect(page.getByTestId("invoice-total")).toHaveText("₹1,300.00");
    await page.getByLabel("Payment method").selectOption("bank");
    await page.getByRole("button", { name: "Post purchase" }).click();
    await expect(page.getByRole("heading", { name: /^Purchase PUR-\d{6}$/ })).toBeVisible();
  });

  await test.step("posts a credit sale with a part payment", async () => {
    await page.goto("/sales/new");
    await page.getByLabel("Customer").selectOption({ label: customer });
    await page.getByLabel("Search products").fill(sku);
    await page.getByRole("option").filter({ hasText: productName }).click();
    await page.getByLabel("Quantity line 1").fill("3");
    await expect(page.getByTestId("invoice-total")).toHaveText("₹960.00");
    await page.getByLabel("Paid in full now").uncheck();
    await page.getByLabel("Amount paid now").fill("500");
    await page.getByRole("button", { name: "Post sale" }).click();
    await expect(page.getByRole("heading", { name: /^Sale INV-\d{6}$/ })).toBeVisible();
    await expect(page.getByText("₹460.00").first()).toBeVisible();
  });

  await test.step("collects the balance", async () => {
    await page.getByRole("button", { name: "Receive payment" }).click();
    await page.getByLabel("Method").selectOption("upi");
    await page.getByRole("button", { name: "Save payment" }).click();
    await expect(page.getByText("Payment recorded")).toBeVisible();
    await expect(page.getByRole("button", { name: "Receive payment" })).toHaveCount(0);
  });

  await test.step("stock and weighted-average value are updated", async () => {
    // 10 @ ₹250 + 5 @ ₹260 = ₹3,800 for 15; selling 3 removes round(3800 x 3 / 15) = ₹760.
    await page.goto(`/products?q=${encodeURIComponent(sku)}`);
    await page.getByRole("link", { name: productName }).click();
    await expect(page.getByText("12 pcs").first()).toBeVisible();
    await expect(page.getByText("₹3,040.00").first()).toBeVisible();
    await expect(page.getByText("₹253.33").first()).toBeVisible();
  });

  await test.step("downloads an Excel sales report", async () => {
    await page.goto("/reports?report=sales");
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("link", { name: "Excel" }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/^sahoo-shop-sales-.*\.xlsx$/);
  });

  await test.step("signs out and protects pages", async () => {
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto("/sales");
    await expect(page).toHaveURL(/\/login\?next=%2Fsales/);
  });
});
