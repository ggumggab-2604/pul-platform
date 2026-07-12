"use client";

import {
  UNIVERSITY_COMMUNITY_INTRO,
  UNIVERSITY_DEPARTMENT_DISCLAIMER,
  activeDepartments,
  activeUniversitiesOnPulSectionCopy,
  createDefaultUniversityFilters,
  departmentBoardPosts,
  departmentPermissions,
  filterUniversityDepartments,
  freshmanRecruitingSectionCopy,
  getDepartmentById,
  getPulActivityStatusLabel,
  getUniversityInitials,
  getVisibilityBadgeStyle,
  hasDepartmentHomepage,
  recentDepartmentPostsSectionCopy,
  universityBoardCreateGuide,
  universityDepartments,
  universityListSectionCopy,
  universityRecruitmentBanners,
  universityRegionFilters,
  universityWhyChooseIntro,
  universityWhyChooseReasons,
  type ActiveDepartment,
  type DepartmentBoardPost,
  type PulActivityStatus,
  type UniversityDepartment,
  type UniversityDepartmentFilters,
  type UniversityRecruitmentBanner,
} from "@/data/universityDepartmentData";
import { CollapsibleSection } from "@/components/ui/CollapsibleSection";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";

const PC_BOARD_PREVIEW = 6;
const MOBILE_BOARD_PREVIEW = 4;
const MOBILE_WHY_PREVIEW = 3;
const MOBILE_ACTIVE_PREVIEW = 2;
const MOBILE_DEPARTMENT_PREVIEW = 5;

/** PC 대학·학과 탭 섹션 공통 스타일 */
const UNIV_SECTION =
  "rounded-xl border border-pul-border bg-white p-2.5 lg:p-5";
const UNIV_SECTION_TITLE = "text-base font-bold text-foreground lg:text-lg";
const UNIV_SECTION_DESC =
  "mt-2 text-xs leading-relaxed text-pul-muted lg:text-sm";
const UNIV_CARD_GRID_ACTIVE =
  "mt-3 grid grid-cols-1 gap-2 lg:mt-4 lg:grid-cols-4 lg:gap-4";
const UNIV_CARD_GRID_LIST =
  "mt-3 grid grid-cols-1 gap-2 lg:mt-4 lg:grid-cols-3 lg:gap-4";
const UNIV_CARD_ACTIONS =
  "mt-auto grid grid-cols-1 gap-2 pt-3 sm:grid-cols-2 lg:gap-2.5 lg:pt-4";
const UNIV_CARD_BASE =
  "flex h-full flex-col rounded-xl border border-pul-border bg-white p-3 shadow-[0_2px_10px_rgba(6,78,59,0.05)] lg:p-4";

function BadgeList({ badges }: { badges: string[] }) {
  if (badges.length === 0) return null;

  return (
    <div className="mt-2 flex flex-wrap gap-1">
      {badges.map((badge) => (
        <span
          key={badge}
          className="rounded-full border border-pul-point/25 bg-pul-light/60 px-2 py-0.5 text-[10px] font-bold text-pul-deep"
        >
          {badge}
        </span>
      ))}
    </div>
  );
}

function PulActivityStatusBadge({ status }: { status: PulActivityStatus }) {
  const isActive = status === "active";

  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold lg:text-[11px]",
        isActive
          ? "border-pul-point/40 bg-pul-light text-pul-deep"
          : "border-pul-border bg-[#fafbfa] text-pul-muted",
      )}
    >
      {getPulActivityStatusLabel(status)}
    </span>
  );
}

function DepartmentHomepageButton({
  departmentUrl,
  className,
}: {
  departmentUrl: string | null;
  className?: string;
}) {
  const baseClass =
    "inline-flex min-h-9 w-full items-center justify-center rounded-lg border text-[11px] font-bold lg:min-h-10 lg:text-xs";

  if (hasDepartmentHomepage(departmentUrl)) {
    return (
      <a
        href={departmentUrl!}
        target="_blank"
        rel="noopener noreferrer"
        className={cn(
          baseClass,
          "border-pul-border text-pul-deep hover:bg-pul-light",
          className,
        )}
      >
        학과 홈페이지 보기
      </a>
    );
  }

  return (
    <span
      role="status"
      aria-label="학과 홈페이지 준비중"
      className={cn(
        "inline-flex min-h-9 w-full items-center justify-center rounded-lg border border-dashed border-pul-border/40 bg-[#fafbfa]/50 px-2 text-[11px] font-normal text-pul-muted/70 lg:min-h-10 lg:text-xs",
        className,
      )}
    >
      홈페이지 준비중
    </span>
  );
}

