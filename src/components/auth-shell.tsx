import { BarChart3Icon, PackageCheckIcon, ShieldCheckIcon } from "lucide-react";
import { Brand, BrandMark } from "@/components/brand";

const HIGHLIGHTS = [
  { icon: PackageCheckIcon, text: "Stock that updates itself with every sale and purchase" },
  { icon: BarChart3Icon, text: "Daily sales, profit, and cash at a glance" },
  { icon: ShieldCheckIcon, text: "Every change is recorded and reversible" },
];

export function AuthShell({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-linear-to-br from-indigo-600 via-indigo-500 to-violet-500 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 size-96 rounded-full bg-violet-300/20 blur-3xl" />
        <span className="relative flex items-center gap-2.5">
          <BrandMark className="bg-white/15 from-transparent to-transparent shadow-none ring-1 ring-white/30" />
          <span className="text-lg font-semibold tracking-tight">Sahoo Shop</span>
        </span>
        <div className="relative max-w-md">
          <h2 className="text-3xl leading-tight font-semibold">Run the shop with less paperwork.</h2>
          <ul className="mt-8 flex flex-col gap-4">
            {HIGHLIGHTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-white/90">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/15">
                  <Icon className="size-4.5" />
                </span>
                {text}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/70">Inventory, sales, and purchases in one place.</p>
      </section>
      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Brand className="mb-8 lg:hidden" />
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 mb-6 text-sm text-muted-foreground">{description}</p>
          <div className="rounded-2xl bg-card p-6 shadow-sm shadow-indigo-950/[0.05] ring-1 ring-foreground/[0.06] dark:ring-foreground/10">
            {children}
          </div>
        </div>
      </section>
    </main>
  );
}
