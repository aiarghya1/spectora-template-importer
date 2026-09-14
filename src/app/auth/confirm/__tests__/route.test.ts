import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { fakeSupabase } from "@/test/fake-supabase";
import { GET } from "../route";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const verifyOtp = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue(fakeSupabase(() => ({}), { auth: { verifyOtp } as never }).client as never);
});

const get = (query: string) => GET(new NextRequest(`http://localhost/auth/confirm${query}`));

describe("GET /auth/confirm", () => {
  it("verifies the token and sends the user into the app", async () => {
    verifyOtp.mockResolvedValue({ error: null });
    const response = await get("?token_hash=abc&type=email");
    expect(verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: "abc" });
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/");
  });

  it("sends invalid or expired links back to login with an error", async () => {
    verifyOtp.mockResolvedValue({ error: { message: "expired" } });
    expect((await get("?token_hash=abc&type=email")).headers.get("location")).toBe("http://localhost/login?error=confirm");
  });

  it("doesn't call Supabase when parameters are missing", async () => {
    expect((await get("?type=email")).headers.get("location")).toBe("http://localhost/login?error=confirm");
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});
