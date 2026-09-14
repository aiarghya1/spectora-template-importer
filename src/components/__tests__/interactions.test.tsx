// @vitest-environment jsdom
/** Less common interactions: timers, Esc/Cancel paths, keyboard guards, dialog closing, style variants. */
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CommentView } from "@/lib/templates/types";
import { CommentCard } from "../comment-card";
import { EditableText } from "../editable-text";
import { AddCommentForm } from "../node-controls";
import { DeleteTemplateButton, DuplicateTemplateButton } from "../template-buttons";
import { Badge, Banner, commentTypeStyle } from "../ui";

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
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("EditableText", () => {
  function setup(save = vi.fn().mockResolvedValue({ ok: true })) {
    render(<EditableText value="Roof" label="Section name" maxLength={40} save={save} />);
    return save;
  }
  const open = (name = "Roof") => fireEvent.click(screen.getByRole("button", { name: `Section name: ${name}. Click to rename` }));
  const input = () => screen.getByRole("textbox", { name: "Section name" });

  it("clears the 'Saved' confirmation after two seconds", async () => {
    vi.useFakeTimers();
    setup();
    open();
    fireEvent.change(input(), { target: { value: "Roof 2" } });
    await act(async () => fireEvent.keyDown(input(), { key: "Enter" }));
    expect(screen.getByText("Saved")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("keeps showing progress if another save is running when the timer fires", async () => {
    vi.useFakeTimers();
    let finish: (value: { ok: true }) => void = () => {};
    const save = setup(vi.fn().mockResolvedValueOnce({ ok: true }).mockImplementationOnce(() => new Promise((resolve) => (finish = resolve))));
    open();
    fireEvent.change(input(), { target: { value: "Roof 2" } });
    await act(async () => fireEvent.keyDown(input(), { key: "Enter" }));
    open("Roof 2");
    fireEvent.change(input(), { target: { value: "Roof 3" } });
    await act(async () => fireEvent.keyDown(input(), { key: "Enter" }));
    act(() => vi.advanceTimersByTime(2000));
    expect(screen.getByText("Saving…")).toBeInTheDocument();
    await act(async () => finish({ ok: true }));
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("doesn't save when a blur arrives together with Esc", () => {
    const save = setup();
    open();
    fireEvent.change(input(), { target: { value: "Draft" } });
    const field = input();
    act(() => {
      fireEvent.keyDown(field, { key: "Escape" });
      fireEvent.blur(field);
    });
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Section name: Roof. Click to rename" })).toBeInTheDocument();
  });

  it("saves a later edit when you click away, even after an earlier Esc", async () => {
    const save = setup();
    const user = userEvent.setup();
    open();
    await user.type(input(), " draft{Escape}");
    open();
    await user.type(input(), " covering");
    await user.tab();
    expect(save).toHaveBeenCalledWith("Roof covering");
  });
});

describe("dialogs and forms", () => {
  it("duplicate and delete dialogs close with Cancel or Esc, at either size", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <>
        <DuplicateTemplateButton id="t1" name="InterNACHI" size="sm" />
        <DeleteTemplateButton id="t1" name="InterNACHI" />
      </>,
    );
    expect(screen.getByRole("button", { name: "Duplicate" })).toHaveClass("h-7");
    expect(screen.getByRole("button", { name: "Delete" })).toHaveClass("h-9");

    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    for (const trigger of ["Duplicate", "Delete"]) {
      await user.click(screen.getByRole("button", { name: trigger }));
      act(() => {
        container.querySelector("dialog[open]")!.dispatchEvent(new Event("close"));
      });
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    }
    expect(actions.duplicateTemplate).not.toHaveBeenCalled();
    expect(actions.deleteTemplate).not.toHaveBeenCalled();
  });

  it("adds a comment, and Cancel closes the form without adding", async () => {
    actions.addComment.mockResolvedValue({ ok: true, id: "c-new" });
    const user = userEvent.setup();
    render(<AddCommentForm itemId="i1" />);

    await user.click(screen.getByRole("button", { name: "+ Add comment" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(actions.addComment).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "+ Add comment" }));
    await user.type(screen.getByRole("textbox", { name: "Comment name" }), "Loose flashing{Enter}");
    expect(actions.addComment).toHaveBeenCalledWith({ itemId: "i1", title: "Loose flashing" });
  });
});

describe("ui primitives", () => {
  it("banners render with a title, body, or both", () => {
    const { rerender } = render(<Banner title="Only a title" />);
    expect(screen.getByRole("status").querySelectorAll("div")).toHaveLength(0);
    rerender(<Banner tone="error">Only a body</Banner>);
    expect(screen.getByRole("alert")).toHaveTextContent("Only a body");
    rerender(<Banner title="Both">Body</Banner>);
    expect(screen.getByText("Body")).toHaveClass("mt-1");
  });

  it("badges have a neutral default and comment types map to status colours", () => {
    render(<Badge>Copy</Badge>);
    expect(screen.getByText("Copy")).toHaveClass("bg-zinc-100");
    expect(commentTypeStyle("Deficiency")).toContain("red");
    expect(commentTypeStyle("limit")).toContain("amber");
    expect(commentTypeStyle("Information")).toContain("sky");
    expect(commentTypeStyle("Maintenance")).toContain("zinc");
    expect(commentTypeStyle(null)).toContain("zinc");
  });
});

describe("CommentCard editor guards", () => {
  const LOSSY: CommentView = {
    id: "c1",
    title: "Missing shingles",
    bodyHtml: '<span style="color:red">Safety</span>',
    renderedHtml: '<span style="color:red">Safety</span>',
    commentType: null,
    version: 1,
    sourceRow: null,
    extras: {},
  };
  const SIMPLE: CommentView = { ...LOSSY, bodyHtml: "<p>Roof is worn</p>", renderedHtml: "<p>Roof is worn</p>" };

  it("warns before leaving the page only while there are unsaved changes", async () => {
    const user = userEvent.setup();
    render(<CommentCard comment={LOSSY} isFirst isLast />);
    await user.click(screen.getByRole("button", { name: "Edit" }));

    const beforeUnload = () => {
      const event = new Event("beforeunload", { cancelable: true });
      window.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(beforeUnload()).toBe(false);
    await user.type(screen.getByRole("textbox", { name: "Comment name" }), "!");
    expect(beforeUnload()).toBe(true);

    vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(beforeUnload()).toBe(false);
  });

  it("ignores ⌘S with nothing to save, and while a save is already running", async () => {
    let finish: (value: unknown) => void = () => {};
    actions.updateComment.mockImplementation(() => new Promise((resolve) => (finish = resolve)));
    const user = userEvent.setup();
    render(<CommentCard comment={LOSSY} isFirst isLast />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const title = screen.getByRole("textbox", { name: "Comment name" });

    fireEvent.keyDown(title, { key: "s", metaKey: true });
    expect(actions.updateComment).not.toHaveBeenCalled();

    await user.type(title, "!");
    fireEvent.keyDown(title, { key: "s", metaKey: true });
    fireEvent.keyDown(title, { key: "s", metaKey: true });
    expect(actions.updateComment).toHaveBeenCalledTimes(1);
    await act(async () => finish({ ok: true, version: 2, bodyHtml: LOSSY.bodyHtml, renderedHtml: LOSSY.renderedHtml, notice: null }));
  });

  it("clicking the current mode does nothing; confirming switches lossy content to visual", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    render(<CommentCard comment={LOSSY} isFirst isLast />);
    await user.click(screen.getByRole("button", { name: "Edit" }));

    await user.click(screen.getByRole("tab", { name: "HTML" }));
    expect(confirm).not.toHaveBeenCalled();
    await user.click(screen.getByRole("tab", { name: "Visual" }));
    expect(screen.getByRole("tab", { name: "Visual" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByRole("toolbar", { name: "Formatting" })).toBeInTheDocument();
  });

  it("saves edits made in the visual editor", async () => {
    actions.updateComment.mockResolvedValue({ ok: true, version: 2, bodyHtml: "<ul><li><p>Roof is worn</p></li></ul>", renderedHtml: "x", notice: null });
    const user = userEvent.setup();
    render(<CommentCard comment={SIMPLE} isFirst isLast />);
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(await screen.findByRole("button", { name: "Bulleted list" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(actions.updateComment).toHaveBeenCalledWith(expect.objectContaining({ bodyHtml: "<ul><li><p>Roof is worn</p></li></ul>" }));
  });
});
