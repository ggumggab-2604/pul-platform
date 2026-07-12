"use client";

import { CertificationActivityTab } from "@/components/certification/CertificationActivityTab";
import { CertificationCoursesTab } from "@/components/certification/CertificationCoursesTab";
import { CertificationExamPrepTab } from "@/components/certification/CertificationExamPrepTab";
import { CertificationGuideTab } from "@/components/certification/CertificationGuideTab";
import {
  CertificationPageTabs,
  type CertificationPageTab,
} from "@/components/certification/CertificationPageTabs";
import {
  CERT_AD_INQUIRY_FORM_URL,
  CERT_COURSE_INQUIRY_FORM_URL,
  CERT_JOB_REGISTER_FORM_URL,
  courseCategoryLabels,
  courseMethodLabels,
  refereeRoleTypeLabels,
  type CourseFilters,
  type ExamType,
  type QualificationCourse,
  type QualificationGuide,
  type RefereeJobPost,
  type RefereeTalentProfile,
} from "@/data/certificationData";
import { InfoModal } from "@/components/ui/InfoModal";
import { useMemo, useState } from "react";

function getGuideCourseFilters(guide: QualificationGuide): Partial<CourseFilters> {
  switch (guide.id) {
    case "guide-instructor":
      return { category: "instructor" };
    case "guide-referee":
      return { category: "referee" };
    case "guide-national":
      return { keyword: "국가시험" };
    case "guide-private":
      return { category: "private_instructor" };
    default:
      return {};
  }
}

function getGuideExamType(guide: QualificationGuide): ExamType | "all" {
  switch (guide.id) {
    case "guide-national":
      return "life_sports";
    case "guide-instructor":
      return "park_instructor";
    case "guide-referee":
      return "park_referee";
    case "guide-private":
      return "private_instructor";
    default:
      return "all";
  }
}

