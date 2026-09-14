/**
 * Zip-bomb guard for .xlsx (which is a zip archive). Reads the central directory and sums the
 * declared uncompressed sizes *before* handing the bytes to SheetJS, which has no inflate limit.
 * Declared sizes can lie, so this is one layer: the upload cap, row cap and function memory limits
 * are the others.
 */
export const MAX_UNCOMPRESSED_BYTES = 60 * 1024 * 1024;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_FILE_SIGNATURE = 0x02014b50;
const EOCD_MIN_SIZE = 22;

/** Total declared uncompressed size, Infinity for zip64/overflow markers, or null if not a readable zip. */
export function zipDeclaredUncompressedSize(bytes: Uint8Array): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const minOffset = Math.max(0, bytes.length - EOCD_MIN_SIZE - 0xffff);

  let eocd = -1;
  for (let offset = bytes.length - EOCD_MIN_SIZE; offset >= minOffset; offset--) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) return null;

  const entries = view.getUint16(eocd + 10, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (entries === 0xffff || directoryOffset === 0xffffffff) return Infinity; // zip64

  let offset = directoryOffset;
  let total = 0;
  for (let i = 0; i < entries; i++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== CENTRAL_FILE_SIGNATURE) return null;
    const uncompressed = view.getUint32(offset + 24, true);
    if (uncompressed === 0xffffffff) return Infinity;
    total += uncompressed;
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return total;
}
