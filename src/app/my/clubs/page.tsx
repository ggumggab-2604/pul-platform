import { ClubAffiliations } from "@/components/clubs/ClubAffiliations";
import { Container } from "@/components/ui/Container";
import { getMyClubAffiliations } from "@/lib/clubs/clubAffiliations";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { universityButton } from "@/components/lessons/universityStyles";
import { universityHref, universityListHref, type UniversityAffiliation } from "@/lib/lessons/universityWorkspace";
export const metadata = { title: "내 소속" };
export default async function Page({ searchParams }: { searchParams: Promise<{ choose?: string }> }) {
  const auth = await getAuthenticatedSupabaseContext();
  if (!auth) redirect("/login?next=/my/clubs");
  const [clubs, universities] = await Promise.all([
    getMyClubAffiliations(auth.supabase, auth.userId).catch(() => null),
    auth.supabase.rpc("list_my_university_departments"),
  ]);
  const items = (universities.data ?? []) as UniversityAffiliation[];
  return <Container className="space-y-5 px-3 py-6 pb-20">
    <h1 className="text-2xl font-bold text-pul-deep">내 소속</h1>
    <section aria-labelledby="my-club-heading" className="space-y-3">
      <h2 id="my-club-heading" className="text-xl font-bold text-pul-deep">일반 동호회</h2>
      <ClubAffiliations viewerId={auth.userId} initial={clubs} choose={(await searchParams).choose} />
    </section>
    <Card title="대학 학과">
      {universities.error ? <p role="alert">대학 학과 소속을 불러오지 못했습니다.</p>
        : items.length ? <ul className="divide-y divide-pul-border">{items.map(item => <li key={item.department_key} className="flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="min-w-0">
            <p className="break-words text-sm text-pul-muted">{item.university_name}</p>
            <p className="break-words font-bold text-pul-deep">{item.department_name}</p>
            {item.student_status ? <p className="text-sm text-pul-muted">{item.student_status === "approved" ? "재학생 승인 완료" : "재학생 승인 대기"}</p> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {item.student_status ? <Link className={universityButton} href={universityHref(item.department_key) + "/students"}>{item.student_status === "approved" ? "학과 공간 열기" : "승인 상태 보기"}</Link> : null}
            {item.can_manage ? <><Link className={universityButton} href={universityHref(item.department_key) + "/manage"}>담당 학과 관리</Link>{item.student_status !== "approved" && <Link className={universityButton} href={universityHref(item.department_key) + "/students"}>학과 공간 관리</Link>}</> : null}
          </div>
        </li>)}</ul> : <p className="text-sm text-pul-muted">요청하거나 승인된 대학 학과가 없습니다.</p>}
      <Link className={universityButton + " mt-3"} href={universityListHref}>대학·평생교육 둘러보기</Link>
    </Card>
  </Container>;
}
