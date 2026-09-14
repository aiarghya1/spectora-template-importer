// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteTemplateButton, DuplicateTemplateButton } from "../template-buttons";

const { actions } = vi.hoisted(() => ({ actions: { duplicateTemplate: vi.fn(), deleteTemplate: vi.fn() } }));
vi.mock("@/app/templates/actions", () => actions);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DuplicateTemplateButton", () => {
  it("names the copy and explains independence", async () => {
    actions.duplicateTemplate.mockResolvedValue({ ok: false, code: "limit", message: "template limit reached (200 per account)" });
    const user = userEvent.setup();
    render(<DuplicateTemplateButton id="t1" name="InterNACHI" />);

    await user.click(screen.getByRole("button", { name: "Duplicate" }));
    const dialog = screen.getByRole("dialog", { name: "Duplicate template" });
    expect(within(dialog).getByText(/Changes to the copy never affect/)).toBeInTheDocument();

    const name = within(dialog).getByRole("textbox", { name: "Name of the copy" });
    expect(name).toHaveValue("InterNACHI (copy)");
    await user.clear(name);
    expect(within(dialog).getByRole("button", { name: "Create copy" })).toBeDisabled();
    await user.type(name, "Pre-listing");
    await user.click(within(dialog).getByRole("button", { name: "Create copy" }));

    expect(actions.duplicateTemplate).toHaveBeenCalledWith({ id: "t1", name: "Pre-listing" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("template limit reached");
  });
});

describe("DeleteTemplateButton", () => {
  it("requires confirmation and shows failures", async () => {
    actions.deleteTemplate.mockResolvedValue({ ok: false, code: "not_found", message: "Template not found." });
    const user = userEvent.setup();
    render(<DeleteTemplateButton id="t1" name="InterNACHI" />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const dialog = screen.getByRole("dialog", { name: "Delete template?" });
    expect(within(dialog).getByText(/Copies of it are not affected/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Delete permanently" }));

    expect(actions.deleteTemplate).toHaveBeenCalledWith({ id: "t1" });
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Template not found.");
  });
});
