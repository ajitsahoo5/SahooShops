"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/api-client";

type Item = { id: string; name: string };

function Row({ item, endpoint, canRename }: { item: Item; endpoint: string; canRename: boolean }) {
  const { pending, run } = useAction();
  const [name, setName] = useState(item.name);
  return (
    <li className="flex items-center gap-2 border-b p-2 last:border-b-0">
      {canRename ? (
        <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" aria-label="Category name" />
      ) : (
        <span className="flex-1">{item.name}</span>
      )}
      {canRename && (
        <Button
          variant="outline"
          size="sm"
          disabled={pending || name.trim() === item.name || !name.trim()}
          onClick={() => run(() => api(`${endpoint}/${item.id}`, "PUT", { name }), { success: "Renamed" })}
        >
          Rename
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => {
          if (window.confirm(`Delete "${item.name}"?`)) {
            void run(() => api(`${endpoint}/${item.id}`, "DELETE"), { success: "Deleted" });
          }
        }}
      >
        Delete
      </Button>
    </li>
  );
}

/** Add, rename, and delete simple named categories (product or expense categories). */
export function CategoryManager({
  categories,
  endpoint,
  canRename = true,
}: {
  categories: Item[];
  endpoint: string;
  canRename?: boolean;
}) {
  const { pending, run } = useAction();
  const [name, setName] = useState("");

  return (
    <div className="max-w-xl">
      <form
        className="mb-4 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const done = await run(() => api(endpoint, "POST", { name }), { success: "Category added" });
          if (done) setName("");
        }}
      >
        <Input placeholder="New category name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Button type="submit" disabled={pending}>
          Add
        </Button>
      </form>
      {categories.length === 0 ? (
        <p className="text-sm text-muted-foreground">No categories yet.</p>
      ) : (
        <ul className="overflow-hidden rounded-xl border bg-card shadow-sm shadow-indigo-950/[0.04]">
          {categories.map((c) => (
            <Row key={c.id} item={c} endpoint={endpoint} canRename={canRename} />
          ))}
        </ul>
      )}
    </div>
  );
}
