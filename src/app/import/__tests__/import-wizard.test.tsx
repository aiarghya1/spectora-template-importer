// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareImport } from "@/lib/import/commit";
import { MAX_UPLOAD_BYTES } from "@/lib/import/file-check";
import { buildXlsx, SPECTORA_HEADERS } from "@/lib/import/__tests__/workbook";
import { ImportWizard } from "../import-wizard";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

type Reply = { status: number; body?: unknown; invalidJson?: boolean };
const reply = ({ status, body, invalidJson }: Reply) =>
  Promise.resolve({ status, json: async () => (invalidJson ? Promise.reject(new SyntaxError("bad")) : body) } as Response);

const fetchMock = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>();

function preview(filename = "InterNACHI Residential.xlsx", previousImports: unknown[] = []) {
  const prepared = prepareImport(
    filename,
    buildXlsx([
      SPECTORA_HEADERS,
      ["", "Orphan", "No section above", "skipped"], // nothing to fill down from → skipped
      ["Roof", "Coverings", "Asphalt", "<p>Asphalt <b>shingles</b></p>", "info"],
      ["Exterior", "Siding", "Vinyl", "Vinyl siding", "limit"],
    ]),
  );
  if (!prepared.ok) throw new Error(prepared.message);
  return { ...JSON.parse(JSON.stringify(prepared)), previousImports };
}

const sentFields = (call: number) => {
  const body = fetchMock.mock.calls[call][1]?.body as FormData;
  return { mode: body.get("mode"), name: body.get("name"), sha256: body.get("sha256"), file: body.get("file") };
};

function setup() {
  const user = userEvent.setup({ applyAccept: false });
  render(<ImportWizard />);
  const input = () => screen.getByLabelText(/Drop your Spectora export here/) as HTMLInputElement;
  return { user, input };
}

const xlsx = (name = "InterNACHI Residential.xlsx") => new File(["x"], name);

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

