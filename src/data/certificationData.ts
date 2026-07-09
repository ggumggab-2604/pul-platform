/**
 * TODO:
 * - 자격증 과정 실제 신청/결제 연동
 * - 교육기관 직접 등록 및 승인
 * - 심판·강사 구인구직 등록 DB
 * - 국가시험 일정 API 연동
 * - 협회 공지 RSS/API 연동
 * - 광고 상품 결제
 */

export const CERT_COURSE_INQUIRY_FORM_URL =
  "https://docs.google.com/forms/d/e/placeholder-cert-course/viewform";
export const CERT_JOB_REGISTER_FORM_URL =
  "https://docs.google.com/forms/d/e/placeholder-cert-job/viewform";
export const CERT_AD_INQUIRY_FORM_URL =
  "https://docs.google.com/forms/d/e/placeholder-cert-ad/viewform";

export const CERT_DISCLAIMER =
  "PUL은 다양한 자격증·심판·교육 정보를 소개하는 플랫폼입니다. 각 자격의 인정 범위, 응시 조건, 비용, 활용 가능 여부는 반드시 주관기관에 직접 확인하세요. PUL은 외부 교육과정의 합격, 자격 인정, 취업, 심판 배정을 보증하지 않습니다.";

export const COURSES_TAB_DISCLAIMER =
  "PUL은 다양한 자격증·심판 교육 정보를 소개하는 플랫폼입니다. 각 교육과정의 인정 범위, 응시 조건, 비용, 활용 가능 여부는 반드시 주관기관에 직접 확인하세요. PUL은 외부 교육과정의 합격, 자격 인정, 취업, 심판 배정을 보증하지 않습니다.";

export const ACTIVITY_TAB_DISCLAIMER =
  "PUL은 심판·강사 구인구직 정보를 연결하는 플랫폼입니다. 자격 보유 여부, 활동 조건, 보수, 배정 여부는 반드시 등록자와 직접 확인하세요. PUL은 채용, 고용, 심판 배정, 강사 활동, 보수 지급을 보증하지 않습니다.";

export const EXAM_PREP_DISCLAIMER =
  "PUL 시험 준비자료는 학습 참고용입니다. 공식 기출문제, 시험 일정, 응시 조건, 합격 기준, 연수 일정은 반드시 주관기관 공식 공지를 확인하세요. 저작권이 있는 교재, 유료 강의 자료, 비공개 기출문제의 무단 등록은 제한됩니다. 구술 모범답변은 학습용 예시이며 실제 시험의 공식 답안이 아닙니다. 실기 공략과 야디지북은 작성자의 경험과 의견일 수 있으므로 실제 시험 환경과 다를 수 있습니다. 연수 정보는 연수기관 사정에 따라 변경될 수 있습니다.";

export const TRAINING_INFO_CAUTION =
  "연수 일정, 연수기관, 신청 방법, 현장실습 절차는 반드시 주관기관 공식 공지를 확인하세요.";

export const ORAL_ANSWER_CAUTION =
  "구술 모범답변은 학습용 예시이며, 실제 시험의 공식 답안이 아닙니다. 공식 기준은 반드시 주관기관 공지를 확인하세요.";

export const WRITTEN_PREP_CAUTION =
  "저작권이 있는 문제집, 유료 강의 자료, 비공개 기출문제는 무단 등록할 수 없습니다.";

export const EXAM_SCHEDULE_CAUTION =
  "시험 일정은 변동될 수 있으므로 반드시 주관기관 공식 공지를 확인하세요.";

export const EXAM_SCHEDULE_INTRO =
  "시험 준비는 접수 기간과 시험일 확인이 가장 먼저입니다. 접수 마감일, 시험 장소, 준비물, 합격자 발표 일정은 반드시 주관기관 공식 공지를 확인하세요.";

export const EXAM_SCHEDULE_GUIDE_INTRO =
  "자격증을 준비하기 전 접수 기간, 시험일, 시험장 발표, 준비물을 먼저 확인하세요. 일정은 변동될 수 있으므로 반드시 주관기관 공식 공지를 확인해야 합니다.";

export type QualificationTypeGroup =
  | "national"
  | "association"
  | "private";

export type QualificationType = {
  id: string;
  title: string;
  group: QualificationTypeGroup;
  description: string;
  examples: string[];
  checkPoints: string[];
};

export type QualificationGuide = {
  id: string;
  title: string;
  target: string;
  description: string;
  recommendedCategory: string;
  ctaText: string;
  /** TODO: 앵커 스크롤·탭 전환 연동 */
  linkTab?: "guide" | "exam-prep" | "courses" | "activity";
};

export type ExamType =
  | "life_sports"
  | "disabled_sports"
  | "park_instructor"
  | "park_referee"
  | "private_instructor"
  | "private_referee";

export type ExamMaterialType =
  | "public_past"
  | "practice"
  | "explanation"
  | "summary"
  | "problem_solving";

export type ExamSourceType = "learning" | "public_link" | "sample";

export type ExamPrepMaterial = {
  id: string;
  examType: ExamType;
  title: string;
  materialType: ExamMaterialType;
  difficulty: "기초" | "중급" | "심화";
  questionCount: number;
  updatedAt: string;
  sourceType: ExamSourceType;
  description: string;
  ctaText: string;
};

export type CourseGuideMaterialType =
  | "youtube"
  | "hole_memo"
  | "yardage_book"
  | "practice_review"
  | "venue_visit_review";

export type CourseGuideProviderType =
  | "youtube"
  | "community"
  | "instructor"
  | "pul_sample";

export type PracticalCourseGuide = {
  id: string;
  examType: ExamType;
  examVenue: string;
  title: string;
  materialType: CourseGuideMaterialType;
  coverage: string;
  keyPoints: string[];
  providerType: CourseGuideProviderType;
  authorName: string;
  youtubeUrl?: string;
  updatedAt: string;
  description: string;
  ctaText: string;
};

export type OralQuestionType =
  | "rules"
  | "gameplay"
  | "safety"
  | "ethics"
  | "referee_role"
  | "emergency";

export type OralQuestion = {
  id: string;
  examType: ExamType;
  questionType: OralQuestionType;
  question: string;
  trend: string;
  sampleAnswer: string;
  practiceTimeLimit: number;
  cautionText: string;
};

export type ExamScheduleStatus =
  | "application_planned"
  | "application_open"
  | "application_closed"
  | "exam_planned"
  | "venue_planned"
  | "result_planned";

export type ExamSchedule = {
  id: string;
  examName: string;
  examType: ExamType;
  organization: string;
  applicationPeriod: string;
  examDate: string;
  venueAnnouncement: string;
  resultDate: string;
  requiredItems: string;
  officialUrl: string;
  status: ExamScheduleStatus;
};

export type ExamPrepBoardType =
  | "generalTalk"
  | "practicalGuide"
  | "oralQuestion"
  | "writtenExam"
  | "trainingInfo";

export type TrainingInfoCategory =
  | "training_schedule"
  | "training_org"
  | "application"
  | "supplies"
  | "field_practice"
  | "training_review"
  | "question";

export type ExamPrepBoardCategory =
  | "written"
  | "oral"
  | "venue"
  | "practice_partner"
  | "group_match"
  | "exam_review"
  | "pass_review"
  | "fail_review"
  | "cheer"
  | "resource_share";

