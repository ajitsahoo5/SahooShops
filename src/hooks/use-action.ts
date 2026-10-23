"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { toast } from "sonner";

/** Runs a mutation with a pending flag, toast feedback, and a server-component refresh. */
export function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const run = useCallback(
    async <T,>(fn: () => Promise<T>, options: { success?: string; refresh?: boolean } = {}): Promise<T | undefined> => {
      setPending(true);
      try {
        const result = await fn();
        if (options.success) toast.success(options.success);
        if (options.refresh !== false) router.refresh();
        return result;
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Something went wrong.");
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [router],
  );

  return { pending, run };
}
