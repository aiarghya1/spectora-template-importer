// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RichEditor } from "../rich-editor";

afterEach(() => {
  vi.restoreAllMocks();
});

async function setup(initialHtml = "<p>Roof is worn</p>") {
  const onChange = vi.fn();
  const user = userEvent.setup();
  render(<RichEditor initialHtml={initialHtml} onChange={onChange} />);
  await screen.findByRole("toolbar", { name: "Formatting" });
  return { onChange, user };
}

describe("RichEditor", () => {
  it("loads the comment and offers the formatting toolbar", async () => {
    await setup();
    expect(await screen.findByRole("textbox", { name: "Comment text" })).toHaveTextContent("Roof is worn");
    for (const name of ["Bold", "Italic", "Underline", "Bulleted list", "Numbered list", "Link"]) {
      expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "false");
    }
  });

  it("reports document changes as HTML", async () => {
    const { onChange, user } = await setup();
    await user.click(screen.getByRole("button", { name: "Bulleted list" }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("<ul><li><p>Roof is worn</p></li></ul>"));
    expect(screen.getByRole("button", { name: "Bulleted list" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Numbered list" }));
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith("<ol><li><p>Roof is worn</p></li></ol>"));
  });

  it("toggles inline marks", async () => {
    const { user } = await setup();
    for (const name of ["Bold", "Italic", "Underline"]) {
      await user.click(screen.getByRole("button", { name }));
      await waitFor(() => expect(screen.getByRole("button", { name })).toHaveAttribute("aria-pressed", "true"));
    }
  });

  it("only accepts http(s) and mailto links", async () => {
    const prompt = vi.spyOn(window, "prompt");
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    const { user } = await setup();

    prompt.mockReturnValueOnce("javascript:alert(1)");
    await user.click(screen.getByRole("button", { name: "Link" }));
    expect(alert).toHaveBeenCalledWith("Links must start with https://, http:// or mailto:");

    alert.mockClear();
    prompt.mockReturnValueOnce(null).mockReturnValueOnce("").mockReturnValueOnce("https://www.nachi.org");
    await user.click(screen.getByRole("button", { name: "Link" }));
    await user.click(screen.getByRole("button", { name: "Link" }));
    await user.click(screen.getByRole("button", { name: "Link" }));
    expect(alert).not.toHaveBeenCalled();
    expect(prompt).toHaveBeenCalledTimes(4);
  });

  it("reports an emptied editor as an empty string", async () => {
    const { onChange, user } = await setup("<p>x</p>");
    const box = await screen.findByRole("textbox", { name: "Comment text" });
    await user.click(box);
    await user.keyboard("{Control>}a{/Control}{Backspace}");
    await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(""));
  });
});
