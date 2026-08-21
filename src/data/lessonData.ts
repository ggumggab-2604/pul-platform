import type {
  LessonFormat,
  LessonRecruitStatus,
  LessonRegion,
  LessonScheduleTag,
  LessonTarget,
  LessonType,
  ParkGolfLesson,
} from "@/types";

/**
 * TODO:
 * - 교육 신청 데이터 저장
 * - 강사/교육기관 등록 신청
 * - 운영자 승인 후 교육 노출
 * - 유료 교육 결제 연동
 * - 교육 후기
 * - 강사 프로필
 * - 동호회 단체교육 신청
 * - 자격증/심판 과정 연결
 * - 입문 가이드 페이지 연결
 */

export const LESSON_INQUIRY_MESSAGE =
  "현재는 운영자가 교육기관 또는 강사에게 문의를 전달하는 방식으로 준비 중입니다. 정식 오픈 전에는 카카오톡 또는 문의 폼으로 연결될 예정입니다.";

export const LESSON_PARTNER_INQUIRY_URL =
  "https://docs.google.com/forms/d/e/placeholder-lesson-partner/viewform";

export const LESSON_PARTNER_INQUIRY_MESSAGE =
  "PUL 교육 제휴·광고 신청 기능은 준비 중입니다. 정식 오픈 전에는 운영자 확인 후 안내드립니다.";

export const lessonBeginnerIntroText =
  "파크골프가 처음이라면 기본 규칙, 장비, 예약 방식, 동호회 이용 방법을 먼저 이해하는 것이 좋습니다. 골프 경험이 있더라도 파크골프는 지자체 구장, 1인 예약, 동호회 중심 운영 등 다른 점이 있습니다.";

export const lessonRegisterNotes = [
  "파크골프 강사, 교육기관, 평생교육원, 동호회 교육 담당자는 PUL에 교육 정보를 등록할 수 있습니다.",
  "초기에는 운영자가 확인 후 수동 등록합니다.",
  "지역별 교육, 단체교육, 입문·실력 향상 프로그램을 노출할 수 있습니다.",
];

export const lessonPartnerBanner = {
  title: "PUL 교육 제휴 안내",
  description:
    "파크골프 강사, 교육기관, 평생교육원, 단체교육 프로그램을 소개할 수 있습니다.",
  ctaText: "제휴 문의",
  tags: [
    "교육기관",
    "평생교육원",
    "입문 레슨",
    "단체교육",
    "장비 할인",
    "시니어 건강",
    "지역 제휴",
  ],
};

export const paidLessonRegisterBanner = {
  title: "PUL 유료 레슨·교육 등록 안내",
  description:
    "파크골프 강사, 레슨 운영자, 아카데미, 동호회 교육 담당자는 PUL에 유료 레슨·교육 정보를 등록할 수 있습니다.",
  ctaText: "레슨·교육 등록 문의",
  tags: ["입문 클래스", "전환 레슨", "퍼팅·스윙", "시니어 교육", "동호회 단체교육"],
};

export const instructorPromoRegisterNotes = [
  "레슨 강사·아카데미·동호회 교육 담당자의 프로그램을 홍보할 수 있습니다.",
  "유튜브 교습가는 영상 링크로 채널과 강의를 소개할 수 있습니다.",
  "초기에는 운영자 확인 후 수동 등록합니다.",
];

export const instructorPromotionNotes = [
  "유튜브 강의 채널은 YouTube 링크로 등록·연결됩니다.",
  "레슨 강사는 교육 프로그램 정보를 PUL에 소개할 수 있습니다.",
  "초기에는 운영자 확인 후 수동 등록합니다.",
  "자격증·심판 과정 등록은 상단 별도 메뉴에서 다룹니다.",
];

export const CERTIFICATION_LESSON_TYPES = [
  "certification",
  "referee",
  "instructor",
] as const satisfies readonly LessonType[];

export function isCertificationLesson(lesson: ParkGolfLesson) {
  return (CERTIFICATION_LESSON_TYPES as readonly string[]).includes(lesson.type);
}

