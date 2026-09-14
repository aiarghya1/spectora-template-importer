// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSectionContent, getTemplate } from "@/lib/templates/queries";
import type { ItemView, TemplateDetail } from "@/lib/templates/types";
import TemplatePage, { generateMetadata } from "../page";

vi.mock("@/lib/templates/queries", () => ({ getTemplate: vi.fn(), getSectionContent: vi.fn() }));
vi.mock("@/app/templates/actions", async () => (await import("@/test/next-mocks")).actionSpies(() => vi.fn()));
vi.mock("@/app/login/actions", () => ({ signOut: vi.fn() }));
vi.mock("next/link", async () => (await import("@/test/next-mocks")).linkModule);
vi.mock("next/navigation", async () => {
  const mocks = await import("@/test/next-mocks");
  return { notFound: mocks.notFoundSignal, useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) };
});

const T = "3f2b8a4e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const TEMPLATE: TemplateDetail = {
  id: T,
  name: "InterNACHI Residential",
  version: 2,
  updatedAt: "2026-09-14T10:00:00Z",
  importId: "imp-1",
  copiedFrom: { id: "t0", name: "Original" },
  sections: [
    { id: "s1", name: "Roof", version: 1, itemCount: 1 },
    { id: "s2", name: "Garage", version: 1, itemCount: 0 },
  ],
};
const ROOF_ITEMS: ItemView[] = [
  {
    id: "i1",
    name: "Coverings",
    version: 1,
    sourceRow: 4,
    comments: [{ id: "c1", title: "Asphalt", bodyHtml: "<p>ok</p>", renderedHtml: "<p>ok</p>", commentType: "info", version: 1, sourceRow: 4, extras: {} }],
  },
];

const page = (query: Record<string, string> = {}, id = T) =>
  TemplatePage({ params: Promise.resolve({ id }), searchParams: Promise.resolve(query) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTemplate).mockResolvedValue(TEMPLATE);
  vi.mocked(getSectionContent).mockImplementation(async (_t, sectionId) => (sectionId === "s1" ? ROOF_ITEMS : []));
});

describe("template editor page", () => {
  it("opens the requested section and shows import and copy banners", async () => {
    render(await page({ section: "s2", imported: "1", copied: "1" }));

    expect(getSectionContent).toHaveBeenCalledWith(T, "s2");
    expect(screen.getByText("Template imported")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "import report" })).toHaveAttribute("href", `/templates/${T}/report`);
    expect(screen.getByText("This is an independent copy")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Garage" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("No items in this section yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Original" })).toHaveAttribute("href", "/templates/t0");
  });

  it("falls back to the first section for an unknown section id", async () => {
    render(await page({ section: "not-a-section" }));
    expect(getSectionContent).toHaveBeenCalledWith(T, "s1");
    expect(screen.getByRole("heading", { name: "Asphalt" })).toBeInTheDocument();
    expect(screen.queryByText("Template imported")).not.toBeInTheDocument();
  });

  it("handles a template with no sections", async () => {
    vi.mocked(getTemplate).mockResolvedValue({ ...TEMPLATE, sections: [] });
    render(await page());
    expect(screen.getByText("This template has no sections. Add one from the sidebar.")).toBeInTheDocument();
    expect(getSectionContent).not.toHaveBeenCalled();
    expect(within(screen.getByRole("navigation", { name: "Sections" })).getByRole("button", { name: "+ Add section" })).toBeInTheDocument();
  });

  it("404s for missing templates", async () => {
    vi.mocked(getTemplate).mockResolvedValue(null);
    await expect(page()).rejects.toThrow("NOT_FOUND");
  });

  it("treats an unreadable section as empty", async () => {
    vi.mocked(getSectionContent).mockResolvedValue(null);
    render(await page({ section: "s1" }));
    expect(screen.getByText("No items in this section yet.")).toBeInTheDocument();
  });

  it("titles the tab with the template name", async () => {
    expect(await generateMetadata({ params: Promise.resolve({ id: T }) })).toEqual({ title: "InterNACHI Residential · Template Importer" });
    vi.mocked(getTemplate).mockResolvedValue(null);
    expect(await generateMetadata({ params: Promise.resolve({ id: T }) })).toEqual({ title: "Template not found" });
  });
});
