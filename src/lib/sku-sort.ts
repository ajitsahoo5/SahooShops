/**
 * Compare SKUs numerically when they are whole numbers, so 2 comes before 10.
 * Any other SKU is ordered by its text, after the numbers.
 */
export function compareSku(a: string, b: string): number {
  const aNum = /^\d+$/.test(a);
  const bNum = /^\d+$/.test(b);
  if (aNum && bNum) {
    const diff = BigInt(a) - BigInt(b);
    if (diff !== 0n) return diff < 0n ? -1 : 1;
    return a.localeCompare(b);
  }
  if (aNum !== bNum) return aNum ? -1 : 1;
  return a.localeCompare(b);
}
