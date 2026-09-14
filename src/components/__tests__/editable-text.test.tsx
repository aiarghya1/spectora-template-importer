// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EditableText } from "../editable-text";

type Result = { ok: true } | { ok: false; message: string };

function setup(save: (next: string) => Promise<Result> = vi.fn().mockResolvedValue({ ok: true })) {
  const user = userEvent.setup();
  render(<EditableText value="Roof" label="Section name" maxLength={40} save={save} />);
  const open = () => user.click(screen.getByRole("button", { name: "Section name: Roof. Click to rename" }));
  const input = () => screen.getByRole("textbox", { name: "Section name" });
  return { user, save, open, input };
}

describe("EditableText", () => {
  it("saves the trimmed value on Enter and confirms it", async () => {
    const { user, save, open, input } = setup();
    await open();
    await user.clear(input());
    await user.type(input(), "  Roof covering {Enter}");

    expect(save).toHaveBeenCalledWith("Roof covering");
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Section name: Roof covering. Click to rename" })).toBeInTheDocument();
  });

  it("saves when focus leaves the field", async () => {
    const { user, save, open, input } = setup();
    await open();
    await user.type(input(), " 2");
    await user.tab();
    expect(save).toHaveBeenCalledWith("Roof 2");
  });

  it("Esc cancels without saving", async () => {
    const { user, save, open, input } = setup();
    await open();
    await user.type(input(), " draft{Escape}");
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Section name: Roof. Click to rename" })).toBeInTheDocument();
  });

  it("does nothing when the value is unchanged", async () => {
    const { user, save, open, input } = setup();
    await open();
    await user.type(input(), "{Enter}");
    expect(save).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("refuses an empty name", async () => {
    const { user, save, open, input } = setup();
    await open();
    await user.clear(input());
    await user.type(input(), "   {Enter}");
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText("Section name can't be empty.")).toBeInTheDocument();
    expect(input()).toBeInTheDocument();
  });

  it("keeps the draft and shows the reason when saving fails", async () => {
    const { user, open, input } = setup(vi.fn().mockResolvedValue({ ok: false, message: "This was changed somewhere else." }));
    await open();
    await user.type(input(), "!{Enter}");
    expect(await screen.findByText("This was changed somewhere else.")).toBeInTheDocument();
    expect(input()).toHaveValue("Roof!");
  });

  it("shows progress, and never sends a second save when blur follows Enter", async () => {
    let finish: (r: Result) => void = () => {};
    const save = vi.fn(() => new Promise<Result>((resolve) => (finish = resolve)));
    const { user, open, input } = setup(save);
    await open();
    await user.type(input(), "!{Enter}");

    expect(screen.getByText("Saving…")).toBeInTheDocument();
    expect(input()).toBeDisabled();
    fireEvent.blur(input());
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => finish({ ok: true }));
    expect(screen.getByText("Saved")).toBeInTheDocument();
  });
});
