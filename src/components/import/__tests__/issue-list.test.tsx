// @vitest-environment jsdom
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { IssueWithLocation } from "@/lib/templates/types";
import { IssueList } from "../issue-list";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const ISSUES: IssueWithLocation[] = [
  { id: 1, source_row: null, severity: "info", category: "missing_in_export", code: "template_name_from_filename", message: "The export doesn't include a template name.", detail: {} },
  { id: 2, source_row: 3, severity: "error", category: "structure", code: "missing_section", message: "Row has content but no Section Name.", detail: { values: { "Item Name": "Orphan", "Comment Text": "kept" } } },
  { id: 3, source_row: null, severity: "warning", category: "structure", code: "section_not_contiguous", message: "2 row(s) belong to an earlier section.", detail: { count: 2, rows: [7, 9] } },
  { id: 4, source_row: 5, severity: "warning", category: "sanitized", code: "html_sanitized", message: "Comment HTML changed: removed image.", detail: { changes: [] }, location: { sectionId: "s1", itemId: "i1" } },
];

describe("IssueList", () => {
  it("counts by severity and filters", async () => {
    const user = userEvent.setup();
    render(<IssueList issues={ISSUES} templateId="t1" />);

    for (const chip of ["All (4)", "Skipped (1)", "Review (2)", "Note (1)"]) {
      expect(screen.getByRole("button", { name: chip })).toBeInTheDocument();
    }
    await user.click(screen.getByRole("button", { name: "Skipped (1)" }));
    expect(screen.getByRole("button", { name: "Skipped (1)" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("Row 3")).toBeInTheDocument();
    expect(screen.getByText("Row has content but no Section Name.")).toBeInTheDocument();
  });

  it("shows a skipped row's original values and grouped row numbers", () => {
    render(<IssueList issues={ISSUES} />);
    expect(screen.getByText("Show the row's original values")).toBeInTheDocument();
    expect(screen.getByText("Orphan")).toBeInTheDocument();
    expect(screen.getByText("Rows: 7, 9")).toBeInTheDocument();
    expect(screen.getAllByText("Whole file")).toHaveLength(2);
  });

  it("filters by type, explains it, and links to the comment in the editor", async () => {
    const user = userEvent.setup();
    render(<IssueList issues={ISSUES} templateId="t1" />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Type" }), "sanitized");
    expect(screen.getByText("Comment HTML was changed for safety. Every change is listed.")).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Open in editor" })).toHaveAttribute("href", "/templates/t1?section=s1#item-i1");

    await user.click(screen.getByRole("button", { name: "Skipped (1)" }));
    expect(screen.getByText("No issues match these filters.")).toBeInTheDocument();
  });

  it("doesn't offer editor links without a saved template", () => {
    render(<IssueList issues={ISSUES} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("pages long lists", async () => {
    const many: IssueWithLocation[] = Array.from({ length: 450 }, (_, i) => ({
      id: i,
      source_row: i + 2,
      severity: "info",
      category: "sanitized",
      code: "html_sanitized",
      message: `Change ${i}`,
      detail: {},
    }));
    const user = userEvent.setup();
    render(<IssueList issues={many} />);

    expect(screen.getAllByRole("listitem")).toHaveLength(200);
    await user.click(screen.getByRole("button", { name: "Show more (250 remaining)" }));
    await user.click(screen.getByRole("button", { name: "Show more (50 remaining)" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(450);
    expect(screen.queryByRole("button", { name: /Show more/ })).not.toBeInTheDocument();
  });

  it("says so when there is nothing to review", () => {
    render(<IssueList issues={[]} />);
    expect(screen.getByText("No issues: every row imported as-is.")).toBeInTheDocument();
  });
});
