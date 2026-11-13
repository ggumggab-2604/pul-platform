import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { UniversityActionForm } from "@/components/lessons/UniversityForms";
import { universityBox, universityButton, universityInput } from "@/components/lessons/universityStyles";
import { universityKey } from "@/lib/lessons/universityWorkspace";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { changeUniversity } from "@/app/lessons/university-departments/[key]/actions";

export const metadata = { title: "대학·학과 담당자 지정" };
const parent = "/lessons/manage/university-departments";

export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!universityKey(key)) notFound();
  const auth = await getAuthenticatedSupabaseContext();
  if (!auth) redirect("/login?next=" + encodeURIComponent(parent + "/" + key + "/managers"));
  const department = await auth.supabase.rpc("get_lesson_university_department_for_management", { p_department_key: key });
  if (department.error || !department.data) {
    return <Container className="px-3 py-6"><p role="alert">학과를 찾을 수 없거나 운영 권한이 없습니다.</p><Link href={parent}>대학·학과 운영으로</Link></Container>;
  }
  const managers = await auth.supabase.rpc("list_university_department_managers", { p_key: key });
  return <Container className="max-w-3xl space-y-4 px-3 py-6 pb-20">
    <Link className={universityButton} href={parent}>대학·학과 운영으로</Link>
    <section className={universityBox + " space-y-3"}>
      <p className="text-sm text-pul-point">{department.data.university_name} · {department.data.department_name}</p>
      <h1 className="text-2xl font-bold text-pul-deep">학과 담당자 지정</h1>
      {managers.error ? <p role="alert">담당자 목록을 불러오지 못했습니다.</p> : <>
        <p className="text-sm text-pul-muted">확인한 PUL 계정 UUID를 입력하세요. 지정한 학과의 관리 권한만 부여합니다.</p>
        <UniversityActionForm action={changeUniversity.bind(null, key, auth.userId, "grant")} button="담당자 지정">
          <label className="block text-sm font-bold">PUL 계정 UUID
            <input className={universityInput} name="user" required maxLength={36} autoComplete="off" />
          </label>
        </UniversityActionForm>
        <h2 className="text-lg font-bold">지정된 담당자</h2>
        {!managers.data?.length ? <p className="text-sm text-pul-muted">지정된 담당자가 없습니다.</p> : null}
        {(managers.data as { user_id: string; member_name: string }[] ?? []).map(manager => <div key={manager.user_id} className="space-y-2 border-t border-pul-border pt-3">
          <p className="break-words">{manager.member_name} <span className="break-all text-sm text-pul-muted">{manager.user_id}</span></p>
          <UniversityActionForm action={changeUniversity.bind(null, key, auth.userId, "revoke")} button="담당 권한 해제">
            <input type="hidden" name="user" value={manager.user_id} />
          </UniversityActionForm>
        </div>)}
      </>}
    </section>
  </Container>;
}