export type ExamPrepBoardPost = {
  id: string;
  boardType: ExamPrepBoardType;
  category: ExamPrepBoardCategory | string;
  examType?: ExamType;
  title: string;
  author: string;
  venue?: string;
  courseName?: string;
  holeRange?: string;
  materialType?: string;
  commentCount: number;
  viewCount: number;
  createdAt: string;
  status: "open" | "closed" | "pinned";
};

export type CourseCategory =
  | "instructor"
  | "referee"
  | "life_sports"
  | "disabled_sports"
  | "private_instructor"
  | "private_referee"
  | "completion";

export type ProviderType =
  | "national_exam"
  | "association"
  | "lifelong"
  | "foundation"
  | "private_academy"
  | "online";

export type CourseMethod = "offline" | "online" | "hybrid" | "theory_practice";
export type CourseStatus = "recruiting" | "accepting" | "waiting" | "closed";

export type QualificationCourse = {
  id: string;
  title: string;
  category: CourseCategory;
  providerType: ProviderType;
  provider: string;
  region: string;
  method: CourseMethod;
  target: string;
  schedule: string;
  price: string;
  status: CourseStatus;
  description: string;
  featured?: boolean;
};

export type RefereeJobRoleType =
  | "referee"
  | "instructor"
  | "staff"
  | "scorer"
  | "assistant";

export type RefereeJobPost = {
  id: string;
  title: string;
  roleType: RefereeJobRoleType;
  region: string;
  schedule: string;
  role: string;
  condition: string;
  payInfo: string;
  organizerType: string;
  status: CourseStatus | "planned";
};

/** @deprecated RefereeJobPost 사용 */
export type RefereeJob = RefereeJobPost;

export type RefereeTalentActivityType =
  | "referee"
  | "instructor"
  | "staff"
  | "scorer"
  | "practice_helper"
  | "oral_mentor";

export type RefereeTalentProfile = {
  id: string;
  nickname: string;
  activityTypes: RefereeTalentActivityType[];
  licenses: string[];
  regions: string[];
  pulActivityScore: number;
  activityHighlights: string[];
  verificationStatus: string[];
  status: "available" | "limited" | "inactive";
};

export type QualificationAd = {
  id: string;
  title: string;
  provider: string;
  adType: string;
  category: string;
  description: string;
  ctaText: string;
};

export const qualificationTypeGroupLabels: Record<QualificationTypeGroup, string> = {
  national: "A. 국가 체육지도자 계열",
  association: "B. 협회·종목단체 계열",
  private: "C. 민간·대학·사설 교육 계열",
};

export const courseCategoryLabels: Record<CourseCategory, string> = {
  instructor: "지도자 과정",
  referee: "심판 과정",
  life_sports: "생활스포츠지도사",
  disabled_sports: "장애인스포츠지도사",
  private_instructor: "민간 지도자",
  private_referee: "민간 심판",
  completion: "수료 과정",
};

export const providerTypeLabels: Record<ProviderType, string> = {
  national_exam: "국가시험",
  association: "협회·종목단체",
  lifelong: "평생교육원",
  foundation: "민간재단",
  private_academy: "사설 교육기관",
  online: "온라인 강의",
};

export const courseMethodLabels: Record<CourseMethod, string> = {
  offline: "오프라인",
  online: "온라인",
  hybrid: "온라인+오프라인",
  theory_practice: "이론+실습",
};

export const courseStatusLabels: Record<CourseStatus | "planned", string> = {
  recruiting: "모집중",
  accepting: "접수중",
  waiting: "마감임박",
  closed: "모집마감",
  planned: "모집 예정",
};

export const refereeRoleTypeLabels: Record<RefereeJobRoleType, string> = {
  referee: "심판",
  instructor: "강사",
  staff: "진행요원",
  scorer: "기록요원",
  assistant: "대회 운영 보조",
};

export const refereeTalentActivityLabels: Record<RefereeTalentActivityType, string> = {
  referee: "심판",
  instructor: "강사",
  staff: "진행요원",
  scorer: "기록요원",
  practice_helper: "실기 연습 도우미",
  oral_mentor: "구술 답변 멘토",
};

export const refereeTalentStatusLabels: Record<RefereeTalentProfile["status"], string> = {
  available: "활동 가능",
  limited: "일부 지역만",
  inactive: "활동 중단",
};

export const jobPostingRegistrationConditions = [
  "대회 운영자",
  "협회/지회/연맹 관계자",
  "동호회 회장/운영진",
  "교육기관",
  "지자체 위탁 운영기관",
  "PUL 운영자가 확인한 단체/기관",
];

export const talentProfileRegistrationConditions = [
  "자격증 보유 회원",
  "자격증 인증 완료 회원",
  "PUL 활동 점수 일정 이상 회원",
  "시험 준비자료 게시판에서 정상 활동한 회원",
  "신고/제재 이력이 없는 회원",
];

export const pulActivityScoreItems = [
  "시험 준비자료 게시판 답변",
  "구술 문제 답변",
  "필기 문제 해설",
  "실기장 공략 공유",
  "연수 후기 작성",
  "합격 후기 작성",
  "동호회 활동 기록",
  "신고 없는 정상 활동",
];

export const courseCategoryFilters: { value: CourseCategory | "all"; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "instructor", label: "지도자 과정" },
  { value: "referee", label: "심판 과정" },
  { value: "life_sports", label: "생활스포츠지도사" },
  { value: "disabled_sports", label: "장애인스포츠지도사" },
  { value: "private_instructor", label: "민간 지도자" },
  { value: "private_referee", label: "민간 심판" },
  { value: "completion", label: "수료 과정" },
];

export const providerTypeFilters: { value: ProviderType | "all"; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "national_exam", label: "국가시험" },
  { value: "association", label: "협회·종목단체" },
  { value: "lifelong", label: "평생교육원" },
  { value: "foundation", label: "민간재단" },
  { value: "private_academy", label: "사설 교육기관" },
  { value: "online", label: "온라인 강의" },
];

export const regionFilters = [
  "전체",
  "서울",
  "경기",
  "인천",
  "부산",
  "충청",
  "강원",
  "전라",
  "경상",
  "제주",
  "온라인",
] as const;

export const methodFilters: { value: CourseMethod | "all"; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "offline", label: "오프라인" },
  { value: "online", label: "온라인" },
  { value: "hybrid", label: "온라인+오프라인" },
  { value: "theory_practice", label: "이론+실습" },
];

export const statusFilters: { value: CourseStatus | "all"; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "recruiting", label: "모집중" },
  { value: "accepting", label: "접수중" },
  { value: "waiting", label: "마감임박" },
  { value: "closed", label: "모집마감" },
];

export const priceRangeFilters = [
  { value: "all", label: "전체" },
  { value: "under100", label: "10만원 이하" },
  { value: "100to300", label: "10~30만원" },
  { value: "over300", label: "30만원 이상" },
] as const;

export const qualificationChecklist = [
  "주관기관이 어디인지 확인하세요.",
  "국가시험, 협회 과정, 민간 자격은 활용 범위가 다를 수 있습니다.",
  "응시 조건, 교육비, 발급비, 갱신 여부를 확인하세요.",
  "대회 심판 활동에 실제로 인정되는 자격인지 확인하세요.",
  "광고성 과정은 PUL이 직접 보증하지 않습니다.",
  "신청 전 반드시 주관기관의 최신 공지를 확인하세요.",
];

