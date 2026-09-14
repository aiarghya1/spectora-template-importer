// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { removeStagedFile, stageImportFile } from "../staged-upload";

const state = vi.hoisted(() => ({
  options: null as Record<string, unknown> | null,
  fail: false,
  session: { user: { id: "11111111-1111-4111-8111-111111111111" }, access_token: "test-access-token" } as unknown,
  authError: null as Error | null,
  removeError: null as Error | null,
  removed: [] as string[],
}));

vi.mock("tus-js-client", () => ({
  Upload: class {
    constructor(_file: File, options: Record<string, unknown>) { state.options = options; }
    start() {
      if (state.fail) (state.options?.onError as (error: Error) => void)(new Error("upload failed"));
      else {
        (state.options?.onProgress as (sent: number, total: number) => void)(3, 6);
        (state.options?.onSuccess as () => void)();
      }
    }
  },
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: async () => ({ data: { session: state.session }, error: state.authError }) },
    storage: { from: () => ({ remove: async (paths: string[]) => { state.removed = paths; return { error: state.removeError }; } }) },
  }),
}));
vi.mock("@/lib/supabase/env", () => ({ supabaseEnv: () => ({ url: "https://example.supabase.co" }) }));

beforeEach(() => {
  state.options = null;
  state.fail = false;
  state.session = { user: { id: "11111111-1111-4111-8111-111111111111" }, access_token: "test-access-token" };
  state.authError = null;
  state.removeError = null;
  state.removed = [];
  vi.stubGlobal("crypto", { randomUUID: () => "22222222-2222-4222-8222-222222222222" });
});

describe("resumable private upload", () => {
  it("sends authenticated chunks directly to Storage and reports progress", async () => {
    const progress = vi.fn();
    const path = await stageImportFile(new File(["bytes"], "InterNACHI.xlsx"), progress);
    expect(path).toBe("11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.xlsx");
    expect(state.options).toMatchObject({
      endpoint: "https://example.storage.supabase.co/storage/v1/upload/resumable",
      chunkSize: 6 * 1024 * 1024,
      headers: { authorization: "Bearer test-access-token" },
      metadata: { bucketName: "template-import-staging", objectName: path },
    });
    expect(progress).toHaveBeenCalledWith(50);
  });

  it("propagates transfer errors so the user can retry", async () => {
    state.fail = true;
    await expect(stageImportFile(new File(["x"], "template.csv"))).rejects.toThrow("upload failed");
  });

  it("requires a session and removes completed staging files", async () => {
    state.session = null;
    await expect(stageImportFile(new File(["x"], "template.xlsx"))).rejects.toThrow("session expired");
    state.authError = new Error("auth failed");
    await expect(stageImportFile(new File(["x"], "template.xlsx"))).rejects.toThrow("session expired");
    await removeStagedFile("own/file.xlsx");
    expect(state.removed).toEqual(["own/file.xlsx"]);
    state.removeError = new Error("remove failed");
    await expect(removeStagedFile("own/file.xlsx")).rejects.toThrow("remove failed");
  });
});