export const lessonTypes: { value: LessonType | "all"; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "beginner", label: "입문 레슨" },
  { value: "improvement", label: "실력 향상" },
  { value: "group", label: "동호회 단체교육" },
  { value: "certification", label: "자격증 준비" },
  { value: "referee", label: "심판 교육" },
  { value: "instructor", label: "지도자 과정" },
  { value: "online", label: "온라인 강의" },
];

export const lessonRegions: { value: LessonRegion | "전체"; label: string }[] = [
  { value: "전체", label: "전체" },
  { value: "서울", label: "서울" },
  { value: "경기", label: "경기" },
  { value: "인천", label: "인천" },
  { value: "충청", label: "충청" },
  { value: "강원", label: "강원" },
  { value: "전라", label: "전라" },
  { value: "경상", label: "경상" },
  { value: "제주", label: "제주" },
];

export const lessonFormats: { value: LessonFormat | "all"; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "offline", label: "오프라인" },
  { value: "online", label: "온라인" },
  { value: "field", label: "현장 실습" },
  { value: "group", label: "단체교육" },
];

export const lessonTargets: { value: LessonTarget | "all"; label: string }[] = [
  { value: "all", label: "전체" },
  { value: "absolute_beginner", label: "완전 초보" },
  { value: "golf_experienced", label: "골프 경험자" },
  { value: "senior", label: "시니어" },
  { value: "club_member", label: "동호회 회원" },
  { value: "cert_prep", label: "자격증 준비자" },
];

export const lessonSchedules: {
  value: LessonScheduleTag | "all";
  label: string;
}[] = [
  { value: "all", label: "전체" },
  { value: "this_week", label: "이번 주" },
  { value: "this_month", label: "이번 달" },
  { value: "always", label: "상시 모집" },
  { value: "closing_soon", label: "마감 임박" },
];

export const lessonTypeLabels: Record<LessonType, string> = {
  beginner: "입문 레슨",
  improvement: "실력 향상",
  group: "동호회 단체교육",
  certification: "자격증 준비",
  referee: "심판 교육",
  instructor: "지도자 과정",
  online: "온라인 강의",
};

export const lessonFormatLabels: Record<LessonFormat, string> = {
  offline: "오프라인",
  online: "온라인",
  field: "현장 실습",
  group: "단체교육",
};

export const lessonTargetLabels: Record<LessonTarget, string> = {
  absolute_beginner: "완전 초보",
  golf_experienced: "골프 경험자",
  senior: "시니어",
  club_member: "동호회 회원",
  cert_prep: "자격증 준비자",
};

export const lessonRecruitLabels: Record<LessonRecruitStatus, string> = {
  recruiting: "모집중",
  waiting: "마감임박",
  closed: "모집마감",
};

export const lessonRecruitStyles: Record<LessonRecruitStatus, string> = {
  recruiting: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/70",
  waiting: "bg-orange-50 text-orange-700 ring-1 ring-orange-200/70",
  closed: "bg-gray-100 text-gray-600 ring-1 ring-gray-200/80",
};

export const lessonTypeBadgeStyles: Record<LessonType, string> = {
  beginner: "bg-pul-light text-pul-deep ring-1 ring-pul-point/20",
  improvement: "bg-emerald-50 text-pul-deep ring-1 ring-emerald-200/60",
  group: "bg-pul-light text-pul-deep ring-1 ring-pul-point/20",
  certification: "bg-emerald-50 text-pul-deep ring-1 ring-emerald-200/60",
  referee: "bg-pul-light/80 text-pul-deep ring-1 ring-pul-point/15",
  instructor: "bg-emerald-50 text-pul-deep ring-1 ring-emerald-200/60",
  online: "bg-pul-light text-pul-deep ring-1 ring-pul-point/20",
};

