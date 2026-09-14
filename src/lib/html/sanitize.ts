import sanitizeHtml from "sanitize-html";
import { Parser } from "htmlparser2";

/**
 * Single HTML allowlist for the whole app. Used at import time (store) and at render time
 * (defence in depth). See docs/DECISIONS.md D6 and docs/import-invariants.md rule 3.
 *
 * The list is deliberately generous about *structure and emphasis* (blocks, lists, tables, colour)
 * because inspectors tune those for years, and strict about anything executable or external.
 */
const ALLOWED_TAGS = [
  "p", "br", "div", "span", "blockquote", "hr",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "b", "strong", "i", "em", "u", "s", "strike", "sub", "sup",
  "ul", "ol", "li", "a",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td",
];
const ALLOWED_ATTRS: Record<string, string[]> = {
  "*": ["style"],
  a: ["href", "style"],
  td: ["colspan", "rowspan", "style"],
  th: ["colspan", "rowspan", "style"],
};
const COLOR = [
  /^#[0-9a-f]{3,8}$/i,
  /^rgba?\(\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*,\s*\d{1,3}%?\s*(,\s*(0|1|0?\.\d+)\s*)?\)$/i,
  /^[a-z]{3,20}$/i,
];
const ALLOWED_STYLES: Record<string, RegExp[]> = {
  color: COLOR,
  "background-color": COLOR,
  "text-align": [/^(left|right|center|justify)$/i],
  "font-weight": [/^(normal|bold|[1-9]00)$/i],
  "font-style": [/^(normal|italic)$/i],
  "text-decoration": [/^(none|underline|line-through)$/i],
};
const ALLOWED_SCHEMES = ["http", "https", "mailto"];
// Content inside these is dropped entirely by sanitize-html, not just unwrapped.
const NON_TEXT_TAGS = new Set(["script", "style", "textarea", "option", "noscript"]);
// External media: removed, but we record where it pointed so the user can see what was lost.
const MEDIA_TAGS = new Set(["img", "iframe", "video", "audio", "source", "embed", "object", "picture"]);

export type SanitizeChange =
  | { kind: "tag_unwrapped"; tag: string; count: number } // tag removed, inner text kept
  | { kind: "tag_dropped"; tag: string; count: number } // tag and its content removed
  | { kind: "media_removed"; tag: string; src: string; count: number }
  | { kind: "attr_removed"; tag: string; attr: string; count: number }
  | { kind: "style_removed"; property: string; count: number }
  | { kind: "unsafe_link_removed"; href: string; count: number };

export interface SanitizeResult {
  html: string;
  changes: SanitizeChange[];
}

const allowedTagSet = new Set(ALLOWED_TAGS);

function hasUnsafeScheme(href: string): boolean {
  const trimmed = href.trim();
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
  // Relative links and fragments have no scheme; sanitize-html keeps them.
  if (!match) return trimmed.startsWith("//");
  return !ALLOWED_SCHEMES.includes(match[1].toLowerCase());
}

/** Walks the input with the same parser family sanitize-html uses and records what will change. */
function detectChanges(input: string): SanitizeChange[] {
  const changes = new Map<string, SanitizeChange>();
  const bump = (key: string, make: () => SanitizeChange) => {
    const existing = changes.get(key);
    if (existing) existing.count += 1;
    else changes.set(key, make());
  };

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        if (MEDIA_TAGS.has(name)) {
          const src = (attribs.src ?? attribs.data ?? attribs.srcset ?? "").slice(0, 500);
          bump(`media:${name}:${src}`, () => ({ kind: "media_removed", tag: name, src, count: 1 }));
          return;
        }
        if (!allowedTagSet.has(name)) {
          const dropped = NON_TEXT_TAGS.has(name);
          bump(`${dropped ? "drop" : "unwrap"}:${name}`, () =>
            dropped
              ? { kind: "tag_dropped", tag: name, count: 1 }
              : { kind: "tag_unwrapped", tag: name, count: 1 },
          );
          return;
        }
        const allowedAttrs = ALLOWED_ATTRS[name] ?? ALLOWED_ATTRS["*"];
        for (const [attr, value] of Object.entries(attribs)) {
          if (!allowedAttrs.includes(attr)) {
            bump(`attr:${name}:${attr}`, () => ({ kind: "attr_removed", tag: name, attr, count: 1 }));
          } else if (attr === "href" && hasUnsafeScheme(value)) {
            bump(`href:${value}`, () => ({ kind: "unsafe_link_removed", href: value.slice(0, 200), count: 1 }));
          } else if (attr === "style") {
            for (const decl of value.split(";")) {
              const colon = decl.indexOf(":");
              const property = (colon < 0 ? decl : decl.slice(0, colon)).trim().toLowerCase();
              if (!property) continue;
              const rules = ALLOWED_STYLES[property];
              const val = colon < 0 ? "" : decl.slice(colon + 1).trim();
              if (!rules || !rules.some((r) => r.test(val))) {
                bump(`style:${property}`, () => ({ kind: "style_removed", property, count: 1 }));
              }
            }
          }
        }
      },
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true },
  );
  parser.write(input);
  parser.end();
  return [...changes.values()];
}

const baseOptions: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: ALLOWED_ATTRS,
  allowedStyles: { "*": ALLOWED_STYLES },
  allowedSchemes: ALLOWED_SCHEMES,
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  nonTextTags: [...NON_TEXT_TAGS],
};

/** Import-time sanitisation: returns clean HTML plus every change made, for the import report. */
export function sanitizeForStorage(raw: string): SanitizeResult {
  const input = raw.replace(/\r\n?/g, "\n");
  return { html: sanitizeHtml(input, baseOptions), changes: detectChanges(input) };
}

/** Render-time sanitisation: same allowlist, links open safely in a new tab. */
export function sanitizeForRender(stored: string): string {
  return sanitizeHtml(stored, {
    ...baseOptions,
    allowedAttributes: { ...ALLOWED_ATTRS, a: ["href", "target", "rel", "style"] },
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer nofollow" }),
    },
  });
}

/** Plain-text projection, used for search and preservation checks. */
export function htmlToText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
}

/** Changes that lose content or meaning (vs. purely cosmetic markup). */
export function isSignificantChange(change: SanitizeChange): boolean {
  return (
    change.kind === "media_removed" || change.kind === "tag_dropped" || change.kind === "unsafe_link_removed"
  );
}

/** Human-readable one-liner for the import report. */
export function describeChanges(changes: SanitizeChange[]): string {
  const parts = changes.map((c) => {
    const times = c.count > 1 ? ` ×${c.count}` : "";
    switch (c.kind) {
      case "media_removed":
        return `removed ${c.tag === "img" ? "image" : `embedded ${c.tag}`}${c.src ? ` (${c.src})` : ""}${times}`;
      case "tag_dropped":
        return `removed <${c.tag}> and its contents${times}`;
      case "tag_unwrapped":
        return `removed <${c.tag}> formatting, kept its text${times}`;
      case "attr_removed":
        return `removed ${c.attr} attribute from <${c.tag}>${times}`;
      case "style_removed":
        return `removed unsupported style "${c.property}"${times}`;
      case "unsafe_link_removed":
        return `removed unsafe link "${c.href}"${times}`;
    }
  });
  return `Comment HTML changed: ${parts.join("; ")}.`;
}
