// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { headers } from "next/headers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { fakeSupabase } from "@/test/fake-supabase";
import { authenticate } from "../actions";
import { LoginForm } from "../login-form";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const signUp = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue(fakeSupabase(() => ({}), { auth: { signUp } as never }).client as never);
});

describe("authenticate — missing request data", () => {
  it("copes with a form that has no email field", async () => {
    const form = new FormData();
    form.set("password", "long-enough");
    expect(await authenticate({}, form)).toEqual({ error: "Enter a valid email address.", email: "" });
  });

  it("falls back to a relative confirmation link without an Origin header", async () => {
    vi.mocked(headers).mockResolvedValue(new Headers() as never);
    signUp.mockResolvedValue({ data: { session: null }, error: null });
    const form = new FormData();
    for (const [key, value] of Object.entries({ mode: "signup", email: "a@b.co", password: "long-enough" })) form.set(key, value);
    await authenticate({}, form);
    expect(signUp).toHaveBeenCalledWith(expect.objectContaining({ options: { emailRedirectTo: "/auth/confirm" } }));
  });
});

describe("LoginForm", () => {
  it("switches back from sign-up to sign-in", async () => {
    const user = userEvent.setup();
    render(<LoginForm />);
    await user.click(screen.getByRole("button", { name: "No account? Create one" }));
    await user.click(screen.getByRole("button", { name: "Have an account? Sign in" }));
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
  });
});