export const qualificationTypes: QualificationType[] = [
  {
    id: "type-national",
    title: "국가 체육지도자 계열",
    group: "national",
    description:
      "국가 체육지도자 자격검정과 연수 절차에 따라 취득하는 자격입니다. 필기, 실기·구술, 연수, 현장실습 등 단계가 있을 수 있으므로 공식 공지를 확인해야 합니다.",
    examples: [
      "생활스포츠지도사",
      "장애인스포츠지도사",
      "노인스포츠지도사",
      "유소년스포츠지도사",
      "전문스포츠지도사",
    ],
    checkPoints: ["시험 주관기관", "응시 자격", "연수·현장실습"],
  },
  {
    id: "type-association",
    title: "협회·종목단체 계열",
    group: "association",
    description:
      "대한파크골프협회, 지역 협회, 종목단체, 연맹 등에서 운영하거나 인증하는 지도자·심판 관련 과정입니다.",
    examples: [
      "대한파크골프협회 지도자 과정",
      "대한파크골프협회 심판 과정",
      "지역 협회 교육",
      "연맹·단체 운영 과정",
    ],
    checkPoints: ["협회 인증 범위", "갱신 여부", "대회 인정"],
  },
  {
    id: "type-private",
    title: "민간·대학·사설 교육 계열",
    group: "private",
    description:
      "대학 평생교육원, 민간재단, 사설 교육기관, 온라인 교육기관 등에서 운영하는 파크골프 관련 교육과정입니다. 국가자격, 협회 과정, 민간 자격은 인정 범위와 활용 가능 분야가 다를 수 있습니다.",
    examples: [
      "대학 평생교육원 과정",
      "민간재단 자격 과정",
      "사설 교육기관 과정",
      "온라인 교육 과정",
      "수료증 과정",
    ],
    checkPoints: ["수료증 vs 자격증", "활용 범위", "교육기관 신뢰도"],
  },
];

export const qualificationGuides: QualificationGuide[] = [
  {
    id: "guide-instructor",
    title: "파크골프 강사가 되고 싶어요",
    target: "지도자·강사 희망",
    description: "지도자 과정, 민간 지도자 과정, 협회 인증 과정을 비교해 보세요.",
    recommendedCategory: "지도자 과정",
    ctaText: "지도자 과정 보기",
    linkTab: "courses",
  },
  {
    id: "guide-referee",
    title: "대회 심판으로 활동하고 싶어요",
    target: "심판 활동 희망",
    description: "심판 과정, 협회 교육, 대회 운영 교육 정보를 확인하세요.",
    recommendedCategory: "심판 과정",
    ctaText: "심판 과정 보기",
    linkTab: "courses",
  },
  {
    id: "guide-national",
    title: "국가시험을 준비하고 싶어요",
    target: "국가시험 준비",
    description: "생활스포츠지도사, 장애인스포츠지도사 준비반을 찾아보세요.",
    recommendedCategory: "국가시험 준비",
    ctaText: "시험 준비자료 보기",
    linkTab: "exam-prep",
  },
  {
    id: "guide-private",
    title: "민간 교육과정을 비교하고 싶어요",
    target: "민간 과정 비교",
    description: "평생교육원, 재단, 사설 교육기관 과정을 비교할 수 있습니다.",
    recommendedCategory: "민간·사설",
    ctaText: "교육과정 비교",
    linkTab: "courses",
  },
  {
    id: "guide-activity",
    title: "자격증 취득 후 활동처를 찾고 싶어요",
    target: "활동 기회 탐색",
    description: "심판·강사·진행요원 모집 공고를 확인하세요.",
    recommendedCategory: "심판·강사 활동",
    ctaText: "활동 정보 보기",
    linkTab: "activity",
  },
];

export const qualificationCourses: QualificationCourse[] = [
  {
    id: "cert-course-1",
    title: "파크골프 지도자 준비반",
    category: "instructor",
    providerType: "lifelong",
    provider: "예시 평생교육원",
    region: "서울",
    method: "offline",
    target: "초보~중급",
    schedule: "2026년 9월 ~ 11월 (주 1회)",
    price: "450,000원",
    status: "recruiting",
    description: "파크골프 지도자 자격 취득을 준비하는 정규 과정입니다.",
    featured: true,
  },
  {
    id: "cert-course-2",
    title: "파크골프 심판 입문 과정",
    category: "referee",
    providerType: "association",
    provider: "예시 교육협회",
    region: "부산",
    method: "theory_practice",
    target: "대회 운영 관심자",
    schedule: "2026년 8월 15일(토)",
    price: "120,000원",
    status: "recruiting",
    description: "대회 심판 활동을 희망하는 분을 위한 입문 과정입니다.",
    featured: true,
  },
  {
    id: "cert-course-3",
    title: "생활스포츠지도사 파크골프 준비반",
    category: "life_sports",
    providerType: "online",
    provider: "예시 아카데미",
    region: "온라인",
    method: "hybrid",
    target: "생활체육 지도 희망자",
    schedule: "2026년 하반기 상시",
    price: "200,000원",
    status: "accepting",
    description: "생활스포츠지도사 국가시험 대비 이론·실기 준비 과정입니다.",
    featured: true,
  },
  {
    id: "cert-course-4",
    title: "장애인스포츠지도사 준비반",
    category: "disabled_sports",
    providerType: "private_academy",
    provider: "예시 교육센터",
    region: "경기",
    method: "hybrid",
    target: "장애인 체육 지도 희망자",
    schedule: "2026년 10월 개강",
    price: "250,000원",
    status: "recruiting",
    description: "장애인스포츠지도사 시험 대비 온라인·오프라인 병행 과정입니다.",
    featured: true,
  },
  {
    id: "cert-course-5",
    title: "민간 파크골프 지도자 수료 과정",
    category: "private_instructor",
    providerType: "foundation",
    provider: "예시 스포츠재단",
    region: "인천",
    method: "offline",
    target: "동호회 지도 희망자",
    schedule: "2026년 7월 ~ 8월",
    price: "180,000원",
    status: "recruiting",
    description: "민간 수료증 과정으로 기초 지도 역량을 키우는 프로그램입니다.",
  },
  {
    id: "cert-course-6",
    title: "대회 심판 실습반",
    category: "referee",
    providerType: "association",
    provider: "대한파크골프협회 지역지회(예시)",
    region: "경기",
    method: "theory_practice",
    target: "심판 교육 수료자",
    schedule: "2026년 9월",
    price: "80,000원",
    status: "waiting",
    description: "실제 대회 운영 환경에서 심판 실습을 진행하는 과정입니다.",
  },
];

