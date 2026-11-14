import Link from "next/link";
import Image from "next/image";
import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { Card } from "@/components/ui/Card";
import { UniversityUploadForm } from "@/components/lessons/UniversityUploadForm";
import { universityButton, universityInput } from "@/components/lessons/universityStyles";
import { applicantFields, applicationStatus, openingFields, universityApplications, type Application } from "@/lib/lessons/universityFollowup";
import { UNIVERSITY_REGIONS } from "@/lib/lessons/universityDirectory";
import { readUniversity, universityHref, universityKey, universityListHref, uuid } from "@/lib/lessons/universityWorkspace";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export const metadata = { title: "대학·학과 신청" };
export default async function Page({ searchParams }: { searchParams: Promise<{ department?: string; id?: string; view?: string; page?: string }> }) {
  const query = await searchParams;
  const params = new URLSearchParams();
  if (query.department && universityKey(query.department)) params.set("department", query.department);
  if (query.id && uuid(query.id)) params.set("id", query.id);
  if (query.view === "mine") params.set("view", "mine");
  const auth = await getAuthenticatedSupabaseContext();
  if (!auth) redirect("/login?next=" + encodeURIComponent(universityApplications + (params.size ? "?" + params : "")));
  const selected = params.get("id");
  const page = /^\d{1,5}$/.test(query.page ?? "") ? Math.max(1, Number(query.page)) : 1;
  const mine = query.view === "mine" || Boolean(selected);
  const list = await auth.supabase.rpc("get_university_applications", { p_operator: false, p_id: selected, p_offset: selected ? 0 : (page - 1) * 25 });
  const entries = (list.data ?? []) as Application[];
  const application = selected ? entries[0] : null;
  if (selected && !application && !list.error) notFound();
  const target = params.get("department");
  const department = target && !mine ? await readUniversity(auth.supabase, target) : null;
  if (target && !mine && !department) notFound();
  const kind = application?.kind ?? (department ? "manager" : "opening");
  const title = kind === "opening" ? "대학·학과 개설 신청" : "학과 담당자 신청";
  const form = !mine || application?.status === "revision";
  const details = application?.details;
  return <Container className="max-w-4xl space-y-4 px-3 py-6 pb-20">
    <nav aria-label="대학 신청 메뉴" className="flex flex-wrap gap-2">
      <Link href={universityListHref} className={universityButton}>대학·평생교육</Link>
      <Link href={universityApplications} className={universityButton}>대학·학과 개설 신청</Link>
      <Link href={universityApplications + "?view=mine"} className={universityButton}>내 신청 내역</Link>
    </nav>
    <h1 className="text-2xl font-bold text-pul-deep">{mine ? "내 신청 내역" : title}</h1>
    {list.error ? <p role="alert">신청 내역을 불러오지 못했습니다. 활동 중인 계정인지 확인해 주세요.</p> : <>
      {mine && !selected && <Card title="제출한 신청">
        {entries.length ? <ul className="divide-y divide-pul-border">{entries.slice(0,25).map(item => <li key={item.id} className="py-3">
          <Link className="block break-words font-bold text-pul-deep underline" href={universityApplications + "?id=" + item.id}>
            {item.university_name ?? item.details.university_name} · {item.department_name ?? item.details.department_name} · {applicationStatus[item.status]}
          </Link>
        </li>)}</ul> : <p>제출한 신청이 없습니다.</p>}
        <div className="mt-3 flex gap-2">{page>1 && <Link className={universityButton} href={universityApplications + "?view=mine&page=" + (page-1)}>이전</Link>}
          {entries.length>25 && <Link className={universityButton} href={universityApplications + "?view=mine&page=" + (page+1)}>다음</Link>}</div>
      </Card>}
      {application && <Card title={title}>
        <p className="font-bold">{applicationStatus[application.status]}</p>
        <p className="break-words">{application.university_name ?? details?.university_name} · {application.department_name ?? details?.department_name}</p>
        {application.note && <p className="mt-2 whitespace-pre-wrap break-words">운영자 안내 · {application.note}</p>}
        {!form && <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          {[...(kind === "opening" ? openingFields : []), ...applicantFields].map(([name,label]) =>
            <div key={name} className="min-w-0"><dt className="font-bold">{label}</dt><dd className="whitespace-pre-wrap break-words">{details?.[name] ?? "—"}</dd></div>)}
        </dl>}
        {application.status === "approved" && application.department_key && <div className="mt-3 flex flex-wrap gap-2">
          <Link className={universityButton} href={universityHref(application.department_key) + "/manage"}>담당 학과 관리</Link>
          {application.publication_status === "published" ? <Link className={universityButton} href={universityHref(application.department_key)}>공개 학과 상세</Link>
            : <p>운영자가 공개 내용을 확인하고 공개합니다.</p>}
        </div>}
      </Card>}
      {form && <Card title={application ? "자료 보완" : "신청 자료"}>
        {(department || application?.kind === "manager") && <p className="mb-3 font-bold">{department?.university_name ?? application?.university_name} · {department?.department_name ?? application?.department_name}</p>}
        <p className="mb-3 text-sm text-pul-muted">공식 연락처와 담당 권한 확인 자료는 신청자와 운영자만 볼 수 있습니다.</p>
        <UniversityUploadForm endpoint={universityApplications + "/submit"} viewer={auth.userId} doneHref={universityApplications} button={application ? "보완 제출" : "신청 제출"} key={application ? application.id + ":" + application.version : target ?? kind}>
          <input type="hidden" name="kind" value={kind}/>
          <input type="hidden" name="department" value={department?.department_key ?? application?.department_key ?? ""}/>
          {application && <><input type="hidden" name="id" value={application.id}/><input type="hidden" name="version" value={application.version}/></>}
          <div className="grid gap-3 sm:grid-cols-2">
            {kind === "opening" && <>
              <label className="grid gap-1 font-bold">과정 구분<select name="program_kind" defaultValue={details?.program_kind ?? "degree"} className={universityInput}>
                <option value="degree">정규학과</option><option value="continuing">평생교육 과정</option>
              </select></label>
              <label className="grid gap-1 font-bold">지역<select name="region" defaultValue={details?.region ?? ""} className={universityInput} required>
                <option value="">지역 선택</option>{UNIVERSITY_REGIONS.map(region=><option key={region}>{region}</option>)}
              </select></label>
            </>}
            {[...(kind === "opening" ? openingFields : []), ...applicantFields].map(([name,label,max,required]) => {
              const props = { name, maxLength: max, required, defaultValue: details?.[name] ?? "", className: universityInput };
              return <label key={name} className={"grid min-w-0 gap-1 font-bold " + (max>=1000 ? "sm:col-span-2" : "")}>
                {label}{!required && " (선택)"}
                {max >= 1000 ? <textarea {...props} rows={4}/> : <input {...props} type={name.endsWith("_url") ? "url" : name.startsWith("recruitment_") ? "date" : "text"}/>}
              </label>;
            })}
          </div>
          {kind === "opening" && <>
            {application?.photo_path && <Image unoptimized src={universityApplications + "/photo/" + application.id + "?v=" + application.version} alt="신청에 첨부한 대표 사진" width={320} height={200} className="h-auto max-w-full rounded-lg"/>}
            <label className="grid gap-1 font-bold">대표 사진 (선택)<input name="file" type="file" accept="image/jpeg,image/png,image/webp" className={universityInput}/></label>
          </>}
        </UniversityUploadForm>
      </Card>}
    </>}
  </Container>;
}

