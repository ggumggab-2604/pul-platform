import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CourseReportActions } from "@/components/courses/manage/CourseReportActions";
import { Container } from "@/components/ui/Container";
import { courseInformationCorrectionTargetLabels } from "@/lib/courses/courseDirectory";
import {
  CourseManagementError,
  getCourseInformationReportForManagement,
  listCourseInformationReportsForManagement,
  type CourseInformationReportStatus,
} from "@/lib/courses/courseManagement";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "골프장 정보 제보 관리" };

type Search = { status?: string | string[]; report?: string | string[] };
const statusLabels: Record<CourseInformationReportStatus, string> = { received: "확인 필요", handled: "처리 완료", dismissed: "적용 없음" };

function one(value: string | string[] | undefined) { return typeof value === "string" ? value : ""; }

export default async function CourseReportManagementRoute({ searchParams }: { searchParams: Promise<Search> }) {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect("/login?next=/courses/manage/reports");
  const search = await searchParams;
  const selectedStatus = one(search.status) as CourseInformationReportStatus;
  const reportId = one(search.report);
  let page;
  let selected = null;
  try {
    page = await listCourseInformationReportsForManagement(
      context.supabase,
      (["received", "handled", "dismissed"] as const).includes(selectedStatus) ? selectedStatus : undefined,
      50,
      0,
    );
    if (reportId) selected = await getCourseInformationReportForManagement(context.supabase, reportId);
  } catch (error) {
    return <ReportAccessError loadFailed={!(error instanceof CourseManagementError && error.code === "permission")} />;
  }
  const receivedCount = page.items.filter((item) => item.reportStatus === "received").length;
  return (
    <div className="min-h-screen bg-pul-page">
      <Container className="max-w-7xl px-3 py-6 pb-20 sm:py-10">
        <header className="rounded-2xl border border-pul-border bg-white p-5 sm:p-7">
          <nav aria-label="경로" className="flex flex-wrap items-center gap-2 text-sm text-pul-muted"><Link href="/manage" className="font-bold hover:text-pul-point">운영 관리</Link><span aria-hidden="true">›</span><Link href="/courses/manage" className="font-bold hover:text-pul-point">골프장</Link><span aria-hidden="true">›</span><span>정보 제보</span></nav>
          <h1 className="mt-3 text-2xl font-black text-foreground sm:text-3xl">골프장 정보 제보</h1>
          <p className="mt-2 text-base leading-7 text-pul-muted">회원 제보를 확인하고, 필요한 골프장 수정은 별도 화면에서 반영한 뒤 간단히 처리하세요.</p>
          <p className="mt-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-sm font-black text-amber-900">현재 목록의 확인 필요 {receivedCount}건</p>
        </header>

        <form action="/courses/manage/reports" method="get" className="mt-5 flex flex-wrap items-end gap-3 rounded-2xl border border-pul-border bg-white p-4">
          <label className="font-bold text-foreground">처리 상태<select name="status" defaultValue={selectedStatus} className="mt-2 block min-h-12 min-w-44 rounded-xl border border-pul-border px-3 text-base"><option value="">전체</option><option value="received">확인 필요</option><option value="handled">처리 완료</option><option value="dismissed">적용 없음</option></select></label>
          <button type="submit" className="min-h-12 rounded-xl bg-pul-point px-5 font-black text-white">필터 적용</button>
        </form>

        <div className="mt-5 grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(300px,0.85fr)_minmax(0,1.35fr)]">
          <section className="rounded-2xl border border-pul-border bg-white p-4 sm:p-5" aria-labelledby="course-report-list-title">
            <div className="flex items-baseline justify-between gap-3"><h2 id="course-report-list-title" className="text-xl font-black text-foreground">제보 목록</h2><span className="text-sm text-pul-muted">전체 {page.total}건</span></div>
            {page.items.length === 0 ? <p className="mt-5 rounded-xl border border-dashed border-pul-border p-6 text-center text-pul-muted">현재 확인할 골프장 정보 제보가 없습니다.</p> : <ul className="mt-4 space-y-2">{page.items.map((report) => {
              const query = new URLSearchParams();
              if (selectedStatus) query.set("status", selectedStatus);
              query.set("report", report.reportId);
              const reportKind = report.reportType === "new_course"
                ? "새 골프장"
                : `정보 정정 · ${courseInformationCorrectionTargetLabels[report.correctionTarget!]}`;
              return <li key={report.reportId}><Link href={`/courses/manage/reports?${query}`} aria-current={selected?.reportId === report.reportId ? "true" : undefined} className={`block min-h-12 rounded-xl border p-3 ${selected?.reportId === report.reportId ? "border-pul-point bg-pul-light" : "border-pul-border bg-white hover:bg-slate-50"}`}><span className="block break-words font-black text-foreground">{report.courseName}</span><span className="mt-1 block text-xs text-pul-muted">{reportKind} · {statusLabels[report.reportStatus]} · {new Date(report.createdAt).toLocaleDateString("ko-KR")}</span></Link></li>;
            })}</ul>}
          </section>

          <section className="min-w-0 rounded-2xl border border-pul-border bg-white p-4 sm:p-6" aria-labelledby="course-report-detail-title">
            {!selected ? <div className="py-10 text-center"><h2 id="course-report-detail-title" className="text-xl font-black text-foreground">제보 상세</h2><p className="mt-2 text-pul-muted">왼쪽 목록에서 확인할 제보를 선택하세요.</p></div> : <ReportDetail report={selected} />}
          </section>
        </div>
      </Container>
    </div>
  );
}

