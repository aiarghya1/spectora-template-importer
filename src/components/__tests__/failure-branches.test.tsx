// @vitest-environment jsdom
/** A failed save must not advance the stored version; redirecting actions return nothing to show. */
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TemplateHeader } from "@/app/templates/[id]/template-header";
import { NodeName } from "../node-controls";
import { DeleteTemplateButton, DuplicateTemplateButton } from "../template-buttons";

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

beforeEach(() => {
  vi.clearAllMocks();
});

const conflict = { ok: false, code: "conflict", message: "This was changed somewhere else." };

describe("failed renames keep the version they started from", () => {
  it("section and item names", async () => {
    actions.renameNode.mockResolvedValueOnce(conflict).mockResolvedValueOnce({ ok: true, version: 6 });
    const user = userEvent.setup();
    render(<NodeName kind="section" id="s1" version={5} name="Roof" />);

    await user.click(screen.getByRole("button", { name: "Section name: Roof. Click to rename" }));
    await user.type(screen.getByRole("textbox", { name: "Section name" }), " A{Enter}");
    expect(await screen.findByText("This was changed somewhere else.")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Section name" }), "B{Enter}");

    expect(actions.renameNode.mock.calls.map(([input]) => input.version)).toEqual([5, 5]);
  });

  it("template names", async () => {
    actions.renameTemplate.mockResolvedValueOnce(conflict).mockResolvedValueOnce({ ok: true, version: 3 });
    const user = userEvent.setup();
    render(
      <TemplateHeader
        template={{ id: "t1", name: "InterNACHI", version: 2, updatedAt: "2026-09-14T10:00:00Z", importId: null, copiedFrom: null, sections: [] }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Template name: InterNACHI. Click to rename" }));
    await user.type(screen.getByRole("textbox", { name: "Template name" }), " A{Enter}");
    expect(await screen.findByText("This was changed somewhere else.")).toBeInTheDocument();
    await user.type(screen.getByRole("textbox", { name: "Template name" }), "B{Enter}");

    expect(actions.renameTemplate.mock.calls.map(([input]) => input.version)).toEqual([2, 2]);
  });
});

describe("redirecting actions", () => {
  it("show no error when duplicate or delete succeed (the page navigates away)", async () => {
    actions.duplicateTemplate.mockResolvedValue(undefined);
    actions.deleteTemplate.mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <>
        <DuplicateTemplateButton id="t1" name="InterNACHI" />
        <DeleteTemplateButton id="t1" name="InterNACHI" />
      </>,
    );

    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Create copy" }));
    expect(actions.duplicateTemplate).toHaveBeenCalled();
    expect(within(screen.getByRole("dialog")).queryByRole("alert")).not.toBeInTheDocument();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Delete permanently" }));
    expect(actions.deleteTemplate).toHaveBeenCalled();
    expect(within(screen.getByRole("dialog")).queryByRole("alert")).not.toBeInTheDocument();
  });
});
