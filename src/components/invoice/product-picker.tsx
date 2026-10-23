"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { formatINR } from "@/lib/money";
import { formatQty } from "@/lib/qty";
import type { ProductView } from "@/server/products/view";

export function ProductPicker({
  onSelect,
  priceField,
}: {
  onSelect: (product: ProductView) => void;
  priceField: "sellingPricePaise" | "purchaseCostPaise";
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProductView[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!q) return;
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await api<{ items: ProductView[] }>(`/api/products/search?q=${encodeURIComponent(q)}`);
        if (id === requestId.current) setResults(data.items);
      } catch {
        if (id === requestId.current) setResults([]);
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  function choose(p: ProductView) {
    onSelect(p);
    setQuery("");
    setResults([]);
    setOpen(false);
  }

  return (
    <div className="relative">
      <Input
        placeholder="Add item: type product name or SKU"
        value={query}
        aria-label="Search products"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          if (!e.target.value.trim()) setResults([]);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (results[0]) choose(results[0]);
          }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && query.trim() && (
        <ul className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-lg border bg-popover shadow-md" role="listbox">
          {loading && results.length === 0 && <li className="p-2 text-sm text-muted-foreground">Searching...</li>}
          {!loading && results.length === 0 && <li className="p-2 text-sm text-muted-foreground">No matching products</li>}
          {results.map((p) => (
            <li key={p.id} role="option" aria-selected={false}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(p)}
              >
                <span>
                  <span className="font-medium">{p.name}</span>
                  <span className="ml-2 font-mono text-xs text-muted-foreground">{p.sku}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {formatQty(p.stockQtyMilli)} {p.unit} · {formatINR(p[priceField])}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