function UniversityLogo({ department }: { department: UniversityDepartment }) {
  const initials = getUniversityInitials(department.universityName);

  if (department.logoUrl) {
    return (
      // TODO: 대학 담당자 제공 공식 로고만 사용 · 허가 확인 후 노출
      <img
        src={department.logoUrl}
        alt={`${department.universityName} 로고`}
        className="h-12 w-12 shrink-0 rounded-lg border border-pul-border object-cover"
      />
    );
  }

  return (
    <div
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-pul-border bg-pul-light text-sm font-bold text-pul-deep"
      aria-hidden="true"
    >
      {initials}
    </div>
  );
}

function RecruitmentBannerPlaceholder() {
  return (
    <div
      className="mt-3 flex min-h-[100px] flex-col items-center justify-center rounded-xl border border-dashed border-orange-200/70 bg-gradient-to-r from-orange-50/50 via-white to-pul-light/30 px-4 py-8 text-center lg:min-h-[120px]"
      aria-label="신입생 모집 대학 배너 광고 영역"
    >
      <p className="text-sm font-bold text-foreground lg:text-base">
        {freshmanRecruitingSectionCopy.emptyTitle}
      </p>
      <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-pul-muted lg:text-sm">
        {freshmanRecruitingSectionCopy.emptyDescription}
      </p>
    </div>
  );
}

function RecruitmentBannerCard({ banner }: { banner: UniversityRecruitmentBanner }) {
  return (
    <a
      href={banner.officialUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="group block overflow-hidden rounded-xl border border-orange-200/60 bg-gradient-to-r from-orange-50/40 to-white shadow-[0_2px_10px_rgba(6,78,59,0.05)]"
    >
      {banner.bannerImageUrl ? (
        <img
          src={banner.bannerImageUrl}
          alt={`${banner.universityName} ${banner.departmentName} 모집 배너`}
          className="h-28 w-full object-cover lg:h-32"
        />
      ) : (
        <div className="flex h-28 items-center justify-center bg-pul-light/40 px-4 lg:h-32">
          <p className="text-center text-xs text-pul-muted">
            {banner.universityName} · {banner.departmentName}
            <br />
            <span className="font-semibold text-pul-deep">{banner.title}</span>
          </p>
        </div>
      )}
      <div className="px-3 py-2.5">
        <p className="text-sm font-bold text-foreground group-hover:text-pul-deep">
          {banner.title}
        </p>
        <p className="mt-0.5 text-xs text-pul-muted">{banner.subtitle}</p>
      </div>
      {/*
        TODO: 배너 등록 대학만 모집요강/브로슈어/입학상담 링크 노출
        - officialUrl: {banner.officialUrl}
        - brochureUrl: {banner.brochureUrl}
      */}
    </a>
  );
}

function UniversityDepartmentCard({
  department,
  onBoardPreview,
  onBoardRequest,
}: {
  department: UniversityDepartment;
  onBoardPreview: (departmentId: string) => void;
  onBoardRequest: (department: UniversityDepartment) => void;
}) {
  const secondaryBadges = department.activityBadges.filter(
    (badge) => badge !== "PUL 활동중" && badge !== "PUL 비활동",
  );
  const isActive = department.pulActivityStatus === "active" && department.hasPulBoard;

  return (
    <article className={UNIV_CARD_BASE}>
      <div className="flex flex-1 flex-col">
        <div className="flex gap-3">
          <UniversityLogo department={department} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-medium text-pul-muted lg:text-xs">
                {department.region}
              </span>
              <PulActivityStatusBadge status={department.pulActivityStatus} />
            </div>
            <h4 className="mt-1 text-sm font-bold text-foreground lg:text-base">
              {department.universityName}
            </h4>
            <p className="mt-0.5 text-xs font-medium text-pul-deep lg:text-sm">
              {department.departmentName}
            </p>
            <div className="min-h-[1.25rem]">
              <BadgeList badges={secondaryBadges} />
            </div>
          </div>
        </div>

        <p className="mt-3 flex-1 text-[11px] leading-relaxed text-pul-muted lg:text-xs">
          <span className="font-semibold text-foreground">주요 특징</span>
          <br />
          {department.features}
        </p>
      </div>

      <div className={UNIV_CARD_ACTIONS}>
        {isActive ? (
          <button
            type="button"
            onClick={() => onBoardPreview(department.id)}
            className="inline-flex min-h-9 w-full items-center justify-center rounded-lg bg-pul-point text-[11px] font-bold text-white hover:bg-pul-deep lg:min-h-10 lg:text-xs"
          >
            학과 게시판 보기
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onBoardRequest(department)}
            className="inline-flex min-h-9 w-full items-center justify-center rounded-lg bg-pul-point text-[11px] font-bold text-white hover:bg-pul-deep lg:min-h-10 lg:text-xs"
          >
            게시판 신청하기
          </button>
        )}
        <DepartmentHomepageButton departmentUrl={department.departmentUrl} />
      </div>

      {/*
        TODO: 신입생 모집 대학 배너를 등록한 학교만 아래 링크 노출
        - 모집요강 보기 (department.admissionGuideUrl)
        - 브로슈어 보기 (department.brochureUrl)
        - 공식 입학처 보기 (department.admissionsUrl)
        - 입학상담 링크 (department.admissionsConsultUrl)
        TODO: universityRecruitmentBanners 에 isActive 배너로 연동
      */}
    </article>
  );
}

