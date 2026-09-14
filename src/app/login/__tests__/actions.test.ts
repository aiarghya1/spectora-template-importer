import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { fakeSupabase } from "@/test/fake-supabase";
import { authenticate, signOut } from "../actions";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ origin: "https://app.example" })) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`REDIRECT:${url}`);
  }),
}));

const auth = {
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
};

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  const db = fakeSupabase(() => ({}), { auth: auth as never });
  vi.mocked(createClient).mockResolvedValue(db.client as never);
});

describe("sign in", () => {
  it("validates before calling Supabase, returning the email so the form keeps it", async () => {
    expect(await authenticate({}, form({ email: "not-an-email", password: "longenough" }))).toEqual({
      error: "Enter a valid email address.",
      email: "not-an-email",
    });
    expect(await authenticate({}, form({ email: "a@b.co", password: "short" }))).toEqual({
      error: "Password must be at least 8 characters.",
      email: "a@b.co",
    });
    expect(auth.signInWithPassword).not.toHaveBeenCalled();
  });

  it("uses a generic message for bad credentials (no account enumeration)", async () => {
    auth.signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    expect(await authenticate({}, form({ email: "a@b.co", password: "wrong-password" }))).toEqual({
      error: "Email or password is incorrect.",
      email: "a@b.co",
    });
  });

  it("caps the echoed email length", async () => {
    const result = await authenticate({}, form({ email: "x".repeat(400), password: "whatever1" }));
    expect(result.email).toHaveLength(254);
  });

  it.each([
    ["/templates/abc", "/templates/abc"],
    ["", "/"],
    ["//evil.example", "/"],
    ["https://evil.example", "/"],
  ])("redirects next=%j to %s (no open redirects)", async (next, expected) => {
    auth.signInWithPassword.mockResolvedValue({ error: null });
    await expect(authenticate({}, form({ email: "a@b.co", password: "correct-horse", next }))).rejects.toThrow(`REDIRECT:${expected}`);
  });
});

describe("sign up", () => {
  const signup = (extra: Record<string, string> = {}) =>
    authenticate({}, form({ mode: "signup", email: "new@b.co", password: "correct-horse", ...extra }));

  it("asks for email confirmation when no session is returned", async () => {
    auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
    expect(await signup()).toEqual({ message: "Check your email to confirm your account, then sign in.", email: "new@b.co" });
    expect(auth.signUp).toHaveBeenCalledWith({
      email: "new@b.co",
      password: "correct-horse",
      options: { emailRedirectTo: "https://app.example/auth/confirm" },
    });
  });

  it("signs straight in when confirmation is disabled", async () => {
    auth.signUp.mockResolvedValue({ data: { session: {} }, error: null });
    await expect(signup()).rejects.toThrow("REDIRECT:/");
  });

  it("validates sign-up input too", async () => {
    expect(await signup({ password: "short" })).toMatchObject({ error: "Password must be at least 8 characters." });
    expect(auth.signUp).not.toHaveBeenCalled();
  });

  it("shows Supabase's reason when sign-up fails", async () => {
    auth.signUp.mockResolvedValue({ data: {}, error: { message: "User already registered" } });
    expect(await signup()).toEqual({ error: "User already registered", email: "new@b.co" });
  });
});

describe("sign out", () => {
  it("ends the session and returns to login", async () => {
    await expect(signOut()).rejects.toThrow("REDIRECT:/login");
    expect(auth.signOut).toHaveBeenCalled();
  });
});