export const refereeJobPosts: RefereeJobPost[] = [
  {
    id: "job-1",
    title: "지역 파크골프대회 심판 모집",
    roleType: "referee",
    region: "경기",
    schedule: "2026년 8월 예정",
    role: "경기 진행 및 심판",
    condition: "심판 자격 보유자 우대",
    payInfo: "협의",
    organizerType: "대회 운영자",
    status: "recruiting",
  },
  {
    id: "job-2",
    title: "시니어 파크골프 입문 강사 모집",
    roleType: "instructor",
    region: "서울",
    schedule: "상시",
    role: "초보 입문 교육",
    condition: "지도자 자격 또는 교육 경험자 우대",
    payInfo: "시간당 협의",
    organizerType: "교육기관",
    status: "recruiting",
  },
  {
    id: "job-3",
    title: "동호회 월례회 진행요원 모집",
    roleType: "staff",
    region: "인천",
    schedule: "월 1회",
    role: "기록, 조 편성, 진행 보조",
    condition: "파크골프 규칙 이해자",
    payInfo: "소정의 활동비",
    organizerType: "동호회 운영진",
    status: "recruiting",
  },
];

/** @deprecated refereeJobPosts 사용 */
export const refereeJobs = refereeJobPosts;

export const refereeTalentProfiles: RefereeTalentProfile[] = [
  {
    id: "talent-1",
    nickname: "파크심판A",
    activityTypes: ["referee", "staff"],
    licenses: ["파크골프 심판 자격"],
    regions: ["경기", "서울"],
    pulActivityScore: 86,
    activityHighlights: ["구술 답변 18건", "실기장 정보 공유 3건"],
    verificationStatus: ["자격 인증 완료", "PUL 활동 우수"],
    status: "available",
  },
  {
    id: "talent-2",
    nickname: "입문강사B",
    activityTypes: ["instructor"],
    licenses: ["지도자 과정 수료"],
    regions: ["서울", "인천"],
    pulActivityScore: 72,
    activityHighlights: ["필기 해설 12건", "합격 후기 1건"],
    verificationStatus: ["자격 인증 완료"],
    status: "available",
  },
  {
    id: "talent-3",
    nickname: "구술멘토C",
    activityTypes: ["oral_mentor", "practice_helper"],
    licenses: ["생활스포츠지도사"],
    regions: ["경기"],
    pulActivityScore: 64,
    activityHighlights: ["구술 답변 24건", "연수 후기 1건"],
    verificationStatus: ["구술 답변 활동", "실기 공략 공유"],
    status: "limited",
  },
];

export const examTypeFilters: { value: ExamType | "all"; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "life_sports", label: "생활스포츠지도사" },
  { value: "disabled_sports", label: "장애인스포츠지도사" },
  { value: "park_instructor", label: "파크골프 지도자" },
  { value: "park_referee", label: "파크골프 심판" },
  { value: "private_instructor", label: "민간 지도자" },
  { value: "private_referee", label: "민간 심판" },
];

export const examTypeLabels: Record<ExamType, string> = {
  life_sports: "생활스포츠지도사",
  disabled_sports: "장애인스포츠지도사",
  park_instructor: "파크골프 지도자",
  park_referee: "파크골프 심판",
  private_instructor: "민간 지도자",
  private_referee: "민간 심판",
};

export const examMaterialTypeLabels: Record<ExamMaterialType, string> = {
  public_past: "공개 기출",
  practice: "예상문제",
  explanation: "해설",
  summary: "요약노트",
  problem_solving: "문제풀이",
};

export const courseGuideMaterialTypeLabels: Record<CourseGuideMaterialType, string> = {
  youtube: "유튜브 공략 영상",
  hole_memo: "홀별 공략 메모",
  yardage_book: "야디지북",
  practice_review: "연습 후기",
  venue_visit_review: "실기장 답사 후기",
};

export const courseGuideProviderTypeLabels: Record<CourseGuideProviderType, string> = {
  youtube: "유튜브",
  community: "커뮤니티",
  instructor: "지도자",
  pul_sample: "PUL 샘플",
};

export const oralQuestionTypeLabels: Record<OralQuestionType, string> = {
  rules: "규정 문제",
  gameplay: "경기 방법 문제",
  safety: "안전수칙",
  ethics: "지도자 윤리",
  referee_role: "심판 역할",
  emergency: "돌발상황 대처",
};

export const examPrepBoardCategoryFilters: {
  value: ExamPrepBoardCategory | "all";
  label: string;
}[] = [
  { value: "all", label: "전체" },
  { value: "written", label: "필기 질문" },
  { value: "oral", label: "구술 질문" },
  { value: "venue", label: "실기장 정보" },
  { value: "practice_partner", label: "같이 연습해요" },
  { value: "group_match", label: "같은 조 찾기" },
  { value: "exam_review", label: "시험 후기" },
  { value: "pass_review", label: "합격 후기" },
  { value: "fail_review", label: "불합격 후기" },
  { value: "cheer", label: "응원·넋두리" },
  { value: "resource_share", label: "자료 공유" },
];

export const examPrepBoardCategoryLabels: Record<ExamPrepBoardCategory, string> = {
  written: "필기 질문",
  oral: "구술 질문",
  venue: "실기장 정보",
  practice_partner: "같이 연습해요",
  group_match: "같은 조 찾기",
  exam_review: "시험 후기",
  pass_review: "합격 후기",
  fail_review: "불합격 후기",
  cheer: "응원·넋두리",
  resource_share: "자료 공유",
};

export const examPrepBoardStatusLabels: Record<ExamPrepBoardPost["status"], string> = {
  open: "모집중",
  closed: "마감",
  pinned: "공지",
};

export const examSourceTypeLabels: Record<ExamSourceType, string> = {
  learning: "학습용 문제",
  public_link: "공개자료 링크",
  sample: "예상문제",
};

export const examScheduleStatusLabels: Record<ExamScheduleStatus, string> = {
  application_planned: "접수 예정",
  application_open: "접수 중",
  application_closed: "접수 마감",
  exam_planned: "시험 예정",
  venue_planned: "장소 발표 예정",
  result_planned: "합격 발표 예정",
};

export const examScheduleStatusStyles: Record<ExamScheduleStatus, string> = {
  application_planned: "border-blue-200 bg-blue-50 text-blue-900",
  application_open: "border-emerald-200 bg-emerald-50 text-emerald-900",
  application_closed: "border-gray-200 bg-gray-100 text-gray-800",
  exam_planned: "border-amber-200 bg-amber-50 text-amber-900",
  venue_planned: "border-orange-200 bg-orange-50 text-orange-900",
  result_planned: "border-violet-200 bg-violet-50 text-violet-900",
};

export const examPrepBoardTypeLabels: Record<ExamPrepBoardType, string> = {
  generalTalk: "시험 준비 이야기방",
  practicalGuide: "실기 공략",
  oralQuestion: "구술 문제",
  writtenExam: "필기 자료",
  trainingInfo: "연수 정보",
};

export const trainingInfoCategoryLabels: Record<TrainingInfoCategory, string> = {
  training_schedule: "연수 일정",
  training_org: "연수기관",
  application: "신청 방법",
  supplies: "준비물",
  field_practice: "현장실습",
  training_review: "연수 후기",
  question: "질문",
};

