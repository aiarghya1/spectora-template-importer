/**
 * Browser-only helpers deciding whether a comment can be edited in the visual (Tiptap) editor
 * without losing formatting. Tiptap silently drops markup outside its schema, so anything it
 * can't represent opens in HTML mode instead. Keep RICH_TAGS in sync with the StarterKit config.
 */
const RICH_TAGS = new Set([
  "P", "BR", "STRONG", "B", "EM", "I", "U", "S", "STRIKE", "DEL",
  "UL", "OL", "LI", "A", "BLOCKQUOTE", "HR", "H1", "H2", "H3", "H4", "H5", "H6",
]);

const HAS_TAG = /<[a-z][\s\S]*?>/i;

export function needsHtmlMode(html: string): boolean {
  if (!HAS_TAG.test(html)) return false;
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  for (const el of Array.from(doc.body.querySelectorAll("*"))) {
    if (!RICH_TAGS.has(el.tagName)) return true;
    for (const attr of Array.from(el.attributes)) {
      if (!(el.tagName === "A" && attr.name === "href")) return true;
    }
  }
  return false;
}

/** Plain-text comments carry line breaks as "\n"; the visual editor needs them as <br>. */
export function toEditorHtml(stored: string): string {
  return HAS_TAG.test(stored) ? stored : stored.replace(/\n/g, "<br>");
}
