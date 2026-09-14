// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AddItemForm, AddSectionForm, DeleteNodeButton, MoveButtons, NodeName } from "../node-controls";

const { actions } = vi.hoisted(() => ({
  actions: {
    addComment: vi.fn(),
    addItem: vi.fn(),
    addSection: vi.fn(),
    deleteNode: vi.fn(),
    moveNode: vi.fn(),
    renameNode: vi.fn(),
    updateComment: vi.fn(),
  },
}));
vi.mock("@/app/templates/actions", () => actions);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("NodeName", () => {
  it("sends the latest version on each rename", async () => {
    actions.renameNode.mockResolvedValueOnce({ ok: true, version: 6 }).mockResolvedValueOnce({ ok: true, version: 7 });
    const user = userEvent.setup();
    render(<NodeName kind="item" id="i1" version={5} name="Gutters" />);

    await user.click(screen.getByRole("button", { name: "Item name: Gutters. Click to rename" }));
    await user.type(screen.getByRole("textbox", { name: "Item name" }), " A{Enter}");
    await user.click(await screen.findByRole("button", { name: "Item name: Gutters A. Click to rename" }));
    await user.type(screen.getByRole("textbox", { name: "Item name" }), "B{Enter}");

    expect(actions.renameNode.mock.calls.map(([input]) => input)).toEqual([
      { kind: "item", id: "i1", version: 5, name: "Gutters A" },
      { kind: "item", id: "i1", version: 6, name: "Gutters AB" },
    ]);
  });
});

describe("MoveButtons", () => {
  it("disables impossible moves and reports failures", async () => {
    actions.moveNode.mockResolvedValue({ ok: false, code: "not_found", message: "This no longer exists." });
    const user = userEvent.setup();
    render(<MoveButtons kind="section" id="s1" label="Roof" isFirst={false} isLast />);

    expect(screen.getByRole("button", { name: "Move Roof down" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Move Roof up" }));
    expect(actions.moveNode).toHaveBeenCalledWith({ kind: "section", id: "s1", direction: -1 });
    expect(await screen.findByRole("alert")).toHaveTextContent("This no longer exists.");
  });
});

describe("DeleteNodeButton", () => {
  it("confirms in a dialog before deleting", async () => {
    actions.deleteNode.mockResolvedValue({ ok: true });
    const user = userEvent.setup();
    render(<DeleteNodeButton kind="item" id="i1" label="Gutters" description="Gutters and its 3 comments will be removed." />);

    await user.click(screen.getByRole("button", { name: "Delete Gutters" }));
    const dialog = screen.getByRole("dialog", { name: "Delete this item?" });
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(actions.deleteNode).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete Gutters" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete" }));
    expect(actions.deleteNode).toHaveBeenCalledWith({ kind: "item", id: "i1" });
  });
});

describe("add forms", () => {
  it("adds an item, closing the form on success", async () => {
    actions.addItem.mockResolvedValue({ ok: true, id: "new" });
    const user = userEvent.setup();
    render(<AddItemForm sectionId="s1" />);

    await user.click(screen.getByRole("button", { name: "+ Add item" }));
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
    await user.type(screen.getByRole("textbox", { name: "Item name" }), "Gutters");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(actions.addItem).toHaveBeenCalledWith({ sectionId: "s1", name: "Gutters" });
    expect(await screen.findByRole("button", { name: "+ Add item" })).toBeInTheDocument();
  });

  it("keeps the form open with the reason when adding fails, and Esc closes it", async () => {
    actions.addSection.mockResolvedValue({ ok: false, code: "limit", message: "template limit reached" });
    const user = userEvent.setup();
    render(<AddSectionForm templateId="t1" />);

    await user.click(screen.getByRole("button", { name: "+ Add section" }));
    await user.type(screen.getByRole("textbox", { name: "Section name" }), "Garage{Enter}");
    expect(actions.addSection).toHaveBeenCalledWith({ templateId: "t1", name: "Garage" });
    expect(await screen.findByRole("alert")).toHaveTextContent("template limit reached");

    await user.type(screen.getByRole("textbox", { name: "Section name" }), "{Escape}");
    expect(screen.getByRole("button", { name: "+ Add section" })).toBeInTheDocument();
  });
});