function BoardPostRow({ post }: { post: DepartmentBoardPost }) {
  return (
    <article className="rounded-lg border border-pul-border bg-[#fafbfa] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-pul-light px-2 py-0.5 text-[10px] font-bold text-pul-deep">
          {post.category}
        </span>
        <span
          className={cn(
            "rounded-full border px-2 py-0.5 text-[10px] font-bold",
            getVisibilityBadgeStyle(post.visibility),
          )}
        >
          {post.visibility}
        </span>
      </div>
      <p className="mt-1.5 text-sm font-semibold text-foreground">{post.title}</p>
      <p className="mt-1 text-xs font-semibold text-pul-deep lg:text-sm">
        {post.universityName}
      </p>
      <p className="text-[11px] font-medium text-foreground lg:text-xs">
        {post.departmentName}
      </p>
      <p className="mt-1.5 text-[10px] text-pul-muted">
        {post.createdAt} · 조회 {post.viewCount} · 댓글 {post.commentCount}
      </p>
    </article>
  );
}

function ActiveDepartmentCard({
  department,
  onBoardPreview,
}: {
  department: ActiveDepartment;
  onBoardPreview: (departmentId: string) => void;
}) {
  const secondaryBadges = department.badges.filter(
    (badge) => badge !== "PUL 활동중" && badge !== "PUL 비활동",
  );

  return (
    <article className={UNIV_CARD_BASE}>
      <div className="flex flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="text-[11px] font-medium text-pul-muted lg:text-xs">
            {department.region}
          </p>
          <PulActivityStatusBadge status="active" />
        </div>
        <h4 className="mt-1 text-sm font-bold text-foreground lg:text-base">
          {department.universityName}
        </h4>
        <p className="mt-0.5 text-xs font-medium text-pul-deep lg:text-sm">
          {department.departmentName}
        </p>
        <div className="min-h-[1.25rem]">
          <BadgeList badges={secondaryBadges} />
        </div>
      </div>

      <dl className="mt-3 grid shrink-0 grid-cols-3 gap-2 text-center text-[10px] text-pul-muted lg:mt-4 lg:text-xs">
        <div className="rounded-lg bg-[#fafbfa] px-2 py-2 lg:py-2.5">
          <dt className="font-semibold text-foreground">게시글</dt>
          <dd className="mt-0.5 text-sm font-bold text-pul-deep">{department.postCount}</dd>
        </div>
        <div className="rounded-lg bg-[#fafbfa] px-2 py-2 lg:py-2.5">
          <dt className="font-semibold text-foreground">댓글</dt>
          <dd className="mt-0.5 text-sm font-bold text-pul-deep">{department.commentCount}</dd>
        </div>
        <div className="rounded-lg bg-[#fafbfa] px-2 py-2 lg:py-2.5">
          <dt className="font-semibold text-foreground">최근 활동</dt>
          <dd className="mt-0.5 text-[10px] font-medium text-pul-deep lg:text-xs">
            {department.lastActiveAt.slice(5)}
          </dd>
        </div>
      </dl>

      <div className={UNIV_CARD_ACTIONS}>
        <button
          type="button"
          onClick={() => onBoardPreview(department.departmentId)}
          className="inline-flex min-h-9 w-full items-center justify-center rounded-lg bg-pul-point text-[11px] font-bold text-white hover:bg-pul-deep lg:min-h-10 lg:text-xs"
        >
          학과 게시판 보기
        </button>
        <DepartmentHomepageButton departmentUrl={department.departmentUrl} />
      </div>
    </article>
  );
}

