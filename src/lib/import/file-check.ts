/**
 * First gate for uploads, before any parsing. Pure: bytes + filename in, verdict out.
 * Checks size and real content type (magic bytes), not just the extension.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // Vercel function body limit is 4.5 MB

export type FileKind = "xlsx" | "xls" | "csv";

export type FileCheckError =
  | "empty_file"
  | "too_large"
  | "plain_text_export"
  | "unsupported_type"
  | "content_mismatch";

export type FileCheckResult =
  | { ok: true; kind: FileKind }
  | { ok: false; code: FileCheckError; message: string };

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const OLE_MAGIC = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

const startsWith = (bytes: Uint8Array, magic: number[]) =>
  bytes.length >= magic.length && magic.every((b, i) => bytes[i] === b);

function looksLikeText(bytes: Uint8Array): boolean {
  const sample = bytes.subarray(0, 64 * 1024);
  if (sample.includes(0)) return false;
  try {
    // stream: true tolerates a multi-byte character cut off at the end of a partial sample.
    new TextDecoder("utf-8", { fatal: true }).decode(sample, { stream: sample.length < bytes.length });
    return true;
  } catch {
    return false;
  }
}

function sniff(bytes: Uint8Array): FileKind | null {
  if (startsWith(bytes, ZIP_MAGIC)) return "xlsx";
  if (startsWith(bytes, OLE_MAGIC)) return "xls";
  if (looksLikeText(bytes)) return "csv";
  return null;
}

export function checkUpload(filename: string, bytes: Uint8Array): FileCheckResult {
  if (bytes.length === 0) {
    return { ok: false, code: "empty_file", message: "The file is empty." };
  }
  if (bytes.length > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      code: "too_large",
      message: `The file is ${(bytes.length / 1024 / 1024).toFixed(1)} MB; the limit is 4 MB.`,
    };
  }

  const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
  if (ext === "txt") {
    return {
      ok: false,
      code: "plain_text_export",
      message:
        "This looks like Spectora's plain-text export. Please use Export to spreadsheet → Export HTML Text instead.",
    };
  }
  if (!["xlsx", "xls", "csv"].includes(ext)) {
    return {
      ok: false,
      code: "unsupported_type",
      message: `".${ext || "?"}" files aren't supported. Upload the Spectora HTML-text spreadsheet (.xlsx or .csv).`,
    };
  }

  const detected = sniff(bytes);
  if (detected !== ext) {
    return {
      ok: false,
      code: "content_mismatch",
      message: `The file is named .${ext} but its contents ${detected ? `look like ${detected}` : "aren't a spreadsheet"}. It may be corrupt or renamed.`,
    };
  }
  return { ok: true, kind: detected };
}
