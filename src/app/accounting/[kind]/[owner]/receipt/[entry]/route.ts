import { createHash } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { getMessagePhotoService } from "@/lib/messaging/messagePhotoStorage";
import { photoOriginMatches, readPhotoForm } from "@/lib/images/photoRequest";
import { validatePhotoBytes } from "@/lib/images/validatePhotoBytes";
import { isId, isKind } from "@/lib/accounting/model";
import { getAccountingEntry } from "@/lib/accounting/server";

type Props = { params: Promise<{ kind: string; owner: string; entry: string }> };
const bucket = "accounting-receipts";
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const failure = (error: string, status: number) => Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(_request: Request, { params }: Props) {
  const { kind, owner, entry } = await params;
  const auth = await getAuthenticatedSupabaseContext();
  if (!auth || !isKind(kind)) return failure("증빙을 확인할 수 없습니다.", 404);
  const row = await getAccountingEntry(auth.supabase, kind, owner, entry);
  if (!row?.receipt_id || !row.receipt_mime) return failure("증빙을 확인할 수 없습니다.", 404);
  try {
    const stored = await getMessagePhotoService().storage.from(bucket).download(`${kind}/${owner}/${entry}/${row.receipt_id}`);
    if (stored.error || !stored.data ||
      (await getAccountingEntry(auth.supabase, kind, owner, entry))?.receipt_id !== row.receipt_id) {
      return failure("증빙을 확인할 수 없습니다.", 404);
    }
    return new Response(stored.data, { headers: {
      "Cache-Control": "private, no-store",
      "Content-Type": row.receipt_mime,
      "Content-Disposition": row.receipt_mime === "application/pdf" ? 'attachment; filename="receipt.pdf"' : "inline",
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-origin",
    } });
  } catch {
    return failure("증빙을 불러오지 못했습니다.", 503);
  }
}

export async function POST(request: Request, { params }: Props) {
  const { kind, owner, entry } = await params;
  const auth = await getAuthenticatedSupabaseContext();
  if (!photoOriginMatches(request) || !auth || !isKind(kind)) return failure("증빙을 저장할 권한이 필요합니다.", 403);
  const row = await getAccountingEntry(auth.supabase, kind, owner, entry);
  if (!row || row.cancelled) return failure("거래를 찾을 수 없습니다.", 404);
  let form: FormData;
  try { form = await readPhotoForm(request, true); }
  catch { return failure("사진 또는 4MB 이하의 PDF를 확인해 주세요.", 400); }
  const file = form.get("file");
  const requestId = form.get("requestId");
  const version = Number(form.get("version"));
  const reason = String(form.get("reason") ?? "").trim();
  if (!(file instanceof File) || file.size < 1 || file.size > 4000000 || typeof requestId !== "string" ||
    !isId(requestId) || !Number.isSafeInteger(version) || version < 1 || !reason || reason.length > 500) {
    return failure("파일과 변경 사유를 확인해 주세요.", 400);
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  try {
    if (file.type === "application/pdf") {
      if (!/^%PDF-(?:1\.[0-7]|2\.0)/.test(bytes.subarray(0, 8).toString("ascii")) ||
        !/%%EOF\s*$/.test(bytes.subarray(-1024).toString("latin1"))) throw Error();
      const pdf = await PDFDocument.load(bytes, { throwOnInvalidObject: true, updateMetadata: false });
      if (pdf.getPageCount() < 1) throw Error();
    } else {
      await validatePhotoBytes(bytes, file.type, "document");
    }
  } catch { return failure("지원되는 JPG·PNG·WebP 사진 또는 PDF를 선택해 주세요.", 400); }
  const digest = hash(bytes);
  const key = `${kind}/${owner}/${entry}/${requestId}`;
  try {
    const service = getMessagePhotoService();
    const storage = service.storage.from(bucket);
    const upload = await storage.upload(key, bytes, { contentType: file.type, upsert: false });
    if (upload.error) {
      const existing = await storage.download(key);
      if (existing.error || hash(new Uint8Array(await existing.data.arrayBuffer())) !== digest) {
        return failure("증빙 파일을 저장하지 못했습니다.", 409);
      }
    }
    const result = await service.rpc("attach_accounting_receipt", {
      k: kind, o: owner, request_id: requestId, a: auth.userId,
      p: { id: entry, version, reason, receipt_id: requestId, mime: file.type, hash: digest },
    });
    if (result.error) return failure("증빙을 장부에 연결하지 못했습니다.", result.error.code === "42501" ? 403 : 503);
    return Response.json(result.data, { headers: { "Cache-Control": "no-store" } });
  } catch { return failure("증빙 저장 결과를 확인하지 못했습니다. 같은 파일로 다시 시도해 주세요.", 503); }
}

