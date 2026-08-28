import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Container } from "@/components/ui/Container";
import {
  CourseManagementError,
  listCoursesForManagement,
  type CoursePublicationStatus,
} from "@/lib/courses/courseManagement";
import { courseRegionOptions, courseTypeLabels, type CourseRegion } from "@/lib/courses/courseDirectory";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export const metadata: Metadata = {
  title: "골프장 운영 관리",
  description: "골프장 정보 등록·수정·공개 상태 관리",
};

type Search = { q?: string | string[]; region?: string | string[]; status?: string | string[] };

function one(value: string | string[] | undefined) {
  return typeof value === "string" ? value : "";
}

export default async function CourseManagementRoute({ searchParams }: { searchParams: Promise<Search> }) {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect("/login?next=/courses/manage");
  const search = await searchParams;
  const keyword = one(search.q).trim();
  const region = one(search.region) as CourseRegion;
  const status = one(search.status) as CoursePublicationStatus;
  let page;
  try {
    page = await listCoursesForManagement(
      context.supabase,
      keyword || undefined,
      courseRegionOptions.includes(region) ? region : undefined,
      (["active", "inactive", "removed"] as const).includes(status) ? status : undefined,
      50,
      0,
    );
  } catch (error) {
    return <ManagementAccessError loadFailed={!(error instanceof CourseManagementError && error.code === "permission")} />;
  }
  return (
    <div className="min-h-screen bg-pul-page">
      <Container className="max-w-6xl px-3 py-6 pb-20 sm:py-10">
        <header className="rounded-2xl border border-pul-border bg-white p-5 sm:p-7">
          <nav aria-label="경로" className="flex flex-wrap items-center gap-2 text-sm text-pul-muted"><Link href="/manage" className="font-bold hover:text-pul-point">운영 관리</Link><span aria-hidden="true">›</span><span>골프장</span></nav>
          <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
            <div><h1 className="text-2xl font-black text-foreground sm:text-3xl">골프장 운영 관리</h1><p className="mt-2 text-base leading-7 text-pul-muted">골프장 정보를 직접 확인하고 숨김 상태로 등록한 뒤 공개할 수 있습니다.</p></div>
            <div className="flex flex-wrap gap-2"><Link href="/courses/manage/reports" className="inline-flex min-h-12 items-center rounded-xl border border-pul-point bg-white px-4 font-black text-pul-point">정보 제보 확인</Link><Link href="/courses/manage/new" className="inline-flex min-h-12 items-center rounded-xl bg-pul-deep px-4 font-black text-white">새 골프장 등록</Link></div>
          </div>
        </header>

        <form action="/courses/manage" method="get" className="mt-5 grid gap-3 rounded-2xl border border-pul-border bg-white p-4 sm:grid-cols-[minmax(0,1fr)_160px_160px_auto] sm:p-5">
          <label className="font-bold text-foreground">검색<span className="sr-only"> (골프장명, 지역, 주소)</span><input name="q" defaultValue={keyword} maxLength={100} placeholder="골프장명·주소 검색" className="mt-2 min-h-12 w-full rounded-xl border border-pul-border px-3 text-base" /></label>
          <label className="font-bold text-foreground">지역<select name="region" defaultValue={region} className="mt-2 min-h-12 w-full rounded-xl border border-pul-border px-3 text-base"><option value="">전체</option>{courseRegionOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label className="font-bold text-foreground">공개 상태<select name="status" defaultValue={status} className="mt-2 min-h-12 w-full rounded-xl border border-pul-border px-3 text-base"><option value="">전체</option><option value="active">공개</option><option value="inactive">숨김</option><option value="removed">제거</option></select></label>
          <button type="submit" className="min-h-12 self-end rounded-xl bg-pul-point px-5 font-black text-white">검색</button>
        </form>

        <section className="mt-5 rounded-2xl border border-pul-border bg-white p-4 sm:p-6" aria-labelledby="managed-course-list-title">
          <div className="flex items-baseline justify-between gap-3"><h2 id="managed-course-list-title" className="text-xl font-black text-foreground">골프장 목록</h2><p className="text-sm text-pul-muted">전체 {page.total}곳</p></div>
          {page.items.length === 0 ? <p className="mt-5 rounded-xl border border-dashed border-pul-border p-7 text-center text-pul-muted">조건에 맞는 골프장이 없습니다. 필요한 경우 새 골프장을 숨김 상태로 등록하세요.</p> : <ul className="mt-4 grid gap-3 sm:grid-cols-2">{page.items.map((course) => <li key={course.courseKey} className="min-w-0 rounded-xl border border-pul-border p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h3 className="break-words text-lg font-black text-foreground">{course.name}</h3><p className="mt-1 text-sm text-pul-muted">{course.region} {course.city} · {course.holes}홀 · {courseTypeLabels[course.courseType]}</p></div><span className={`shrink-0 rounded-full px-3 py-1 text-xs font-black ${course.courseStatus === "active" ? "bg-emerald-100 text-emerald-800" : course.courseStatus === "inactive" ? "bg-slate-100 text-slate-700" : "bg-red-100 text-red-800"}`}>{course.courseStatus === "active" ? "공개" : course.courseStatus === "inactive" ? "숨김" : "제거"}</span></div><p className="mt-3 line-clamp-2 text-sm leading-6 text-pul-muted">{course.address}</p><div className="mt-4 flex items-center justify-between gap-3"><span className="text-xs text-pul-muted">{new Date(course.updatedAt).toLocaleDateString("ko-KR")} 수정</span><Link href={`/courses/manage/${encodeURIComponent(course.courseKey)}`} className="inline-flex min-h-11 items-center rounded-lg border border-pul-border px-4 font-bold text-pul-deep">수정</Link></div></li>)}</ul>}
        </section>
      </Container>
    </div>
  );
}

function ManagementAccessError({ loadFailed }: { loadFailed: boolean }) {
  return <div className="min-h-screen bg-pul-page"><Container className="max-w-3xl px-3 py-12"><div className="rounded-2xl border border-pul-border bg-white p-7 text-center"><h1 className="text-2xl font-black text-foreground">{loadFailed ? "골프장 운영 정보를 불러오지 못했습니다." : "골프장 운영 권한이 없습니다."}</h1><p className="mt-2 leading-7 text-pul-muted">{loadFailed ? "잠시 후 다시 시도해 주세요." : "이 화면은 active 플랫폼 운영자만 이용할 수 있습니다."}</p><Link href="/manage" className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-pul-deep px-5 font-bold text-white">운영 관리로 돌아가기</Link></div></Container></div>;
}
