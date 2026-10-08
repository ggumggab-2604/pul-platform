import { PHOTO_MULTIPART_BYTES, validatePhotoTransfer } from "./photoPolicy";
export class PhotoRequestError extends Error {}
export function photoOriginMatches(request: Request) {
  try { const origin = new URL(request.headers.get("origin") ?? "");
    return ["http:","https:"].includes(origin.protocol) && origin.host === request.headers.get("host") && (!request.headers.get("sec-fetch-site") || request.headers.get("sec-fetch-site") === "same-origin");
  } catch { return false; }
}
/** Images always keep 4.2MB multipart. The one mixed route retains its legacy PDF limits. */
export async function readPhotoForm(request: Request, allowLegacyPdf = false): Promise<FormData> {
  const reader = request.body?.getReader();
  if (!reader) throw Error("사진을 선택해 주세요.");
  const cap = allowLegacyPdf ? 6 * 1024 * 1024 : PHOTO_MULTIPART_BYTES;
  const parts: Uint8Array[] = []; let size = 0;
  while (true) {
    const {done,value} = await reader.read(); if (done) break;
    size += value.byteLength;
    if (size > cap) { await reader.cancel(); throw new PhotoRequestError("사진 전송 크기를 초과했습니다."); }
    parts.push(value);
  }
  const body = Buffer.concat(parts);
  try { const form = await new Response(body,{headers:{"Content-Type":request.headers.get("content-type") ?? ""}}).formData();
    const file=form.get("file"); if (!(file instanceof File)) throw Error("사진을 선택해 주세요.");
    if (allowLegacyPdf && file.type === "application/pdf") return form;
    if (size > PHOTO_MULTIPART_BYTES) throw new PhotoRequestError("사진 전송 크기를 초과했습니다.");
    try { validatePhotoTransfer(file); } catch { throw new PhotoRequestError("사진 전송 크기를 초과했습니다."); } return form;
  } finally { body.fill(0); }
}
