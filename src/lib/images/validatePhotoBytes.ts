import "server-only";
import sharp from "sharp";
import { PHOTO_DECODE_PIXELS, PHOTO_TYPES, validatePhotoPixels, validatePhotoTransfer, type PhotoPurpose } from "./photoPolicy";

export class PhotoValidationError extends Error {}
/** Inspect/decode the received bytes, never a client width/height declaration. */
export async function validatePhotoBytes(bytes: Uint8Array, mime: string, purpose: PhotoPurpose) {
  try { validatePhotoTransfer({ size: bytes.byteLength }); } catch(e) { throw new PhotoValidationError((e as Error).message); }
  if (!PHOTO_TYPES.includes(mime as typeof PHOTO_TYPES[number])) throw Error("사진 형식을 확인해 주세요.");
  const image = sharp(Buffer.from(bytes), { limitInputPixels: PHOTO_DECODE_PIXELS, failOn: "warning" });
  try {
    const metadata = await image.metadata();
    const expected = mime === "image/jpeg" ? "jpeg" : mime === "image/png" ? "png" : "webp";
    if (metadata.format !== expected || (metadata.pages ?? 1) !== 1) throw Error("정지 사진 파일과 형식을 확인해 주세요.");
    validatePhotoPixels(metadata.width ?? 0, metadata.height ?? 0, purpose);
    // Decode the full image as well; a readable header alone is insufficient.
    await image.stats();
    return { width: metadata.width!, height: metadata.height!, bytes: bytes.byteLength };
  } catch(e) { throw new PhotoValidationError(e instanceof Error && /[가-힣]/.test(e.message) ? e.message : "사진을 처리하지 못했습니다. 다시 시도해 주세요."); } finally { image.destroy(); }
}
