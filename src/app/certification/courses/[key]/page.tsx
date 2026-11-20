import { courseCategoryLabels, courseMethodLabels, courseStatusLabels } from "@/data/certificationData";
import { getCertificationDateRangeDisplay } from "@/lib/certification/certificationDateDisplay";
import { notFound } from "next/navigation";
import Link from "next/link";
import { Container } from "@/components/ui/Container";
import {
  certificationCourseQualification,
  certificationCourseTotal,
  formatCertificationCourseFee,
  safeCertificationCourseReturn,
} from "@/lib/certification/certificationCourseComparison";
import { CertificationDirectoryError, getPublicCertificationCourse, readCertificationCourseSummary } from "@/lib/certification/certificationDirectory";
import type { DirectoryDetails } from "@/lib/certification/certificationPhaseOne";
import { createClient } from "@/lib/supabase/server";

export default async function CertificationCourseDetail({ params, searchParams }: {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const [{ key }, { returnTo }] = await Promise.all([params, searchParams]);
  const client = await createClient();
  const [course, supplemental] = await Promise.all([
    getPublicCertificationCourse(client, key).catch((error: unknown) => {
      if (error instanceof CertificationDirectoryError && error.code === "notFound") notFound();
      throw error;
    }),
    client.rpc("certification_details", { p_entity: "course", p_key: key, p_manage: false }),
  ]);
  if (supplemental.error) throw new Error("교육과정 상세를 불러오지 못했습니다.", { cause: supplemental.error });
  if (supplemental.data === null) notFound();
  const details = (supplemental.data as DirectoryDetails).details;
  const summary = readCertificationCourseSummary(details);
  const fees = [["수강료", summary.tuition], ["검정료", summary.examFee], ["발급비", summary.issueFee]] as const;
  const total = certificationCourseTotal(summary);
  const range = getCertificationDateRangeDisplay(course.startsOn, course.endsOn, {
    range: "교육 일정", start: "시작일", end: "종료일",
  });
  const destination = new URL(course.applicationUrl ?? course.officialUrl);
  const overview = [
    ["주관기관", course.provider],
    ["자격명·급수", certificationCourseQualification(course, summary)],
    ["교육 일정", range?.value ?? course.schedule],
    ["모집 상태", courseStatusLabels[course.status]],
    ["총비용", total],
    ["신청처", destination.host],
  ];

  return (
    <Container className="max-w-5xl space-y-3 px-3 py-5 sm:py-8">
      <nav aria-label="교육과정 상세 경로" className="flex flex-wrap items-center gap-2 text-sm text-pul-muted">
        <Link href={safeCertificationCourseReturn(returnTo)} className="inline-flex min-h-11 items-center rounded-lg border border-pul-point/40 bg-white px-3 font-bold text-pul-deep hover:bg-pul-light">목록으로</Link>
        <span>자격증·심판 / 민간 교육과정</span>
      </nav>
      <section aria-labelledby="course-detail-title" className="space-y-4 rounded-xl border border-pul-border bg-pul-light/45 p-4 sm:p-6">
        <h1 id="course-detail-title" className="text-2xl font-extrabold tracking-tight text-pul-deep [overflow-wrap:anywhere] sm:text-3xl">{course.title}</h1>
        <dl className="grid sm:grid-cols-3 sm:gap-x-4 sm:gap-y-2">
          {overview.map(([label, value]) => (
            <div key={label} className="grid min-w-0 grid-cols-[5rem_minmax(0,1fr)] gap-2 border-t border-pul-border py-2 sm:block">
              <dt className="text-sm text-pul-muted">{label}</dt>
              <dd className="text-sm font-bold break-keep [overflow-wrap:anywhere] sm:mt-1 sm:text-base">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <a
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-pul-point px-4 text-center text-sm font-bold text-white hover:bg-pul-deep sm:w-auto"
            href={destination.href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {course.applicationUrl ? "교육 신청 사이트 열기" : "교육기관 사이트에서 확인"}
          </a>
          <span className="text-xs text-pul-muted">새 탭에서 열림</span>
        </div>
      </section>
      <div className="grid items-start gap-3 sm:grid-cols-2">
        <section aria-labelledby="course-identification" className="min-w-0 space-y-3 rounded-xl border border-pul-border bg-white p-4 sm:p-5">
          <h2 id="course-identification" className="text-lg font-extrabold text-pul-deep">과정 정보</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div className="min-w-0 rounded-lg border border-pul-border p-2">
              <dt className="text-pul-muted">발급기관</dt><dd className="font-semibold [overflow-wrap:anywhere]">{details?.issuer || "발급기관 정보 없음"}</dd>
            </div>
            <div className="min-w-0 rounded-lg border border-pul-border p-2">
              <dt className="text-pul-muted">등록번호</dt><dd className="font-semibold [overflow-wrap:anywhere]">{details?.registration || "등록번호 정보 없음"}</dd>
            </div>
          </dl>
          <p className="text-sm text-pul-muted">{courseCategoryLabels[course.category]} · {course.region} · {courseMethodLabels[course.method]}</p>
          {range && course.schedule !== range.value && <p className="whitespace-pre-wrap text-sm text-pul-muted [overflow-wrap:anywhere]">{course.schedule}</p>}
          <p className="text-sm [overflow-wrap:anywhere]">교육 대상 · {course.target}</p>
          <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{course.description}</p>
        </section>
        <section aria-labelledby="course-fees" className="min-w-0 space-y-3 rounded-xl border border-pul-border bg-white p-4 sm:p-5">
          <h2 id="course-fees" className="text-lg font-extrabold text-pul-deep">비용 내역</h2>
          <dl className="space-y-1.5 text-sm">
            {fees.map(([label, fee]) => (
              <div key={label} className="flex justify-between gap-2 border-b border-pul-border pb-1.5">
                <dt>{label}</dt><dd className="font-semibold tabular-nums">{fee === null ? "미등록" : formatCertificationCourseFee(fee)}</dd>
              </div>
            ))}
            <div className="flex justify-between gap-2 rounded-lg bg-pul-light p-2 font-extrabold text-pul-deep">
              <dt>총비용</dt><dd className="text-right tabular-nums">{total}</dd>
            </div>
          </dl>
          <p className="text-sm text-pul-muted [overflow-wrap:anywhere]">기존 비용 안내 · {course.price}</p>
        </section>
      </div>
      <p className="text-sm text-pul-muted">수강 신청·결제·환불은 외부 교육기관 또는 판매처에서 진행합니다.</p>
    </Container>
  );
}
