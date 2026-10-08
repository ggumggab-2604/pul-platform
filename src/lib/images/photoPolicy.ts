/** Upload limits apply to NEW files, never to reading/editing existing assets. */
export const PHOTO_INPUT_BYTES = 32 * 1024 * 1024;
export const PHOTO_UPLOAD_BYTES = 4_000_000;
export const PHOTO_MULTIPART_BYTES = 4_200_000;
// User-approved ceilings. Do not increase or add a per-call override without approval.
export const PHOTO_MAX_EDGE = { photo: 800, document: 2560 } as const;
export const PHOTO_DECODE_PIXELS = 64_000_000;
export type PhotoPurpose = keyof typeof PHOTO_MAX_EDGE;
export const PHOTO_PROCESSING_MESSAGE = "사진을 압축하고 있습니다…";
export const PHOTO_UPLOADING_MESSAGE = "사진을 업로드하고 있습니다…";
export const PHOTO_FAILURE_MESSAGE = "사진을 처리하지 못했습니다. 다시 시도해 주세요.";
export function photoProcessingMessage(index = 1, total = 1) {
  return total > 1 ? `${PHOTO_PROCESSING_MESSAGE} (${index}/${total}장)` : PHOTO_PROCESSING_MESSAGE;
}
export function validatePhotoPixels(width: number, height: number, purpose: PhotoPurpose) {
  if (!Object.hasOwn(PHOTO_MAX_EDGE, purpose) || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 || Math.max(width, height) > PHOTO_MAX_EDGE[purpose])
    throw Error("이미지는 용도별 최대 크기(일반 800px · 안내 2560px) 이하로 처리해야 합니다.");
}
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type PhotoMime = typeof PHOTO_TYPES[number];
export function validatePhotoInput(file: { type: string; size: number; name: string }, allowed: readonly string[] = PHOTO_TYPES) {
  if (!allowed.includes(file.type) || !PHOTO_TYPES.includes(file.type as PhotoMime))
    throw Error("JPG·PNG·WebP 중 이 화면에서 지원하는 사진을 선택해 주세요. HEIC·애니메이션은 지원하지 않습니다.");
  const ext = file.type === "image/jpeg" ? /\.jpe?g$/i : file.type === "image/png" ? /\.png$/i : /\.webp$/i;
  if (!ext.test(file.name) || file.name.length > 200) throw Error("사진 파일 이름과 형식을 확인해 주세요.");
  if (file.size < 1 || file.size > PHOTO_INPUT_BYTES) throw Error("원본 사진은 장당 32MB 이하로 선택해 주세요.");
}
export function validatePhotoTransfer(file: {size: number}, limit = PHOTO_UPLOAD_BYTES) {
  if (!Number.isSafeInteger(file.size) || file.size < 1 || file.size > limit) throw Error("사진 처리 후 전송 크기를 초과했습니다. 선택한 사진을 확인하고 다시 시도해 주세요.");
}
