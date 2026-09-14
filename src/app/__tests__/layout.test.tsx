import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import RootLayout, { metadata } from "../layout";

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "font-sans-var" }),
  Geist_Mono: () => ({ variable: "font-mono-var" }),
}));

type Element = ReactElement<{ lang?: string; className?: string; children?: ReactElement<{ className?: string; children?: unknown }> }>;

describe("root layout", () => {
  it("sets the language, fonts and page chrome around the page content", () => {
    const child = <p>page</p>;
    const html = RootLayout({ children: child }) as Element;
    expect(html.type).toBe("html");
    expect(html.props.lang).toBe("en");
    expect(html.props.className).toContain("font-sans-var");
    expect(html.props.className).toContain("font-mono-var");
    const body = html.props.children as ReactElement<{ className: string; children: unknown }>;
    expect(body.type).toBe("body");
    expect(body.props.className).toContain("bg-zinc-50");
    expect(body.props.children).toBe(child);
  });

  it("describes the app", () => {
    expect(metadata).toEqual({
      title: "Template Importer",
      description: "Bring Spectora inspection templates across intact, then edit and copy them.",
    });
  });
});
