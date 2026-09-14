import { describe, expect, it } from "vitest";
import { describeChanges, isSignificantChange, sanitizeForStorage, type SanitizeChange } from "../sanitize";

describe("sanitizeForStorage — less common markup", () => {
  it("reports embedded objects, sources and media without a source", () => {
    const { changes } = sanitizeForStorage('<object data="movie.swf"></object><source srcset="roof.webp"><video></video>');
    expect(changes).toEqual([
      { kind: "media_removed", tag: "object", src: "movie.swf", count: 1 },
      { kind: "media_removed", tag: "source", src: "roof.webp", count: 1 },
      { kind: "media_removed", tag: "video", src: "", count: 1 },
    ]);
  });

  it("handles malformed style declarations", () => {
    const { changes } = sanitizeForStorage('<span style="color; ;font-weight:bold">x</span>');
    expect(changes).toEqual([{ kind: "style_removed", property: "color", count: 1 }]);
  });
});

describe("isSignificantChange", () => {
  it.each<[SanitizeChange, boolean]>([
    [{ kind: "media_removed", tag: "img", src: "a", count: 1 }, true],
    [{ kind: "tag_dropped", tag: "script", count: 1 }, true],
    [{ kind: "unsafe_link_removed", href: "javascript:x", count: 1 }, true],
    [{ kind: "tag_unwrapped", tag: "font", count: 1 }, false],
    [{ kind: "attr_removed", tag: "a", attr: "onclick", count: 1 }, false],
    [{ kind: "style_removed", property: "position", count: 1 }, false],
  ])("%j → %s", (change, expected) => {
    expect(isSignificantChange(change)).toBe(expected);
  });
});

describe("describeChanges", () => {
  it("describes every kind of change", () => {
    expect(
      describeChanges([
        { kind: "media_removed", tag: "iframe", src: "", count: 1 },
        { kind: "tag_dropped", tag: "style", count: 2 },
        { kind: "attr_removed", tag: "p", attr: "onclick", count: 1 },
        { kind: "style_removed", property: "position", count: 3 },
        { kind: "unsafe_link_removed", href: "javascript:x", count: 1 },
      ]),
    ).toBe(
      'Comment HTML changed: removed embedded iframe; removed <style> and its contents ×2; removed onclick attribute from <p>; removed unsupported style "position" ×3; removed unsafe link "javascript:x".',
    );
  });
});
