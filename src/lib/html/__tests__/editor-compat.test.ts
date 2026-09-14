// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { needsHtmlMode, toEditorHtml } from "../editor-compat";

describe("needsHtmlMode", () => {
  it.each([
    ["plain text\nwith lines", false],
    ["<p>Roof is <strong>worn</strong> and <em>old</em></p><ul><li>a</li></ul>", false],
    ['<p>See <a href="https://x.co">the guide</a></p><h2>Next</h2><blockquote>q</blockquote><hr>', false],
    ['<span style="color:red">Safety</span>', true],
    ["<div>block</div>", true],
    ["<table><tbody><tr><td>x</td></tr></tbody></table>", true],
    ["<p>H<sub>2</sub>O</p>", true],
    ['<a href="https://x.co" target="_blank">x</a>', true],
    ['<p style="text-align:center">x</p>', true],
  ])("%j → %s", (html, expected) => {
    expect(needsHtmlMode(html)).toBe(expected);
  });
});

describe("toEditorHtml", () => {
  it("turns plain-text line breaks into <br> and leaves HTML alone", () => {
    expect(toEditorHtml("Line one\nLine two")).toBe("Line one<br>Line two");
    expect(toEditorHtml("<p>a</p>\n<p>b</p>")).toBe("<p>a</p>\n<p>b</p>");
  });
});
