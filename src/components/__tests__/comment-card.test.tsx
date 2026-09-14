// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommentView } from "@/lib/templates/types";
import { CommentCard } from "../comment-card";

const { actions, refresh } = vi.hoisted(() => ({
  actions: {
    updateComment: vi.fn(),
    moveNode: vi.fn(),
    deleteNode: vi.fn(),
    renameNode: vi.fn(),
    addComment: vi.fn(),
    addItem: vi.fn(),
    addSection: vi.fn(),
  },
  refresh: vi.fn(),
}));
vi.mock("@/app/templates/actions", () => actions);
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const LOSSY: CommentView = {
  id: "c1",
  title: "Missing shingles",
  bodyHtml: '<span style="color:red">Safety</span> issue',
  renderedHtml: '<span style="color:red">Safety</span> issue',
  commentType: "defect",
  version: 4,
  sourceRow: 12,
  extras: { Category: "1", "Default Location": "North slope" },
};
const SIMPLE: CommentView = { ...LOSSY, bodyHtml: "<p>Roof is <b>worn</b></p>", renderedHtml: "<p>Roof is <b>worn</b></p>", extras: {} };

function renderCard(comment: CommentView = LOSSY, position = { isFirst: false, isLast: false }) {
  const user = userEvent.setup();
  const view = render(<CommentCard comment={comment} {...position} />);
  return { user, ...view };
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("CommentCard — viewing", () => {
  it("shows title, type, source row, rendered text and hidden Spectora fields", async () => {
    const { user, container } = renderCard();
    expect(screen.getByRole("heading", { name: "Missing shingles" })).toBeInTheDocument();
    expect(screen.getByText("defect")).toBeInTheDocument();
    expect(screen.getByText("Row 12")).toBeInTheDocument();
    expect(container.querySelector(".rich")?.innerHTML).toBe('<span style="color:red">Safety</span> issue');

    expect(screen.queryByText("North slope")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show other Spectora fields (2)" }));
    expect(screen.getByText("North slope")).toBeInTheDocument();
    expect(screen.getByText("Preserved exactly as imported. Not editable in this app.")).toBeInTheDocument();
  });

  it("labels empty comments clearly", () => {
    renderCard({ ...SIMPLE, title: "  ", bodyHtml: "", renderedHtml: "" });
    expect(screen.getByRole("heading", { name: "Untitled comment" })).toBeInTheDocument();
    expect(screen.getByText("No comment text")).toBeInTheDocument();
  });

  it("moves and deletes through the server actions", async () => {
    actions.moveNode.mockResolvedValue({ ok: true });
    actions.deleteNode.mockResolvedValue({ ok: false, code: "not_found", message: "Already deleted." });
    const { user } = renderCard(LOSSY, { isFirst: true, isLast: false });

    expect(screen.getByRole("button", { name: "Move Missing shingles up" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Move Missing shingles down" }));
    expect(actions.moveNode).toHaveBeenCalledWith({ kind: "comment", id: "c1", direction: 1 });

    await user.click(screen.getByRole("button", { name: "Delete Missing shingles" }));
    const dialog = screen.getByRole("dialog", { name: "Delete this comment?" });
    expect(within(dialog).getByText(/Other templates, including copies, are not affected/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(actions.deleteNode).toHaveBeenCalledWith({ kind: "comment", id: "c1" });
    expect(await within(dialog).findByText("Already deleted.")).toBeInTheDocument();
  });
});

describe("CommentCard — editing", () => {
  it("opens formatting the visual editor can't keep in HTML mode, with an explanation", async () => {
    const { user } = renderCard();
    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(screen.getByRole("tab", { name: "HTML" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByText(/opened in HTML mode to protect it/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Comment HTML" })).toHaveValue(LOSSY.bodyHtml);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("opens simple comments in the visual editor", async () => {
    const { user } = renderCard(SIMPLE);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByRole("tab", { name: "Visual" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("toolbar", { name: "Formatting" })).toBeInTheDocument();
  });

  it("warns before switching lossy content to the visual editor", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { user } = renderCard();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("tab", { name: "Visual" }));
    expect(confirm).toHaveBeenCalled();
    expect(screen.getByRole("tab", { name: "HTML" })).toHaveAttribute("aria-selected", "true");
  });

  it("saves with the current version, shows safety changes, and uses the new version next time", async () => {
    actions.updateComment
      .mockResolvedValueOnce({
        ok: true,
        version: 5,
        bodyHtml: '<span style="color:red">Safety</span> fixed',
        renderedHtml: '<span style="color:red">Safety</span> fixed',
        notice: 'Comment HTML changed: removed unsupported style "position".',
      })
      .mockResolvedValueOnce({ ok: true, version: 6, bodyHtml: "again", renderedHtml: "again", notice: null });
    const { user, container } = renderCard();

    await user.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Comment HTML" }), {
      target: { value: '<span style="color:red;position:fixed">Safety</span> fixed' },
    });
    expect(screen.getByText(/Unsaved changes/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(actions.updateComment).toHaveBeenCalledWith({
      id: "c1",
      version: 4,
      title: "Missing shingles",
      bodyHtml: '<span style="color:red;position:fixed">Safety</span> fixed',
    });
    expect(await screen.findByText("Saved, with safety changes")).toBeInTheDocument();
    expect(container.querySelector(".rich")?.textContent).toBe("Safety fixed");

    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.type(screen.getByRole("textbox", { name: "Comment name" }), "!");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(actions.updateComment).toHaveBeenLastCalledWith(expect.objectContaining({ version: 5, title: "Missing shingles!" }));
  });

  it("saves with Ctrl/⌘+S", async () => {
    actions.updateComment.mockResolvedValue({ ok: true, version: 5, bodyHtml: "x", renderedHtml: "x", notice: null });
    const { user } = renderCard();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const title = screen.getByRole("textbox", { name: "Comment name" });
    await user.type(title, " (roof)");
    fireEvent.keyDown(title, { key: "s", ctrlKey: true });
    expect(actions.updateComment).toHaveBeenCalledTimes(1);
  });

  it("explains conflicts and offers to reload", async () => {
    actions.updateComment.mockResolvedValue({ ok: false, code: "conflict", message: "This was changed somewhere else (another tab?)." });
    const { user } = renderCard();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.type(screen.getByRole("textbox", { name: "Comment name" }), "!");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This was changed somewhere else");
    await user.click(screen.getByRole("button", { name: "Reload latest" }));
    expect(refresh).toHaveBeenCalled();
  });

  it("asks before discarding unsaved changes", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    const { user } = renderCard();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.type(screen.getByRole("textbox", { name: "Comment name" }), "!");

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("textbox", { name: "Comment name" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("heading", { name: "Missing shingles" })).toBeInTheDocument();
  });

  it("cancels immediately when nothing changed", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const { user } = renderCard();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Missing shingles" })).toBeInTheDocument();
  });
});
