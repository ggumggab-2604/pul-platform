/**
 * TODO:
 * - 대학 담당자가 직접 제공한 공식 로고만 사용
 * - 로고 사용 허가 확인
 * - 로고 없을 경우 학교명 이니셜 표시
 * - 학과별 미니게시판 DB 연동 · 글쓰기 · 인증 회원
 * - 학생증/재학증명/졸업증명 확인
 * - 학과 게시판 개설 신청
 * - 최초 개설자 임시 학과 대표 지정
 * - 학과 대표 권한 관리
 * - PUL 운영자 승인 후 게시판 생성
 * - 대학 홍보 등록 학교만 모집요강/브로슈어/입학처 링크 노출
 * - 대학 모집 시즌 배너 등록 기능
 * - 대학별 홍보 상세 페이지
 * - 입학상담 링크 연결
 * - 신입생 모집 대학 배너 등록
 * - 메인 화면 모집 배너 연동
 * - 대학·학과 탭 상단 추천 노출
 */

export type UniversityRecruitmentBanner = {
  id: string;
  universityName: string;
  departmentName: string;
  region: string;
  bannerImageUrl: string | null;
  title: string;
  subtitle: string;
  recruitmentPeriod: string;
  targetStudents: string;
  officialUrl: string;
  brochureUrl: string;
  isActive: boolean;
};

/** @deprecated UniversityRecruitmentBanner 사용 */
export type FreshmanRecruitingUniversity = {
  id: string;
  departmentId: string;
  universityName: string;
  departmentName: string;
  region: string;
  recruitmentStatus: string;
  highlight: string;
  logoUrl: string | null;
};

export type BoardPublicStatus = "일반글" | "재학생 전용" | "학과 공지";

export type DepartmentBoardPost = {
  id: string;
  universityName: string;
  departmentName: string;
  category: string;
  title: string;
  visibility: BoardPublicStatus;
  authorRole: string;
  commentCount: number;
  viewCount: number;
  createdAt: string;
};

export type PulActivityStatus = "active" | "inactive";

export type BoardRequestStatus = "none" | "requested" | "approved" | "rejected";

export type ActiveDepartment = {
  id: string;
  departmentId: string;
  universityName: string;
  departmentName: string;
  region: string;
  postCount: number;
  commentCount: number;
  lastActiveAt: string;
  badges: string[];
  departmentUrl: string | null;
};

export type UniversityDepartment = {
  id: string;
  universityName: string;
  departmentName: string;
  region: string;
  logoUrl: string | null;
  features: string;
  departmentUrl: string | null;
  pulActivityStatus: PulActivityStatus;
  hasPulBoard: boolean;
  boardUrl: string;
  boardRequestStatus: BoardRequestStatus;
  postCount: number;
  commentCount: number;
  lastActiveAt: string | null;
  activityBadges: string[];
  /** 신입생 모집 배너·홍보 등록 학교만 true */
  isPromoted: boolean;
  admissionGuideUrl: string;
  brochureUrl: string;
  admissionsUrl: string;
  admissionsConsultUrl: string;
};

export const departmentPermissions = {
  publicRead: true,
  secretReadRole: "verifiedDepartmentMember",
  postRole: "verifiedStudentOrAlumni",
  noticeRole: "departmentAdminOrRepresentative",
  manageRole: "departmentAdminOrPulAdmin",
} as const;

export const universityRegionFilters = [
  "전체",
  "서울",
  "경기",
  "인천",
  "강원",
  "충청",
  "전라",
  "경상",
  "제주",
] as const;

export const plannedUniversityBannerSlots = [
  "신입생 모집 대학 배너 등록",
  "메인 화면 모집 배너 연동",
  "대학·학과 탭 상단 추천 노출",
  "모집요강/브로슈어 연결",
  "공식 입학처 링크 연결",
  "입학상담 링크 연결",
] as const;

export const UNIVERSITY_COMMUNITY_INTRO = {
  title: "대학·학과 커뮤니티",
  description:
    "파크골프 관련 대학·학과의 수업 후기, 실기 활동, 자격증 준비, 입학 질문, 동문 소식을 함께 볼 수 있는 공개 커뮤니티 공간입니다.\n일반글은 누구나 볼 수 있고, 재학생 전용 글은 해당 학과 인증 회원만 볼 수 있습니다.",
};

export const universityBoardCreateGuide = {
  title: "우리 학교 게시판이 아직 없나요?",
  description:
    "PUL에 등록된 대학이라도 아직 학과 게시판이 없을 수 있습니다.\n재학생, 졸업생, 학과 담당자가 게시판 개설을 신청하면 PUL 운영자가 인증 자료를 확인한 뒤 학과 게시판을 만들어드립니다.\n등록되지 않은 대학·학과도 「대학·학과 등록 신청」을 통해 알려주실 수 있습니다.",
};

