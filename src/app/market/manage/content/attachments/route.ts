// Transitional release: keep reads available while closing the old photo completion path.
// Replace with the final route only after verified-photo SQL is active.
export async function POST() {
  return Response.json({ code: "preparation_unavailable", stage: "prepare", message: "사진 업로드를 잠시 준비하고 있습니다. 작성 내용과 선택 사진을 유지하고 잠시 후 다시 시도해 주세요." }, { status: 503, headers: { "Cache-Control": "no-store", "Retry-After": "120" } });
}
