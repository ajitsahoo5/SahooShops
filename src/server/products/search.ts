const MAX_PREFIX = 20;

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/i)
    .filter(Boolean);
}

/** Prefix tokens for name and SKU words, used with `array-contains` product search. */
export function buildSearchTokens(name: string, sku: string): string[] {
  const tokens = new Set<string>();
  const all = [...words(name), ...words(sku), sku.toLowerCase()];
  for (const word of all) {
    for (let i = 1; i <= Math.min(word.length, MAX_PREFIX); i++) tokens.add(word.slice(0, i));
  }
  return [...tokens].slice(0, 400);
}

/** Query words, longest first so the Firestore filter is as selective as possible. */
export function queryTokens(query: string): string[] {
  return [...new Set(words(query).map((w) => w.slice(0, MAX_PREFIX)))].sort((a, b) => b.length - a.length);
}
