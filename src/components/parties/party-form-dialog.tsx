"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { Field } from "@/components/forms";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/hooks/use-action";
import { api } from "@/lib/api-client";
import type { PartyDoc, PartyType, WithId } from "@/server/types";

export function PartyFormDialog({ type, party }: { type: PartyType; party?: WithId<PartyDoc> }) {
  const router = useRouter();
  const { pending, run } = useAction();
  const [open, setOpen] = useState(false);
  const label = type === "customer" ? "customer" : "supplier";
  const endpoint = type === "customer" ? "/api/customers" : "/api/suppliers";
  const [form, setForm] = useState({
    name: party?.name ?? "",
    phone: party?.phone ?? "",
    email: party?.email ?? "",
    address: party?.address ?? "",
    notes: party?.notes ?? "",
    active: party?.active ?? true,
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {party ? (
          <Button variant="outline">Edit</Button>
        ) : (
          <Button>
            <PlusIcon /> New {label}
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{party ? `Edit ${label}` : `New ${label}`}</DialogTitle>
        </DialogHeader>
        <form
          className="grid grid-cols-2 gap-3"
          onSubmit={async (e) => {
            e.preventDefault();
            const result = await run(
              async () => {
                if (party) {
                  await api(`${endpoint}/${party.id}`, "PUT", form);
                  return { id: party.id };
                }
                return api<{ id: string }>(endpoint, "POST", form);
              },
              { success: party ? "Saved" : `${label[0].toUpperCase()}${label.slice(1)} added` },
            );
            if (result) {
              setOpen(false);
              if (!party) router.push(`/${type === "customer" ? "customers" : "suppliers"}/${result.id}`);
            }
          }}
        >
          <Field label="Name" htmlFor="partyName" className="col-span-2">
            <Input id="partyName" required value={form.name} onChange={(e) => set({ name: e.target.value })} />
          </Field>
          <Field label="Phone" htmlFor="partyPhone">
            <Input id="partyPhone" value={form.phone} onChange={(e) => set({ phone: e.target.value })} />
          </Field>
          <Field label="Email" htmlFor="partyEmail">
            <Input id="partyEmail" type="email" value={form.email} onChange={(e) => set({ email: e.target.value })} />
          </Field>
          <Field label="Address" htmlFor="partyAddress" className="col-span-2">
            <Textarea id="partyAddress" rows={2} value={form.address} onChange={(e) => set({ address: e.target.value })} />
          </Field>
          <Field label="Notes" htmlFor="partyNotes" className="col-span-2">
            <Textarea id="partyNotes" rows={2} value={form.notes} onChange={(e) => set({ notes: e.target.value })} />
          </Field>
          {party && (
            <label className="col-span-2 flex items-center gap-2 text-sm">
              <Checkbox checked={form.active} onCheckedChange={(v) => set({ active: v === true })} /> Active
            </label>
          )}
          <Button type="submit" className="col-span-2" disabled={pending}>
            Save
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
