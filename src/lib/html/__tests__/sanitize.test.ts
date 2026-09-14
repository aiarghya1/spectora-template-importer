import { describe, expect, it } from "vitest";
import { describeChanges, htmlToText, isSignificantChange, sanitizeForRender, sanitizeForStorage } from "../sanitize";

describe("sanitizeForStorage", () => {
  it("keeps allowed formatting and links untouched", () => {
    const input = '<p><strong>Roof</strong> is <em>worn</em>. See <a href="https://www.nachi.org/roof">guide</a>.</p>';
    const result = sanitizeForStorage(input);
    expect(result.html).toBe(input);
    expect(result.changes).toEqual([]);
  });

  it("keeps block structure, lists and tables so lines don't run together", () => {
    const input = "<div>Line one</div><div>Line two</div><ul><li>a</li></ul><table><tbody><tr><td colspan=\"2\">cell</td></tr></tbody></table>";
    const result = sanitizeForStorage(input);
    expect(result.html).toBe(input);
    expect(result.changes).toEqual([]);
  });

  it("keeps safe colour styles and reports unsafe ones", () => {
    const result = sanitizeForStorage('<span style="color: red; position: fixed">Safety</span>');
    expect(result.html).toBe('<span style="color:red">Safety</span>');
    expect(result.changes).toEqual([{ kind: "style_removed", property: "position", count: 1 }]);
  });

  it("drops script content and reports it", () => {
    const result = sanitizeForStorage("Hello<script>alert(1)</script> world");
    expect(result.html).toBe("Hello world");
    expect(result.changes).toContainEqual({ kind: "tag_dropped", tag: "script", count: 1 });
  });

  it("unwraps unsupported tags but keeps their text, and reports each tag", () => {
    const result = sanitizeForStorage('<font color="red">Red</font> <font>two</font> <center>mid</center>');
    expect(htmlToText(result.html)).toBe("Red two mid");
    expect(result.changes).toContainEqual({ kind: "tag_unwrapped", tag: "font", count: 2 });
    expect(result.changes).toContainEqual({ kind: "tag_unwrapped", tag: "center", count: 1 });
  });

  it("reports removed images and videos with their source", () => {
    const result = sanitizeForStorage('See <img src="https://cdn.example/roof.jpg"> and <iframe src="https://youtube.com/embed/x"></iframe>');
    expect(result.html).toBe("See  and ");
    expect(result.changes).toContainEqual({ kind: "media_removed", tag: "img", src: "https://cdn.example/roof.jpg", count: 1 });
    expect(result.changes).toContainEqual({ kind: "media_removed", tag: "iframe", src: "https://youtube.com/embed/x", count: 1 });
    expect(result.changes.every(isSignificantChange)).toBe(true);
  });

  it("removes event handlers and unsafe link schemes", () => {
    const result = sanitizeForStorage('<a href="javascript:alert(1)" onclick="x()">click</a>');
    expect(result.html).not.toMatch(/javascript|onclick/i);
    expect(result.html).toContain("click");
    expect(result.changes).toContainEqual({ kind: "attr_removed", tag: "a", attr: "onclick", count: 1 });
    expect(result.changes).toContainEqual({ kind: "unsafe_link_removed", href: "javascript:alert(1)", count: 1 });
  });

  it("treats obfuscated and protocol-relative links as unsafe", () => {
    const result = sanitizeForStorage('<a href=" JaVaScRiPt:alert(1)">x</a><a href="//evil.example">y</a>');
    expect(result.html).not.toMatch(/javascript|evil/i);
    expect(result.changes.filter((c) => c.kind === "unsafe_link_removed")).toHaveLength(2);
  });

  it("keeps mailto links and normalises CRLF", () => {
    const result = sanitizeForStorage('Line one\r\nLine two <a href="mailto:a@b.co">mail</a>');
    expect(result.html).toBe('Line one\nLine two <a href="mailto:a@b.co">mail</a>');
    expect(result.changes).toEqual([]);
  });

  it("preserves unicode and plain-text characters", () => {
    const input = "Ñandú — 20°F – “quoted” 🏠";
    expect(sanitizeForStorage(input).html).toBe(input);
    expect(htmlToText(sanitizeForStorage("Age < 20 years & older").html)).toBe("Age &lt; 20 years &amp; older");
  });

  it("handles empty input", () => {
    expect(sanitizeForStorage("")).toEqual({ html: "", changes: [] });
  });

  it("describes changes in plain language", () => {
    const { changes } = sanitizeForStorage('<img src="a.jpg"><font>x</font><font>y</font>');
    expect(describeChanges(changes)).toBe(
      "Comment HTML changed: removed image (a.jpg); removed <font> formatting, kept its text ×2.",
    );
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
    expect(sanitizeForRender('<p onmouseover="x()" style="background:url(javascript:1)">t</p>')).toBe("<p>t</p>");
  });
});
