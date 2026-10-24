import { StoreIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-xl bg-linear-to-br from-indigo-500 to-violet-500 text-white shadow-md shadow-indigo-500/25",
        className,
      )}
    >
      <StoreIcon className="size-5" />
    </span>
  );
}

export function Brand({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      <span className="text-lg font-semibold tracking-tight">Sahoo Shop</span>
    </span>
  );
}
