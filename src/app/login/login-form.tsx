"use client";
import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

type Mode = "signin" | "signup" | "verify" | "forgot" | "reset";
type Result = { error?: { message?: string; code?: string; status?: number } | null };

const TITLES: Record<Mode, string> = { signin: "Sign in", signup: "Create account", verify: "Check your email", forgot: "Reset password", reset: "Choose a new password" };
const field = "mt-1.5 w-full rounded-lg border border-line-strong bg-paper px-3 py-2.5";

export function LoginForm() {
  const params = useSearchParams();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string>();
  const [note, setNote] = useState<string>();
  const [busy, setBusy] = useState(false);
  // Only same-site relative paths are allowed as a return target (no open redirect).
  const next = (() => {
    const n = params.get("next") ?? "/studio";
    return n.startsWith("/") && !n.startsWith("//") ? n : "/studio";
  })();

  const go = (m: Mode, msg?: string) => {
    setMode(m);
    setError(undefined);
    setNote(msg);
  };

  async function submit(f: FormData) {
    const get = (k: string) => String(f.get(k) ?? "");
    const fail = (r: Result, fallback: string) => {
      setError(r.error?.message || fallback);
      return true;
    };
    const mail = mode === "verify" || mode === "reset" ? email : get("email").trim();
    setEmail(mail);
    if (mode === "signin") {
      const r: Result = await authClient.signIn.email({ email: mail, password: get("password") });
      if (r.error?.status === 403 || r.error?.code === "EMAIL_NOT_VERIFIED") return go("verify", `We sent a 6-digit code to ${mail}.`);
      if (r.error) return fail(r, "Sign-in failed.");
    } else if (mode === "signup") {
      const r: Result = await authClient.signUp.email({ email: mail, password: get("password"), name: get("name").trim() || mail.split("@")[0] });
      if (r.error) return fail(r, "Could not create the account.");
      return go("verify", `We sent a 6-digit code to ${mail}. It may take a minute; check spam too.`);
    } else if (mode === "verify") {
      const r: Result = await authClient.emailOtp.verifyEmail({ email: mail, otp: get("code").trim() });
      if (r.error) return fail(r, "That code did not work.");
      const s = await authClient.getSession();
      if (!s.data?.user) return go("signin", "Email confirmed. Sign in to continue.");
    } else if (mode === "forgot") {
      const r: Result = await authClient.emailOtp.sendVerificationOtp({ email: mail, type: "forget-password" });
      if (r.error) return fail(r, "Could not send a reset code.");
      return go("reset", `If ${mail} has an account, a reset code is on its way.`);
    } else {
      const r: Result = await authClient.emailOtp.resetPassword({ email: mail, otp: get("code").trim(), password: get("password") });
      if (r.error) return fail(r, "Could not reset the password.");
      return go("signin", "Password changed. Sign in with the new one.");
    }
    window.location.assign(next);
  }

  return (
    <>
      <h1 className="mt-4 font-display text-5xl leading-none">{TITLES[mode]}</h1>
      <p className="mt-3 text-sm text-ink-2">
        {mode === "signup" ? "Free accounts include 3 generations — handwriting or AI edits." : mode === "signin" ? "Sign in to your studio." : note}
      </p>
      {note && (mode === "signin" || mode === "signup") && <p className="mt-2 text-sm text-ink">{note}</p>}
      <form
        key={mode}
        className="mt-8 space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(undefined);
          try {
            await submit(new FormData(e.currentTarget));
          } catch (err) {
            // The auth client throws on some HTTP errors (e.g. wrong password); network failures say "fetch".
            const msg = err instanceof Error ? err.message : "";
            setError(msg && !/fetch|network/i.test(msg) ? msg : "Could not reach the sign-in service. Check your connection and try again.");
          }
          setBusy(false);
        }}
      >
        {mode === "signup" && (
          <label className="block text-sm font-medium">
            Name
            <input name="name" autoComplete="name" maxLength={80} className={field} />
          </label>
        )}
        {(mode === "signin" || mode === "signup" || mode === "forgot") && (
          <label className="block text-sm font-medium">
            Email
            <input name="email" type="email" autoComplete="email" required defaultValue={email} className={field} />
          </label>
        )}
        {(mode === "verify" || mode === "reset") && (
          <label className="block text-sm font-medium">
            6-digit code
            <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required className={`${field} tracking-[0.4em]`} />
          </label>
        )}
        {(mode === "signin" || mode === "signup" || mode === "reset") && (
          <label className="block text-sm font-medium">
            {mode === "reset" ? "New password" : "Password"}
            <input name="password" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} minLength={8} required className={field} />
          </label>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy ? "Please wait…" : { signin: "Sign in", signup: "Create account", verify: "Confirm email", forgot: "Send reset code", reset: "Set password" }[mode]}
        </Button>
      </form>
      <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-ink-2">
        {mode !== "signin" && (
          <button type="button" className="underline-offset-4 hover:text-ink hover:underline" onClick={() => go("signin")}>
            Back to sign in
          </button>
        )}
        {mode === "signin" && (
          <>
            <button type="button" className="underline-offset-4 hover:text-ink hover:underline" onClick={() => go("signup")}>
              Create an account
            </button>
            <button type="button" className="underline-offset-4 hover:text-ink hover:underline" onClick={() => go("forgot")}>
              Forgot password?
            </button>
          </>
        )}
        {mode === "verify" && (
          <button
            type="button"
            className="underline-offset-4 hover:text-ink hover:underline"
            onClick={async () => {
              const r: Result = await authClient.emailOtp.sendVerificationOtp({ email, type: "email-verification" });
              setNote(r.error ? r.error.message || "Could not send a new code." : `A new code was sent to ${email}.`);
            }}
          >
            Send a new code
          </button>
        )}
      </div>
    </>
  );
}
