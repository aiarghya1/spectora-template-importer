import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { cleanupStaging } from "@/lib/import/cleanup-staging";
import { GET } from "../route";

vi.mock("@supabase/supabase-js", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/import/cleanup-staging", () => ({ cleanupStaging: vi.fn() }));

const request = (authorization?: string) => new Request("http://localhost/api/cron/cleanup-imports", {
  headers: authorization ? { authorization } : {},
});

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "test-secret";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
});

describe("GET /api/cron/cleanup-imports", () => {
  it("rejects missing or wrong auth, including an unset secret", async () => {
    expect((await GET(request())).status).toBe(401);
    expect((await GET(request("Bearer wrong"))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(request("Bearer undefined"))).status).toBe(401);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("requires server-only Supabase configuration", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    expect((await GET(request("Bearer test-secret"))).status).toBe(503);
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect((await GET(request("Bearer test-secret"))).status).toBe(503);
  });

  it("deletes expired files using the private bucket", async () => {
    const bucket = {};
    const from = vi.fn(() => bucket);
    vi.mocked(createClient).mockReturnValue({ storage: { from } } as never);
    vi.mocked(cleanupStaging).mockResolvedValue(4);
    const response = await GET(request("Bearer test-secret"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, removed: 4 });
    expect(createClient).toHaveBeenCalledWith("https://test.supabase.co", "service-key", { auth: { persistSession: false, autoRefreshToken: false } });
    expect(from).toHaveBeenCalledWith("template-import-staging");
    expect(cleanupStaging).toHaveBeenCalledWith(bucket);
  });

  it("returns an error if Storage cleanup fails", async () => {
    vi.mocked(createClient).mockReturnValue({ storage: { from: () => ({}) } } as never);
    vi.mocked(cleanupStaging).mockRejectedValue(new Error("offline"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await GET(request("Bearer test-secret"));
    expect(response.status).toBe(500);
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});
