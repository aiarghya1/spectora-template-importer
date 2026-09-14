// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { latestTemplateId, listTemplates } from "@/lib/templates/queries";
import { AppHeader } from "@/components/app-header";
import Home from "../page";
import ImportPage from "../import/page";
import LoginPage from "../login/page";
import { LoginForm } from "../login/login-form";
import TemplatesPage from "../templates/page";

const { authenticate, signOut } = vi.hoisted(() => ({ authenticate: vi.fn(), signOut: vi.fn() }));
vi.mock("@/lib/templates/queries", () => ({ latestTemplateId: vi.fn(), listTemplates: vi.fn() }));
vi.mock("../login/actions", () => ({ authenticate, signOut }));
vi.mock("@/app/login/actions", () => ({ authenticate, signOut }));
vi.mock("@/app/templates/actions", async () => (await import("@/test/next-mocks")).actionSpies(() => vi.fn()));
vi.mock("../import/import-wizard", () => ({ ImportWizard: () => <div>wizard</div> }));
vi.mock("next/link", async () => (await import("@/test/next-mocks")).linkModule);
vi.mock("next/navigation", async () => ({ redirect: (await import("@/test/next-mocks")).redirectTo }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("home", () => {
  it("opens the most recently edited template, or the list when there are none", async () => {
    vi.mocked(latestTemplateId).mockResolvedValueOnce("t1").mockResolvedValueOnce(null);
    await expect(Home()).rejects.toThrow("REDIRECT:/templates/t1");
    await expect(Home()).rejects.toThrow("REDIRECT:/templates");
  });
});

describe("templates list", () => {
  it("lists templates with counts, copy badges and actions", async () => {
    vi.mocked(listTemplates).mockResolvedValue([
      { id: "t1", name: "InterNACHI", updatedAt: "2026-09-14T10:00:00Z", copiedFromId: null, sectionCount: 21, commentCount: 1234 },
      { id: "t2", name: "InterNACHI (copy)", updatedAt: "2026-09-14T11:00:00Z", copiedFromId: "t1", sectionCount: 21, commentCount: 1234 },
    ]);
    render(await TemplatesPage());

    const rows = screen.getAllByRole("listitem");
    expect(within(rows[0]).getByRole("link", { name: "InterNACHI" })).toHaveAttribute("href", "/templates/t1");
    expect(within(rows[0]).getByText(/21 sections · 1,234 comments · Updated/)).toBeInTheDocument();
    expect(within(rows[0]).queryByText("Copy")).not.toBeInTheDocument();
    expect(within(rows[1]).getByText("Copy")).toBeInTheDocument();
    expect(within(rows[1]).getByRole("button", { name: "Duplicate" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Import from Spectora" })).toHaveAttribute("href", "/import");
  });

  it("guides a new user to import", async () => {
    vi.mocked(listTemplates).mockResolvedValue([]);
    render(await TemplatesPage());
    expect(screen.getByText("No templates yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Import a template" })).toHaveAttribute("href", "/import");
  });
});

describe("import page", () => {
  it("explains how to export from Spectora and hosts the wizard", () => {
    render(<ImportPage />);
    expect(screen.getByRole("heading", { name: "Import a Spectora template" })).toBeInTheDocument();
    expect(screen.getByText(/not plain text — that one strips your links and formatting/)).toBeInTheDocument();
    expect(screen.getByText("wizard")).toBeInTheDocument();
  });
});

describe("app header", () => {
  it("links to the main areas and signs out through the server action", () => {
    render(<AppHeader />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getByRole("link", { name: "Templates" })).toHaveAttribute("href", "/templates");
    expect(within(nav).getByRole("link", { name: "Import" })).toHaveAttribute("href", "/import");
    expect(screen.getByRole("button", { name: "Sign out" })).toBeInTheDocument();
  });
});

describe("login", () => {
  it("explains an expired confirmation link", async () => {
    render(await LoginPage({ searchParams: Promise.resolve({ error: "confirm" }) }));
    expect(screen.getByRole("alert")).toHaveTextContent("That confirmation link is invalid or expired.");
  });

  it("switches between sign-in and sign-up", async () => {
    const user = userEvent.setup();
    const { container } = render(<LoginForm next="/templates/t1" />);
    const mode = () => container.querySelector<HTMLInputElement>('input[name="mode"]')?.value;

    expect(mode()).toBe("signin");
    expect(container.querySelector('input[name="next"]')).toHaveValue("/templates/t1");
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "current-password");

    await user.click(screen.getByRole("button", { name: "No account? Create one" }));
    expect(mode()).toBe("signup");
    expect(screen.getByRole("button", { name: "Create account" })).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toHaveAttribute("autocomplete", "new-password");
  });

  it("submits credentials, keeps the email after an error, and shows confirmations", async () => {
    authenticate
      .mockResolvedValueOnce({ error: "Email or password is incorrect.", email: "inspector@example.com" })
      .mockResolvedValueOnce({ message: "Check your email to confirm your account, then sign in.", email: "inspector@example.com" });
    const user = userEvent.setup();
    render(<LoginForm />);

    await user.type(screen.getByLabelText("Email"), "inspector@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-horse");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect.");
    const [, submitted] = authenticate.mock.calls[0] as [unknown, FormData];
    expect(Object.fromEntries(submitted)).toMatchObject({ mode: "signin", email: "inspector@example.com", password: "wrong-horse" });

    // The failed attempt must not make the inspector retype their email.
    expect(screen.getByLabelText("Email")).toHaveValue("inspector@example.com");
    await user.clear(screen.getByLabelText("Password"));
    await user.type(screen.getByLabelText("Password"), "correct-horse");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Check your email");
    expect(authenticate).toHaveBeenCalledTimes(2);
  });
});