export function getLessonRecruitDisplay(lesson: ParkGolfLesson): {
  label: string;
  className: string;
} {
  if (lesson.recruitStatus === "closed") {
    return { label: "모집마감", className: lessonRecruitStyles.closed };
  }
  if (
    lesson.scheduleTags.includes("closing_soon") ||
    lesson.recruitStatus === "waiting"
  ) {
    return { label: "마감임박", className: lessonRecruitStyles.waiting };
  }
  if (lesson.scheduleTags.includes("always")) {
    return {
      label: "상시모집",
      className: "bg-pul-light text-pul-deep ring-1 ring-pul-point/25",
    };
  }
  return { label: "모집중", className: lessonRecruitStyles.recruiting };
}

export const parkGolfLessons: ParkGolfLesson[] = [
  {
    id: "lesson-1",
    title: "파크골프 완전 입문 1일 클래스",
    type: "beginner",
    province: "서울",
    district: "마포구",
    regionLabel: "서울 > 마포구",
    location: "마포 파크골프장 교육장",
    instructor: "김민수",
    organizer: "마포구 평생학습관",
    target: ["absolute_beginner"],
    schedule: "2026년 7월 12일(토)",
    scheduleTags: ["this_week", "this_month"],
    time: "10:00 ~ 15:00",
    price: "35,000원",
    format: "offline",
    recruitStatus: "recruiting",
    description:
      "파크골프를 처음 접하는 분을 위한 1일 집중 입문 과정입니다. 기본 자세, 스윙, 규칙을 배웁니다.",
    curriculum: "장비 소개 · 그립/어드레스 · 퍼팅 · 기본 스윙 · 규칙·매너",
    supplies: "편한 운동복, 운동화, 개인 장갑(선택)",
    notices: ["우천 시 실내 이론 교육으로 대체", "점심 식사 별도"],
    contactMethod: "마포구 평생학습관 02-000-0001",
    featured: true,
  },
  {
    id: "lesson-2",
    title: "골프 경험자를 위한 파크골프 전환 레슨",
    type: "improvement",
    province: "경기",
    district: "고양시",
    regionLabel: "경기 > 고양시",
    location: "고양 파크골프장",
    instructor: "이정훈",
    organizer: "고양 파크골프 아카데미",
    target: ["golf_experienced"],
    schedule: "2026년 7월 19일(토) ~ 8월 9일(토) 4회",
    scheduleTags: ["this_month"],
    time: "09:00 ~ 11:00",
    price: "120,000원",
    format: "field",
    recruitStatus: "recruiting",
    description:
      "필드 골프 경험이 있는 분이 파크골프에 빠르게 적응할 수 있도록 돕는 전환 레슨입니다.",
    curriculum: "클럽 차이 · 거리 조절 · 그린 공략 · 코스 플레이",
    supplies: "파크골프 클럽(대여 가능), 운동화",
    notices: ["골프 경력 1년 이상 권장"],
    contactMethod: "고양 파크골프 아카데미 031-000-0002",
    featured: true,
  },
  {
    id: "lesson-3",
    title: "동호회 단체 기본기 교육",
    type: "group",
    province: "인천",
    district: "연수구",
    regionLabel: "인천 > 연수구",
    location: "연수 파크골프장",
    instructor: "박서연",
    organizer: "연수 파크골프 동호회",
    target: ["club_member", "absolute_beginner"],
    schedule: "2026년 7월 26일(토)",
    scheduleTags: ["this_month"],
    time: "14:00 ~ 17:00",
    price: "동호회 회원 무료",
    format: "group",
    recruitStatus: "recruiting",
    description: "동호회 신입 회원 대상 단체 기본기 교육입니다.",
    curriculum: "동호회 소개 · 기본 스윙 · 안전 수칙 · 라운딩 매너",
    supplies: "동호회 지정 장비 사용",
    notices: ["동호회 가입 회원 대상"],
    contactMethod: "연수 파크골프 동호회 운영진",
    featured: true,
  },
  {
    id: "lesson-4",
    title: "시니어 파크골프 안전 교육",
    type: "beginner",
    province: "충청",
    district: "청주시",
    regionLabel: "충청 > 청주시",
    location: "청주 시니어 파크골프장",
    instructor: "최영자",
    organizer: "청주시 건강도시과",
    target: ["senior", "absolute_beginner"],
    schedule: "상시 모집 (매주 수요일)",
    scheduleTags: ["always", "this_month"],
    time: "10:00 ~ 12:00",
    price: "20,000원",
    format: "offline",
    recruitStatus: "recruiting",
    description: "시니어를 위한 안전 중심 파크골프 입문 교육입니다.",
    curriculum: "스트레칭 · 안전 수칙 · 기본 스윙 · 건강 체조",
    supplies: "편한 복장, 운동화",
    notices: ["65세 이상 우대", "보호자 동반 가능"],
    contactMethod: "청주시 건강도시과 043-000-0004",
    featured: true,
  },
  {
    id: "lesson-5",
    title: "파크골프 규칙·매너 교육",
    type: "beginner",
    province: "강원",
    district: "춘천시",
    regionLabel: "강원 > 춘천시",
    location: "춘천 파크골프장 세미나실",
    instructor: "한지원",
    organizer: "춘천시 파크골프협회",
    target: ["absolute_beginner", "club_member"],
    schedule: "2026년 8월 2일(토)",
    scheduleTags: ["this_month", "closing_soon"],
    time: "13:00 ~ 16:00",
    price: "15,000원",
    format: "offline",
    recruitStatus: "recruiting",
    description: "경기 규칙과 라운딩 매너를 집중적으로 배우는 교육입니다.",
    curriculum: "경기 규칙 · 하우스 룰 · 매너 · 실전 라운딩",
    supplies: "필기도구",
    notices: ["잔여 3석"],
    contactMethod: "춘천시 파크골프협회 033-000-0005",
  },
  {
    id: "lesson-6",
    title: "지도자 자격증 준비반",
    type: "instructor",
    province: "경상",
    district: "부산 해운대구",
    regionLabel: "경상 > 부산 해운대구",
    location: "부산 파크골프 지도자 교육원",
    instructor: "정대호",
    organizer: "대한파크골프협회 부산지회",
    target: ["cert_prep"],
    schedule: "2026년 9월 ~ 11월 (주 1회)",
    scheduleTags: ["always"],
    time: "19:00 ~ 21:00",
    price: "450,000원",
    format: "offline",
    recruitStatus: "recruiting",
    description: "파크골프 지도자 자격증 취득을 준비하는 정규 과정입니다.",
    curriculum: "이론 · 지도법 · 실기 · 모의시험",
    supplies: "교재 별도 구매",
    notices: ["자격증 응시 자격 요건 확인 필요"],
    contactMethod: "부산지회 교육팀 051-000-0006",
  },
  {
    id: "lesson-7",
    title: "심판 기초 교육",
    type: "referee",
    province: "전라",
    district: "전주시",
    regionLabel: "전라 > 전주시",
    location: "전주 파크골프장",
    instructor: "윤성민",
    organizer: "전북 파크골프심판위원회",
    target: ["cert_prep", "club_member"],
    schedule: "2026년 7월 20일(일)",
    scheduleTags: ["this_month"],
    time: "09:00 ~ 17:00",
    price: "50,000원",
    format: "field",
    recruitStatus: "recruiting",
    description: "대회 심판을 희망하는 분을 위한 기초 교육입니다.",
    curriculum: "규칙 해설 · 판정 실습 · 대회 운영",
    supplies: "심판복(대여), 필기도구",
    notices: ["실기 평가 포함"],
    contactMethod: "전북 심판위원회 063-000-0007",
  },
  {
    id: "lesson-8",
    title: "스크린 파크골프 체험 교육",
    type: "online",
    province: "서울",
    district: "강서구",
    regionLabel: "서울 > 강서구",
    location: "강서 스크린 파크골프센터",
    instructor: "오현우",
    organizer: "PUL 체험교육팀",
    target: ["absolute_beginner", "golf_experienced"],
    schedule: "매주 화·목 상시",
    scheduleTags: ["always", "this_week"],
    time: "18:00 ~ 19:30",
    price: "25,000원",
    format: "online",
    recruitStatus: "recruiting",
    description: "스크린 시설에서 기본기를 익히는 체험형 교육입니다.",
    curriculum: "스크린 이용법 · 기본 스윙 · 거리감 익히기",
    supplies: "센터 장비 사용",
    notices: ["사전 예약 필수"],
    contactMethod: "PUL 체험교육 02-000-0008",
  },
  {
    id: "lesson-9",
    title: "여성 입문자 소그룹 레슨",
    type: "beginner",
    province: "경기",
    district: "성남시",
    regionLabel: "경기 > 성남시",
    location: "성남 여성 파크골프클럽 연습장",
    instructor: "강미래",
    organizer: "성남 여성 파크골프클럽",
    target: ["absolute_beginner"],
    schedule: "2026년 7월 15일(화) ~ 8월 5일(화)",
    scheduleTags: ["this_week", "this_month"],
    time: "10:00 ~ 11:30",
    price: "80,000원",
    format: "offline",
    recruitStatus: "recruiting",
    description: "여성 입문자를 위한 소그룹(6명) 레슨입니다.",
    curriculum: "기본 자세 · 스윙 · 코스 입문 · 여성 맞춤 스트레칭",
    supplies: "운동복, 운동화",
    notices: ["여성 회원 전용"],
    contactMethod: "성남 여성 파크골프클럽 031-000-0009",
  },
  {
    id: "lesson-10",
    title: "월례회 대비 실전 레슨",
    type: "improvement",
    province: "제주",
    district: "제주시",
    regionLabel: "제주 > 제주시",
    location: "제주 파크골프장",
    instructor: "서준혁",
    organizer: "제주 파크골프 동호회 연합",
    target: ["club_member", "golf_experienced"],
    schedule: "2026년 7월 18일(금) ~ 19일(토)",
    scheduleTags: ["this_week", "closing_soon"],
    time: "08:00 ~ 17:00",
    price: "150,000원",
    format: "field",
    recruitStatus: "waiting",
    description: "월례회·대회를 앞둔 동호회 회원 대상 실전 레슨입니다.",
    curriculum: "코스 공략 · 멘탈 관리 · 대회 전략 · 라운드 실습",
    supplies: "개인 장비, 썬크림",
    notices: ["동호회 소속 확인 필요", "잔여 2석"],
    contactMethod: "제주 동호회 연합 064-000-0010",
  },
];

