import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { UniversityDepartmentManagementPage } from "@/components/lessons/manage/UniversityDepartmentManagementPage";
import { Container } from "@/components/ui/Container";
import {
  listUniversityDepartmentsForManagement,
  UniversityDirectoryError,
  type UniversityDepartmentPublicationStatus,
} from "@/lib/lessons/universityDirectory";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export const metadata: Metadata = { title: "대학·학과 운영", description: "레슨·교육 대학·학과 공개 디렉터리 운영" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value;

function AccessMessage({ loadFailed }: { loadFailed: boolean }) {
  return (
    <main className="min-h-screen bg-pul-page"><Container className="max-w-3xl px-3 py-12"><div className="rounded-2xl border border-pul-border bg-white p-7 text-center">
      <h1 className="text-2xl font-bold text-foreground">{loadFailed ? "운영 정보를 불러오지 못했습니다." : "대학·학과 운영 권한이 없습니다."}</h1>
      <p className="mt-2 text-pul-muted">{loadFailed ? "잠시 후 다시 시도해 주세요." : "이 화면은 active lessons.manage 운영자만 이용할 수 있습니다."}</p>
      <Link href="/lessons" className="mt-5 inline-flex min-h-12 items-center rounded-xl bg-pul-deep px-5 font-bold text-white">레슨·교육으로 돌아가기</Link>
    </div></Container></main>
  );
}

export default async function UniversityDepartmentManagementRoute({ searchParams }: { searchParams: SearchParams }) {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect(`/login?next=${encodeURIComponent("/lessons/manage/university-departments")}`);
  const params = await searchParams;
  const keyword = first(params.keyword)?.trim() ?? "";
  const statusValue = first(params.status);
  const status = statusValue === "published" || statusValue === "hidden" ? statusValue as UniversityDepartmentPublicationStatus : undefined;
  let page;
  let loadError: unknown = null;
  try {
    page = await listUniversityDepartmentsForManagement(context.supabase, keyword, status, 30, 0);
  } catch (reason) {
    loadError = reason;
  }
  if (!page) {
    return <AccessMessage loadFailed={!(loadError instanceof UniversityDirectoryError && loadError.code === "permission")} />;
  }
  return (
      <main className="min-h-screen bg-pul-page"><Container className="max-w-[1440px] px-3 py-6 pb-20">
        <header className="rounded-2xl border border-pul-border bg-white p-5 sm:p-6">
          <nav aria-label="경로" className="text-sm text-pul-muted"><Link href="/manage" className="font-bold hover:text-pul-point">운영 관리센터</Link> <span aria-hidden="true">›</span> 대학·학과 운영</nav>
          <h1 className="mt-3 text-2xl font-black text-foreground sm:text-3xl">대학·학과 디렉터리 운영</h1>
          <p className="mt-2 text-sm leading-6 text-pul-muted">hidden 초안을 확인한 뒤 별도로 공개합니다. 회원 요청을 완료해도 디렉터리 항목은 자동 생성되지 않습니다.</p>
          <div className="mt-4 flex flex-wrap gap-2"><Link href="/lessons/manage/university-departments/requests" className="min-h-11 rounded-lg border border-pul-border px-4 py-2.5 font-bold text-pul-deep">등록·수정 요청 보기</Link><Link href="/lessons" className="min-h-11 rounded-lg border border-pul-border px-4 py-2.5 font-bold text-pul-deep">공개 화면 보기</Link></div>
        </header>
        <form className="mt-4 grid gap-2 rounded-xl border border-pul-border bg-white p-3 sm:grid-cols-[1fr_160px_auto]">
          <label className="sr-only" htmlFor="university-management-keyword">검색</label><input id="university-management-keyword" name="keyword" defaultValue={keyword} maxLength={100} placeholder="대학명·학과명 검색" className="min-h-11 rounded-lg border border-pul-border px-3" />
          <label className="sr-only" htmlFor="university-management-status">공개 상태</label><select id="university-management-status" name="status" defaultValue={status ?? ""} className="min-h-11 rounded-lg border border-pul-border px-3"><option value="">전체 상태</option><option value="hidden">숨김</option><option value="published">공개</option></select>
          <button type="submit" className="min-h-11 rounded-lg bg-pul-deep px-4 font-bold text-white">조회</button>
        </form>
        <div className="mt-4"><UniversityDepartmentManagementPage initialPage={page} /></div>
      </Container></main>
  );
}
