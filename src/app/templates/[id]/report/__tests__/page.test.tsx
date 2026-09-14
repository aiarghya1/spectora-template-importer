// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getImportReport, getTemplate } from "@/lib/templates/queries";
import type { ImportReport, TemplateDetail } from "@/lib/templates/types";
import ImportReportPage from "../page";

vi.mock("@/lib/templates/queries", () => ({ getTemplate: vi.fn(), getImportReport: vi.fn() }));
vi.mock("@/app/login/actions", () => ({ signOut: vi.fn() }));
vi.mock("next/link", async () => (await import("@/test/next-mocks")).linkModule);
vi.mock("next/navigation", async () => ({ notFound: (await import("@/test/next-mocks")).notFoundSignal }));

const TEMPLATE: TemplateDetail = {
  id: "t1",
  name: "InterNACHI (copy)",
  version: 1,
  updatedAt: "2026-09-14T10:00:00Z",
  importId: "imp",
  copiedFrom: { id: "t0", name: "InterNACHI" },
  sections: [],
};
const REPORT: ImportReport = {
  id: "imp",
  filename: "internachi-residential.xlsx",
  sha256: "ab".repeat(32),
  createdAt: "2026-09-14T09:00:00Z",
  sourceRows: 812,
  summary: {
    sheetName: "Template",
    stats: {
      sourceRows: 812, headerRow: 1, dataRows: 810, blankRows: 1, skippedRows: 0, itemOnlyRows: 3, sectionOnlyRows: 0,
      sections: 21, items: 180, comments: 807, nonEmptyCells: 4000, cellsStored: 3600, cellsInExtras: 400, cellsReported: 0,
    },
    columns: [{ letter: "A", header: "Section Name", role: "section", extrasKey: "Section Name", known: true, note: null, values: 810 }],
  },
  issues: [
    { id: 1, source_row: 40, severity: "warning", category: "sanitized", code: "html_sanitized", message: "Comment HTML changed: removed image (https://x/y.jpg).", detail: {}, location: { sectionId: "s1", itemId: "i1" } },
  ],
  originalTemplate: { id: "t0", name: "InterNACHI" },
};

const page = () => ImportReportPage({ params: Promise.resolve({ id: "t1" }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getTemplate).mockResolvedValue(TEMPLATE);
  vi.mocked(getImportReport).mockResolvedValue(REPORT);
});

describe("import report page", () => {
  it("shows file details, reconciliation, issues with editor links, and columns", async () => {
    render(await page());
    expect(screen.getByRole("heading", { name: "Import report" })).toBeInTheDocument();
    expect(screen.getByText("internachi-residential.xlsx")).toBeInTheDocument();
    expect(screen.getByText("ab".repeat(32))).toBeInTheDocument();
    expect(screen.getByText("812")).toBeInTheDocument();
    expect(screen.getByText("All 4,000 filled cells are accounted for — nothing was dropped silently.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open in editor" })).toHaveAttribute("href", "/templates/t1?section=s1#item-i1");
    expect(screen.getByRole("columnheader", { name: "Imported as" })).toBeInTheDocument();
    expect(screen.getByText("Rows & grouping:")).toBeInTheDocument();
  });

  it("explains that a copy's report comes from the original import", async () => {
    render(await page());
    expect(screen.getByText("This template is a copy")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "InterNACHI" })).toHaveAttribute("href", "/templates/t0");
  });

  it("still explains when the original template has been deleted", async () => {
    vi.mocked(getImportReport).mockResolvedValue({ ...REPORT, originalTemplate: null });
    render(await page());
    expect(screen.getByText(/that template has since been deleted/)).toBeInTheDocument();
  });

  it("omits the copy banner for the original, and handles reports without stats", async () => {
    vi.mocked(getTemplate).mockResolvedValue({ ...TEMPLATE, copiedFrom: null });
    vi.mocked(getImportReport).mockResolvedValue({ ...REPORT, originalTemplate: null, summary: {} });
    render(await page());
    expect(screen.queryByText("This template is a copy")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Did everything come across?" })).not.toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("says when there is no report, and 404s for missing templates", async () => {
    vi.mocked(getImportReport).mockResolvedValue(null);
    render(await page());
    expect(screen.getByText("No import report for this template")).toBeInTheDocument();

    vi.mocked(getTemplate).mockResolvedValue(null);
    await expect(page()).rejects.toThrow("NOT_FOUND");
  });
});