describe("ImportWizard — failures", () => {
  it("explains a wrong file and confirms nothing was imported", async () => {
    fetchMock.mockReturnValueOnce(
      reply({ status: 422, body: { ok: false, stage: "file", code: "plain_text_export", message: "This looks like Spectora's plain-text export." } }),
    );
    const { user, input } = setup();
    await user.upload(input(), new File(["Roof"], "template.txt"));

    expect(await screen.findByText("That's the plain-text export")).toBeInTheDocument();
    expect(screen.getByText("This looks like Spectora's plain-text export.")).toBeInTheDocument();
    expect(screen.getByText("Nothing was imported.")).toBeInTheDocument();
    expect(sentFields(0).mode).toBe("preview");
  });

  it("shows the headers it found when the file isn't a Spectora export", async () => {
    fetchMock.mockReturnValueOnce(
      reply({
        status: 422,
        body: { ok: false, code: "missing_required_columns", message: "Couldn't find the Section Name and Item Name columns.", detail: { foundHeaders: ["Name", "Price"] } },
      }),
    );
    const { user, input } = setup();
    await user.upload(input(), xlsx("prices.xlsx"));
    expect(await screen.findByText("This doesn't look like a Spectora template export")).toBeInTheDocument();
    expect(screen.getByText("Name · Price")).toBeInTheDocument();
  });

  it("rejects files over 4 MB without uploading", async () => {
    const { user, input } = setup();
    await user.upload(input(), new File([new Uint8Array(MAX_UPLOAD_BYTES + 1)], "huge.xlsx"));
    expect(screen.getByText("The file is too large")).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("handles network failures and non-JSON server errors", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockReturnValueOnce(reply({ status: 502, invalidJson: true }));
    const { user, input } = setup();

    await user.upload(input(), xlsx());
    expect(await screen.findByText("Connection problem")).toBeInTheDocument();

    await user.upload(input(), xlsx());
    expect(await screen.findByText(/The server returned an unexpected response/)).toBeInTheDocument();
  });
});

describe("ImportWizard — preview and commit", () => {
  it("previews without saving, then commits the same file with its fingerprint", async () => {
    const data = preview();
    fetchMock.mockReturnValueOnce(reply({ status: 200, body: data })).mockReturnValueOnce(
      reply({ status: 200, body: { ok: true, templateId: "t-new", importId: "i-new" } }),
    );
    const { user, input } = setup();
    const file = xlsx();
    await user.upload(input(), file);

    expect(await screen.findByText("Preview — nothing saved yet")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Did everything come across?" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What to review" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What will be created" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "How columns were read" })).toBeInTheDocument();
    expect(screen.getByText("1 row(s) can't be imported")).toBeInTheDocument();

    const name = screen.getByRole("textbox", { name: "Template name" });
    expect(name).toHaveValue("InterNACHI Residential");
    await user.clear(name);
    await user.type(name, "  My template ");
    await user.click(screen.getByRole("button", { name: "Import template" }));

    expect(sentFields(1)).toEqual({ mode: "commit", name: "My template", sha256: data.sha256, file });
    expect(push).toHaveBeenCalledWith("/templates/t-new?imported=1");
  });

  it("warns when this exact file was imported before", async () => {
    fetchMock.mockReturnValueOnce(
      reply({ status: 200, body: preview("t.xlsx", [{ id: "i0", created_at: "2026-09-13T09:30:00Z", template: { id: "t0", name: "Earlier import" } }]) }),
    );
    const { user, input } = setup();
    await user.upload(input(), xlsx());
    expect(await screen.findByText("You've imported this exact file before")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Earlier import" })).toHaveAttribute("href", "/templates/t0");
  });

  it("requires a name", async () => {
    fetchMock.mockReturnValueOnce(reply({ status: 200, body: preview() }));
    const { user, input } = setup();
    await user.upload(input(), xlsx());
    await user.clear(await screen.findByRole("textbox", { name: "Template name" }));
    await user.click(screen.getByRole("button", { name: "Import template" }));
    expect(screen.getByText("Give the template a name before importing.")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stays on the preview with the reason when the commit is refused", async () => {
    fetchMock.mockReturnValueOnce(reply({ status: 200, body: preview() })).mockReturnValueOnce(
      reply({ status: 409, body: { ok: false, code: "file_changed", message: "Preview it again before importing." } }),
    );
    const { user, input } = setup();
    await user.upload(input(), xlsx());
    await user.click(await screen.findByRole("button", { name: "Import template" }));

    expect(await screen.findByText("The file changed since the preview")).toBeInTheDocument();
    expect(screen.getByText("Preview — nothing saved yet")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("can start over with a different file", async () => {
    fetchMock.mockReturnValueOnce(reply({ status: 200, body: preview() }));
    const { user, input } = setup();
    await user.upload(input(), xlsx());
    await user.click(await screen.findByRole("button", { name: "Choose a different file" }));
    expect(screen.getByText("Drop your Spectora export here")).toBeInTheDocument();
  });

  it("ignores a slow response for a file that has since been replaced", async () => {
    let finishFirst: (value: Response) => void = () => {};
    fetchMock
      .mockImplementationOnce(() => new Promise<Response>((resolve) => (finishFirst = resolve)))
      .mockReturnValueOnce(reply({ status: 200, body: preview("Second.xlsx") }));
    setup();
    const dropZone = screen.getByText("Drop your Spectora export here").closest("label")!;

    fireEvent.drop(dropZone, { dataTransfer: { files: [xlsx("First.xlsx")] } });
    fireEvent.drop(dropZone, { dataTransfer: { files: [xlsx("Second.xlsx")] } });
    expect(await screen.findByRole("textbox", { name: "Template name" })).toHaveValue("Second");

    await act(async () => finishFirst((await reply({ status: 200, body: preview("First.xlsx") })) as Response));
    expect(screen.getByRole("textbox", { name: "Template name" })).toHaveValue("Second");
  });
});