export const examPrepMaterials: ExamPrepMaterial[] = [
  {
    id: "prep-1",
    examType: "life_sports",
    title: "생활스포츠지도사 파크골프 학습용 문제",
    materialType: "practice",
    difficulty: "기초",
    questionCount: 30,
    updatedAt: "2026-06",
    sourceType: "learning",
    description: "파크골프 종목 기초 이론을 점검하는 학습용 예상문제입니다.",
    ctaText: "학습용 문제 보기",
  },
  {
    id: "prep-2",
    examType: "life_sports",
    title: "스포츠 지도론 요약노트",
    materialType: "summary",
    difficulty: "중급",
    questionCount: 0,
    updatedAt: "2026-05",
    sourceType: "learning",
    description: "필기 대비 핵심 개념을 정리한 학습용 요약 자료입니다.",
    ctaText: "요약노트 보기",
  },
  {
    id: "prep-3",
    examType: "life_sports",
    title: "생활스포츠지도사 공개자료 링크 모음",
    materialType: "public_past",
    difficulty: "기초",
    questionCount: 0,
    updatedAt: "2026-04",
    sourceType: "public_link",
    description: "공개된 종목 안내·학습 자료 링크를 모아둔 참고 목록입니다.",
    ctaText: "공개자료 보기",
  },
  {
    id: "prep-4",
    examType: "disabled_sports",
    title: "장애인스포츠지도사 학습용 예상문제",
    materialType: "practice",
    difficulty: "중급",
    questionCount: 25,
    updatedAt: "2026-06",
    sourceType: "learning",
    description: "장애인 체육 지도 관련 학습용 예상문제입니다.",
    ctaText: "예상문제 보기",
  },
  {
    id: "prep-5",
    examType: "park_instructor",
    title: "파크골프 지도자 필기 학습용 문제",
    materialType: "practice",
    difficulty: "기초",
    questionCount: 20,
    updatedAt: "2026-04",
    sourceType: "learning",
    description: "지도자 과정 필기 대비 학습용 문제 세트입니다.",
    ctaText: "문제 보기",
  },
  {
    id: "prep-6",
    examType: "park_referee",
    title: "파크골프 규칙 학습용 해설",
    materialType: "explanation",
    difficulty: "중급",
    questionCount: 15,
    updatedAt: "2026-05",
    sourceType: "learning",
    description: "심판 과정 필기 대비 규칙 해설 학습 자료입니다.",
    ctaText: "해설 보기",
  },
  {
    id: "prep-7",
    examType: "park_referee",
    title: "심판 필기 문제풀이 연습",
    materialType: "problem_solving",
    difficulty: "심화",
    questionCount: 10,
    updatedAt: "2026-06",
    sourceType: "sample",
    description: "규정·경기 방법 문제를 풀어보는 학습용 문제풀이 세트입니다.",
    ctaText: "문제풀이 시작",
  },
  {
    id: "prep-8",
    examType: "private_instructor",
    title: "민간 지도자 수료 평가 학습용 문제",
    materialType: "practice",
    difficulty: "기초",
    questionCount: 15,
    updatedAt: "2026-04",
    sourceType: "sample",
    description: "민간 지도자 과정 이수 평가 대비 학습용 예상문제입니다.",
    ctaText: "예상문제 보기",
  },
];

export const practicalCourseGuides: PracticalCourseGuide[] = [
  {
    id: "course-1",
    examType: "life_sports",
    examVenue: "예시 파크골프장",
    title: "2026 생활스포츠지도사 실기장 1~18번 홀 공략",
    materialType: "youtube",
    coverage: "1번~18번 홀",
    keyPoints: [
      "티샷 방향",
      "거리 조절",
      "OB 주의",
      "퍼팅 경사",
      "1번~18번 홀",
      "유튜브 공략",
    ],
    providerType: "youtube",
    authorName: "예시지도자",
    youtubeUrl: "https://www.youtube.com/watch?v=example-park-guide",
    updatedAt: "2026-06",
    description:
      "티샷 방향, 거리 조절, OB 위험 구간, 그린 경사, 퍼팅 주의점을 정리한 공략 영상입니다.",
    ctaText: "공략 영상 보기",
  },
  {
    id: "course-2",
    examType: "life_sports",
    examVenue: "예시 파크골프장",
    title: "OO실기장 야디지북 메모",
    materialType: "yardage_book",
    coverage: "주요 홀",
    keyPoints: [
      "티샷 방향",
      "짧게 공략",
      "솟은 그린",
      "야디지북",
      "1번~18번 홀",
    ],
    providerType: "community",
    authorName: "응시생A",
    updatedAt: "2026-05",
    description:
      "각 홀별 티샷 방향, 짧게 쳐야 하는 홀, 그린 주변 주의사항을 정리한 메모입니다.",
    ctaText: "야디지북 보기",
  },
  {
    id: "course-3",
    examType: "life_sports",
    examVenue: "예시 파크골프장",
    title: "실기장 답사 후기",
    materialType: "venue_visit_review",
    coverage: "전체 코스",
    keyPoints: ["OB 주의", "거리 조절", "퍼팅 경사", "1번~18번 홀"],
    providerType: "community",
    authorName: "응시생B",
    updatedAt: "2026-06",
    description: "직접 연습한 사람이 남긴 홀별 난이도와 주의사항입니다.",
    ctaText: "후기 보기",
  },
  {
    id: "course-4",
    examType: "park_instructor",
    examVenue: "예시 파크골프장",
    title: "지도자 실기 평가장 7~12번 홀 공략 메모",
    materialType: "hole_memo",
    coverage: "7번~12번 홀",
    keyPoints: ["티샷 방향", "짧게 공략", "솟은 그린", "OB 주의"],
    providerType: "instructor",
    authorName: "예시강사",
    updatedAt: "2026-04",
    description: "중반 홀에서 자주 감점되는 구간과 안전한 공략 루트를 정리했습니다.",
    ctaText: "홀별 메모 보기",
  },
  {
    id: "course-5",
    examType: "park_instructor",
    examVenue: "예시 파크골프장",
    title: "실기 연습 후기 — 바람 많은 날",
    materialType: "practice_review",
    coverage: "전체 코스",
    keyPoints: ["거리 조절", "티샷 방향", "퍼팅 경사"],
    providerType: "community",
    authorName: "연습생C",
    updatedAt: "2026-05",
    description: "바람이 강한 날 연습 후 남긴 거리 조절·티샷 방향 후기입니다.",
    ctaText: "연습 후기 보기",
  },
  {
    id: "course-6",
    examType: "park_referee",
    examVenue: "예시 파크골프장",
    title: "심판 실습 코스 답사 영상",
    materialType: "youtube",
    coverage: "주요 홀",
    keyPoints: ["OB 주의", "유튜브 공략", "1번~18번 홀"],
    providerType: "youtube",
    authorName: "예시심판",
    youtubeUrl: "https://www.youtube.com/watch?v=example-referee-course",
    updatedAt: "2026-03",
    description: "심판 실습 전 코스 구조와 위험 구간을 미리 확인하는 답사 영상입니다.",
    ctaText: "답사 영상 보기",
  },
];

