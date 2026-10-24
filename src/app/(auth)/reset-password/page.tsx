"use client";

import Link from "next/link";
import { useState } from "react";
import { sendPasswordResetEmail } from "firebase/auth";
import { AuthShell } from "@/components/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { clientAuth } from "@/lib/firebase-client";

export default function ResetPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await sendPasswordResetEmail(await clientAuth(), email.trim());
    } catch {
      // Always show the same message so the form does not reveal which emails exist.
    }
    setSent(true);
    setPending(false);
  }

  return (
    <AuthShell title="Reset password" description="We will email a password reset link to the administrator.">
      {sent ? (
        <div className="flex flex-col gap-4">
          <Alert>
            <AlertDescription>If that email belongs to the administrator account, a reset link is on its way.</AlertDescription>
          </Alert>
          <Button asChild variant="outline">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Button type="submit" size="lg" disabled={pending}>
            {pending ? "Sending..." : "Send reset link"}
          </Button>
          <Link href="/login" className="text-center text-sm text-muted-foreground hover:text-primary hover:underline">
            Back to sign in
          </Link>
        </form>
      )}
    </AuthShell>
  );
}
