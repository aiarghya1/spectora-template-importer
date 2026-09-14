// @vitest-environment jsdom
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ColumnSummary, ParsedSection, ParseStats } from "@/lib/import/types";
import type { IssueWithLocation } from "@/lib/templates/types";
import { ColumnTable } from "../column-table";
import { IssueList } from "../issue-list";
import { Reconciliation } from "../reconciliation";
import { TreePreview } from "../tree-preview";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ColumnTable", () => {
  it("labels mapped, known, unknown and unlabelled columns, and hides empty unlabelled ones", () => {
    const columns: ColumnSummary[] = [
      { letter: "A", header: "Section Name", role: "section", extrasKey: "Section Name", known: true, note: null, values: 10 },
      { letter: "B", header: "Category", role: "extras", extrasKey: "Category", known: true, note: "Defect category.", values: 4 },
      { letter: "C", header: "Inspector Notes", role: "extras", extrasKey: "Inspector Notes", known: false, note: null, values: 2 },
      { letter: "D", header: "", role: "extras", extrasKey: "Column D", known: false, note: null, values: 1 },
      { letter: "E", header: "", role: "extras", extrasKey: "Column E", known: false, note: null, values: 0 },
    ];
    render(<ColumnTable columns={columns} />);
    expect(screen.getAllByRole("row")).toHaveLength(5); // header + 4
    expect(screen.getByText("Section name")).toHaveClass("font-medium");
    expect(screen.getByText("Kept as read-only data")).toHaveClass("text-zinc-600");
    expect(screen.getAllByText("Unrecognised · kept as data")).toHaveLength(2);
    expect(screen.getByText("(no header)")).toBeInTheDocument();
    expect(screen.queryByText("E")).not.toBeInTheDocument();
  });
});

describe("IssueList details", () => {
  const issues: IssueWithLocation[] = [
    { id: 1, source_row: 1, severity: "info", category: "structure", code: "row_above_header", message: "Above header", detail: { values: ["Template title", "v2"] } },
    { id: 2, source_row: 2, severity: "info", category: "structure", code: "empty", message: "No values", detail: { values: {} } },
    { id: 3, source_row: null, severity: "warning", category: "structure", code: "many", message: "Many rows", detail: { count: 45, rows: Array.from({ length: 40 }, (_, i) => i + 2) } },
    { id: 4, source_row: null, severity: "warning", category: "structure", code: "uncounted", message: "Uncounted", detail: { rows: [7, 8] } },
  ];

  it("labels array values as cells, skips empty value lists, and summarises long row lists", async () => {
    const user = userEvent.setup();
    render(<IssueList issues={issues} />);
    expect(screen.getByText("Cell 1")).toBeInTheDocument();
    expect(screen.getByText("Template title")).toBeInTheDocument();
    expect(screen.getAllByText("Show the row's original values")).toHaveLength(1);
    expect(screen.getByText(/Rows: 2, 3, .*, 31 … and 15 more/)).toBeInTheDocument();
    expect(screen.getByText("Rows: 7, 8")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Note (2)" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "All (4)" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(4);
  });
});

describe("Reconciliation with inconsistent totals", () => {
  it("doesn't divide by zero", () => {
    const stats: ParseStats = {
      sourceRows: 1, headerRow: 1, dataRows: 0, blankRows: 0, skippedRows: 0, itemOnlyRows: 0, sectionOnlyRows: 0,
      sections: 0, items: 0, comments: 0, nonEmptyCells: 0, cellsStored: 5, cellsInExtras: 0, cellsReported: 0,
    };
    render(<Reconciliation stats={stats} />);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Imported into editable fields: 5 (0.0%)");
    expect(screen.getByRole("status")).toHaveTextContent("Accounting mismatch");
  });
});

describe("TreePreview", () => {
  it("only intercepts clicks on links, and labels comments with no text", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const sections: ParsedSection[] = [
      {
        name: "Roof",
        source_row: 2,
        extras: {},
        items: [
          {
            name: "Coverings",
            source_row: 2,
            extras: {},
            comments: [
              { title: "Has text", body_html: "<p>Plain words</p>", comment_type: null, source_row: 2, extras: {} },
              { title: "Empty", body_html: "", comment_type: null, source_row: 3, extras: {} },
            ],
          },
        ],
      },
    ];
    const user = userEvent.setup();
    render(<TreePreview sections={sections} />);

    await user.click(screen.getByRole("button", { name: /Has text/ }));
    await user.click(screen.getByText("Plain words"));
    expect(open).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Empty/ }));
    expect(screen.getByText("No comment text")).toBeInTheDocument();
  });
});
