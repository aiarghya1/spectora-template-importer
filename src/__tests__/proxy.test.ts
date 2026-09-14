import { NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { supabaseEnv } from "@/lib/supabase/env";
import { proxy } from "../proxy";

vi.mock("@supabase/ssr", () => ({ createServerClient: vi.fn() }));

type CookieOptions = {
  cookies: { getAll: () => unknown; setAll: (cookies: Array<{ name: string; value: string; options: object }>) => void };
};

const saved = { ...process.env };
beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon";
});
afterAll(() => {
  process.env = saved;
});

function signedIn(value: boolean, refreshCookie = false) {
  vi.mocked(createServerClient).mockImplementation(((_url: string, _key: string, options: CookieOptions) => ({
    auth: {
      getClaims: async () => {
        if (refreshCookie) options.cookies.setAll([{ name: "sb-session", value: "refreshed", options: { path: "/" } }]);
        return { data: value ? { claims: { sub: "user-1" } } : null, error: null };
      },
    },
  })) as never);
}

const request = (path: string) => new NextRequest(`http://localhost${path}`);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("proxy", () => {
  it("redirects signed-out page requests to login, remembering where they were going", async () => {
    signedIn(false);
    const response = await proxy(request("/templates/123"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login?next=%2Ftemplates%2F123");
  });

  it("answers signed-out API calls with JSON 401 instead of an HTML redirect", async () => {
    signedIn(false);
    const response = await proxy(request("/api/import"));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "unauthenticated" });
  });

  it("lets only the exact cron path reach its bearer-token handler without a user cookie", async () => {
    signedIn(false);
    expect((await proxy(request("/api/cron/cleanup-imports"))).headers.get("x-middleware-next")).toBe("1");
    expect(createServerClient).not.toHaveBeenCalled();
    expect((await proxy(request("/api/cron/cleanup-imports/extra"))).status).toBe(401);
  });

  it("lets public pages and signed-in users through", async () => {
    signedIn(false);
    expect((await proxy(request("/login"))).headers.get("x-middleware-next")).toBe("1");
    expect((await proxy(request("/auth/confirm?x=1"))).headers.get("x-middleware-next")).toBe("1");
    signedIn(true);
    expect((await proxy(request("/templates"))).headers.get("x-middleware-next")).toBe("1");
  });

  it("gives Supabase the request's cookies", async () => {
    let seen: unknown;
    vi.mocked(createServerClient).mockImplementation(((_url: string, _key: string, options: CookieOptions) => ({
      auth: {
        getClaims: async () => {
          seen = options.cookies.getAll();
          return { data: null, error: null };
        },
      },
    })) as never);
    await proxy(new NextRequest("http://localhost/login", { headers: { cookie: "sb-session=abc" } }));
    expect(seen).toEqual([{ name: "sb-session", value: "abc" }]);
  });

  it("forwards refreshed session cookies on the response", async () => {
    signedIn(true, true);
    const response = await proxy(request("/templates"));
    expect(response.cookies.get("sb-session")?.value).toBe("refreshed");
  });
});

describe("supabaseEnv", () => {
  it("fails loudly with setup instructions when configuration is missing", () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect(() => supabaseEnv()).toThrow(/Copy \.env\.example to \.env\.local/);
    process.env.NEXT_PUBLIC_SUPABASE_URL = url;
    expect(supabaseEnv()).toEqual({ url: "https://project.supabase.co", anonKey: "anon" });
  });
});
