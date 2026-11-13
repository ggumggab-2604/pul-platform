import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { UniversityActionForm, UniversityProfileForm } from "@/components/lessons/UniversityForms";
import { universityBox, universityButton, universityInput } from "@/components/lessons/universityStyles";
import { contactLabels, universityHref, universityKey, universityPhotoHref, type UniversityConsultation, type UniversityStudent, type UniversityWorkspace } from "@/lib/lessons/universityWorkspace";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { changeUniversity } from "../actions";

export const metadata = { title: "대학 담당자 관리" };
const tabs = [["profile", "공개 학과 편집"], ["consultations", "입학 상담"], ["students", "재학생 승인"]] as const;
const batch = 25;

export default async function Page({ params, searchParams }: {
  params: Promise<{ key: string }>; searchParams: Promise<{ section?: string; page?: string }>;
}) {
  const { key } = await params;
  if (!universityKey(key)) notFound();
  const href = universityHref(key);
  const auth = await getAuthenticatedSupabaseContext();
  if (!auth) redirect("/login?next=" + encodeURIComponent(href + "/manage"));
  const query = await searchParams;
  const section = tabs.find(([id]) => id === query.section)?.[0] ?? "profile";
  const page = /^\d{1,5}$/.test(query.page ?? "") ? Math.max(1, Number(query.page)) : 1;
  const result = await auth.supabase.rpc("get_university_workspace", { p_key: key, p_section: section, p_offset: (page - 1) * batch });
  if (result.error) {
    return <Container className="max-w-3xl px-3 py-6 pb-20"><section className={universityBox + " space-y-3"}>
      <h1 className="text-xl font-bold">{result.error.code === "42501" ? "학과 관리 권한이 필요합니다." : "학과 관리 화면을 불러오지 못했습니다."}</h1>
      <Link className={universityButton} href={href}>공개 학과로 돌아가기</Link>
    </section></Container>;
  }
  const d = result.data as UniversityWorkspace;
  const nextLink = (p: number) => href + "/manage?section=" + section + "&page=" + p;
  const records = d.items.slice(0, batch);
  return <Container className="space-y-4 px-3 py-6 pb-20">
    <header className={universityBox + " space-y-2 bg-gradient-to-r from-white to-pul-light"}>
      <p className="text-sm font-bold text-pul-point">{d.university_name} · {d.department_name}</p>
      <h1 className="text-2xl font-bold text-pul-deep sm:text-3xl">대학 담당자 관리</h1>
      {d.publication_status === "published" ? <Link prefetch={false} className={universityButton} href={href}>공개 학과 미리 보기</Link>
        : <p className="text-sm text-pul-muted">현재 학과가 숨김 상태입니다. 공개 상태는 PUL 운영자가 관리합니다.</p>}
    </header>
    <nav aria-label="학과 관리 메뉴" className="flex flex-wrap gap-2">
      {tabs.map(([id, label]) => <Link key={id} aria-current={section === id ? "page" : undefined} href={href + "/manage?section=" + id} className={universityButton + (section === id ? " bg-pul-light" : " bg-white")}>{label}</Link>)}
    </nav>
    {section === "profile" ? <UniversityProfileForm key={auth.userId + key} profile={d} viewer={auth.userId}
      photo={d.photo_path ? <Image src={universityPhotoHref(key, d.version)} width={480} height={288} unoptimized alt="현재 대표 사진" className="aspect-[5/3] w-full max-w-64 rounded-lg object-cover" /> : null} />
    : <section className={universityBox + " space-y-3"}>
      <h2 className="text-xl font-bold">{section === "consultations" ? "입학 상담 접수함" : "재학생 소속 확인"}</h2>
      {section === "consultations" ? <>
        <p className="text-sm text-pul-muted">연락 상태를 기록해도 상담 접수 기록은 유지됩니다.</p>
        {(records as UniversityConsultation[]).map(row => <details key={row.id} className="rounded-lg border border-pul-border p-3">
          <summary className="min-h-11 cursor-pointer break-words font-bold">{row.member_name} · 상담 접수 · {contactLabels[row.contact_status]} · 상담 내용 열기</summary>
          <p className="mb-3 whitespace-pre-wrap break-words">{row.body}</p>
          <UniversityActionForm action={changeUniversity.bind(null, key, auth.userId, "contact")} button="연락 상태 저장">
            <input type="hidden" name="id" value={row.id} />
            <div>
              <label htmlFor={"status-" + row.id} className="block text-sm font-bold">연락 상태</label>
              <select id={"status-" + row.id} className={universityInput} name="status" defaultValue={row.contact_status}>
                {Object.entries(contactLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={"note-" + row.id} className="block text-sm font-bold">연락 메모 (선택)</label>
              <textarea id={"note-" + row.id} className={universityInput} name="note" defaultValue={row.contact_note ?? ""} maxLength={1000} rows={2} />
            </div>
          </UniversityActionForm>
        </details>)}
      </> : <>
        <p className="text-sm text-pul-muted">재학 여부를 별도로 확인한 요청만 승인하세요. 입학 상담과는 별개입니다.</p>
        {(records as UniversityStudent[]).map(row => <div key={row.user_id} className="space-y-3 rounded-lg border border-pul-border p-3">
          <p className="break-words font-bold">{row.member_name} · {row.approved_at ? "재학생 승인 완료" : "승인 대기"}</p>
          {!row.approved_at ? <UniversityActionForm action={changeUniversity.bind(null, key, auth.userId, "approve")} button="재학생 소속 승인" once>
            <p className="break-all text-xs text-pul-muted">PUL 계정: {row.user_id}</p>
            <input type="hidden" name="user" value={row.user_id} />
            <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="confirmed" required />재학 여부를 확인했습니다.</label>
          </UniversityActionForm> : null}
        </div>)}
      </>}
      {records.length ? null : <p className="text-sm text-pul-muted">표시할 요청이 없습니다.</p>}
      <nav aria-label="요청 목록 페이지" className="flex flex-wrap gap-2">
        {page > 1 ? <Link href={nextLink(page - 1)} className={universityButton}>이전</Link> : null}
        {d.items.length > batch ? <Link href={nextLink(page + 1)} className={universityButton}>다음</Link> : null}
      </nav>
    </section>}
  </Container>;
}