export const universityListSectionCopy = {
  title: "파크골프 관련 대학·학과",
  description:
    "운영자가 조사한 국내 파크골프 관련 대학·학과 목록입니다.\nPUL 활동중 대학은 학과 게시판이 개설된 대학이며, PUL 비활동 대학은 아직 게시판이 없는 대학입니다.\n목록에 없는 대학·학과는 하단 「대학·학과 등록 신청」을 통해 알려주세요.",
  registrationHint:
    "우리 대학·학과가 목록에 없거나, 학과 게시판을 만들고 싶다면 등록 신청을 해주세요.",
};

export const universityWhyChooseIntro = {
  title: "왜 파크골프 대학·학과를 선택할까요?",
  description:
    "파크골프를 취미에서 한 단계 더 깊이 배우고 싶은 분, 성인학습자로 새로운 학교생활을 시작하고 싶은 분, 자격증·지도자·심판·강사 활동을 준비하는 분에게 도움이 될 수 있습니다.",
};

export const universityWhyChooseReasons = [
  "파크골프 이론과 실기를 체계적으로 배울 수 있습니다.",
  "성인학습자, 만학도, 재직자도 학위 과정에 도전할 수 있습니다.",
  "생활스포츠지도사, 지도자 과정, 심판 활동 준비에 도움이 될 수 있습니다.",
  "같은 관심사를 가진 동기, 선후배, 학과 커뮤니티를 만들 수 있습니다.",
  "동호회 운영, 강사 활동, 지역 활동으로 확장할 수 있습니다.",
];

export const freshmanRecruitingSectionCopy = {
  title: "신입생 모집 대학",
  description:
    "파크골프 관련 대학·학과 모집 시즌에는 이 영역에 대학 모집 배너를 노출할 수 있습니다.\n성인학습자 전형, 만학도·재직자 과정, 야간·주말 수업, 학위 과정, 입학상담 정보를 홍보할 수 있습니다.",
  emptyTitle: "배너 광고 영역 예정",
  emptyDescription:
    "현재는 모집 배너가 등록되어 있지 않습니다.\n대학·학과 홍보를 원하는 학교는 문의해주세요.",
};

export const recentDepartmentPostsSectionCopy = {
  title: "대학별 최근 게시글",
  description:
    "파크골프 관련 대학·학과별로 올라온 수업 후기, 실기 활동, 자격증 준비, 입학 질문, 학과 공지를 확인해보세요.",
};

export const activeUniversitiesOnPulSectionCopy = {
  title: "PUL에서 활동 중인 대학",
  description:
    "PUL 안에서 게시글과 댓글 활동이 있는 대학·학과를 확인할 수 있습니다.",
};

/** @deprecated freshmanRecruitingSectionCopy 사용 */
export const universityRecruitmentBannerCopy = freshmanRecruitingSectionCopy;

/**
 * 배너 등록 대학 샘플 데이터.
 * isActive === true 인 배너만 신입생 모집 대학 영역에 노출.
 * TODO: 대학 홍보 계약 체결 시 가로 배너 노출
 * TODO: PC 가로형 배너 1~3개 슬라이드 또는 리스트 · 모바일 1열 가로 배너 카드
 * TODO: 배너 클릭 시 대학 홍보 상세 페이지 또는 공식 입학처 링크 연결
 * TODO: 모집요강/브로슈어/입학상담 링크는 배너 등록 대학만 노출
 */
export const universityRecruitmentBanners: UniversityRecruitmentBanner[] = [
  {
    id: "banner-sample-1",
    universityName: "예시전문대학",
    departmentName: "파크골프산업과",
    region: "경상",
    bannerImageUrl: null,
    title: "2026학년도 파크골프산업과 신입생 모집",
    subtitle: "성인학습자 전형 · 실기 중심 · 전문학사",
    recruitmentPeriod: "2026.03 ~ 2026.07",
    targetStudents: "성인학습자, 일반 지원자",
    officialUrl: "https://example.com/univ-admission-2",
    brochureUrl: "https://example.com/univ-brochure-2",
    isActive: false,
  },
  {
    id: "banner-sample-2",
    universityName: "예시스포츠대학",
    departmentName: "생활체육학과(파크골프전공)",
    region: "경기",
    bannerImageUrl: null,
    title: "파크골프 전공 실기·지도 과정 모집",
    subtitle: "생활체육 지도 · 현장실습 · 학위 과정",
    recruitmentPeriod: "2026.04 ~ 2026.08",
    targetStudents: "일반 지원자, 체육 전공 희망자",
    officialUrl: "https://example.com/univ-admission-4",
    brochureUrl: "https://example.com/univ-brochure-4",
    isActive: false,
  },
];

