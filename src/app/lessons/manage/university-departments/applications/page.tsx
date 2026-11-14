import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { UniversityActionForm } from "@/components/lessons/UniversityForms";
import { universityButton, universityInput } from "@/components/lessons/universityStyles";
import { applicantFields, applicationStatus, openingFields, universityApplications, universityReview, type Application } from "@/lib/lessons/universityFollowup";
import { universityHref, uuid } from "@/lib/lessons/universityWorkspace";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { reviewApplication } from "./actions";

export const metadata = { title: "대학·학과 신청함" };
export default async function Page({ searchParams }: { searchParams: Promise<{ id?: string; page?: string }> }) {
  const query = await searchParams;
  const id = query.id;
  if (id && !uuid(id)) notFound();
  const page = /^\d{1,5}$/.test(query.page ?? "") ? Math.max(1,Number(query.page)) : 1;
  const auth = await getAuthenticatedSupabaseContext();
  if (!auth) redirect("/login?next=" + encodeURIComponent(universityReview + (id ? "?id=" + id : "")));
  const result = await auth.supabase.rpc("get_university_applications", { p_operator: true, p_id: id ?? null, p_offset: id ? 0 : (page-1)*25 });
  const entries = (result.data ?? []) as Application[];
  const item = id ? entries[0] : null;
  if (id && !item && !result.error) notFound();
  return <Container className="max-w-5xl space-y-4 px-3 py-6 pb-20">
    <nav aria-label="운영 경로" className="flex flex-wrap gap-2">
      <Link className={universityButton} href="/manage">운영 관리센터</Link>
      <Link className={universityButton} href="/lessons/manage/university-departments">대학·학과 운영</Link>
      <Link className={universityButton} href={universityReview}>신청함</Link>
    </nav>
    <h1 className="text-2xl font-bold text-pul-deep">대학·학과 신청함</h1>
    {result.error ? <p role="alert">{["42501","P0001"].includes(result.error.code) ? "레슨·교육 운영 권한이 필요합니다." : "신청함을 불러오지 못했습니다."}</p>
    : item ? <Card title={item.kind === "opening" ? "개설 신청" : "담당자 신청"}>
      <p className="font-bold">{applicationStatus[item.status]}</p>
      {item.note && <p className="mt-2 whitespace-pre-wrap break-words">안내 · {item.note}</p>}
      {item.department_key && <p className="mt-2 break-words">{item.university_name} · {item.department_name}</p>}
      <dl className="my-4 grid gap-3 sm:grid-cols-2">
        {item.kind === "opening" && <div><dt className="font-bold">과정 구분 · 지역</dt><dd>{item.details.program_kind === "degree" ? "정규학과" : "평생교육 과정"} · {item.details.region}</dd></div>}
        {[...(item.kind === "opening" ? openingFields : []), ...applicantFields].map(([field,label]) =>
          <div key={field} className="min-w-0"><dt className="font-bold">{label}</dt><dd className="whitespace-pre-wrap break-words">{item.details[field] ?? "—"}</dd></div>)}
      </dl>
      {item.photo_path && <Image unoptimized src={universityApplications + "/photo/" + item.id + "?review=1&v=" + item.version} alt="신청 대표 사진" width={360} height={240} className="mb-4 h-auto max-w-full rounded-lg"/>}
      {item.status === "pending" && <UniversityActionForm key={item.version} action={reviewApplication.bind(null,auth.userId,item.id,item.version)} button="심사 결과 저장">
        <label className="grid gap-1 font-bold">심사 결과<select name="decision" required defaultValue="" className={universityInput}>
          <option value="" disabled>선택</option><option value="approved">승인</option><option value="revision">보완 요청</option><option value="rejected">반려</option>
        </select></label>
        <label className="grid gap-1 font-bold">신청자에게 안내<textarea name="note" rows={4} maxLength={1000} className={universityInput}/></label>
        <p className="text-sm text-pul-muted">보완 요청과 반려에는 안내가 필요합니다. 개설 승인 시 숨김 상태로 등록됩니다.</p>
      </UniversityActionForm>}
      {item.status === "approved" && item.department_key && <div className="flex flex-wrap gap-2">
        <Link className={universityButton} href={"/lessons/manage/university-departments?keyword=" + encodeURIComponent(item.department_name ?? "")}>공개·숨김 관리</Link>
        <Link className={universityButton} href={"/lessons/manage/university-departments/" + item.department_key + "/managers"}>담당자 관리</Link>
        {item.publication_status === "published" && <Link className={universityButton} href={universityHref(item.department_key)}>공개 학과 상세</Link>}
      </div>}
    </Card> : <Card title="접수된 신청">
      {entries.length ? <ul className="divide-y divide-pul-border">{entries.slice(0,25).map(row => <li key={row.id} className="py-3">
        <Link className="block break-words font-bold text-pul-deep underline" href={universityReview + "?id=" + row.id}>
          {row.kind === "opening" ? "개설" : "담당자"} · {row.university_name ?? row.details.university_name} · {row.department_name ?? row.details.department_name} · {applicationStatus[row.status]}
        </Link>
      </li>)}</ul> : <p>접수된 신청이 없습니다.</p>}
      <div className="mt-3 flex gap-2">{page>1 && <Link className={universityButton} href={universityReview + "?page=" + (page-1)}>이전</Link>}
        {entries.length>25 && <Link className={universityButton} href={universityReview + "?page=" + (page+1)}>다음</Link>}</div>
    </Card>}
  </Container>;
}

