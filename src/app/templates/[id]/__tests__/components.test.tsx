// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItemView, SectionSummary, TemplateDetail } from "@/lib/templates/types";
import TemplateError from "../error";
import TemplateNotFound from "../not-found";
import { SectionPanel } from "../section-panel";
import { SectionSidebar } from "../section-sidebar";
import { TemplateHeader } from "../template-header";

const { actions } = vi.hoisted(() => ({
  actions: {
    renameTemplate: vi.fn(),
    renameNode: vi.fn(),
    updateComment: vi.fn(),
    addSection: vi.fn(),
    addItem: vi.fn(),
    addComment: vi.fn(),
    deleteNode: vi.fn(),
    moveNode: vi.fn(),
    duplicateTemplate: vi.fn(),
    deleteTemplate: vi.fn(),
  },
}));
vi.mock("@/app/templates/actions", () => actions);
vi.mock("next/link", async () => (await import("@/test/next-mocks")).linkModule);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

const NAMES = ["Roof", "Exterior", "Garage", "Attic", "Interior", "Plumbing", "Electrical", "Heating", "Cooling", "Grounds"];
const SECTIONS: SectionSummary[] = NAMES.map((name, i) => ({ id: `s${i}`, name, version: 1, itemCount: i }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("SectionSidebar", () => {
  it("marks the open section, disables impossible moves, and filters long lists", async () => {
    const user = userEvent.setup();
    render(<SectionSidebar templateId="t1" sections={SECTIONS} activeId="s2" />);

    expect(screen.getByRole("link", { name: "Garage" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Garage" })).toHaveAttribute("href", "/templates/t1?section=s2");
    expect(screen.getByRole("button", { name: "Move Roof up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Grounds down" })).toBeDisabled();

    await user.type(screen.getByRole("searchbox", { name: "Filter sections" }), "ING");
    expect(screen.getAllByRole("link").map((l) => l.textContent)).toEqual(["Plumbing", "Heating", "Cooling"]);
    expect(screen.queryByRole("button", { name: /^Move/ })).not.toBeInTheDocument(); // positions are ambiguous while filtered

    await user.clear(screen.getByRole("searchbox"));
    await user.type(screen.getByRole("searchbox"), "zzz");
    expect(screen.getByText("No sections match.")).toBeInTheDocument();
  });

  it("hides the filter for short lists", () => {
    render(<SectionSidebar templateId="t1" sections={SECTIONS.slice(0, 3)} activeId={null} />);
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add section" })).toBeInTheDocument();
  });
});

describe("TemplateHeader", () => {
  const TEMPLATE: TemplateDetail = {
    id: "t1",
    name: "InterNACHI",
    version: 2,
    updatedAt: "2026-09-14T10:00:00Z",
    importId: "imp",
    copiedFrom: { id: "t0", name: "Original" },
    sections: SECTIONS.slice(0, 2),
  };

  it("renames with the latest version and links to the report and original", async () => {
    actions.renameTemplate.mockResolvedValueOnce({ ok: true, version: 3 }).mockResolvedValueOnce({ ok: true, version: 4 });
    const user = userEvent.setup();
    render(<TemplateHeader template={TEMPLATE} />);

    expect(screen.getByRole("link", { name: "Import report" })).toHaveAttribute("href", "/templates/t1/report");
    expect(screen.getByRole("link", { name: "Original" })).toHaveAttribute("href", "/templates/t0");
    expect(screen.getByText(/2 sections · Updated/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Template name: InterNACHI. Click to rename" }));
    await user.type(screen.getByRole("textbox", { name: "Template name" }), " 2026{Enter}");
    await user.click(await screen.findByRole("button", { name: "Template name: InterNACHI 2026. Click to rename" }));
    await user.type(screen.getByRole("textbox", { name: "Template name" }), "!{Enter}");

    expect(actions.renameTemplate.mock.calls.map(([input]) => input)).toEqual([
      { id: "t1", version: 2, name: "InterNACHI 2026" },
      { id: "t1", version: 3, name: "InterNACHI 2026!" },
    ]);
  });

  it("omits the report link for templates without an import", () => {
    render(<TemplateHeader template={{ ...TEMPLATE, importId: null, copiedFrom: null }} />);
    expect(screen.queryByRole("link", { name: "Import report" })).not.toBeInTheDocument();
    expect(screen.queryByText(/Copy of/)).not.toBeInTheDocument();
  });
});

describe("SectionPanel", () => {
  const ITEMS: ItemView[] = [
    {
      id: "i1",
      name: "Coverings",
      version: 1,
      sourceRow: 4,
      comments: [
        { id: "c1", title: "Asphalt", bodyHtml: "a", renderedHtml: "a", commentType: null, version: 1, sourceRow: 4, extras: {} },
        { id: "c2", title: "Worn", bodyHtml: "b", renderedHtml: "b", commentType: null, version: 1, sourceRow: 5, extras: {} },
      ],
    },
    { id: "i2", name: "Flashing", version: 1, sourceRow: null, comments: [] },
  ];

  it("shows counts, order controls and consequences of deleting", async () => {
    const user = userEvent.setup();
    render(<SectionPanel section={SECTIONS[0]} items={ITEMS} />);

    expect(screen.getByText("2 items · 2 comments")).toBeInTheDocument();
    expect(screen.getByText("2 comments · first seen on row 4")).toBeInTheDocument();
    expect(screen.getByText("No comments in this item.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Move Coverings up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Flashing down" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Asphalt up" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Move Worn down" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Delete Roof" }));
    expect(within(screen.getByRole("dialog")).getByText(/with its 2 item\(s\) and 2 comment\(s\) will be removed/)).toBeInTheDocument();
  });

  it("invites adding the first item", () => {
    render(<SectionPanel section={SECTIONS[0]} items={[]} />);
    expect(screen.getByText("No items in this section yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "+ Add item" })).toBeInTheDocument();
  });
});

describe("error and not-found pages", () => {
  it("offers a retry and shows the error reference without leaking details", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const retry = vi.fn();
    const user = userEvent.setup();
    render(<TemplateError error={Object.assign(new Error("relation does not exist"), { digest: "abc123" })} retry={retry} />);

    expect(screen.getByText("Reference: abc123")).toBeInTheDocument();
    expect(screen.queryByText(/relation does not exist/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalled();
    log.mockRestore();
  });

  it("explains a missing template", () => {
    render(<TemplateNotFound />);
    expect(screen.getByRole("heading", { name: "Template not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to templates" })).toHaveAttribute("href", "/templates");
  });
});
