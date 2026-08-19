export const CLUB_MEDIA_MAX_BYTES = 8 * 1024 * 1024;

export type ClubMediaMimeType = "image/jpeg" | "image/png" | "image/webp";

const allowedMimeTypes = new Set<ClubMediaMimeType>([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function normalizedContentType(value: string | null | undefined): string {
  return value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

export function isClubMediaMimeType(value: string): value is ClubMediaMimeType {
  return allowedMimeTypes.has(value as ClubMediaMimeType);
}

export function validateClubMediaFilename(
  filename: string,
  mimeType: ClubMediaMimeType,
): void {
  if (!filename || filename.length > 255 || /[\u0000-\u001f\u007f]/.test(filename)) {
    throw new Error("CLUB_MEDIA_FILENAME_INVALID");
  }
  const extension = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const allowed = mimeType === "image/jpeg" ? new Set(["jpg", "jpeg"]) : mimeType === "image/png" ? new Set(["png"]) : new Set(["webp"]);
  if (!extension || !allowed.has(extension)) {
    throw new Error("CLUB_MEDIA_EXTENSION_MISMATCH");
  }
}

export function validateClubMediaDeclaration(
  mimeType: string,
  byteSize: number,
): ClubMediaMimeType {
  const normalized = normalizedContentType(mimeType);
  if (!isClubMediaMimeType(normalized)) {
    throw new Error("CLUB_MEDIA_MIME_INVALID");
  }
  if (!Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > CLUB_MEDIA_MAX_BYTES) {
    throw new Error("CLUB_MEDIA_SIZE_INVALID");
  }
  return normalized;
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function detectMimeType(bytes: Uint8Array): ClubMediaMimeType | undefined {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  return undefined;
}

export function validateClubMediaBytes(
  bytes: Uint8Array,
  declaredMimeType: string,
  declaredByteSize: number,
  storageContentType: string | null | undefined,
): ClubMediaMimeType {
  const declared = validateClubMediaDeclaration(declaredMimeType, declaredByteSize);
  if (bytes.byteLength !== declaredByteSize) {
    throw new Error("CLUB_MEDIA_SIZE_MISMATCH");
  }
  const stored = normalizedContentType(storageContentType);
  if (!isClubMediaMimeType(stored)) {
    throw new Error("CLUB_MEDIA_CONTENT_TYPE_INVALID");
  }
  if (stored !== declared) {
    throw new Error("CLUB_MEDIA_CONTENT_TYPE_MISMATCH");
  }
  if (detectMimeType(bytes) !== declared) {
    throw new Error("CLUB_MEDIA_MAGIC_MISMATCH");
  }
  return declared;
}
