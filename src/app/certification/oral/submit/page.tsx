import { redirect } from "next/navigation";
import { submitOralAction } from "@/app/certification/phaseOneActions";
import { CertificationDetailFrame } from "@/components/certification/CertificationDetailFrame";
import { CertificationLocalForm, certificationInput } from "@/components/certification/CertificationLocalForms";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export default async function SubmitCertificationOral() {
  if (!await getAuthenticatedSupabaseContext()) redirect("/login?next=%2Fcertification%2Foral%2Fsubmit");
  return <CertificationDetailFrame title="새 구술 자료 등록" back="/certification?tab=exam-prep&stage=oral">
    <p className="text-sm leading-6">공개 자료는 원문 링크를, 복원 질문은 응시 연도와 기억을 바탕으로 요약한 범위를 알려 주세요. 비공개 문제지, 채점 내용, 개인정보는 옮기지 마세요.</p>
    <CertificationLocalForm action={submitOralAction} label="출처 확인 요청">
      <label className="block">자료 유형<select className={certificationInput} name="kind">
        <option value="recalled">응시자 복원 질문</option><option value="official">공식 공개자료</option>
      </select></label>
      <label className="block">질문<textarea className={certificationInput} name="question" required minLength={5} maxLength={500} /></label>
      <label className="block">회원 등록 답변 (선택)<textarea className={certificationInput} name="answer" maxLength={1500} /></label>
      <label className="block">출처 설명<textarea className={certificationInput} name="source_note" required minLength={5} maxLength={500} /></label>
      <label className="block">출처 URL (공식 공개자료 필수)<input className={certificationInput} name="source_url" type="url" pattern="https://.*" maxLength={500} /></label>
    </CertificationLocalForm>
  </CertificationDetailFrame>;
}
