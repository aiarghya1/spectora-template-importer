"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export type AuthState = { error?: string; message?: string; email?: string };

const credentials = z.object({
  email: z.email("Enter a valid email address.").max(254),
  password: z.string().min(8, "Password must be at least 8 characters.").max(72),
  next: z.string().optional(),
});

/** Only allow same-site relative redirects, to prevent open redirects via ?next=. */
function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

/** Single entry point for the form; the mode travels as a hidden field. */
export async function authenticate(_state: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").slice(0, 254);
  const result = formData.get("mode") === "signup" ? await signUp(formData) : await signIn(formData);
  // React resets the form after an action completes; hand the email back so it isn't retyped.
  return { ...result, email };
}

async function signIn(formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  // Generic message: don't reveal whether the account exists.
  if (error) return { error: "Email or password is incorrect." };
  redirect(safeNext(parsed.data.next));
}

async function signUp(formData: FormData): Promise<AuthState> {
  const parsed = credentials.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const origin = (await headers()).get("origin") ?? "";
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${origin}/auth/confirm` },
  });
  if (error) return { error: error.message };
  if (!data.session) return { message: "Check your email to confirm your account, then sign in." };
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
