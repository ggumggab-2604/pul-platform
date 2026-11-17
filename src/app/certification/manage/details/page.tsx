import { notFound, redirect } from "next/navigation";
import { saveCertificationDetailsAction } from "@/app/certification/phaseOneActions";
import { CertificationDetailFrame } from "@/components/certification/CertificationDetailFrame";
import { CertificationLocalForm, certificationInput } from "@/components/certification/CertificationLocalForms";
import { courseDetailFields, directoryKeyPattern, jobDetailFields, type DirectoryDetails } from "@/lib/certification/certificationPhaseOne";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export default async function ManageCertificationDetails({ searchParams }: { searchParams: Promise<{ entity?: string | string[]; key?: string | string[] }> }) {
  const { entity, key } = await searchParams;
  if ((entity !== "course" && entity !== "job") || typeof key !== "string" || !directoryKeyPattern.test(key)) notFound();
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect(`/login?next=${encodeURIComponent(`/certification/manage/details?entity=${entity}&key=${key}`)}`);
  const { data } = await context.supabase.rpc("certification_details", { p_entity: entity, p_key: key, p_manage: true });
  const current = data as DirectoryDetails | null;
  const fields = entity === "course" ? courseDetailFields : jobDetailFields;
  return <CertificationDetailFrame title={entity === "course" ? "과정 비용·광고 연결" : "구인 상세·대회·쪽지 연결"}
    back={`/certification/manage?tab=${entity === "course" ? "courses" : "jobs"}&edit=${key}`}>
    {current?.version ? <CertificationLocalForm action={saveCertificationDetailsAction.bind(null, entity, key, current.version)}>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(([name, label]) => {
          const fee = name === "tuition" || name.endsWith("_fee");
          return <label key={name}>{label}{fee ? " (원)" : ""}
            <input name={name} type={name === "activity_date" ? "date" : fee ? "number" : "text"}
              min={fee ? 0 : undefined} max={fee ? 999999999 : undefined} maxLength={160} className={certificationInput} defaultValue={current.details[name]} />
          </label>;
        })}
      </div>
      {entity === "course" ? <label className="block">공통 광고 상세 슬러그
        <input className={certificationInput} name="promotion_slug" maxLength={80} pattern="[a-z0-9][a-z0-9-]{0,79}" defaultValue={current.promotion_slug ?? ""} />
        <span className="text-sm text-pul-muted">공통 배너 관리의 내부 상세 슬러그를 입력하세요. 활성 유료 광고 슬롯과 공개 과정이 연결됩니다.</span>
      </label> : <>
        <label className="block">대회 키 (선택)<input name="event_key" maxLength={64} className={certificationInput} defaultValue={current.event_key ?? ""} /></label>
        <label className="block">담당자의 PUL 쪽지 수신 코드 (선택)
          <input name="contact_user_id" maxLength={36} className={certificationInput} defaultValue={current.contact_user_id ?? ""} />
        </label>
      </>}
    </CertificationLocalForm> : <p role="alert">항목을 열 수 없습니다. 운영 권한과 항목 상태를 확인해 주세요.</p>}
  </CertificationDetailFrame>;
}
