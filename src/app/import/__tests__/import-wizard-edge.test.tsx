// @vitest-environment jsdom
import type { ReactNode } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareImport } from "@/lib/import/commit";
import { buildXlsx, SPECTORA_HEADERS } from "@/lib/import/__tests__/workbook";
import { ImportWizard } from "../import-wizard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();
const reply = (status: number, body?: unknown) =>
  Promise.resolve({ status, json: async () => (body === undefined ? Promise.reject(new SyntaxError("not json")) : body) } as Response);

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

const dropZone = () => screen.getByText("Drop your Spectora export here").closest("label") as HTMLLabelElement;
// Query the element directly: the label text changes to "Reading …" while a file is being read.
const input = () => document.querySelector('input[type="file"]') as HTMLInputElement;

describe("ImportWizard — drop zone", () => {
  it("highlights while dragging and ignores drops without files", () => {
    render(<ImportWizard />);
    fireEvent.dragOver(dropZone());
    expect(dropZone()).toHaveClass("border-zinc-900");
    fireEvent.dragLeave(dropZone());
    expect(dropZone()).toHaveClass("border-zinc-300");

    fireEvent.drop(dropZone(), { dataTransfer: { files: [] } });
    fireEvent.change(input(), { target: { files: [] } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows which file is being read and disables the picker meanwhile", async () => {
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const user = userEvent.setup();
    render(<ImportWizard />);
    await user.upload(input(), new File(["x"], "InterNACHI.xlsx"));
    expect(screen.getByText("InterNACHI.xlsx")).toBeInTheDocument();
    expect(input()).toBeDisabled();
  });
});

describe("ImportWizard — server responses", () => {
  it("maps a non-JSON 413 from the platform to the size limit message", async () => {
    fetchMock.mockReturnValueOnce(reply(413));
    const user = userEvent.setup();
    render(<ImportWizard />);
    await user.upload(input(), new File(["x"], "big.xlsx"));
    expect(await screen.findByText("The file is too large")).toBeInTheDocument();
    expect(screen.getByText("The file is too large for this upload. The limit is 20 MB.")).toBeInTheDocument();
  });

  it("lists the reasons when no row could be imported", async () => {
    fetchMock.mockReturnValueOnce(
      reply(422, {
        ok: false,
        code: "no_importable_rows",
        message: "None of the rows could be imported.",
        detail: { issues: [{ source_row: 3, message: "Row has content but no Section Name." }, { source_row: null, message: "File-level reason." }] },
      }),
    );
    const user = userEvent.setup();
    render(<ImportWizard />);
    await user.upload(input(), new File(["x"], "t.xlsx"));
    expect(await screen.findByText("Nothing could be imported")).toBeInTheDocument();
    expect(screen.getByText("Row 3: Row has content but no Section Name.")).toBeInTheDocument();
    expect(screen.getByText("File-level reason.")).toBeInTheDocument();
  });

  it("uses a generic title for unknown error codes", async () => {
    fetchMock.mockReturnValueOnce(reply(400, { ok: false, code: "something_new", message: "Details." }));
    const user = userEvent.setup();
    render(<ImportWizard />);
    await user.upload(input(), new File(["x"], "t.xlsx"));
    expect(await screen.findByText("The import didn't work")).toBeInTheDocument();
  });

  it("notes when a previous import's template was deleted", async () => {
    const prepared = prepareImport("t.xlsx", buildXlsx([SPECTORA_HEADERS, ["Roof", "Coverings", "A", "a"]]));
    if (!prepared.ok) throw new Error(prepared.message);
    fetchMock.mockReturnValueOnce(
      reply(200, { ...JSON.parse(JSON.stringify(prepared)), previousImports: [{ id: "i0", created_at: "2026-09-13T09:30:00Z", template: null }] }),
    );
    const user = userEvent.setup();
    render(<ImportWizard />);
    await user.upload(input(), new File(["x"], "t.xlsx"));
    expect(await screen.findByText(/that template has since been deleted/)).toBeInTheDocument();
    expect(screen.queryByText(/can't be imported/)).not.toBeInTheDocument();
  });
});
