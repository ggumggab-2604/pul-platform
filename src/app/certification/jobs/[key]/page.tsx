import Link from "next/link";
import { notFound } from "next/navigation";
import { CertificationDetailFields, CertificationDetailFrame, certificationLink } from "@/components/certification/CertificationDetailFrame";
import { courseStatusLabels, refereeRoleTypeLabels } from "@/data/certificationData";
import { CertificationDirectoryError, getPublicCertificationJob } from "@/lib/certification/certificationDirectory";
import { getCertificationDateRangeDisplay } from "@/lib/certification/certificationDateDisplay";
import { jobDetailFields, type DirectoryDetails } from "@/lib/certification/certificationPhaseOne";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function CertificationJobDetail({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const client = await createClient();
  const [job, supplemental, viewer] = await Promise.all([
    getPublicCertificationJob(client, key).catch((error: unknown) => {
      if (error instanceof CertificationDirectoryError && error.code === "notFound") notFound();
      throw error;
    }),
    client.rpc("certification_details", { p_entity: "job", p_key: key, p_manage: false }),
    getAuthenticatedSupabaseContext(),
  ]);
  const data = supplemental.data as DirectoryDetails | null;
  const details = data?.details ?? {};
  const href = `/certification/jobs/${encodeURIComponent(key)}`;
  const compose = `/messages/new?${new URLSearchParams({ certificationKind: "job", certificationKey: key })}`;
  const range = getCertificationDateRangeDisplay(job.applicationStartsOn, job.applicationEndsOn, { range: "모집 기간", start: "모집 시작", end: "모집 종료" });
  return <CertificationDetailFrame title={job.title} back="/certification?tab=activity">
    <p className="text-sm font-bold text-pul-point">{refereeRoleTypeLabels[job.roleType]} · {courseStatusLabels[job.status]}</p>
    <CertificationDetailFields fields={[
      ...jobDetailFields.map(([key, label]) => [label, details[key]] as const),
      ["일정 안내", job.schedule], ["지역", job.region], ["활동비", job.payInfo], ["모집 기관", job.organizerName], ["모집 기관 유형", job.organizerType],
      ...(range ? [[range.label, range.value] as const] : []),
      ["업무", job.role], ["지원 조건", job.condition],
    ]} />
    <div className="flex flex-wrap gap-x-4">
      {data?.event_key && <Link className={certificationLink} href={`/events/${encodeURIComponent(data.event_key)}`}>관련 대회 상세</Link>}
      {data?.can_contact && <Link className={certificationLink} prefetch={false} href={viewer ? compose : `/login?next=${encodeURIComponent(href)}`}>
        {viewer ? "모집 담당자에게 쪽지" : "로그인하고 담당자에게 쪽지 보내기"}
      </Link>}
      {(job.applicationUrl || job.officialUrl) && <a className={certificationLink} href={job.applicationUrl ?? job.officialUrl ?? undefined}>공식 모집 페이지</a>}
    </div>
  </CertificationDetailFrame>;
}
