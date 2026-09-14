"use client";

import { useActionState, useState } from "react";
import { authenticate, type AuthState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [state, action, pending] = useActionState<AuthState, FormData>(authenticate, {});

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="next" value={next ?? ""} />
      <label className="flex flex-col gap-1 text-sm font-medium">
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-md border border-zinc-300 px-3 py-2 font-normal"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        Password
        <input
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          className="rounded-md border border-zinc-300 px-3 py-2 font-normal"
        />
      </label>

      {state.error && (
        <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          {state.error}
        </p>
      )}
      {state.message && (
        <p role="status" className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-800">
          {state.message}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
      </button>
      <button
        type="button"
        onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
        className="text-sm text-zinc-600 underline"
      >
        {mode === "signin" ? "No account? Create one" : "Have an account? Sign in"}
      </button>
    </form>
  );
}
