import sanitizeHtml from "sanitize-html";
import { Parser } from "htmlparser2";

/**
 * Single HTML allowlist for the whole app. Used at import time (store) and at render time
 * (defence in depth). See docs/DECISIONS.md D6 and docs/import-invariants.md rule 3.
 */
const ALLOWED_TAGS = ["p", "br", "b", "strong", "i", "em", "u", "ul", "ol", "li", "a"] as const;
const ALLOWED_ATTRS: Record<string, readonly string[]> = { a: ["href"] };
const ALLOWED_SCHEMES = ["http", "https", "mailto"] as const;
// Content inside these is dropped entirely by sanitize-html, not just unwrapped.
const NON_TEXT_TAGS = new Set(["script", "style", "textarea", "option", "noscript"]);

export type SanitizeChange =
  | { kind: "tag_unwrapped"; tag: string; count: number } // tag removed, inner text kept
  | { kind: "tag_dropped"; tag: string; count: number } // tag and its content removed
  | { kind: "attr_removed"; tag: string; attr: string; count: number }
  | { kind: "unsafe_link_removed"; href: string; count: number };

export interface SanitizeResult {
  html: string;
  changes: SanitizeChange[];
}

const allowedTagSet = new Set<string>(ALLOWED_TAGS);

function hasUnsafeScheme(href: string): boolean {
  const trimmed = href.trim();
  const match = /^([a-z][a-z0-9+.-]*):/i.exec(trimmed);
  // Relative links and fragments have no scheme; sanitize-html keeps them.
  if (!match) return trimmed.startsWith("//");
  return !(ALLOWED_SCHEMES as readonly string[]).includes(match[1].toLowerCase());
}

/** Walks the input with the same parser family sanitize-html uses and records what will change. */
function detectChanges(input: string): SanitizeChange[] {
  const counts = new Map<string, SanitizeChange>();
  const bump = (key: string, make: () => SanitizeChange) => {
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, make());
  };

  const parser = new Parser(
    {
      onopentag(name, attribs) {
        if (!allowedTagSet.has(name)) {
          const dropped = NON_TEXT_TAGS.has(name);
          bump(`${dropped ? "drop" : "unwrap"}:${name}`, () =>
            dropped
              ? { kind: "tag_dropped", tag: name, count: 1 }
              : { kind: "tag_unwrapped", tag: name, count: 1 },
          );
          return;
        }
        const allowedAttrs = ALLOWED_ATTRS[name] ?? [];
        for (const [attr, value] of Object.entries(attribs)) {
          if (!allowedAttrs.includes(attr)) {
            bump(`attr:${name}:${attr}`, () => ({ kind: "attr_removed", tag: name, attr, count: 1 }));
          } else if (name === "a" && attr === "href" && hasUnsafeScheme(value)) {
            bump(`href:${value}`, () => ({ kind: "unsafe_link_removed", href: value.slice(0, 200), count: 1 }));
          }
        }
      },
    },
    { decodeEntities: true, lowerCaseTags: true, lowerCaseAttributeNames: true },
  );
  parser.write(input);
  parser.end();
  return [...counts.values()];
}

const baseOptions: sanitizeHtml.IOptions = {
  allowedTags: [...ALLOWED_TAGS],
  allowedAttributes: { a: ["href"] },
  allowedSchemes: [...ALLOWED_SCHEMES],
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
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer nofollow" }),
    },
    allowedAttributes: { a: ["href", "target", "rel"] },
  });
}

/** Plain-text projection, used for search and preservation checks. */
export function htmlToText(html: string): string {
  return sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} });
}
