"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const params = useSearchParams();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  // Only same-site relative paths are allowed as a return target (no open redirect).
  const next = (() => {
    const n = params.get("next") ?? "/studio";
    return n.startsWith("/") && !n.startsWith("//") ? n : "/studio";
  })();

  return (
    <form
      className="mt-8 space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(undefined);
        const password = new FormData(e.currentTarget).get("password");
        const r = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
        if (r.ok) window.location.assign(next);
        else {
          setError((await r.json().catch(() => ({}))).error ?? "Sign-in failed.");
          setBusy(false);
        }
      }}
    >
      <label className="block text-sm font-medium">
        Owner password
        <input name="password" type="password" autoComplete="current-password" required className="mt-1.5 w-full rounded-lg border border-line-strong bg-paper px-3 py-2.5" />
      </label>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
