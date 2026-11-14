import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/ui/Container";
import { UniversityActionForm } from "@/components/lessons/UniversityForms";
import { universityBox, universityButton, universityInput, universityPrimary } from "@/components/lessons/universityStyles";
import { readUniversity, safeUniversityHref, universityHref, universityKey, universityListHref, universityPhotoHref } from "@/lib/lessons/universityWorkspace";
import { universityApplications } from "@/lib/lessons/universityFollowup";
import { createClient } from "@/lib/supabase/server";
import { changeUniversity } from "./actions";

export const metadata = { title: "대학·평생교육 학과 상세" };

function OfficialLink({ value, children, primary = false }: { value: string | null; children: string; primary?: boolean }) {
  const url = safeUniversityHref(value);
  return url ? <a href={url} target="_blank" rel="noopener noreferrer" className={primary ? universityPrimary : universityButton}>
    {children}<span className="sr-only"> (새 탭)</span>
  </a> : null;
}

export default async function Page({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  if (!universityKey(key)) notFound();
  const client = await createClient();
  const [department, claims] = await Promise.all([readUniversity(client, key), client.auth.getClaims()]);
  if (!department) notFound();
  const href = universityHref(key);
  const viewer = claims.error ? undefined : claims.data?.claims?.sub;
  const consult = href + "#admission-consultation";
  const consultHref = viewer ? "#admission-consultation" : "/login?next=" + encodeURIComponent(consult);
  const actions = <>
    <OfficialLink value={department.admissions_url} primary>공식 지원하기</OfficialLink>
    <Link href={consultHref} className={universityButton + " bg-pul-light"}>입학 상담 신청</Link>
  </>;
  return <Container className="space-y-4 px-3 py-5 pb-20">
    <nav aria-label="현재 위치" className="flex flex-wrap gap-2 text-sm text-pul-muted">
      <Link href="/lessons" className="underline">레슨·교육</Link><span aria-hidden="true">›</span>
      <Link href={universityListHref} className="underline">대학·평생교육</Link><span aria-hidden="true">›</span>
      <span aria-current="page">{department.department_name}</span>
    </nav>
    <div className={"grid gap-4 " + (department.photo_path ? "lg:grid-cols-2" : "")}>
      {department.photo_path ? <div className="order-2 overflow-hidden rounded-xl border border-pul-border bg-white lg:order-1">
        <Image src={universityPhotoHref(key, department.version)} width={1000} height={600} loading="eager" unoptimized alt={department.department_name + " 대표 사진"} className="aspect-[5/3] h-full w-full object-cover" />
      </div> : null}
      <section className={universityBox + " order-1 space-y-3 lg:order-2"}>
        <p className="text-sm font-bold text-pul-point">{department.university_name} · {department.region}{department.campus ? " · " + department.campus : ""}{department.program_kind ? " · " + (department.program_kind === "degree" ? "정규학과" : "평생교육 과정") : ""}</p>
        <h1 className="break-words text-2xl font-bold text-pul-deep sm:text-3xl">{department.department_name}</h1>
        {department.recruitment_start && department.recruitment_end ? <div className="rounded-lg bg-pul-light p-3">
          <p className="text-sm text-pul-muted">모집 기간</p>
          <p className="font-bold">{department.recruitment_start} ~ {department.recruitment_end}</p>
        </div> : null}
        <div className="flex flex-wrap gap-2">{actions}</div>
        <p className="text-sm text-pul-muted">원서 접수는 대학에서, 입학 상담 신청은 PUL에서 진행합니다.</p>
      </section>
    </div>
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-4">
        <section className={universityBox + " space-y-3"}>
          <h2 className="text-xl font-bold">학과 소개</h2>
          <p className="whitespace-pre-wrap break-words">{department.summary}</p>
          <div className="flex flex-wrap gap-2"><OfficialLink value={department.school_url ?? null}>학교 공식 홈페이지</OfficialLink>
          <OfficialLink value={department.official_url}>학과 공식 홈페이지</OfficialLink></div>
        </section>
        <section className={universityBox + " space-y-3"}>
          <h2 className="text-xl font-bold">모집 공고</h2>
          {department.recruitment_title ? <h3 className="break-words font-bold">{department.recruitment_title}</h3> : null}
          {department.recruitment_body ? <p className="whitespace-pre-wrap break-words">{department.recruitment_body}</p> : null}
          {!department.recruitment_title && !department.recruitment_body && !department.recruitment_start
            ? <p className="text-sm text-pul-muted">등록된 모집 공고가 없습니다.</p> : null}
          <OfficialLink value={department.guide_url}>공식 모집요강</OfficialLink>
        </section>
        {viewer ? <section id="admission-consultation" className={universityBox + " scroll-mt-24 space-y-3"}>
          <h2 className="text-xl font-bold">입학 상담 신청</h2>
          <p className="text-sm text-pul-muted">신청 내용은 해당 학과 담당자가 확인합니다. 주민등록번호 등 민감한 정보는 적지 마세요.</p>
          <UniversityActionForm action={changeUniversity.bind(null, key, viewer, "consult")} button="PUL에 상담 접수" once>
            <label className="block text-sm font-bold">상담 내용
              <textarea className={universityInput + " mt-1"} name="body" required minLength={2} maxLength={1000} rows={4} />
            </label>
          </UniversityActionForm>
        </section> : null}
      </div>
      <aside className="space-y-4">
        <section className={universityBox + " hidden space-y-3 lg:block"}>
          <h2 className="text-lg font-bold">빠른 이용</h2>
          <div className="grid gap-2">{actions}</div>
        </section>
        <section className={universityBox + " grid gap-3"}>
          <h2 className="text-lg font-bold">재학생 공간</h2>
          <p className="text-sm text-pul-muted">재학 확인을 요청하고, 승인되면 학과 공간에 들어갈 수 있습니다.</p>
          <Link className={universityButton} href={href + "/students"}>재학생 공간 열기</Link>
          {department.can_manage ? <Link className={universityButton} href={href + "/manage"}>학과 담당자 관리</Link> : <Link className={universityButton} href={universityApplications + "?department=" + encodeURIComponent(key)}>학과 담당자 신청</Link>}
        </section>
      </aside>
    </div>
  </Container>;
}