export const oralQuestionBank: OralQuestion[] = [
  {
    id: "oral-1",
    examType: "park_referee",
    questionType: "rules",
    question: "OB가 발생했을 때 처리 방법을 설명하세요.",
    trend: "자주 나오는 문제",
    sampleAnswer:
      "OB 구역에 볼이 들어갔을 때는 규정에 따라 벌타를 적용하고, 지정된 구역에서 다시 플레이합니다. 선수에게 규칙과 절차를 명확히 안내해야 합니다.",
    practiceTimeLimit: 3,
    cautionText: ORAL_ANSWER_CAUTION,
  },
  {
    id: "oral-2",
    examType: "park_referee",
    questionType: "gameplay",
    question: "경기 중 동반자의 공이 움직였을 때 어떻게 해야 하나요?",
    trend: "실전 상황형",
    sampleAnswer:
      "움직인 원인을 확인하고, 규정에 따라 공을 원위치에 놓거나 벌타를 적용합니다. 상황을 차분히 설명하고 기록에 남깁니다.",
    practiceTimeLimit: 3,
    cautionText: ORAL_ANSWER_CAUTION,
  },
  {
    id: "oral-3",
    examType: "park_instructor",
    questionType: "safety",
    question: "지도자가 교육 중 안전사고를 예방하기 위해 해야 할 일을 말해보세요.",
    trend: "기본 소양",
    sampleAnswer:
      "연습 전 주변 안전을 확인하고, 스윙 방향에 사람이 없는지 점검합니다. 날씨·바닥 상태를 확인하고, 무리한 동작을 지도하지 않으며, 위험 시 즉시 중단합니다.",
    practiceTimeLimit: 3,
    cautionText: ORAL_ANSWER_CAUTION,
  },
  {
    id: "oral-4",
    examType: "park_referee",
    questionType: "referee_role",
    question: "심판의 역할과 판정 시 유의사항을 설명하세요.",
    trend: "심판 과정 관련",
    sampleAnswer:
      "심판은 규칙에 따라 공정하게 경기를 진행하고, 위반 여부를 판단합니다. 선수에게 규칙을 안내하고, 분쟁 시 규정에 근거해 설명하며, 기록을 관리합니다.",
    practiceTimeLimit: 3,
    cautionText: ORAL_ANSWER_CAUTION,
  },
  {
    id: "oral-5",
    examType: "park_instructor",
    questionType: "ethics",
    question: "지도자 윤리에 대해 말씀해 주세요.",
    trend: "기본 소양",
    sampleAnswer:
      "지도자는 수강생에게 공정하고 성실하게 지도해야 하며, 차별 없이 안전을 최우선으로 합니다. 허위·과장 홍보를 하지 않고, 자격 범위를 벗어난 지도를 하지 않습니다.",
    practiceTimeLimit: 3,
    cautionText: ORAL_ANSWER_CAUTION,
  },
  {
    id: "oral-6",
    examType: "park_referee",
    questionType: "emergency",
    question: "돌발상황 발생 시 어떻게 대처하나요?",
    trend: "실전 상황형",
    sampleAnswer:
      "먼저 안전을 확보하고 경기를 일시 중단합니다. 규정에 따라 처리하고, 필요 시 상급 심판 또는 운영위원회에 보고합니다.",
    practiceTimeLimit: 3,
    cautionText: ORAL_ANSWER_CAUTION,
  },
];

export const examSchedules: ExamSchedule[] = [
  {
    id: "sched-1",
    examName: "생활스포츠지도사 국가시험",
    examType: "life_sports",
    organization: "한국스포츠협회(예시)",
    applicationPeriod: "2026년 상반기 접수 예정",
    examDate: "2026년 하반기 예정",
    venueAnnouncement: "미발표",
    resultDate: "시험 후 공지 예정",
    requiredItems: "신분증, 응시표, 개인 클럽, 운동복",
    officialUrl: "https://example.com/life-sports-exam",
    status: "venue_planned",
  },
  {
    id: "sched-2",
    examName: "장애인스포츠지도사 국가시험",
    examType: "disabled_sports",
    organization: "한국장애인체육회(예시)",
    applicationPeriod: "2026년 7월 ~ 8월(예시)",
    examDate: "2026년 10월 예정",
    venueAnnouncement: "2026년 9월 공지 예정",
    resultDate: "시험 후 2주 내(예시)",
    requiredItems: "신분증, 응시표, 개인 클럽",
    officialUrl: "https://example.com/disabled-sports-exam",
    status: "application_open",
  },
  {
    id: "sched-3",
    examName: "파크골프 지도자 과정 평가",
    examType: "park_instructor",
    organization: "대한파크골프협회(예시)",
    applicationPeriod: "기관별 상이",
    examDate: "과정 수료 후 평가",
    venueAnnouncement: "교육기관별 안내",
    resultDate: "평가 후 2주 내(예시)",
    requiredItems: "신분증, 수료증명, 개인 클럽",
    officialUrl: "https://example.com/park-instructor",
    status: "exam_planned",
  },
  {
    id: "sched-4",
    examName: "파크골프 심판 과정 평가",
    examType: "park_referee",
    organization: "지역 협회·교육기관(예시)",
    applicationPeriod: "교육 과정별 안내",
    examDate: "교육 종료 후 실습·필기",
    venueAnnouncement: "실습 장소 별도 공지",
    resultDate: "기관 공지 확인",
    requiredItems: "신분증, 교육 수료 확인서",
    officialUrl: "https://example.com/park-referee",
    status: "result_planned",
  },
];