export function CertificationPageContent() {
  const [activeTab, setActiveTab] = useState<CertificationPageTab>("guide");
  const [courseFilters, setCourseFilters] = useState<Partial<CourseFilters>>({});
  const [examPrepType, setExamPrepType] = useState<ExamType | "all">("all");
  const [filterSeed, setFilterSeed] = useState(0);
  const [examPrepSeed, setExamPrepSeed] = useState(0);
  const [selectedCourse, setSelectedCourse] = useState<QualificationCourse | null>(null);
  const [selectedJob, setSelectedJob] = useState<RefereeJobPost | null>(null);
  const [selectedProfile, setSelectedProfile] = useState<RefereeTalentProfile | null>(null);
  const [infoModal, setInfoModal] = useState<
    | "course-inquiry"
    | "course-detail"
    | "job-inquiry"
    | "job-register"
    | "profile-inquiry"
    | "profile-register"
    | "ad-inquiry"
    | null
  >(null);

  const courseInquiryMessage = useMemo(() => {
    if (!selectedCourse) return "";
    return [
      `「${selectedCourse.title}」 과정 문의입니다.`,
      "",
      `교육기관: ${selectedCourse.provider}`,
      `지역: ${selectedCourse.region}`,
      `비용: ${selectedCourse.price}`,
      "",
      "실제 신청·결제는 주관기관에 직접 문의해 주세요.",
      "MVP 단계에서는 PUL 운영자가 문의 내용을 확인 후 안내합니다.",
    ].join("\n");
  }, [selectedCourse]);

  const courseDetailMessage = useMemo(() => {
    if (!selectedCourse) return "";
    return [
      selectedCourse.description,
      "",
      `구분: ${courseCategoryLabels[selectedCourse.category]}`,
      `주관/교육기관: ${selectedCourse.provider}`,
      `지역: ${selectedCourse.region}`,
      `교육 방식: ${courseMethodLabels[selectedCourse.method]}`,
      `일정: ${selectedCourse.schedule}`,
      `대상: ${selectedCourse.target}`,
      `비용: ${selectedCourse.price}`,
      "",
      "최신 일정·모집 상태는 주관기관 공지를 확인하세요.",
    ].join("\n");
  }, [selectedCourse]);

  const jobInquiryMessage = useMemo(() => {
    if (!selectedJob) return "";
    return [
      `「${selectedJob.title}」 구인 공고 문의입니다.`,
      "",
      `구분: ${refereeRoleTypeLabels[selectedJob.roleType]}`,
      `지역: ${selectedJob.region}`,
      `일정: ${selectedJob.schedule}`,
      `역할: ${selectedJob.role}`,
      `등록 주체: ${selectedJob.organizerType}`,
      "",
      "실제 지원·배정은 모집 주체에 직접 문의해 주세요.",
      "MVP 단계에서는 PUL 운영자가 문의 내용을 확인 후 안내합니다.",
    ].join("\n");
  }, [selectedJob]);

  const profileInquiryMessage = useMemo(() => {
    if (!selectedProfile) return "";
    return [
      `「${selectedProfile.nickname}」 구직 프로필 문의입니다.`,
      "",
      `보유 자격: ${selectedProfile.licenses.join(", ")}`,
      `활동 가능 지역: ${selectedProfile.regions.join(" / ")}`,
      `PUL 활동 점수: ${selectedProfile.pulActivityScore}점`,
      `PUL 활동: ${selectedProfile.activityHighlights.join(", ")}`,
      "",
      "자격 보유 여부와 활동 조건은 등록자와 직접 확인해 주세요.",
      "MVP 단계에서는 PUL 운영자가 문의 내용을 확인 후 안내합니다.",
    ].join("\n");
  }, [selectedProfile]);

  const handleGuideSelect = (guide: QualificationGuide) => {
    const nextTab = guide.linkTab ?? "courses";
    setActiveTab(nextTab);

    if (nextTab === "courses") {
      setCourseFilters(getGuideCourseFilters(guide));
      setFilterSeed((value) => value + 1);
    }

    if (nextTab === "exam-prep") {
      setExamPrepType(getGuideExamType(guide));
      setExamPrepSeed((value) => value + 1);
    }

    // TODO: 탭 전환 후 해당 섹션 앵커 스크롤
  };

  const handleCourseInquiry = (course: QualificationCourse) => {
    setSelectedCourse(course);
    setInfoModal("course-inquiry");
  };

  const handleCourseDetail = (course: QualificationCourse) => {
    setSelectedCourse(course);
    setInfoModal("course-detail");
  };

  const handleJobInquiry = (job: RefereeJobPost) => {
    setSelectedJob(job);
    setInfoModal("job-inquiry");
  };

  const handleProfileInquiry = (profile: RefereeTalentProfile) => {
    setSelectedProfile(profile);
    setInfoModal("profile-inquiry");
  };

  return (
    <div className="space-y-3 lg:space-y-4">
      <CertificationPageTabs activeTab={activeTab} onChange={setActiveTab} />

      {activeTab === "guide" && (
        <CertificationGuideTab onGuideSelect={handleGuideSelect} />
      )}
      {activeTab === "exam-prep" && (
        <CertificationExamPrepTab
          initialExamType={examPrepType}
          filterSeed={examPrepSeed}
        />
      )}
      {activeTab === "courses" && (
        <CertificationCoursesTab
          onInquiry={handleCourseInquiry}
          onDetail={handleCourseDetail}
          onAdInquiry={() => setInfoModal("ad-inquiry")}
          initialFilters={courseFilters}
          filterSeed={filterSeed}
        />
      )}
      {activeTab === "activity" && (
        <CertificationActivityTab
          onJobInquiry={handleJobInquiry}
          onJobRegister={() => setInfoModal("job-register")}
          onProfileInquiry={handleProfileInquiry}
          onProfileRegister={() => setInfoModal("profile-register")}
        />
      )}

      {infoModal === "course-inquiry" && selectedCourse && (
        <InfoModal
          title="교육과정 문의"
          message={courseInquiryMessage}
          actionLabel="문의 양식 열기"
          actionHref={CERT_COURSE_INQUIRY_FORM_URL}
          onClose={() => {
            setInfoModal(null);
            setSelectedCourse(null);
          }}
        />
      )}
      {infoModal === "course-detail" && selectedCourse && (
        <InfoModal
          title={selectedCourse.title}
          message={courseDetailMessage}
          actionLabel="문의하기"
          actionHref={CERT_COURSE_INQUIRY_FORM_URL}
          onClose={() => {
            setInfoModal(null);
            setSelectedCourse(null);
          }}
        />
      )}
      {infoModal === "job-inquiry" && selectedJob && (
        <InfoModal
          title="구인 공고 문의"
          message={jobInquiryMessage}
          actionLabel="문의 양식 열기"
          actionHref={CERT_JOB_REGISTER_FORM_URL}
          onClose={() => {
            setInfoModal(null);
            setSelectedJob(null);
          }}
        />
      )}
      {infoModal === "job-register" && (
        <InfoModal
          title="구인 공고 등록 문의"
          message={[
            "대회 운영자, 협회, 동호회, 교육기관은 심판·강사·진행요원 모집 공고를 PUL에 등록할 수 있습니다.",
            "",
            "MVP 단계에서는 운영자 확인 후 수동 등록합니다.",
            "TODO: 구인 공고 직접 등록 · 승인 워크플로",
          ].join("\n")}
          actionLabel="등록 문의 양식"
          actionHref={CERT_JOB_REGISTER_FORM_URL}
          onClose={() => setInfoModal(null)}
        />
      )}
      {infoModal === "profile-inquiry" && selectedProfile && (
        <InfoModal
          title="구직 프로필 문의"
          message={profileInquiryMessage}
          actionLabel="문의 양식 열기"
          actionHref={CERT_JOB_REGISTER_FORM_URL}
          onClose={() => {
            setInfoModal(null);
            setSelectedProfile(null);
          }}
        />
      )}
      {infoModal === "profile-register" && (
        <InfoModal
          title="구직 프로필 등록 신청"
          message={[
            "자격증 보유 회원은 자격 인증과 PUL 활동 점수를 바탕으로 심판·강사 구직 프로필을 등록할 수 있습니다.",
            "",
            "초기에는 자격 인증 회원의 기본 구직 프로필 등록을 무료로 운영합니다.",
            "MVP 단계에서는 운영자 확인 후 수동 등록합니다.",
            "TODO: 자격 인증 · PUL 활동 점수 연동 · 구직 프로필 직접 등록",
          ].join("\n")}
          actionLabel="등록 신청 양식"
          actionHref={CERT_JOB_REGISTER_FORM_URL}
          onClose={() => setInfoModal(null)}
        />
      )}
      {infoModal === "ad-inquiry" && (
        <InfoModal
          title="교육과정 등록 문의"
          message={[
            "평생교육원, 협회, 민간재단, 사설 교육기관, 강사, 온라인 강의 운영자는 PUL에 자격증·심판 교육과정을 홍보할 수 있습니다.",
            "",
            "MVP 단계에서는 운영자 확인 후 수동 등록합니다.",
            "이후 교육기관 직접 등록 및 광고 상품으로 확장할 예정입니다.",
            "",
            "TODO: 교육기관 직접 등록 · 광고 결제 연동",
          ].join("\n")}
          actionLabel="등록 문의 양식"
          actionHref={CERT_AD_INQUIRY_FORM_URL}
          onClose={() => setInfoModal(null)}
        />
      )}
    </div>
  );
}
