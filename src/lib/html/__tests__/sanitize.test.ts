import { describe, expect, it } from "vitest";
import { htmlToText, sanitizeForRender, sanitizeForStorage } from "../sanitize";

describe("sanitizeForStorage", () => {
  it("keeps allowed formatting and links untouched", () => {
    const input = '<p><strong>Roof</strong> is <em>worn</em>. See <a href="https://www.nachi.org/roof">guide</a>.</p>';
    const result = sanitizeForStorage(input);
    expect(result.html).toBe(input);
    expect(result.changes).toEqual([]);
  });

  it("drops script content and reports it", () => {
    const result = sanitizeForStorage('Hello<script>alert(1)</script> world');
    expect(result.html).toBe("Hello world");
    expect(result.changes).toContainEqual({ kind: "tag_dropped", tag: "script", count: 1 });
  });

  it("unwraps unsupported tags but keeps their text, and reports each tag", () => {
    const result = sanitizeForStorage('<span style="color:red">Red</span> <span>two</span> <table><tr><td>cell</td></tr></table>');
    expect(htmlToText(result.html)).toContain("Red");
    expect(htmlToText(result.html)).toContain("cell");
    expect(result.changes).toContainEqual({ kind: "tag_unwrapped", tag: "span", count: 2 });
    expect(result.changes).toContainEqual({ kind: "tag_unwrapped", tag: "table", count: 1 });
  });

  it("removes event handlers and unsafe link schemes", () => {
    const result = sanitizeForStorage('<a href="javascript:alert(1)" onclick="x()">click</a>');
    expect(result.html).not.toMatch(/javascript|onclick/i);
    expect(result.html).toContain("click");
    expect(result.changes).toContainEqual({ kind: "attr_removed", tag: "a", attr: "onclick", count: 1 });
    expect(result.changes).toContainEqual({ kind: "unsafe_link_removed", href: "javascript:alert(1)", count: 1 });
  });

  it("treats obfuscated schemes as unsafe", () => {
    const result = sanitizeForStorage('<a href=" JaVaScRiPt:alert(1)">x</a><a href="//evil.example">y</a>');
    expect(result.html).not.toMatch(/javascript|evil/i);
    expect(result.changes.filter((c) => c.kind === "unsafe_link_removed")).toHaveLength(2);
  });

  it("keeps mailto links and normalises CRLF", () => {
    const result = sanitizeForStorage('Line one\r\nLine two <a href="mailto:a@b.co">mail</a>');
    expect(result.html).toBe('Line one\nLine two <a href="mailto:a@b.co">mail</a>');
    expect(result.changes).toEqual([]);
  });

  it("preserves unicode and plain text verbatim", () => {
    const input = "Ñandú — 20°F – “quoted” 🏠";
    expect(sanitizeForStorage(input).html).toBe(input);
  });

  it("handles empty input", () => {
    expect(sanitizeForStorage("")).toEqual({ html: "", changes: [] });
  });
});

describe("sanitizeForRender", () => {
  it("adds safe link attributes", () => {
    const html = sanitizeForRender('<a href="https://example.com">x</a>');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it("re-strips anything unsafe that reached storage", () => {
    expect(sanitizeForRender('<img src=x onerror="alert(1)">ok')).toBe("ok");
  });
});
