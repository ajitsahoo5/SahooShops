import { InboxIcon } from "lucide-react";

export function EmptyState({ message, children }: { message: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card/60 p-10 text-center text-sm text-muted-foreground">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <InboxIcon className="size-5" />
      </span>
      <p>{message}</p>
      {children}
    </div>
  );
}
