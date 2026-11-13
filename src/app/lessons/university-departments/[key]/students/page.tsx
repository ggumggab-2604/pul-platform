import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { UniversityActionForm } from "@/components/lessons/UniversityForms";
import { universityBox, universityButton } from "@/components/lessons/universityStyles";
import { readUniversity, universityHref, universityKey } from "@/lib/lessons/universityWorkspace";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { changeUniversity } from "../actions";

export const metadata = { title: "재학생 공간" };
const upcoming = ["공지", "이야기방", "모임·월례회", "성적", "명예의 전당"];

export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!universityKey(key)) notFound();
  const href = universityHref(key);
  const auth = await getAuthenticatedSupabaseContext();
  if (!auth) redirect("/login?next=" + encodeURIComponent(href + "/students"));
  const d = await readUniversity(auth.supabase, key);
  if (!d) notFound();
  return <Container className="max-w-4xl space-y-4 px-3 py-6 pb-20">
    <div className="flex flex-wrap gap-2">
      <Link className={universityButton} href="/my/clubs">내 소속</Link>
      <Link className={universityButton} href={href}>공개 학과 소개</Link>
    </div>
    <section className={universityBox + " space-y-3"}>
      <p className="text-sm font-bold text-pul-point">{d.university_name} · {d.department_name}</p>
      {d.student_status === "approved" ? <>
        <h1 className="text-2xl font-bold text-pul-deep">재학생 공간</h1>
        <p className="text-sm text-pul-deep">재학생 소속이 승인되었습니다.</p>
        <ul className="grid gap-2 sm:grid-cols-2">{upcoming.map(title => <li key={title} className="rounded-lg border border-pul-border p-3">
          <strong>{title}</strong><span className="ml-2 text-sm text-pul-muted">준비 중</span>
        </li>)}</ul>
      </> : <>
        <h1 className="text-2xl font-bold text-pul-deep">재학생 전용 공간</h1>
        {d.student_status === "pending" ? <p>승인 대기 · 학과 담당자가 재학 여부를 확인하고 있습니다.</p> : <>
          <p className="text-sm text-pul-muted">이 학과의 재학생인 경우 소속 확인을 요청하세요. 담당자가 별도로 재학 여부를 확인합니다.</p>
          <UniversityActionForm action={changeUniversity.bind(null, key, auth.userId, "request")} button="재학생 소속 확인 요청" once />
        </>}
      </>}
    </section>
  </Container>;
}
