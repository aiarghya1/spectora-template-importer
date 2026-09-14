// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildXlsx, SPECTORA_HEADERS } from "@/lib/import/__tests__/workbook";
import { parseSpectoraExport } from "@/lib/import/parse";
import { TreePreview } from "../tree-preview";

function sections() {
  const result = parseSpectoraExport({
    bytes: buildXlsx([
      SPECTORA_HEADERS,
      ["Roof", "Coverings", "Asphalt", '<p>See <a href="https://www.nachi.org/roof">NACHI</a></p>', "info", 1],
      ["Roof", "Coverings", "", "Line one\nLine two", "defect"],
      ["Garage"],
    ]),
    filename: "t.xlsx",
    kind: "xlsx",
  });
  if (!result.ok) throw new Error(result.message);
  return result.sections;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TreePreview", () => {
  it("summarises each section and item", () => {
    render(<TreePreview sections={sections()} />);
    expect(screen.getByText("1 items · 2 comments")).toBeInTheDocument();
    expect(screen.getByText("0 items · 0 comments")).toBeInTheDocument();
    expect(screen.getByText("No items")).toBeInTheDocument();
  });

  it("renders comment text only when opened, keeping line breaks and extras", async () => {
    const user = userEvent.setup();
    render(<TreePreview sections={sections()} />);

    expect(screen.queryByText("NACHI")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Asphalt/ }));
    expect(screen.getByRole("link", { name: "NACHI" })).toBeInTheDocument();
    expect(screen.getByText("Category")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Untitled comment/ }));
    const plain = screen.getByText(/Line one/);
    expect(plain).toHaveClass("whitespace-pre-wrap");
    expect(plain.textContent).toBe("Line one\nLine two");
  });

  it("opens links in a new tab so an unfinished import isn't lost", async () => {
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    const user = userEvent.setup();
    render(<TreePreview sections={sections()} />);
    await user.click(screen.getByRole("button", { name: /Asphalt/ }));
    await user.click(screen.getByRole("link", { name: "NACHI" }));
    expect(open).toHaveBeenCalledWith("https://www.nachi.org/roof", "_blank", "noopener,noreferrer");
  });
});