export const examPrepBoardPosts: ExamPrepBoardPost[] = [
  {
    id: "talk-1",
    boardType: "generalTalk",
    category: "venue",
    examType: "life_sports",
    venue: "한천예천파크골프장",
    title: "OO실기장 7번 홀 티샷 어디 보고 치는 게 좋나요?",
    author: "응시준비생",
    commentCount: 8,
    viewCount: 142,
    createdAt: "2시간 전",
    status: "open",
  },
  {
    id: "talk-2",
    boardType: "generalTalk",
    category: "oral",
    examType: "park_referee",
    title: "구술 3분 안에 답변하는 요령이 있을까요?",
    author: "심판지망",
    commentCount: 5,
    viewCount: 98,
    createdAt: "5시간 전",
    status: "open",
  },
  {
    id: "talk-3",
    boardType: "generalTalk",
    category: "practice_partner",
    examType: "life_sports",
    venue: "한천예천파크골프장",
    title: "이번 주 토요일 실기장 같이 연습하실 분?",
    author: "실기연습러",
    commentCount: 3,
    viewCount: 76,
    createdAt: "어제",
    status: "open",
  },
  {
    id: "talk-4",
    boardType: "generalTalk",
    category: "group_match",
    examType: "life_sports",
    title: "같은 조 배정된 분 계신가요?",
    author: "시험당일",
    commentCount: 12,
    viewCount: 210,
    createdAt: "2일 전",
    status: "open",
  },
  {
    id: "talk-5",
    boardType: "generalTalk",
    category: "written",
    examType: "life_sports",
    title: "필기 기출 중 이 문제 답이 헷갈립니다.",
    author: "필기고민",
    commentCount: 6,
    viewCount: 115,
    createdAt: "3일 전",
    status: "open",
  },
  {
    id: "talk-6",
    boardType: "generalTalk",
    category: "cheer",
    title: "시험 전날인데 너무 떨리네요.",
    author: "떨리는마음",
    commentCount: 14,
    viewCount: 188,
    createdAt: "4일 전",
    status: "open",
  },
  {
    id: "talk-7",
    boardType: "generalTalk",
    category: "pass_review",
    examType: "life_sports",
    title: "합격자 공부법 공유합니다.",
    author: "합격자예시",
    commentCount: 9,
    viewCount: 320,
    createdAt: "1주 전",
    status: "pinned",
  },
  {
    id: "prac-1",
    boardType: "practicalGuide",
    category: "hole_guide",
    examType: "life_sports",
    venue: "한천예천파크골프장",
    courseName: "A코스",
    holeRange: "1~9번 홀",
    materialType: "홀별 공략",
    title: "한천예천 A코스 1~9번 홀 공략",
    author: "코스탐험",
    commentCount: 11,
    viewCount: 256,
    createdAt: "1일 전",
    status: "open",
  },
  {
    id: "prac-2",
    boardType: "practicalGuide",
    category: "hole_guide",
    examType: "life_sports",
    venue: "한천예천파크골프장",
    courseName: "B코스",
    holeRange: "10~18번 홀",
    materialType: "홀별 공략",
    title: "한천예천 B코스 10~18번 홀 티샷 방향",
    author: "티샷러",
    commentCount: 7,
    viewCount: 198,
    createdAt: "2일 전",
    status: "open",
  },
  {
    id: "prac-3",
    boardType: "practicalGuide",
    category: "green_info",
    examType: "life_sports",
    venue: "OO실기장",
    courseName: "전체",
    materialType: "퍼팅그린 특징",
    title: "OO실기장 퍼팅그린 경사 정리",
    author: "퍼팅연구",
    commentCount: 4,
    viewCount: 167,
    createdAt: "3일 전",
    status: "open",
  },
  {
    id: "prac-5",
    boardType: "practicalGuide",
    category: "video",
    examType: "life_sports",
    venue: "여러 실기장",
    materialType: "유튜브 공략 영상",
    title: "생활스포츠지도사 실기장 유튜브 공략 모음",
    author: "영상큐레이터",
    commentCount: 15,
    viewCount: 412,
    createdAt: "4일 전",
    status: "pinned",
  },
  {
    id: "prac-yard-1",
    boardType: "practicalGuide",
    category: "yardage",
    examType: "life_sports",
    venue: "OO파크골프장",
    courseName: "전체",
    materialType: "야디지북",
    title: "OO파크골프장 야디지북 공유",
    author: "야디메모",
    commentCount: 6,
    viewCount: 198,
    createdAt: "5일 전",
    status: "open",
  },
  {
    id: "prac-4",
    boardType: "practicalGuide",
    category: "ob_guide",
    examType: "life_sports",
    venue: "예시 파크골프장",
    courseName: "전체",
    holeRange: "주요 홀",
    materialType: "OB 구간",
    title: "OO실기장 OB 위험 구간 정리",
    author: "안전우선",
    commentCount: 9,
    viewCount: 221,
    createdAt: "6일 전",
    status: "open",
  },
  {
    id: "prac-yard-2",
    boardType: "practicalGuide",
    category: "distance",
    examType: "life_sports",
    venue: "OO파크골프장",
    courseName: "전체",
    holeRange: "1~18홀",
    materialType: "거리표",
    title: "OO파크골프장 1~18홀 거리표",
    author: "거리측정",
    commentCount: 4,
    viewCount: 156,
    createdAt: "1주 전",
    status: "open",
  },
  {
    id: "prac-6",
    boardType: "practicalGuide",
    category: "visit_review",
    examType: "life_sports",
    venue: "OO파크골프장",
    courseName: "전체",
    materialType: "답사 후기",
    title: "OO파크골프장 답사 후기",
    author: "답사러",
    commentCount: 6,
    viewCount: 134,
    createdAt: "1주 전",
    status: "open",
  },
  {
    id: "oral-1",
    boardType: "oralQuestion",
    category: "rules",
    examType: "park_referee",
    materialType: "모범답변",
    title: "OB 처리 방법 구술 모범답변",
    author: "규정정리",
    commentCount: 8,
    viewCount: 189,
    createdAt: "1일 전",
    status: "open",
  },
  {
    id: "oral-2",
    boardType: "oralQuestion",
    category: "gameplay",
    examType: "park_referee",
    materialType: "모범답변",
    title: "경기 중 공이 움직였을 때 답변 정리",
    author: "실전답변",
    commentCount: 5,
    viewCount: 156,
    createdAt: "2일 전",
    status: "open",
  },
  {
    id: "oral-3",
    boardType: "oralQuestion",
    category: "safety",
    examType: "park_instructor",
    materialType: "예상문제",
    title: "지도자 안전수칙 예상문제",
    author: "안전지도",
    commentCount: 3,
    viewCount: 98,
    createdAt: "3일 전",
    status: "open",
  },
  {
    id: "oral-4",
    boardType: "oralQuestion",
    category: "referee_role",
    examType: "park_referee",
    materialType: "모범답변",
    title: "심판 역할과 판정 시 유의사항",
    author: "심판연습",
    commentCount: 7,
    viewCount: 201,
    createdAt: "4일 전",
    status: "open",
  },
  {
    id: "oral-5",
    boardType: "oralQuestion",
    category: "practice",
    examType: "park_referee",
    materialType: "질문",
    title: "구술 3분 안에 답변하는 요령",
    author: "타이머연습",
    commentCount: 12,
    viewCount: 278,
    createdAt: "5일 전",
    status: "pinned",
  },
  {
    id: "oral-6",
    boardType: "oralQuestion",
    category: "rules",
    examType: "park_referee",
    materialType: "기출복원",
    title: "자주 나오는 규정 문제 정리",
    author: "기출정리",
    commentCount: 9,
    viewCount: 245,
    createdAt: "1주 전",
    status: "open",
  },
  {
    id: "written-1",
    boardType: "writtenExam",
    category: "past_restore",
    examType: "life_sports",
    materialType: "기출복원",
    title: "2026 생활스포츠지도사 필기 기출 복원 정리",
    author: "필기정리",
    commentCount: 14,
    viewCount: 356,
    createdAt: "1일 전",
    status: "pinned",
  },
  {
    id: "written-2",
    boardType: "writtenExam",
    category: "practice",
    examType: "disabled_sports",
    materialType: "예상문제",
    title: "장애인스포츠지도사 필기 예상문제 30선",
    author: "예상문제",
    commentCount: 6,
    viewCount: 178,
    createdAt: "2일 전",
    status: "open",
  },
  {
    id: "written-3",
    boardType: "writtenExam",
    category: "summary",
    examType: "park_instructor",
    materialType: "요약노트",
    title: "파크골프 지도자 필기 요약노트 공유",
    author: "요약왕",
    commentCount: 8,
    viewCount: 203,
    createdAt: "3일 전",
    status: "open",
  },
  {
    id: "written-4",
    boardType: "writtenExam",
    category: "question",
    examType: "park_referee",
    materialType: "질문",
    title: "심판 필기 규정 문제 헷갈리는 부분 정리",
    author: "규정질문",
    commentCount: 5,
    viewCount: 121,
    createdAt: "4일 전",
    status: "open",
  },
  {
    id: "written-5",
    boardType: "writtenExam",
    category: "review",
    examType: "private_instructor",
    materialType: "질문",
    title: "민간 지도자 과정 필기 후기",
    author: "민간응시",
    commentCount: 3,
    viewCount: 89,
    createdAt: "5일 전",
    status: "open",
  },
  {
    id: "written-6",
    boardType: "writtenExam",
    category: "guide",
    examType: "life_sports",
    materialType: "해설",
    title: "필기 공부 순서 추천",
    author: "공부루트",
    commentCount: 11,
    viewCount: 267,
    createdAt: "1주 전",
    status: "open",
  },
  {
    id: "training-1",
    boardType: "trainingInfo",
    category: "application",
    examType: "life_sports",
    materialType: "신청 방법",
    title: "생활스포츠지도사 연수 신청은 어디서 하나요?",
    author: "연수준비",
    commentCount: 9,
    viewCount: 312,
    createdAt: "1일 전",
    status: "pinned",
  },
  {
    id: "training-2",
    boardType: "trainingInfo",
    category: "training_org",
    examType: "life_sports",
    materialType: "연수기관",
    title: "연수기관별 일정 확인 방법 정리",
    author: "일정정리",
    commentCount: 6,
    viewCount: 245,
    createdAt: "2일 전",
    status: "open",
  },
  {
    id: "training-3",
    boardType: "trainingInfo",
    category: "supplies",
    examType: "life_sports",
    materialType: "준비물",
    title: "연수 준비물과 출석 기준 질문",
    author: "준비물질문",
    commentCount: 4,
    viewCount: 178,
    createdAt: "3일 전",
    status: "open",
  },
  {
    id: "training-4",
    boardType: "trainingInfo",
    category: "field_practice",
    examType: "life_sports",
    materialType: "현장실습",
    title: "현장실습은 어떻게 진행되나요?",
    author: "현장궁금",
    commentCount: 11,
    viewCount: 289,
    createdAt: "4일 전",
    status: "open",
  },
  {
    id: "training-5",
    boardType: "trainingInfo",
    category: "training_review",
    examType: "life_sports",
    materialType: "연수 후기",
    title: "연수 후기 공유합니다",
    author: "연수수료",
    commentCount: 7,
    viewCount: 201,
    createdAt: "5일 전",
    status: "open",
  },
  {
    id: "training-6",
    boardType: "trainingInfo",
    category: "training_schedule",
    examType: "disabled_sports",
    materialType: "연수 일정",
    title: "장애인스포츠지도사 연수 일정 공유",
    author: "일정공유",
    commentCount: 3,
    viewCount: 134,
    createdAt: "1주 전",
    status: "open",
  },
];

