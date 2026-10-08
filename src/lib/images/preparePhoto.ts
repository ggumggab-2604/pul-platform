"use client";
import { PHOTO_TYPES, PHOTO_UPLOAD_BYTES, validatePhotoInput, validatePhotoTransfer, PHOTO_MAX_EDGE, PHOTO_DECODE_PIXELS, PHOTO_FAILURE_MESSAGE, type PhotoPurpose, type PhotoMime } from "./photoPolicy";
export type PhotoOptions = { purpose?: PhotoPurpose; onProcessing?: () => void; maxBytes?: number; allowedTypes?: readonly string[] };
export class PhotoPreparationError extends Error {}
const cache = new WeakMap<File, Map<string, Promise<File>>>();
/** One result per original + policy. Retry reuses bytes without recompressing a result. */
export function preparePhoto(file: File, options: PhotoOptions = {}): Promise<File> {
  const key = JSON.stringify([options.purpose ?? "photo", options.maxBytes ?? PHOTO_UPLOAD_BYTES, options.allowedTypes ?? PHOTO_TYPES]);
  let entries = cache.get(file);
  if (!entries) { entries = new Map(); cache.set(file, entries); }
  const old = entries.get(key); if (old) return old;
  const pending = processPhoto(file, options).catch(error => { entries!.delete(key); throw new PhotoPreparationError(error instanceof Error && /[가-힣]/.test(error.message) ? error.message : PHOTO_FAILURE_MESSAGE); });
  entries.set(key, pending);
  return pending;
}
async function processPhoto(file: File, options: PhotoOptions): Promise<File> {
  validatePhotoInput(file, options.allowedTypes);
  if (!Object.hasOwn(PHOTO_MAX_EDGE, options.purpose ?? "photo")) throw Error("사진 용도를 확인해 주세요.");
  const maxBytes = Math.min(options.maxBytes ?? PHOTO_UPLOAD_BYTES, PHOTO_UPLOAD_BYTES);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw Error("사진 전송 기준을 확인해 주세요.");
  options.onProcessing?.();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const text = (offset: number, n: number) => String.fromCharCode(...bytes.subarray(offset, offset + n));
  const mime = file.type as PhotoMime;
  if (mime === "image/jpeg" ? !(bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255)
    : mime === "image/png" ? !(bytes.length > 24 && bytes[0] === 137 && text(1, 3) === "PNG")
    : !(text(0,4) === "RIFF" && text(8,4) === "WEBP")) throw Error("실제 사진 파일과 형식이 일치하지 않습니다.");
  if (mime === "image/png") {
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const size = view.getUint32(offset), kind = text(offset+4,4);
      if (kind === "acTL") throw Error("움직이는 사진은 지원하지 않습니다. 정지 사진을 선택해 주세요.");
      offset += size + 12;
    }
  }
  if (mime === "image/webp") {
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const size = view.getUint32(offset+4,true), kind = text(offset,4);
      if (kind === "ANIM" || kind === "ANMF") throw Error("움직이는 사진은 지원하지 않습니다. 정지 사진을 선택해 주세요.");
      offset += 8 + size + (size % 2);
    }
  }
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }); }
  catch { throw Error("사진을 읽지 못했습니다. 선택은 유지됩니다. 다른 사진을 선택하거나 다시 시도해 주세요."); }
  const canvas = document.createElement("canvas");
  try {
    const {width, height} = bitmap;
    if (!width || !height || width * height > PHOTO_DECODE_PIXELS) throw Error("사진 해상도가 너무 큽니다. 6,400만 화소 이하 사진을 선택해 주세요.");
    const documentPhoto = options.purpose === "document";
    const longest = Math.max(width,height), edge = PHOTO_MAX_EDGE[options.purpose ?? "photo"];
    if (longest <= edge && file.size <= maxBytes) return file;
    // Yield only for actual resizing/encoding: let the status paint before CPU work.
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const ctx = canvas.getContext("2d"); if (!ctx) throw Error("사진 처리 기능을 사용할 수 없습니다. 다시 시도해 주세요.");
    // Always render from the original, keep alpha and aspect ratio. Never flatten PNG.
    const sizes = [edge, Math.floor(edge * 0.8), Math.floor(edge * 0.625)];
    for (const size of sizes) {
      const scale = Math.min(1,size/longest);
      canvas.width = Math.max(1,Math.round(width*scale)); canvas.height = Math.max(1,Math.round(height*scale));
      ctx.clearRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
      for (const quality of (mime === "image/png" ? [1] : documentPhoto ? [0.94,0.9] : [0.86,0.78])) {
        const blob = await new Promise<Blob>((resolve,reject) => canvas.toBlob(b => b ? resolve(b) : reject(Error("사진 변환에 실패했습니다. 다시 시도해 주세요.")),mime,quality));
        if (blob.type !== mime) throw Error("이 브라우저에서 사진 형식을 변환하지 못했습니다.");
        if (blob.size > maxBytes) continue;
        const extension = mime === "image/jpeg" ? "jpg" : mime === "image/png" ? "png" : "webp";
        const result = new File([blob], file.name.replace(/\.[^.]+$/, "") + "." + extension, {type:mime,lastModified:file.lastModified});
        validatePhotoTransfer(result,maxBytes); return result;
      }

    }
    throw Error("사진을 읽기 좋은 품질로 전송 크기에 맞추지 못했습니다. 선택은 유지됩니다. 다른 사진을 선택하거나 다시 시도해 주세요.");
  } finally { bitmap.close(); canvas.width=canvas.height=0; }
}
/** Prepare before creating metadata/hash/intent, not only before the last fetch. */
export async function photoUploadForm(file: File, fields: Record<string,string>, options: PhotoOptions = {}) {
  const prepared = await preparePhoto(file,options);
  const form = new FormData();
  for (const [key,value] of Object.entries(fields)) form.set(key,value);
  form.set("file",prepared); return form;
}
