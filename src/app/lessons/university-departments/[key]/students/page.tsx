import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { UniversityStudentSpace } from "@/components/lessons/UniversityStudentSpace";
import { sections, type Space } from "@/lib/lessons/universityFollowup";
import { UniversityActionForm } from "@/components/lessons/UniversityForms";
import { universityBox, universityButton } from "@/components/lessons/universityStyles";
import { readUniversity, universityHref, universityKey } from "@/lib/lessons/universityWorkspace";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { changeUniversity } from "../actions";

export const metadata = { title: "재학생 공간" };


export default async function Page({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<{ section?: string; page?: string }> }) {
  const { key } = await params;
  if (!universityKey(key)) notFound();
  const href = universityHref(key);
  const auth = await getAuthenticatedSupabaseContext();
  if (!auth) redirect("/login?next=" + encodeURIComponent(href + "/students"));
  const query = await searchParams;
  const section = query.section && Object.hasOwn(sections, query.section) ? query.section as keyof typeof sections : "notice";
  const page = /^\d{1,5}$/.test(query.page ?? "") ? Math.max(1, Number(query.page)) : 1;
  const kind = section === "photos" ? "story" : section;
  const space = await auth.supabase.rpc("get_university_space", { p_key: key, p_kind: kind, p_offset: (page-1)*20, p_photos: section === "photos" });
  if (!space.error && space.data) {
    const data = space.data as Space;
    return <Container className="max-w-4xl space-y-4 px-3 py-6 pb-20">
      <Link className={universityButton} href="/my/clubs">내 소속</Link>
      <header className={universityBox}>
        <p className="break-words font-bold text-pul-point">{data.school} · {data.name}</p>
        <h1 className="text-2xl font-bold text-pul-deep">학과 공간</h1>
      </header>
      <UniversityStudentSpace href={href + "/students"} section={section} page={page} space={data} viewer={auth.userId}/>
    </Container>;
  }
  if (space.error?.code !== "42501") return <Container><p role="alert">학과 공간을 불러오지 못했습니다.</p></Container>;
  const d = await readUniversity(auth.supabase, key);
  if (!d) notFound();
  return <Container className="max-w-4xl space-y-4 px-3 py-6 pb-20">
    <div className="flex flex-wrap gap-2">
      <Link className={universityButton} href="/my/clubs">내 소속</Link>
      <Link className={universityButton} href={href}>공개 학과 소개</Link>
    </div>
    <section className={universityBox + " space-y-3"}>
      <p className="text-sm font-bold text-pul-point">{d.university_name} · {d.department_name}</p>
      <>
        <h1 className="text-2xl font-bold text-pul-deep">재학생 전용 공간</h1>
        {d.student_status === "pending" ? <p>승인 대기 · 학과 담당자가 재학 여부를 확인하고 있습니다.</p> : <>
          <p className="text-sm text-pul-muted">이 학과의 재학생인 경우 소속 확인을 요청하세요. 담당자가 별도로 재학 여부를 확인합니다.</p>
          <UniversityActionForm action={changeUniversity.bind(null, key, auth.userId, "request")} button="재학생 소속 확인 요청" once />
        </>}
      </>
    </section>
  </Container>;
}