type LessonsUniversityDepartmentsTabProps = {
  onRecruitmentInquiry?: () => void;
};

export function LessonsUniversityDepartmentsTab({
  onRecruitmentInquiry,
}: LessonsUniversityDepartmentsTabProps) {
  const [filters, setFilters] = useState<UniversityDepartmentFilters>(
    createDefaultUniversityFilters,
  );
  const [showAllDepartments, setShowAllDepartments] = useState(false);
  const [showAllBoards, setShowAllBoards] = useState(false);
  const [infoMessage, setInfoMessage] = useState<{
    title: string;
    message: string;
  } | null>(null);

  const filteredDepartments = useMemo(
    () => filterUniversityDepartments(universityDepartments, filters),
    [filters],
  );

  const hasMoreDepartments =
    !showAllDepartments && filteredDepartments.length > MOBILE_DEPARTMENT_PREVIEW;

  const visibleBoards = showAllBoards
    ? departmentBoardPosts
    : departmentBoardPosts.slice(0, PC_BOARD_PREVIEW);

  const hasMoreBoards =
    !showAllBoards && departmentBoardPosts.length > MOBILE_BOARD_PREVIEW;

  const activeRecruitmentBanners = useMemo(
    () => universityRecruitmentBanners.filter((banner) => banner.isActive),
    [],
  );

  const handleBoardPreview = (departmentId: string) => {
    const department = getDepartmentById(departmentId);
    setInfoMessage({
      title: "학과 게시판",
      message: `${department?.universityName ?? "학과"} 게시판은 준비 중입니다.\n\n향후 해당 학과 재학생·졸업생 인증 회원이 공지, 수업 후기, 입학 질문 등을 공유할 수 있습니다.`,
    });
    document.getElementById("recent-board-posts")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  const handleBoardCreate = () => {
    setInfoMessage({
      title: "우리 학교 게시판 만들기",
      message:
        "학교·학과 게시판 개설 신청 기능은 준비 중입니다.\n\n재학생, 졸업생, 학과 담당자가 신청하면 PUL 운영자가 학생증, 재학증명서, 졸업증명서, 학과 담당자 확인 자료를 검토한 뒤 학과 게시판을 개설합니다.\n최초 신청자는 임시 학과 대표로 지정됩니다.",
    });
    /*
      TODO:
      - 재학생/졸업생/학과 담당자 인증
      - 학생증, 재학증명서, 졸업증명서, 학과 담당자 확인
      - PUL 운영자 승인 후 학과 게시판 개설
      - 최초 신청자를 임시 학과 대표로 지정
      - 학과 대표 권한 관리
    */
  };

  const handleBoardRequest = (department: UniversityDepartment) => {
    const requestNote =
      department.boardRequestStatus === "requested"
        ? "\n\n이 학교는 이미 게시판 개설 신청이 접수된 상태입니다."
        : "";

    setInfoMessage({
      title: "게시판 신청하기",
      message: `${department.universityName} ${department.departmentName} 학과 게시판 개설을 신청합니다.\n\n재학생, 졸업생, 학과 담당자가 PUL에 학과 게시판 개설을 신청할 수 있습니다. PUL 운영자가 인증 자료를 확인한 뒤 게시판을 만들어드리며, 최초 신청자는 임시 학과 대표로 지정됩니다.${requestNote}`,
    });
    /*
      TODO:
      - 재학생/졸업생/학과 담당자 인증
      - 학생증, 재학증명서, 졸업증명서, 학과 담당자 확인
      - PUL 운영자 승인 후 학과 게시판 개설
      - 최초 신청자를 임시 학과 대표로 지정
      - 학과 대표 권한 관리
    */
  };

  const handleDepartmentRegistration = () => {
    setInfoMessage({
      title: "대학·학과 등록 신청",
      message:
        "대학·학과 등록 신청 기능은 준비 중입니다.\n\n운영자가 아직 등록하지 못한 파크골프 관련 대학·학과가 있거나, 새로 학과 게시판을 만들고 싶은 재학생·졸업생·학과 담당자가 신청할 수 있습니다.\n학교명, 학과명, 지역, 학과 홈페이지 등을 알려주시면 운영자가 검토 후 목록에 반영합니다.",
    });
    /*
      TODO:
      - 대학·학과 등록 신청 폼
      - 재학생/졸업생/학과 담당자 인증
      - 운영자 검토 후 universityDepartments 목록 반영
    */
  };

  return (
    <>
      <div className="space-y-3 lg:space-y-6">
        <section className="rounded-xl border border-pul-border bg-white p-2.5 shadow-[0_2px_10px_rgba(6,78,59,0.06)] lg:p-5">
          <p className="text-[10px] font-bold tracking-[0.14em] text-pul-point lg:text-[11px]">
            UNIVERSITY COMMUNITY
          </p>
          <h2 className="mt-1 text-lg font-bold text-foreground lg:text-xl">
            {UNIVERSITY_COMMUNITY_INTRO.title}
          </h2>
          <p className="mt-2 whitespace-pre-line text-xs leading-relaxed text-pul-muted lg:text-sm">
            {UNIVERSITY_COMMUNITY_INTRO.description}
          </p>
        </section>

        <section className="rounded-xl border border-pul-border bg-white p-2.5 lg:p-4">
          <h3 className="text-base font-bold text-foreground lg:text-lg">
            {universityWhyChooseIntro.title}
          </h3>
          <p className="mt-2 text-xs leading-relaxed text-pul-muted lg:text-sm">
            {universityWhyChooseIntro.description}
          </p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 lg:gap-3">
            {universityWhyChooseReasons.map((reason, index) => (
              <div
                key={reason}
                className={cn(
                  "rounded-lg border border-pul-border bg-[#fafbfa] px-3 py-3",
                  index >= MOBILE_WHY_PREVIEW && "hidden lg:block",
                )}
              >
                <p className="text-xs leading-relaxed text-foreground lg:text-sm">
                  {reason}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section
          id="freshman-recruiting-section"
          className={UNIV_SECTION}
        >
          <h3 className={UNIV_SECTION_TITLE}>
            {freshmanRecruitingSectionCopy.title}
          </h3>
          <p className={cn(UNIV_SECTION_DESC, "whitespace-pre-line")}>
            {freshmanRecruitingSectionCopy.description}
          </p>

          {activeRecruitmentBanners.length > 0 ? (
            <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:gap-3">
              {activeRecruitmentBanners.map((banner) => (
                <div key={banner.id} className="min-w-0 flex-1">
                  <RecruitmentBannerCard banner={banner} />
                </div>
              ))}
            </div>
          ) : (
            <RecruitmentBannerPlaceholder />
          )}

          {/*
            TODO: 대학 홍보 계약 체결 시 가로 배너 노출
            TODO: PC — 가로형 배너 1~3개 슬라이드 또는 리스트 노출
            TODO: 모바일 — 1열 가로 배너 카드 노출
            TODO: 배너 클릭 시 대학 홍보 상세 페이지 또는 공식 입학처 링크 연결
            TODO: 모집요강/브로슈어/입학상담 링크는 배너 등록 대학만 노출
          */}

          <button
            type="button"
            onClick={onRecruitmentInquiry}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-pul-light text-sm font-bold text-pul-deep hover:bg-pul-light/80 sm:w-auto sm:px-6"
          >
            대학 홍보 문의
          </button>
        </section>

        <section
          id="recent-board-posts"
          className={UNIV_SECTION}
        >
          <h3 className={UNIV_SECTION_TITLE}>
            {recentDepartmentPostsSectionCopy.title}
          </h3>
          <p className={UNIV_SECTION_DESC}>
            {recentDepartmentPostsSectionCopy.description}
          </p>

          <div className="mt-3 grid grid-cols-1 gap-2 lg:grid-cols-2 lg:gap-3">
            {visibleBoards.map((post, index) => (
              <div
                key={post.id}
                className={cn(
                  index >= MOBILE_BOARD_PREVIEW && !showAllBoards && "hidden lg:block",
                )}
              >
                <BoardPostRow post={post} />
              </div>
            ))}
          </div>

          {hasMoreBoards && (
            <button
              type="button"
              onClick={() => setShowAllBoards(true)}
              className="mt-3 inline-flex min-h-10 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-xs font-bold text-pul-deep hover:bg-pul-light lg:min-h-11 lg:text-sm"
            >
              최근 게시글 더 보기
            </button>
          )}
          {/* TODO: 게시글 상세 · 글쓰기 · 댓글 · 재학생 전용 글 열람 UI */}
        </section>

        <section className="rounded-xl border border-dashed border-pul-point/30 bg-pul-light/20 p-2.5 lg:p-5">
          <h3 className={UNIV_SECTION_TITLE}>
            {universityBoardCreateGuide.title}
          </h3>
          <p className={cn(UNIV_SECTION_DESC, "whitespace-pre-line")}>
            {universityBoardCreateGuide.description}
          </p>
          <button
            type="button"
            onClick={handleBoardCreate}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-pul-point text-sm font-bold text-white hover:bg-pul-deep sm:w-auto sm:px-6"
          >
            우리 학교 게시판 만들기
          </button>
        </section>

        <section className={UNIV_SECTION}>
          <h3 className={UNIV_SECTION_TITLE}>
            {activeUniversitiesOnPulSectionCopy.title}
          </h3>
          <p className={UNIV_SECTION_DESC}>
            {activeUniversitiesOnPulSectionCopy.description}
          </p>
          <div className={UNIV_CARD_GRID_ACTIVE}>
            {activeDepartments.map((department, index) => (
              <div
                key={department.id}
                className={cn(
                  "h-full",
                  index >= MOBILE_ACTIVE_PREVIEW && "hidden lg:block",
                )}
              >
                <ActiveDepartmentCard
                  department={department}
                  onBoardPreview={handleBoardPreview}
                />
              </div>
            ))}
          </div>
        </section>

        <section
          id="university-list-section"
          className={UNIV_SECTION}
        >
          <h3 className={UNIV_SECTION_TITLE}>
            {universityListSectionCopy.title}
          </h3>
          <p className={cn(UNIV_SECTION_DESC, "whitespace-pre-line")}>
            {universityListSectionCopy.description}
          </p>
          <p className="mt-2 text-xs text-pul-muted lg:mt-3 lg:text-sm">
            등록된 대학·학과{" "}
            <span className="font-bold text-pul-deep">{filteredDepartments.length}</span>
            개
          </p>

          <div className="mt-3">
            <select
              value={filters.region}
              onChange={(event) => {
                setFilters({ region: event.target.value });
                setShowAllDepartments(false);
              }}
              className="h-10 w-full rounded-lg border border-pul-border px-3 text-sm sm:max-w-xs"
              aria-label="지역 필터"
            >
              {universityRegionFilters.map((region) => (
                <option key={region} value={region}>
                  지역: {region}
                </option>
              ))}
            </select>
          </div>

          {filteredDepartments.length === 0 ? (
            <p className="mt-3 rounded-lg border border-dashed border-pul-border px-3 py-6 text-center text-sm text-pul-muted">
              해당 지역에 등록된 대학·학과가 없습니다.
            </p>
          ) : (
            <div className={UNIV_CARD_GRID_LIST}>
              {filteredDepartments.map((department, index) => (
                <div
                  key={department.id}
                  className={cn(
                    "h-full",
                    index >= MOBILE_DEPARTMENT_PREVIEW &&
                      !showAllDepartments &&
                      "hidden lg:block",
                  )}
                >
                  <UniversityDepartmentCard
                    department={department}
                    onBoardPreview={handleBoardPreview}
                    onBoardRequest={handleBoardRequest}
                  />
                </div>
              ))}
            </div>
          )}

          <div className="mt-3 flex flex-col gap-2 lg:mt-4 lg:gap-3">
            {hasMoreDepartments && (
              <button
                type="button"
                onClick={() => setShowAllDepartments(true)}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-white text-sm font-bold text-pul-deep hover:bg-pul-light"
              >
                전체 대학·학과 보기 ({filteredDepartments.length}개)
              </button>
            )}

            <p className="text-xs leading-relaxed text-pul-muted lg:text-sm">
              {universityListSectionCopy.registrationHint}
            </p>

            <button
              type="button"
              onClick={handleDepartmentRegistration}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-pul-border bg-pul-light text-sm font-bold text-pul-deep hover:bg-pul-light/80 lg:min-h-12"
            >
              대학·학과 등록 신청
            </button>
          </div>
        </section>

        <section
          id="department-board-section"
          className={UNIV_SECTION}
        >
          <div className="lg:hidden">
            <CollapsibleSection
              title="학과별 미니게시판 권한 안내"
              summary="일반글·재학생 전용·글쓰기·관리 권한 요약"
              className="border-0 shadow-none"
            >
              <ul className="space-y-1.5 text-sm leading-relaxed text-pul-muted">
                <li>
                  <span className="font-semibold text-foreground">일반글:</span> 전체
                  공개
                </li>
                <li>
                  <span className="font-semibold text-foreground">재학생 전용 글:</span>{" "}
                  해당 학교·학과 인증 회원만 열람
                </li>
                <li>
                  <span className="font-semibold text-foreground">글쓰기:</span> 해당
                  학과 재학생·졸업생 인증 회원
                </li>
                <li>
                  <span className="font-semibold text-foreground">학과 공지:</span> 학과
                  담당자 또는 인증된 학과 대표
                </li>
                <li>
                  <span className="font-semibold text-foreground">관리:</span> 학과
                  담당자 · 학과 대표 · PUL 관리자
                </li>
              </ul>
            </CollapsibleSection>
          </div>

          <div className="hidden lg:block">
            <h3 className={UNIV_SECTION_TITLE}>
              학과별 미니게시판 권한 안내
            </h3>

            <aside className="mt-3 rounded-lg border border-dashed border-pul-point/25 bg-pul-light/20 px-3 py-3">
              <dl className="space-y-2 text-xs leading-relaxed text-pul-muted">
                <div>
                  <dt className="font-semibold text-foreground">일반글</dt>
                  <dd>전체 공개</dd>
                </div>
                <div>
                  <dt className="font-semibold text-foreground">재학생 전용 글</dt>
                  <dd>해당 학교·학과 인증 회원만 열람 가능</dd>
                </div>
                <div>
                  <dt className="font-semibold text-foreground">글쓰기</dt>
                  <dd>해당 학과 재학생·졸업생 인증 회원</dd>
                </div>
                <div>
                  <dt className="font-semibold text-foreground">학과 공지</dt>
                  <dd>학과 담당자 또는 인증된 학과 대표</dd>
                </div>
                <div>
                  <dt className="font-semibold text-foreground">관리</dt>
                  <dd>학과 담당자 · 학과 대표 · PUL 관리자</dd>
                </div>
              </dl>
              <p className="mt-2 text-[10px] leading-snug text-pul-muted">
                정책 키: publicRead={String(departmentPermissions.publicRead)},
                secretReadRole={departmentPermissions.secretReadRole},
                postRole={departmentPermissions.postRole},
                noticeRole={departmentPermissions.noticeRole},
                manageRole={departmentPermissions.manageRole}
              </p>
            </aside>
          </div>
          {/* TODO: 학과 인증 · 재학생/졸업생 인증 · 글쓰기 · 재학생 전용 글 열람 구현 */}
        </section>

        <p className="whitespace-pre-line rounded-xl border border-pul-border bg-[#fafbfa] px-3 py-3 text-[11px] leading-relaxed text-pul-muted lg:px-4 lg:py-4 lg:text-xs">
          {UNIVERSITY_DEPARTMENT_DISCLAIMER}
        </p>
      </div>

      {infoMessage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setInfoMessage(null)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-pul-border bg-white p-5 shadow-[0_12px_40px_rgba(6,78,59,0.2)]"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="text-xl font-bold text-foreground">{infoMessage.title}</h2>
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-pul-muted">
              {infoMessage.message}
            </p>
            <button
              type="button"
              onClick={() => setInfoMessage(null)}
              className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-lg border border-pul-border text-sm font-bold text-pul-muted hover:text-pul-deep"
            >
              닫기
            </button>
          </div>
        </div>
      )}
    </>
  );
}
