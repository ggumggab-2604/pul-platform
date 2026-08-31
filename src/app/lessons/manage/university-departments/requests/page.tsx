import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { UniversityDepartmentRequestManagementPage } from "@/components/lessons/manage/UniversityDepartmentRequestManagementPage";
import { Container } from "@/components/ui/Container";
import {
  listUniversityDepartmentRequestsForManagement,
  UniversityDirectoryError,
  type UniversityDepartmentRequestStatus,
} from "@/lib/lessons/universityDirectory";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "대학·학과 요청 운영", description: "대학·학과 등록·수정 요청 운영" };
type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

export default async function UniversityDepartmentRequestRoute({ searchParams }: { searchParams: SearchParams }) {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect(`/login?next=${encodeURIComponent("/lessons/manage/university-departments/requests")}`);
  const value = first((await searchParams).status);
  const status = value === "completed" || value === "closed" || value === "pending" ? value as UniversityDepartmentRequestStatus : value === "all" ? null : "pending";
  let page;
  let loadError: unknown = null;
  try {
    page = await listUniversityDepartmentRequestsForManagement(context.supabase, status, 30, 0);
  } catch (reason) {
    loadError = reason;
  }
  if (!page) {
    const denied = loadError instanceof UniversityDirectoryError && loadError.code === "permission";
    return <main className="min-h-screen bg-pul-page"><Container className="max-w-3xl px-3 py-12"><div className="rounded-2xl border border-pul-border bg-white p-7 text-center"><h1 className="text-2xl font-bold text-foreground">{denied ? "대학·학과 운영 권한이 없습니다." : "요청 정보를 불러오지 못했습니다."}</h1><Link href="/lessons" className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-pul-deep px-5 font-bold text-white">레슨·교육으로 돌아가기</Link></div></Container></main>;
  }
  return <main className="min-h-screen bg-pul-page"><Container className="max-w-[1320px] px-3 py-6 pb-20">
      <header className="rounded-2xl border border-pul-border bg-white p-5 sm:p-6"><nav className="text-sm text-pul-muted" aria-label="경로"><Link href="/lessons/manage/university-departments" className="font-bold hover:text-pul-point">대학·학과 운영</Link> <span aria-hidden="true">›</span> 등록·수정 요청</nav><h1 className="mt-3 text-2xl font-black text-foreground sm:text-3xl">대학·학과 등록·수정 요청</h1><p className="mt-2 text-sm leading-6 text-pul-muted">요청을 완료 또는 닫을 수 있습니다. 완료 처리는 디렉터리 항목을 자동 생성하지 않습니다.</p></header>
      <form className="mt-4 flex flex-wrap gap-2 rounded-xl border border-pul-border bg-white p-3"><label htmlFor="university-request-status" className="self-center font-bold text-foreground">상태</label><select id="university-request-status" name="status" defaultValue={status ?? "all"} className="min-h-11 rounded-lg border border-pul-border px-3"><option value="pending">처리 대기</option><option value="completed">완료</option><option value="closed">닫힘</option><option value="all">전체</option></select><button type="submit" className="min-h-11 rounded-lg bg-pul-deep px-4 font-bold text-white">조회</button></form>
      <div className="mt-4"><UniversityDepartmentRequestManagementPage initialPage={page} /></div>
    </Container></main>;
}
