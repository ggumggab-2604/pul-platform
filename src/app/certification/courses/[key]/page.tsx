import { courseCategoryLabels, courseMethodLabels, courseStatusLabels } from "@/data/certificationData";
import { getCertificationDateRangeDisplay } from "@/lib/certification/certificationDateDisplay";
import { notFound } from "next/navigation";
import { CertificationDetailFields, CertificationDetailFrame, certificationLink } from "@/components/certification/CertificationDetailFrame";
import { CertificationDirectoryError, getPublicCertificationCourse } from "@/lib/certification/certificationDirectory";
import { courseDetailFields, type DirectoryDetails } from "@/lib/certification/certificationPhaseOne";
import { createClient } from "@/lib/supabase/server";

const won = (value: string | number) => Number(value).toLocaleString("ko-KR") + "원";

export default async function CertificationCourseDetail({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const client = await createClient();
  const [course, supplemental] = await Promise.all([
    getPublicCertificationCourse(client, key).catch((error: unknown) => {
      if (error instanceof CertificationDirectoryError && error.code === "notFound") notFound();
      throw error;
    }),
    client.rpc("certification_details", { p_entity: "course", p_key: key, p_manage: false }),
  ]);
  const details = (supplemental.data as DirectoryDetails | null)?.details ?? {};
  const fees = [details.tuition, details.exam_fee, details.issue_fee];
  const total = fees.every(Boolean) ? won(fees.reduce((sum, value) => sum + Number(value), 0)) : null;
  const range = getCertificationDateRangeDisplay(course.startsOn, course.endsOn, { range: "확정 일정", start: "시작일", end: "종료일" });
  return <CertificationDetailFrame title={course.title} back="/certification?tab=courses">
    <p className="whitespace-pre-wrap break-words leading-7">{course.description}</p>
    <CertificationDetailFields fields={[
      ["운영기관", course.provider], ["구분", courseCategoryLabels[course.category]],
      ...courseDetailFields.map(([key, name]) => [name, details[key] && (key === "tuition" || key.endsWith("_fee") ? won(details[key]) : details[key])] as const),
      ["총비용", total], ["기존 비용 안내", course.price], ["교육 일정", course.schedule], ["교육 지역", course.region], ["교육 대상", course.target],
      ["교육 방식", courseMethodLabels[course.method]], ["모집 상태", courseStatusLabels[course.status]],
      ...(range ? [[range.label, range.value] as const] : []),
    ]} />
    <p className="text-sm leading-6 text-pul-muted">광고비와 배너 노출은 PUL 운영 영역입니다. 수강 신청·결제·환불은 외부 교육기관 또는 판매처에서 진행합니다.</p>
    <a className={certificationLink} href={course.applicationUrl ?? course.officialUrl} target="_blank" rel="noreferrer">
      {course.applicationUrl ? "외부 교육기관에서 신청 (새 창)" : "교육기관 사이트에서 확인 (새 창)"}
    </a>
  </CertificationDetailFrame>;
}