export const featuredLessons = parkGolfLessons.filter((lesson) => lesson.featured);

export const generalPaidLessons = parkGolfLessons.filter(
  (lesson) => !isCertificationLesson(lesson),
);

export const generalFeaturedLessons = featuredLessons.filter(
  (lesson) => !isCertificationLesson(lesson),
);

export const paidTabLessonTypes = lessonTypes.filter(
  (item) =>
    item.value === "all" ||
    !(CERTIFICATION_LESSON_TYPES as readonly string[]).includes(item.value),
);

export const paidTabLessonTargets = lessonTargets.filter(
  (item) => item.value !== "cert_prep",
);

export function filterLessons(
  lessons: ParkGolfLesson[],
  filters: {
    type: string;
    region: string;
    format: string;
    target: string;
    schedule: string;
    keyword: string;
  },
) {
  const keyword = filters.keyword.trim().toLowerCase();

  return lessons.filter((lesson) => {
    if (filters.type !== "all" && lesson.type !== filters.type) return false;
    if (filters.region !== "전체" && lesson.province !== filters.region) {
      return false;
    }
    if (filters.format !== "all" && lesson.format !== filters.format) {
      return false;
    }
    if (
      filters.target !== "all" &&
      !lesson.target.includes(filters.target as LessonTarget)
    ) {
      return false;
    }
    if (
      filters.schedule !== "all" &&
      !lesson.scheduleTags.includes(filters.schedule as LessonScheduleTag)
    ) {
      return false;
    }
    if (keyword) {
      const haystack =
        `${lesson.title} ${lesson.province} ${lesson.district} ${lesson.regionLabel} ${lesson.instructor} ${lesson.organizer} ${lesson.location}`.toLowerCase();
      if (!haystack.includes(keyword)) return false;
    }
    return true;
  });
}
