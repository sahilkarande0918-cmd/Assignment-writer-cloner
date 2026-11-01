import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <main id="main" className="grid flex-1 place-items-center px-4 py-20">
      <div className="w-full max-w-sm">
        <p className="text-xs font-medium uppercase tracking-[0.28em] text-bronze-ink">Private studio</p>
        <h1 className="mt-4 font-display text-5xl leading-none">Sign in</h1>
        <p className="mt-3 text-sm text-ink-2">This studio belongs to one owner. Enter the owner password to continue.</p>
        <Suspense>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  );
}