export function filterByExamType<T extends { examType: ExamType }>(
  items: T[],
  examType: ExamType | "all",
) {
  if (examType === "all") return items;
  return items.filter((item) => item.examType === examType);
}

export function filterExamPrepPosts(
  posts: ExamPrepBoardPost[],
  boardType: ExamPrepBoardType,
  examType: ExamType | "all",
  category: ExamPrepBoardCategory | "all" = "all",
) {
  return posts.filter((post) => {
    if (post.boardType !== boardType) return false;
    if (examType !== "all" && post.examType && post.examType !== examType) {
      return false;
    }
    if (
      boardType === "generalTalk" &&
      category !== "all" &&
      post.category !== category
    ) {
      return false;
    }
    return true;
  });
}

/** @deprecated filterExamPrepPosts 사용 */
export function filterBoardPosts(
  posts: ExamPrepBoardPost[],
  examType: ExamType | "all",
  category: ExamPrepBoardCategory | "all",
) {
  return filterExamPrepPosts(posts, "generalTalk", examType, category);
}

export const qualificationAdTargets = [
  "지도자 과정 모집",
  "심판 과정 모집",
  "생활스포츠지도사 준비반",
  "장애인스포츠지도사 준비반",
  "온라인 문제풀이 강의",
  "실기 대비반",
  "교재/문제집",
  "심판 모집 공고",
  "강사 모집 공고",
];

export const plannedCourseAdProducts: QualificationAd[] = [
  {
    id: "ad-1",
    title: "상단 추천 과정 노출",
    provider: "PUL 광고",
    adType: "추천 노출",
    category: "교육과정",
    description: "자격증·심판 교육과정 탭 상단 추천 영역 노출",
    ctaText: "문의",
  },
  {
    id: "ad-2",
    title: "지역별 추천 과정 노출",
    provider: "PUL 광고",
    adType: "지역 타깃",
    category: "교육과정",
    description: "지역 필터 결과 상단 추천 슬롯",
    ctaText: "문의",
  },
  {
    id: "ad-3",
    title: "자격증 유형별 배너",
    provider: "PUL 광고",
    adType: "배너",
    category: "브랜딩",
    description: "지도자·심판·국가시험 유형별 배너 노출",
    ctaText: "문의",
  },
  {
    id: "ad-5",
    title: "교육기관 상세 페이지",
    provider: "PUL 광고",
    adType: "상세 페이지",
    category: "기관",
    description: "교육기관 소개·과정 목록 전용 페이지",
    ctaText: "문의",
  },
  {
    id: "ad-6",
    title: "온라인 강의 링크 연결",
    provider: "PUL 광고",
    adType: "외부 링크",
    category: "온라인",
    description: "YouTube·온라인 강의 플랫폼 연결 홍보",
    ctaText: "문의",
  },
];

export const qualificationAds: QualificationAd[] = [
  ...plannedCourseAdProducts,
  {
    id: "ad-4",
    title: "심판 모집 공고 상단 노출",
    provider: "PUL 광고",
    adType: "모집 공고",
    category: "활동",
    description: "심판·강사 활동 탭 상단 고정 노출",
    ctaText: "문의",
  },
];

export type CourseFilters = {
  category: string;
  region: string;
  method: string;
  status: string;
  priceRange: string;
  providerType: string;
  keyword: string;
};

export function createDefaultCourseFilters(): CourseFilters {
  return {
    category: "all",
    region: "전체",
    method: "all",
    status: "all",
    priceRange: "all",
    providerType: "all",
    keyword: "",
  };
}

function parsePrice(price: string) {
  const value = Number.parseInt(price.replace(/[^\d]/g, ""), 10);
  return Number.isNaN(value) ? 0 : value;
}

function matchPriceRange(price: string, range: string) {
  if (range === "all") return true;
  const value = parsePrice(price);
  if (range === "under100") return value <= 100000;
  if (range === "100to300") return value > 100000 && value <= 300000;
  if (range === "over300") return value > 300000;
  return true;
}

export function filterQualificationCourses(
  courses: QualificationCourse[],
  filters: CourseFilters,
) {
  const keyword = filters.keyword.trim().toLowerCase();

  return courses.filter((course) => {
    if (filters.category !== "all" && course.category !== filters.category) {
      return false;
    }
    if (filters.region !== "전체" && course.region !== filters.region) {
      return false;
    }
    if (filters.method !== "all" && course.method !== filters.method) {
      return false;
    }
    if (filters.status !== "all" && course.status !== filters.status) {
      return false;
    }
    if (filters.providerType !== "all" && course.providerType !== filters.providerType) {
      return false;
    }
    if (!matchPriceRange(course.price, filters.priceRange)) return false;
    if (keyword) {
      const haystack =
        `${course.title} ${course.provider} ${course.region} ${course.target} ${courseCategoryLabels[course.category]}`.toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}

export const featuredQualificationCourses = qualificationCourses.filter(
  (course) => course.featured,
);
