"use client";

import Form from "next/form";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useTheme } from "next-themes";
import {
  ArchiveIcon,
  BarChart3Icon,
  BoxesIcon,
  HandCoinsIcon,
  LayoutDashboardIcon,
  LogOutIcon,
  MenuIcon,
  MoonIcon,
  PackageIcon,
  PlusIcon,
  ReceiptIcon,
  SearchIcon,
  SettingsIcon,
  ShoppingCartIcon,
  SunIcon,
  TruckIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboardIcon }],
  },
  {
    label: "Transactions",
    items: [
      { href: "/sales", label: "Sales", icon: ShoppingCartIcon },
      { href: "/purchases", label: "Purchases", icon: TruckIcon },
      { href: "/payments", label: "Payments", icon: HandCoinsIcon },
      { href: "/expenses", label: "Expenses", icon: WalletIcon },
    ],
  },
  {
    label: "Inventory",
    items: [
      { href: "/products", label: "Products", icon: PackageIcon },
      { href: "/stock", label: "Stock ledger", icon: BoxesIcon },
    ],
  },
  {
    label: "People",
    items: [
      { href: "/customers", label: "Customers", icon: UsersIcon },
      { href: "/suppliers", label: "Suppliers", icon: ReceiptIcon },
    ],
  },
  {
    label: "Insights and admin",
    items: [
      { href: "/reports", label: "Reports", icon: BarChart3Icon },
      { href: "/archive", label: "Archive", icon: ArchiveIcon },
      { href: "/settings", label: "Settings", icon: SettingsIcon },
    ],
  },
];

function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function Sidebar({ email, onNavigate, onLogout }: { email: string; onNavigate?: () => void; onLogout: () => void }) {
  const pathname = usePathname();
  return (
    <div className="flex h-full flex-col">
      <Link href="/dashboard" onClick={onNavigate} className="flex h-16 shrink-0 items-center px-5">
        <Brand />
      </Link>
      <nav className="flex-1 overflow-y-auto px-3 pb-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label} className="mt-4 first:mt-1">
            <p className="mb-1 px-3 text-[0.68rem] font-semibold tracking-wider text-muted-foreground/80 uppercase">
              {group.label}
            </p>
            <div className="flex flex-col gap-0.5">
              {group.items.map(({ href, label, icon: Icon }) => {
                const active = isActive(pathname, href);
                return (
                  <Link
                    key={href}
                    href={href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/75 hover:bg-muted hover:text-sidebar-foreground",
                    )}
                  >
                    <Icon
                      className={cn(
                        "size-4.5 shrink-0",
                        active ? "text-primary" : "text-muted-foreground group-hover:text-sidebar-foreground",
                      )}
                    />
                    {label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-3 rounded-xl bg-muted/70 p-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary uppercase">
            {email.charAt(0)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">Signed in as</p>
            <p className="truncate text-sm font-medium" title={email}>
              {email}
            </p>
          </div>
        </div>
        <Button variant="ghost" className="mt-2 w-full justify-start text-muted-foreground" onClick={onLogout}>
          <LogOutIcon /> Sign out
        </Button>
      </div>
    </div>
  );
}

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="rounded-full bg-muted/70 text-muted-foreground hover:text-foreground"
      aria-label="Switch between light and dark mode"
      title="Light or dark mode"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <MoonIcon className="dark:hidden" />
      <SunIcon className="hidden dark:block" />
    </Button>
  );
}

export function AppShell({ email, children }: { email: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  async function logout() {
    try {
      await api("/api/auth/logout", "POST");
    } finally {
      router.replace("/login");
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-sidebar-border bg-sidebar md:block">
        <Sidebar email={email} onLogout={logout} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-card/85 px-4 backdrop-blur-md md:px-6">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open menu">
                <MenuIcon />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <Sidebar email={email} onNavigate={() => setOpen(false)} onLogout={logout} />
            </SheetContent>
          </Sheet>
          <Link href="/dashboard" className="sm:hidden">
            <Brand />
          </Link>
          <Form action="/products" className="relative hidden max-w-sm flex-1 sm:block">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              name="q"
              type="search"
              placeholder="Find a product by name or SKU"
              aria-label="Find a product"
              className="rounded-full border-transparent bg-muted/70 pl-9 focus-visible:bg-card"
            />
          </Form>
          <div className="ml-auto flex items-center gap-2">
            <Button asChild variant="outline" className="hidden lg:inline-flex">
              <Link href="/purchases/new">
                <TruckIcon /> New purchase
              </Link>
            </Button>
            <Button asChild>
              <Link href="/sales/new" aria-label="New sale">
                <PlusIcon /> <span className="hidden sm:inline">New sale</span>
              </Link>
            </Button>
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] flex-1 p-4 md:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
