import { redirect } from "next/navigation";
import { reviewOralAction } from "@/app/certification/phaseOneActions";
import { CertificationDetailFrame, certificationLink } from "@/components/certification/CertificationDetailFrame";
import { CertificationLocalForm } from "@/components/certification/CertificationLocalForms";
import type { OralSubmission } from "@/lib/certification/certificationPhaseOne";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export default async function ManageCertificationOral() {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect("/login?next=%2Fcertification%2Fmanage%2Foral");
  const { data, error } = await context.supabase.rpc("certification_oral", { p_manage: true });
  const entries = (data ?? []) as OralSubmission[];
  return <CertificationDetailFrame title="구술 자료 출처 검토" back="/certification/manage">
    <p className="text-sm text-pul-muted">복원 질문의 출처와 공유 범위를 확인하세요. 비공개 문제지·채점 내용을 그대로 옮긴 자료는 숨김을 유지하세요.</p>
    {error ? <p role="alert">자료를 열 수 없습니다. 운영 권한을 확인해 주세요.</p> :
      entries.length === 0 ? <p>검토할 자료가 없습니다.</p> :
      entries.map((entry) => <article key={entry.id} className="space-y-2 rounded-lg border border-pul-border p-4">
        <p className="text-sm font-semibold">{entry.status === "published" ? "공개됨" : entry.status === "hidden" ? "숨김" : "검토 대기"} · {entry.kind === "official" ? "공식 공개자료" : "응시자 복원 질문"}</p>
        <h2 className="whitespace-pre-wrap break-words font-bold">{entry.question}</h2>
        {entry.answer && <div><p className="text-sm font-semibold">회원 등록 답변</p><p className="whitespace-pre-wrap break-words">{entry.answer}</p></div>}
        <p className="whitespace-pre-wrap break-words text-sm text-pul-muted">{entry.source_note}</p>
        {entry.source_url && <a className={certificationLink} href={entry.source_url} target="_blank" rel="noreferrer">출처 열기 (새 창)</a>}
        <CertificationLocalForm action={reviewOralAction.bind(null, entry.id, entry.status !== "published")} label={entry.status === "published" ? "숨기기" : entry.status === "hidden" ? "출처 확인 후 다시 공개" : "출처 확인 후 공개"} />
      </article>)}
  </CertificationDetailFrame>;
}