/** @deprecated universityRecruitmentBanners 사용 */
export const freshmanRecruitingUniversities: FreshmanRecruitingUniversity[] = [];

export const UNIVERSITY_DEPARTMENT_DISCLAIMER =
  "PUL은 파크골프 관련 대학·학과 정보를 소개하고 학과별 커뮤니티 공간을 제공하는 플랫폼입니다.\n모집 인원, 전형 방법, 학비, 장학금, 수업 방식, 졸업 요건, 자격증 연계 여부는 반드시 해당 대학 공식 입학처와 학과 공지를 확인하세요.\n대학 심벌과 브로슈어는 대학이 직접 제공하거나 사용 허가가 확인된 자료만 사용할 수 있습니다.\nPUL은 입학, 합격, 자격 취득, 취업, 심판·강사 활동을 보증하지 않습니다.";

export const departmentBoardPosts: DepartmentBoardPost[] = [
  {
    id: "board-1",
    universityName: "예시대학교",
    departmentName: "파크골프학과",
    category: "학과 공지",
    title: "2026학년도 성인학습자 모집 일정 안내",
    visibility: "학과 공지",
    authorRole: "학과 담당자",
    commentCount: 4,
    viewCount: 128,
    createdAt: "2026-02-28",
  },
  {
    id: "board-2",
    universityName: "예시전문대학",
    departmentName: "파크골프산업과",
    category: "수업 후기",
    title: "실기 수업 후기 공유합니다",
    visibility: "일반글",
    authorRole: "재학생(인증)",
    commentCount: 7,
    viewCount: 96,
    createdAt: "2026-02-25",
  },
  {
    id: "board-3",
    universityName: "예시스포츠대학",
    departmentName: "생활체육학과(파크골프전공)",
    category: "자격증 준비",
    title: "생활스포츠지도사 준비 같이 하실 분?",
    visibility: "일반글",
    authorRole: "재학생(인증)",
    commentCount: 12,
    viewCount: 210,
    createdAt: "2026-02-22",
  },
  {
    id: "board-4",
    universityName: "예시직업훈련대학",
    departmentName: "파크골프재직자과정",
    category: "실기 수업",
    title: "이번 주 학과 실습 일정",
    visibility: "일반글",
    authorRole: "학과 담당자",
    commentCount: 3,
    viewCount: 74,
    createdAt: "2026-02-20",
  },
  {
    id: "board-5",
    universityName: "예시평생교육대학",
    departmentName: "파크골프지도과",
    category: "입학 질문",
    title: "신입생 입학 질문 Q&A",
    visibility: "일반글",
    authorRole: "일반 회원",
    commentCount: 15,
    viewCount: 186,
    createdAt: "2026-02-18",
  },
  {
    id: "board-6",
    universityName: "예시대학교",
    departmentName: "파크골프학과",
    category: "학과 활동",
    title: "학과 MT 사진 공유",
    visibility: "일반글",
    authorRole: "학과 대표",
    commentCount: 6,
    viewCount: 102,
    createdAt: "2026-02-15",
  },
  {
    id: "board-7",
    universityName: "예시시민대학",
    departmentName: "파크골프성인학습과정",
    category: "동문 소식",
    title: "졸업생 취업·지도 활동 사례",
    visibility: "일반글",
    authorRole: "졸업생(인증)",
    commentCount: 9,
    viewCount: 156,
    createdAt: "2026-02-12",
  },
  {
    id: "board-8",
    universityName: "예시산업대학",
    departmentName: "파크골프전공심화과정",
    category: "비밀글",
    title: "전공심화 야간반 수업 자료 공유",
    visibility: "재학생 전용",
    authorRole: "재학생(인증)",
    commentCount: 2,
    viewCount: 31,
    createdAt: "2026-02-10",
  },
];

/** @deprecated departmentBoardPosts 사용 */
export const departmentBoards = departmentBoardPosts;