function ReportDetail({ report }: { report: Awaited<ReturnType<typeof getCourseInformationReportForManagement>> }) {
  return <><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="course-report-detail-title" className="text-xl font-black text-foreground">{report.courseName}</h2><p className="mt-1 text-sm text-pul-muted">{report.reportType === "new_course" ? "새 골프장 제보" : "기존 정보 정정"} · {new Date(report.createdAt).toLocaleString("ko-KR")}</p></div><span className="rounded-full bg-pul-light px-3 py-1 text-sm font-black text-pul-deep">{statusLabels[report.reportStatus]}</span></div>
    <dl className="mt-5 grid gap-4 sm:grid-cols-2">{report.correctionTarget ? <Detail label="수정 대상" value={courseInformationCorrectionTargetLabels[report.correctionTarget]} /> : null}<Detail label="지역·위치" value={[report.region, report.locationDescription].filter(Boolean).join(" · ") || "정보 없음"} /><Detail label="알고 있는 운영 정보" value={report.operationDetails ?? "별도 내용 없음"} /></dl>
    <div className="mt-5 rounded-xl bg-slate-50 p-4"><h3 className="font-black text-foreground">제보 내용</h3><p className="mt-2 whitespace-pre-wrap break-words text-base leading-7 text-foreground">{report.reportBody}</p></div>
    {report.targetCourse ? <div className="mt-5 rounded-xl border border-pul-border p-4"><h3 className="font-black text-foreground">현재 대상 골프장</h3><p className="mt-2 text-sm leading-6 text-pul-muted">{report.targetCourse.name} · {report.targetCourse.address} · {report.targetCourse.courseStatus === "active" ? "공개" : "숨김"}</p><Link href={`/courses/manage/${encodeURIComponent(report.targetCourse.courseKey)}`} className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-pul-border px-4 font-bold text-pul-deep">이 골프장 수정하기</Link></div> : null}
    <CourseReportActions report={report} />
  </>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div><dt className="text-sm font-bold text-pul-muted">{label}</dt><dd className="mt-1 break-words text-base leading-7 text-foreground">{value}</dd></div>; }

function ReportAccessError({ loadFailed }: { loadFailed: boolean }) { return <div className="min-h-screen bg-pul-page"><Container className="max-w-3xl px-3 py-12"><div className="rounded-2xl border border-pul-border bg-white p-7 text-center"><h1 className="text-2xl font-black text-foreground">{loadFailed ? "제보 정보를 불러오지 못했습니다." : "골프장 제보 조회 권한이 없습니다."}</h1><p className="mt-2 leading-7 text-pul-muted">{loadFailed ? "잠시 후 다시 시도해 주세요." : "이 화면은 active 플랫폼 운영자만 이용할 수 있습니다."}</p><Link href="/manage" className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-pul-deep px-5 font-bold text-white">운영 관리로 돌아가기</Link></div></Container></div>; }
