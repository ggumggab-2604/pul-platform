import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { OperationsDashboard } from "@/components/manage/OperationsDashboard";
import { Container } from "@/components/ui/Container";
import {
  listCertificationCoursesForManagement,
  listCertificationExamSchedulesForManagement,
  listCertificationJobsForManagement,
} from "@/lib/certification/certificationDirectory";
import {
  createCertificationDirectoryFreshnessMetric,
  getOperationsDashboard,
  latestCertificationDirectoryUpdatedAt,
  type OpsDashboardMetric,
} from "@/lib/operations/operationsDashboard";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export const metadata: Metadata = {
  title: "운영 관리센터",
  description: "PUL 콘텐츠와 운영 요청 관리",
};

const managementLinks = [
  {
    href: "/manage/club-directory-corrections",
    title: "동호회 정보 수정 제보",
    description: "회원이 접수한 동호회 정보 오류·변경 제보를 확인하고 처리합니다.",
    role: "플랫폼 관리자",
  },
  {
    href: "/manage/banners",
    title: "배너·홍보 관리",
    description: "메인과 주요 메뉴에 표시할 공지·제휴·광고 배너를 등록하고 예약합니다.",
    role: "플랫폼 관리자",
  },
  {
    href: "/hall-of-fame/manage",
    title: "명예의 전당 운영",
    description: "등재 요청과 정정·이의·신고를 확인합니다.",
    role: "명예의 전당 운영자",
  },
  {
    href: "/hall-of-fame/manage/evidence-cleanup",
    title: "명예의 전당 증빙 정리",
    description: "만료·실패·교체된 private 증빙을 한 건씩 안전하게 정리합니다.",
    role: "플랫폼 관리자",
  },
  {
    href: "/news/manage",
    title: "뉴스·정보 운영",
    description: "뉴스와 제보·홍보 문의를 관리합니다.",
    role: "플랫폼 관리자",
  },
  {
    href: "/courses/manage",
    title: "골프장 운영",
    description: "골프장 정보를 등록·수정하고 회원 정보 제보를 처리합니다.",
    role: "플랫폼 관리자",
  },
  {
    href: "/events/manage",
    title: "대회·이벤트 운영",
    description: "공식 일정과 접수 상태를 관리하고 최신성 신호를 확인합니다.",
    role: "플랫폼 관리자",
  },
  {
    href: "/lessons/manage/requests",
    title: "레슨 등록요청",
    description: "레슨·교육 등록요청을 확인합니다.",
    role: "플랫폼 관리자",
  },
  {
    href: "/lessons/manage/university-departments",
    title: "대학·학과 운영",
    description: "파크골프 관련 대학·학과 디렉터리와 회원 등록·수정 요청을 관리합니다.",
    role: "플랫폼 관리자",
  },
  {
    href: "/certification/manage",
    title: "자격증·심판 운영",
    description: "교육과정·시험 일정·심판 및 관련 구인 정보를 등록하고 공개 상태를 관리합니다.",
    role: "플랫폼 관리자",
  },
  {
    href: "/certification/manage/requests",
    title: "자격증 정보 요청",
    description: "자격증·심판 과정 등록요청을 확인합니다.",
    role: "플랫폼 관리자",
  },
  {
    href: "/lessons/manage/reports",
    title: "레슨 정보제보",
    description: "공개 레슨 정보의 오류·변경 제보를 확인합니다.",
    role: "플랫폼 관리자",
  },
  {
    href: "/market/manage/repair-shop-inquiries",
    title: "장터 수리점 문의",
    description: "수리업체 등록 문의를 확인하고 처리합니다.",
    role: "플랫폼 관리자",
  },
  {
    href: "/market/manage/partnership-inquiries",
    title: "장터 제휴 문의",
    description: "광고·입점·제휴 문의를 확인하고 처리합니다.",
    role: "플랫폼 관리자",
  },
];

export default async function ManagementHomePage() {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) redirect("/login?next=/manage");

  let dashboard = null;
  let directoryMetric: OpsDashboardMetric | null = null;
  let dashboardLoadFailed = false;
  let directoryMetricLoadFailed = false;
  const [dashboardResult, directoryResult] = await Promise.allSettled([
    getOperationsDashboard(context.supabase),
    Promise.all([
      listCertificationCoursesForManagement(context.supabase, {}, 1, 0),
      listCertificationExamSchedulesForManagement(context.supabase, {}, 1, 0),
      listCertificationJobsForManagement(context.supabase, {}, 1, 0),
    ]),
  ]);
  if (dashboardResult.status === "fulfilled") {
    dashboard = dashboardResult.value;
  } else {
    dashboardLoadFailed = true;
  }
  if (directoryResult.status === "fulfilled") {
    const [courses, exams, jobs] = directoryResult.value;
    directoryMetric = createCertificationDirectoryFreshnessMetric({
      courseTotal: courses.total,
      examTotal: exams.total,
      jobTotal: jobs.total,
      latestUpdatedAt: latestCertificationDirectoryUpdatedAt([
        courses.items[0]?.updatedAt,
        exams.items[0]?.updatedAt,
        jobs.items[0]?.updatedAt,
      ]),
    });
  } else {
    directoryMetricLoadFailed = true;
  }

  return (
    <main className="min-h-screen bg-pul-page">
      <Container className="max-w-6xl px-3 py-8 pb-20 sm:py-12">
        <header className="rounded-2xl border border-pul-border bg-white p-5 sm:p-7">
          <p className="text-sm font-bold text-pul-point">PUL 운영</p>
          <h1 className="mt-2 text-3xl font-black text-foreground">운영 관리센터</h1>
          <p className="mt-3 max-w-3xl text-base leading-7 text-pul-muted">
            필요한 업무를 선택하세요. 각 화면은 서버에서 현재 계정의 실제 권한을 다시 확인합니다.
          </p>
        </header>

        <OperationsDashboard
          dashboard={dashboard}
          loadFailed={dashboardLoadFailed}
          directoryMetric={directoryMetric}
          directoryMetricLoadFailed={directoryMetricLoadFailed}
        />

        <section aria-labelledby="management-links-heading" className="mt-6">
          <h2 id="management-links-heading" className="text-xl font-black text-foreground">
            관리 업무
          </h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {managementLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-2xl border border-pul-border bg-white p-5 transition hover:border-pul-point hover:shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pul-point"
              >
                <span className="flex items-start justify-between gap-4">
                  <span>
                    <span className="block text-lg font-black text-foreground group-hover:text-pul-deep">
                      {item.title}
                    </span>
                    <span className="mt-2 block text-base leading-7 text-pul-muted">{item.description}</span>
                  </span>
                  <span aria-hidden="true" className="text-2xl font-bold text-pul-point">›</span>
                </span>
                <span className="mt-3 inline-flex rounded-full bg-pul-light px-3 py-1 text-xs font-bold text-pul-deep">
                  {item.role}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </Container>
    </main>
  );
}