export const activeDepartments: ActiveDepartment[] = [
  {
    id: "active-1",
    departmentId: "dept-4",
    universityName: "예시스포츠대학",
    departmentName: "생활체육학과(파크골프전공)",
    region: "경기",
    postCount: 42,
    commentCount: 128,
    lastActiveAt: "2026-02-28",
    badges: ["PUL 활동중", "활동 활발", "자격증 준비 활발"],
    departmentUrl: "https://example.com/univ-dept-4",
  },
  {
    id: "active-2",
    departmentId: "dept-2",
    universityName: "예시전문대학",
    departmentName: "파크골프산업과",
    region: "경상",
    postCount: 35,
    commentCount: 89,
    lastActiveAt: "2026-02-27",
    badges: ["PUL 활동중", "재학생 인증 운영중", "입학 질문 가능"],
    departmentUrl: "https://example.com/univ-dept-2",
  },
  {
    id: "active-3",
    departmentId: "dept-1",
    universityName: "예시대학교",
    departmentName: "파크골프학과",
    region: "충청",
    postCount: 28,
    commentCount: 67,
    lastActiveAt: "2026-02-26",
    badges: ["PUL 활동중", "활동 활발"],
    departmentUrl: "https://example.com/univ-dept-1",
  },
  {
    id: "active-4",
    departmentId: "dept-7",
    universityName: "예시시민대학",
    departmentName: "파크골프성인학습과정",
    region: "서울",
    postCount: 24,
    commentCount: 58,
    lastActiveAt: "2026-02-25",
    badges: ["PUL 활동중", "재학생 인증 운영중"],
    departmentUrl: "https://example.com/univ-dept-7",
  },
];

export const universityDepartments: UniversityDepartment[] = [
  {
    id: "dept-1",
    universityName: "예시대학교",
    departmentName: "파크골프학과",
    region: "충청",
    logoUrl: null,
    features: "파크골프 이론·실기, 지도자 과정, 자격증 준비",
    departmentUrl: "https://example.com/univ-dept-1",
    pulActivityStatus: "active",
    hasPulBoard: true,
    boardUrl: "#board-dept-1",
    boardRequestStatus: "approved",
    postCount: 28,
    commentCount: 67,
    lastActiveAt: "2026-02-26",
    activityBadges: ["PUL 활동중", "활동 활발", "재학생 인증 운영중"],
    isPromoted: false,
    admissionGuideUrl: "https://example.com/univ-guide-1",
    brochureUrl: "https://example.com/univ-brochure-1",
    admissionsUrl: "https://example.com/univ-admission-1",
    admissionsConsultUrl: "https://example.com/univ-consult-1",
  },
  {
    id: "dept-2",
    universityName: "예시전문대학",
    departmentName: "파크골프산업과",
    region: "경상",
    logoUrl: null,
    features: "장비 관리, 경기 운영, 시설관리, 실습 중심 교육",
    departmentUrl: "https://example.com/univ-dept-2",
    pulActivityStatus: "active",
    hasPulBoard: true,
    boardUrl: "#board-dept-2",
    boardRequestStatus: "approved",
    postCount: 35,
    commentCount: 89,
    lastActiveAt: "2026-02-27",
    activityBadges: ["PUL 활동중", "입학 질문 가능", "활동 활발"],
    isPromoted: false,
    admissionGuideUrl: "https://example.com/univ-guide-2",
    brochureUrl: "https://example.com/univ-brochure-2",
    admissionsUrl: "https://example.com/univ-admission-2",
    admissionsConsultUrl: "https://example.com/univ-consult-2",
  },
  {
    id: "dept-3",
    universityName: "예시평생교육대학",
    departmentName: "파크골프지도과",
    region: "전라",
    logoUrl: null,
    features: "지도자 준비, 심판 활동, 지역 동호회 연계",
    departmentUrl: "https://example.com/univ-dept-3",
    pulActivityStatus: "active",
    hasPulBoard: true,
    boardUrl: "#board-dept-3",
    boardRequestStatus: "approved",
    postCount: 12,
    commentCount: 24,
    lastActiveAt: "2026-02-20",
    activityBadges: ["PUL 활동중", "새 게시판", "입학 질문 가능"],
    isPromoted: false,
    admissionGuideUrl: "https://example.com/univ-guide-3",
    brochureUrl: "https://example.com/univ-brochure-3",
    admissionsUrl: "https://example.com/univ-admission-3",
    admissionsConsultUrl: "https://example.com/univ-consult-3",
  },
  {
    id: "dept-4",
    universityName: "예시스포츠대학",
    departmentName: "생활체육학과(파크골프전공)",
    region: "경기",
    logoUrl: null,
    features: "생활체육 지도, 파크골프 전공 실기, 현장실습",
    departmentUrl: "https://example.com/univ-dept-4",
    pulActivityStatus: "active",
    hasPulBoard: true,
    boardUrl: "#board-dept-4",
    boardRequestStatus: "approved",
    postCount: 42,
    commentCount: 128,
    lastActiveAt: "2026-02-28",
    activityBadges: ["PUL 활동중", "자격증 준비 활발", "활동 활발"],
    isPromoted: false,
    admissionGuideUrl: "https://example.com/univ-guide-4",
    brochureUrl: "https://example.com/univ-brochure-4",
    admissionsUrl: "https://example.com/univ-admission-4",
    admissionsConsultUrl: "https://example.com/univ-consult-4",
  },
  {
    id: "dept-5",
    universityName: "예시산업대학",
    departmentName: "파크골프전공심화과정",
    region: "인천",
    logoUrl: null,
    features: "전공 심화, 지도자 자격 연계, 경기 운영 실무",
    departmentUrl: null,
    pulActivityStatus: "inactive",
    hasPulBoard: false,
    boardUrl: "",
    boardRequestStatus: "requested",
    postCount: 0,
    commentCount: 0,
    lastActiveAt: null,
    activityBadges: ["PUL 비활동"],
    isPromoted: false,
    admissionGuideUrl: "https://example.com/univ-guide-5",
    brochureUrl: "https://example.com/univ-brochure-5",
    admissionsUrl: "https://example.com/univ-admission-5",
    admissionsConsultUrl: "https://example.com/univ-consult-5",
  },
  {
    id: "dept-6",
    universityName: "예시직업훈련대학",
    departmentName: "파크골프재직자과정",
    region: "경상",
    logoUrl: null,
    features: "재직자 맞춤 수업, 야간·온라인 병행, 자격증 준비",
    departmentUrl: "https://example.com/univ-dept-6",
    pulActivityStatus: "inactive",
    hasPulBoard: false,
    boardUrl: "",
    boardRequestStatus: "none",
    postCount: 0,
    commentCount: 0,
    lastActiveAt: null,
    activityBadges: ["PUL 비활동"],
    isPromoted: false,
    admissionGuideUrl: "https://example.com/univ-guide-6",
    brochureUrl: "https://example.com/univ-brochure-6",
    admissionsUrl: "https://example.com/univ-admission-6",
    admissionsConsultUrl: "https://example.com/univ-consult-6",
  },
  {
    id: "dept-7",
    universityName: "예시시민대학",
    departmentName: "파크골프성인학습과정",
    region: "서울",
    logoUrl: null,
    features: "성인학습자 맞춤 커리큘럼, 학위 과정, 동문 네트워크",
    departmentUrl: "https://example.com/univ-dept-7",
    pulActivityStatus: "active",
    hasPulBoard: true,
    boardUrl: "#board-dept-7",
    boardRequestStatus: "approved",
    postCount: 24,
    commentCount: 58,
    lastActiveAt: "2026-02-25",
    activityBadges: ["PUL 활동중", "활동 활발", "재학생 인증 운영중"],
    isPromoted: false,
    admissionGuideUrl: "https://example.com/univ-guide-7",
    brochureUrl: "https://example.com/univ-brochure-7",
    admissionsUrl: "https://example.com/univ-admission-7",
    admissionsConsultUrl: "https://example.com/univ-consult-7",
  },
];

