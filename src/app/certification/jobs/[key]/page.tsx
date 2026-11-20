import Link from "next/link";
import { notFound } from "next/navigation";
import { CertificationDetailFields, CertificationDetailFrame, certificationLink } from "@/components/certification/CertificationDetailFrame";
import { CertificationJobStatusBadge } from "@/components/certification/CertificationJobCard";
import { refereeRoleTypeLabels } from "@/data/certificationData";
import { getCertificationJobActivityDetail } from "@/lib/certification/certificationDirectory";
import { getCertificationDateRangeDisplay } from "@/lib/certification/certificationDateDisplay";
import { certificationInquiryHref, certificationJobFacts, safeCertificationActivityReturn } from "@/lib/certification/certificationJobActivity";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export default async function CertificationJobDetail({ params, searchParams }: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ returnTo?: string | string[]; inquiry?: string | string[] }>;
}) {
  const [{ key }, query, client, viewer] = await Promise.all([params, searchParams, createClient(), getAuthenticatedSupabaseContext()]);
  const data = await getCertificationJobActivityDetail(client, key);
  if (!data) notFound();
  const { job, summary, eventKey, contactName, isOwnContact } = data;
  const back = safeCertificationActivityReturn(query.returnTo);
  const closed = summary.status === "closed";
  const official = job.applicationUrl ?? job.officialUrl;
  const reason = closed ? "모집이 마감되어 쪽지 문의를 받을 수 없습니다."
    : isOwnContact ? "본인이 담당하는 공고에는 쪽지를 보낼 수 없습니다."
    : !contactName ? "쪽지를 받을 수 있는 공고 담당자가 없습니다." : null;
  const range = getCertificationDateRangeDisplay(job.applicationStartsOn, job.applicationEndsOn, {
    range: "모집 기간", start: "모집 시작", end: "모집 종료",
  });

  return <CertificationDetailFrame title={job.title} back={back} wide>
    <div className="flex flex-wrap items-center gap-2 text-sm text-pul-muted">
      <p>모집 역할 · {refereeRoleTypeLabels[summary.role]}</p>
      <CertificationJobStatusBadge status={summary.status} />
    </div>
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
      <section className="space-y-3" aria-labelledby="job-activity-details">
        <h2 id="job-activity-details" className="text-lg font-bold text-pul-deep">활동 정보</h2>
        <CertificationDetailFields fields={[...certificationJobFacts(summary), ["지역", job.region]]} />
      </section>
      <section className="space-y-3 rounded-xl border border-pul-border bg-pul-page p-3 sm:p-4 lg:col-start-2 lg:row-span-2 lg:row-start-1" aria-labelledby="job-actions">
        <h2 id="job-actions" className="text-lg font-bold text-pul-deep">신청과 문의</h2>
        {closed ? <p className="text-sm text-pul-muted">공고의 모집 기간이 끝났습니다.</p>
          : official ? <a href={official} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-pul-point px-3 font-bold text-white hover:bg-pul-deep">
            {job.applicationUrl ? "공식 신청 페이지 열기" : "공식 모집 페이지"} <span aria-hidden="true">↗</span><span className="text-xs font-medium">(새 탭)</span>
          </a> : <p className="text-sm text-pul-muted">공식 모집·신청 주소가 등록되지 않았습니다.</p>}
        <div className="space-y-2 border-t border-pul-border pt-3">
          {contactName && <p className="text-sm text-pul-muted">공고 문의 담당자 · {contactName}</p>}
          {reason ? <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">{reason}</p> : <>
            <Link prefetch={false} href={certificationInquiryHref("job", key, back, !!viewer)} className="flex min-h-11 items-center justify-center rounded-lg border border-pul-border bg-white px-3 font-bold text-pul-point hover:bg-pul-light">
              {viewer && query.inquiry === "1" ? "쪽지 작성 계속" : "쪽지로 문의"}
            </Link>
            {!viewer && <p className="text-sm text-pul-muted">로그인 후 같은 공고에서 쪽지 작성을 이어갈 수 있습니다.</p>}
          </>}
        </div>
      </section>
      <section className="space-y-3" aria-labelledby="job-description">
        <h2 id="job-description" className="text-lg font-bold text-pul-deep">공고 안내</h2>
        <CertificationDetailFields fields={[
          ["일정 안내", job.schedule], ["활동비", job.payInfo], ["모집 기관", job.organizerName], ["모집 기관 유형", job.organizerType],
          ...(range ? [[range.label, range.value] as const] : []),
          ["업무", job.role], ["지원 조건", job.condition],
        ]} />
        {eventKey && <Link className={certificationLink} href={"/events/" + encodeURIComponent(eventKey)}>관련 대회 상세</Link>}
      </section>
    </div>
  </CertificationDetailFrame>;
}
