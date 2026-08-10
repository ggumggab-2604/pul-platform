export const HALL_OF_FAME_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;

export type HallOfFameEvidenceMimeType =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "application/pdf";

const allowedMimeTypes = new Set<HallOfFameEvidenceMimeType>([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export function isHallOfFameEvidenceMimeType(
  value: string,
): value is HallOfFameEvidenceMimeType {
  return allowedMimeTypes.has(value as HallOfFameEvidenceMimeType);
}

export function normalizeHallOfFameEvidenceContentType(
  value: string | null | undefined,
): HallOfFameEvidenceMimeType | null {
  if (typeof value !== "string") {
    return null;
  }
  const mediaType = value.split(";", 1)[0]?.trim().toLowerCase();
  return mediaType && isHallOfFameEvidenceMimeType(mediaType)
    ? mediaType
    : null;
}

function startsWith(bytes: Uint8Array, signature: readonly number[]) {
  return signature.every((value, index) => bytes[index] === value);
}

export function detectHallOfFameEvidenceMimeType(
  bytes: Uint8Array,
): HallOfFameEvidenceMimeType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }
  if (
    bytes.length >= 12 &&
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return "application/pdf";
  }
  return null;
}

export function validateHallOfFameEvidenceBytes(
  bytes: Uint8Array,
  declaredMimeType: string,
  declaredByteSize: number,
  storageContentType: string | null | undefined,
) {
  if (bytes.byteLength < 1 || bytes.byteLength > HALL_OF_FAME_EVIDENCE_MAX_BYTES) {
    throw new Error("HOF_EVIDENCE_SIZE_INVALID");
  }
  if (bytes.byteLength !== declaredByteSize) {
    throw new Error("HOF_EVIDENCE_SIZE_MISMATCH");
  }
  const normalizedContentType = normalizeHallOfFameEvidenceContentType(
    storageContentType,
  );
  if (!normalizedContentType) {
    throw new Error("HOF_EVIDENCE_CONTENT_TYPE_INVALID");
  }
  if (normalizedContentType !== declaredMimeType) {
    throw new Error("HOF_EVIDENCE_CONTENT_TYPE_MISMATCH");
  }
  const detectedMimeType = detectHallOfFameEvidenceMimeType(bytes);
  if (
    !detectedMimeType ||
    detectedMimeType !== declaredMimeType ||
    detectedMimeType !== normalizedContentType
  ) {
    throw new Error("HOF_EVIDENCE_MIME_MISMATCH");
  }
  return detectedMimeType;
}
