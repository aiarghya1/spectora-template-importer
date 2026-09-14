/** Temporary, private source files used only to bypass the function body limit. */
export const STAGING_BUCKET = "template-import-staging";

export function stagedPath(userId: string, filename: string, nonce: string): string {
  const extension = filename.toLowerCase().match(/\.(xlsx|xls|csv)$/)?.[1];
  if (!extension) throw new Error("Choose an .xlsx, .xls or .csv file.");
  return `${userId}/${nonce}.${extension}`;
}

export function validStagedPath(path: string, userId: string, filename: string): boolean {
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(xlsx|xls|csv)$/.test(path)) return false;
  if (path.split("/")[0] !== userId) return false;
  if (filename.includes("/") || filename.includes("\\") || /[\x00-\x1f\x7f]/.test(filename) || filename.length > 255) return false;
  return path.slice(path.lastIndexOf(".")) === filename.toLowerCase().slice(filename.lastIndexOf("."));
}

/** Supabase recommends the direct Storage hostname for resumable uploads. */
export function resumableEndpoint(projectUrl: string): string {
  const url = new URL(projectUrl);
  if (url.hostname.endsWith(".supabase.co")) url.hostname = url.hostname.replace(/\.supabase\.co$/, ".storage.supabase.co");
  url.pathname = "/storage/v1/upload/resumable";
  url.search = "";
  url.hash = "";
  return url.toString();
}