export function getPulActivityStatusLabel(status: PulActivityStatus) {
  return status === "active" ? "PUL 활동중" : "PUL 비활동";
}

export function hasDepartmentHomepage(departmentUrl: string | null) {
  return Boolean(departmentUrl?.trim());
}

export function getUniversityInitials(universityName: string) {
  const trimmed = universityName.replace(/예시/g, "").trim();
  if (trimmed.length <= 2) return universityName.slice(0, 2);
  return trimmed.slice(0, 2);
}

export function getDepartmentById(departmentId: string) {
  return universityDepartments.find((department) => department.id === departmentId);
}

export function getVisibilityBadgeStyle(visibility: BoardPublicStatus) {
  if (visibility === "학과 공지") {
    return "border-pul-point/30 bg-pul-light text-pul-deep";
  }
  if (visibility === "재학생 전용") {
    return "border-orange-200 bg-orange-50 text-orange-700";
  }
  return "border-pul-border bg-[#fafbfa] text-foreground";
}

export type UniversityDepartmentFilters = {
  region: string;
};

export function createDefaultUniversityFilters(): UniversityDepartmentFilters {
  return {
    region: "전체",
  };
}

export function filterUniversityDepartments(
  departments: UniversityDepartment[],
  filters: UniversityDepartmentFilters,
) {
  return departments.filter((department) => {
    if (filters.region !== "전체" && department.region !== filters.region) {
      return false;
    }
    return true;
  });
}
