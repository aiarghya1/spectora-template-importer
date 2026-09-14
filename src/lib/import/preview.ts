import type { PreparedImport } from "./commit";

type Ready = Extract<PreparedImport, { ok: true }>;
type PreviewTotals = { sections: number; items: number; comments: number; issues: number; columns: number };
export type ImportPreview = Ready & { previewSample: boolean; previewTotals: PreviewTotals };

/** Keep the response below the function payload limit while retaining exact totals. */
export function previewPayload(prepared: Ready, forceSample = false): ImportPreview {
  const previewTotals = {
    sections: prepared.parse.stats.sections,
    items: prepared.parse.stats.items,
    comments: prepared.parse.stats.comments,
    issues: prepared.parse.issues.length,
    columns: prepared.parse.columns.length,
  };
  if (!forceSample && Buffer.byteLength(JSON.stringify(prepared), "utf8") < 2_000_000) {
    return { ...prepared, previewSample: false, previewTotals };
  }

  let itemBudget = 100;
  let commentBudget = 100;
  const sections = prepared.parse.sections.slice(0, 20).map((section) => ({
    ...section,
    items: section.items.slice(0, itemBudget).map((item) => {
      itemBudget--;
      const comments = item.comments.slice(0, commentBudget).map((comment) => {
        commentBudget--;
        return {
          ...comment,
          title: comment.title.slice(0, 300),
          body_html: comment.body_html.slice(0, 1000),
          extras: Object.fromEntries(Object.entries(comment.extras).slice(0, 10).map(([key, value]) => [key, value.slice(0, 200)])),
        };
      });
      return { ...item, comments };
    }),
  }));
  const payload: ImportPreview = {
    ...prepared,
    previewSample: true,
    previewTotals,
    parse: {
      ...prepared.parse,
      sections,
      columns: prepared.parse.columns.slice(0, 100).map((column) => ({
        ...column,
        header: column.header.slice(0, 200),
        extrasKey: column.extrasKey.slice(0, 200),
        note: column.note?.slice(0, 200) ?? null,
      })),
      issues: prepared.parse.issues.slice(0, 100).map((issue) => ({
        ...issue,
        message: issue.message.slice(0, 500),
        detail: { preview: JSON.stringify(issue.detail).slice(0, 1000) },
      })),
    },
  };
  return payload;
}
