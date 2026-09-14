import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createClient as createBrowser } from "../client";
import { createClient as createServer } from "../server";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn(() => ({})), createBrowserClient: vi.fn(() => ({})) }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

type CookieAdapter = {
  getAll: () => unknown;
  setAll: (cookies: Array<{ name: string; value: string; options: object }>) => void;
};

const saved = { ...process.env };
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
});
afterAll(() => {
  process.env = saved;
});
beforeEach(() => {
  vi.clearAllMocks();
});

describe("Supabase clients", () => {
  it("browser client uses only the public URL and anon key", () => {
    createBrowser();
    expect(createBrowserClient).toHaveBeenCalledWith("https://project.supabase.co", "anon");
  });

  it("server client reads and writes the request's cookies", async () => {
    const store = { getAll: vi.fn(() => [{ name: "sb", value: "1" }]), set: vi.fn() };
    vi.mocked(cookies).mockResolvedValue(store as never);
    await createServer();

    const [url, key, options] = vi.mocked(createServerClient).mock.calls[0] as unknown as [string, string, { cookies: CookieAdapter }];
    expect([url, key]).toEqual(["https://project.supabase.co", "anon"]);
    expect(options.cookies.getAll()).toEqual([{ name: "sb", value: "1" }]);
    options.cookies.setAll([{ name: "sb", value: "2", options: { path: "/" } }]);
    expect(store.set).toHaveBeenCalledWith("sb", "2", { path: "/" });
  });

  it("server client tolerates read-only cookies in Server Components", async () => {
    const store = {
      getAll: () => [],
      set: () => {
        throw new Error("Cookies can only be modified in a Server Action or Route Handler.");
      },
    };
    vi.mocked(cookies).mockResolvedValue(store as never);
    await createServer();
    const [, , options] = vi.mocked(createServerClient).mock.calls[0] as unknown as [string, string, { cookies: CookieAdapter }];
    expect(() => options.cookies.setAll([{ name: "sb", value: "2", options: {} }])).not.toThrow();
  });
});
