import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildXlsx, SPECTORA_HEADERS } from "@/lib/import/__tests__/workbook";
import { createClient } from "@/lib/supabase/server";
import { fakeSupabase, type Resolver } from "@/test/fake-supabase";
import { POST } from "../route";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const URL = "http://localhost/api/import";
const XLSX_BYTES = buildXlsx([SPECTORA_HEADERS, ["Roof", "Coverings", "Asphalt", "<p>Asphalt</p>", "info"]]);

function withDb(resolve: Resolver = () => ({}), claims?: Record<string, unknown> | null) {
  const db = fakeSupabase(resolve, { claims });
  vi.mocked(createClient).mockResolvedValue(db.client as never);
  return db;
}

function upload(fields: Record<string, string | File>, headers?: Record<string, string>) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return new NextRequest(URL, { method: "POST", body: form, headers });
}

const xlsxFile = (name = "InterNACHI Residential.xlsx") => new File([XLSX_BYTES as BlobPart], name);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/import — request handling", () => {
  it("401 when not signed in", async () => {
    withDb(undefined, null);
    const response = await POST(upload({ mode: "preview", file: xlsxFile() }));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ ok: false, code: "unauthenticated" });
  });

  it("413 when the declared body is over the limit, before reading it", async () => {
    withDb();
    const response = await POST(new NextRequest(URL, { method: "POST", body: "x", headers: { "content-length": String(10 * 1024 * 1024) } }));
    expect(response.status).toBe(413);
  });

  it("400 for a non-multipart body, a missing file, or a bad mode", async () => {
    withDb();
    const notMultipart = await POST(new NextRequest(URL, { method: "POST", body: "hello", headers: { "content-type": "text/plain" } }));
    expect(notMultipart.status).toBe(400);

    const noFile = await POST(upload({ mode: "preview" }));
    expect(noFile.status).toBe(400);
    expect(await noFile.json()).toMatchObject({ code: "no_file" });

    const badMode = await POST(upload({ mode: "delete-everything", file: xlsxFile() }));
    expect(badMode.status).toBe(400);
  });

  it("422 with a specific code for the plain-text export", async () => {
    withDb();
    const response = await POST(upload({ mode: "preview", file: new File(["Roof\nShingles"], "template.txt") }));
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ ok: false, stage: "file", code: "plain_text_export" });
  });

  it("422 with found headers when the spreadsheet isn't a Spectora export", async () => {
    withDb();
    const other = new File([buildXlsx([["Name", "Price"], ["Widget", 3]]) as BlobPart], "prices.xlsx");
    const body = await (await POST(upload({ mode: "preview", file: other }))).json();
    expect(body).toMatchObject({ stage: "parse", code: "missing_required_columns", detail: { foundHeaders: ["Name", "Price"] } });
  });
});

describe("POST /api/import — preview", () => {
  it("parses without writing and lists previous imports of the same file", async () => {
    const db = withDb((op) =>
      op.name === "imports" ? { data: [{ id: "i1", created_at: "2026-09-13T09:00:00Z", template: { id: "t1", name: "Earlier" } }] } : {},
    );
    const response = await POST(upload({ mode: "preview", file: xlsxFile() }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, filename: "InterNACHI Residential.xlsx", parse: { templateName: "InterNACHI Residential", stats: { comments: 1 } } });
    expect(body.previousImports).toHaveLength(1);
    expect(db.ops.every((op) => op.action === "select")).toBe(true);
    expect(db.ops[0].filters).toEqual([["eq", "file_sha256", body.sha256]]);
  });
});

describe("POST /api/import — commit", () => {
  async function previewSha() {
    withDb();
    return (await (await POST(upload({ mode: "preview", file: xlsxFile() }))).json()).sha256 as string;
  }

  it("409 when the file differs from the previewed one", async () => {
    withDb();
    const response = await POST(upload({ mode: "commit", file: xlsxFile(), sha256: "0".repeat(64) }));
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ code: "file_changed" });
  });

  it("commits via import_template with the trimmed name and returns ids", async () => {
    const sha256 = await previewSha();
    const db = withDb((op) => (op.name === "import_template" ? { data: { template_id: "t-new", import_id: "i-new" } } : {}));
    const response = await POST(upload({ mode: "commit", file: xlsxFile(), sha256, name: "  My template  " }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, templateId: "t-new", importId: "i-new" });
    expect(db.ops[0]).toMatchObject({ kind: "rpc", name: "import_template", single: "single" });
    const payload = db.ops[0].payload as Record<string, unknown>;
    expect(payload).toMatchObject({ p_name: "My template", p_filename: "InterNACHI Residential.xlsx", p_file_sha256: sha256, p_source_rows: 2 });
    expect(payload.p_sections).toHaveLength(1);
  });

  it("defaults the name to the file name", async () => {
    const db = withDb(() => ({ data: { template_id: "t", import_id: "i" } }));
    await POST(upload({ mode: "commit", file: xlsxFile("Pre-listing 2026.xlsx") }));
    expect(db.ops[0].payload).toMatchObject({ p_name: "Pre-listing 2026" });
  });

  it.each([
    ["import rate limit reached (30 per hour)", 429, "rate_limited"],
    ["template limit reached (200 per account)", 429, "quota"],
  ])("maps '%s' to %i %s", async (message, status, code) => {
    withDb(() => ({ error: { code: "54000", message } }));
    const response = await POST(upload({ mode: "commit", file: xlsxFile() }));
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ ok: false, code });
  });

  it("500 with a safe message when the database fails (nothing is written)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    withDb(() => ({ error: { code: "XX000", message: "internal detail that must not leak" } }));
    const response = await POST(upload({ mode: "commit", file: xlsxFile() }));
    const body = await response.json();
    expect(response.status).toBe(500);
    expect(body).toMatchObject({ ok: false, code: "failed" });
    expect(JSON.stringify(body)).not.toContain("internal detail");
    log.mockRestore();
  });
});
