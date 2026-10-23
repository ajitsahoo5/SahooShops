/**
 * Read-only integrity check: product stock vs. stock ledger, and stats vs. source records.
 *
 *   npm run verify-ledger
 *
 * Exits with code 1 when any mismatch is found. Reads every product, movement, and party, so
 * run it occasionally (for example after a restore), not on a schedule.
 */
import { checkIntegrity } from "@/server/inventory/integrity";

checkIntegrity()
  .then(({ issues, productsChecked, movementsChecked }) => {
    console.log(`Checked ${productsChecked} products and ${movementsChecked} stock movements.`);
    if (issues.length === 0) {
      console.log("No integrity problems found.");
      return;
    }
    for (const issue of issues) console.error(`[${issue.kind}] ${issue.id}: ${issue.message}`);
    process.exit(1);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
