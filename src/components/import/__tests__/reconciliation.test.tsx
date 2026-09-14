// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ParseStats } from "@/lib/import/types";
import { Reconciliation } from "../reconciliation";

const STATS: ParseStats = {
  sourceRows: 13,
  headerRow: 1,
  dataRows: 11,
  blankRows: 1,
  skippedRows: 1,
  itemOnlyRows: 0,
  sectionOnlyRows: 0,
  sections: 2,
  items: 3,
  comments: 1234,
  nonEmptyCells: 40,
  cellsStored: 30,
  cellsInExtras: 6,
  cellsReported: 4,
};

describe("Reconciliation", () => {
  it("shows headline counts and where every cell went", () => {
    render(<Reconciliation stats={STATS} />);
    expect(screen.getByText("Comments").nextElementSibling).toHaveTextContent("1,234");
    expect(screen.getByText(/From 11 template rows \(headers on row 1\) · 1 blank rows ignored · 1 rows skipped/)).toBeInTheDocument();
    expect(screen.getByRole("img")).toHaveAccessibleName(
      "40 filled cells. Imported into editable fields: 30; Kept as read-only data: 6; Not imported — listed as issues: 4.",
    );
    expect(screen.getAllByRole("tooltip").map((t) => t.textContent)).toEqual([
      "Imported into editable fields: 30 (75.0%)",
      "Kept as read-only data: 6 (15.0%)",
      "Not imported — listed as issues: 4 (10.0%)",
    ]);
    expect(screen.getByRole("status")).toHaveTextContent("All 40 filled cells are accounted for — nothing was dropped silently.");
  });

  it("omits empty segments from the bar but keeps them in the legend", () => {
    render(<Reconciliation stats={{ ...STATS, cellsStored: 34, cellsReported: 0 }} />);
    expect(screen.getAllByRole("tooltip")).toHaveLength(2);
    expect(screen.getByText("not imported — listed as issues")).toBeInTheDocument();
  });

  it("flags an accounting mismatch loudly", () => {
    render(<Reconciliation stats={{ ...STATS, cellsStored: 29 }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Accounting mismatch: only 39 of 40 cells are tracked. Don't rely on this import.");
  });
});
