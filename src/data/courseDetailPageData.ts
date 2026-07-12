import type { CourseMapItem, WeatherIconKey } from "@/data/courseMapData";
import { courseMapItems } from "@/data/courseMapData";

export type CoursePhotoSource = "operator" | "club";

export type CourseMapMarkerType =
  | "course"
  | "hole"
  | "entrance"
  | "parking"
  | "reception"
  | "restroom"
  | "rest"
  | "club-meet";

export type CourseMapMarker = {
  id: string;
  type: CourseMapMarkerType;
  label: string;
  x: number;
  y: number;
};

export type CourseMapPhotoPin = {
  photoId: string;
  x: number;
  y: number;
};

export type CoursePhoto = {
  id: string;
  src: string;
  alt: string;
  source: CoursePhotoSource;
  caption?: string;
  clubName?: string;
  uploaderNickname?: string;
  takenAt?: string;
  /** 운영자·관리자 지정 대표(히어로) 사진 */
  isHero?: boolean;
  /** 승인된 추천 현장사진 */
  featured?: boolean;
  /** 승인 여부 — false면 대표사진 후보에서 제외 (기본 true) */
  approved?: boolean;
};

/** 골프장 대표사진으로 쓰면 안 되는 플랫폼 프로모 이미지 */
export const COURSE_PROMO_IMAGE_PATHS = new Set([
  "/images/hero-park-golf.jpg",
  "/images/banner-course.jpg",
]);

export function isCoursePromoImage(src: string): boolean {
  return COURSE_PROMO_IMAGE_PATHS.has(src);
}

/**
 * 대표사진 우선순위:
 * 1) 운영자·관리자 히어로 2) 승인된 추천 현장사진
 * 3) 일반 승인 현장사진(운영자) 4) 없음
 * 프로모·동호회 단체사진은 대표(히어로) 후보에서 제외한다.
 */
export function pickCourseHeroPhoto(photos: CoursePhoto[]): CoursePhoto | null {
  const eligible = photos.filter(
    (p) => p.approved !== false && !isCoursePromoImage(p.src),
  );
  if (eligible.length === 0) return null;

  const hero = eligible.find((p) => p.isHero);
  if (hero) return hero;

  const featured = eligible.find((p) => p.featured);
  if (featured) return featured;

  return eligible.find((p) => p.source === "operator") ?? null;
}

export type HofRecordType = "holeInOne" | "albatross" | "condor";

export type HallOfFameRecordCard = {
  type: HofRecordType;
  label: string;
  totalCount: number;
  recent: {
    memberName: string;
    clubName: string;
    date: string;
    courseHole: string;
    photoSrc?: string;
    verified: boolean;
  } | null;
};

export type MonthlyClubWinner = {
  id: string;
  yearMonth: string;
  clubName: string;
  meetingName: string;
  winnerName: string;
  score: string;
  photoSrc?: string;
};

export type HourlyForecastItem = {
  time: string;
  condition: string;
  temperature: string;
  rainChance: string;
  icon: WeatherIconKey;
  wind?: string;
};

export type RainyDayAlternative = {
  id: string;
  name: string;
  distance: string;
  driveTime: string;
  groupCapacity: string;
  phone: string;
  href: string;
};

export type MeetingPlaceListingBadge = "일반" | "PUL 제휴" | "광고" | "협찬" | "유료 노출";

export type NearbyMeetingPlace = {
  id: string;
  category: "식당" | "카페" | "단체 모임 장소";
  name: string;
  distance: string;
  driveTime: string;
  groupCapacity: string;
  parking: string;
  phone: string;
  listingBadge: MeetingPlaceListingBadge;
  href: string;
};

export type SponsoredBadge = "광고" | "협찬" | "PUL 제휴" | "유료 노출";

export type SponsoredLocalCard = {
  id: string;
  category: string;
  name: string;
  description?: string;
  badge: SponsoredBadge;
  distance: string;
  driveTime: string;
  groupCapacity: string;
  parking: string;
  phone: string;
  href: string;
};

export type NearbyPlaceTabId = "screen" | "restaurant" | "meeting" | "cafe" | "repair";

export type NearbyGeneralPlace = {
  id: string;
  name: string;
  categoryLabel: string;
  distance: string;
  driveTime: string;
  groupCapacity?: string;
  parking?: string;
  phone: string;
  href: string;
  menuOrType?: string;
  tags?: string[];
  listingBadge?: MeetingPlaceListingBadge;
};

export type CourseNearbyPlacesData = {
  screenGolf: NearbyGeneralPlace[];
  restaurants: NearbyGeneralPlace[];
  meetingPlaces: NearbyGeneralPlace[];
  cafes: NearbyGeneralPlace[];
  repairShops: NearbyGeneralPlace[];
};

export type CourseSidebarData = {
  showRainyAlternatives: boolean;
  rainyAlternatives: RainyDayAlternative[];
  meetingPlaces: NearbyMeetingPlace[];
  sponsoredCards: SponsoredLocalCard[];
};

export type WeatherWarning = {
  id: string;
  type: "rain" | "wind" | "heat" | "cold";
  message: string;
};

export type CourseOperationStatus = "operating" | "seasonal" | "tempClosed" | "unknown";

/** 운영 정보 출처 */
export type CourseInfoSource = "operator" | "admin" | "member" | "unverified";

export type FacilityStatus = "available" | "unavailable" | "unknown";

export type CourseFacilityItem = {
  id: string;
  label: string;
  icon: string;
  status: FacilityStatus;
  note?: string;
};

export type CourseLayoutInfo = {
  id: string;
  name: string;
  holes: number;
  difficulty: string;
  features: string;
  surface: string;
  distance?: string;
  obstacles?: string;
  beginnerRecommended?: boolean;
};

export type CourseReviewItem = {
  id: string;
  author: string;
  rating: number;
  facilityRating: number;
  courseRating: number;
  accessibilityRating: number;
  crowdRating: number;
  content: string;
  date: string;
  hasPhoto?: boolean;
};

export type CourseNoticeItem = {
  id: string;
  title: string;
  date: string;
  summary: string;
};

export type CourseNearbyEventItem = {
  id: string;
  title: string;
  date: string;
  status: string;
  targetAudience: string;
  benefitTags: string[];
  href: string;
};

export type CourseNearbyInfoItem = {
  id: string;
  label: string;
  name: string;
  href: string;
  note?: string;
};

export type CourseDetailPageData = {
  isMock: boolean;
  operationStatus: CourseOperationStatus;
  /** 현재/선택 위치 기준 거리 (mock 가능) */
  distanceFromLocation: string;
  /** 운영 정보 최종 확인일 */
  operationVerifiedAt: string;
  /** 정보 출처 */
  infoSource: CourseInfoSource;
  /** 핵심 특징 배지 (운영 상태 제외, 최대 2개 → 합계 3개) */
  keyFeatureBadges: string[];
  /** 예약 사이트 URL (없으면 예약 안내로 대체) */
  reservationUrl?: string;
  /** 예약 안내 문구 */
  reservationGuideSummary: string;
  tagline: string;
  images: string[];
  photos: CoursePhoto[];
  closedDays: string;
  courseCount: number;
  fee: string;
  reservationMethod: string;
  todayAvailable: string;
  hourlyForecast: HourlyForecastItem[];
  remainingTodayForecast: HourlyForecastItem[];
  weatherWarnings: WeatherWarning[];
  rainOperationNote: string;
  clubLeaderWeatherTip: string;
  weatherDisclaimer: string;
  weatherBriefNote: string;
  tomorrowRainSummary: string;
  /** 날씨 관측·예보 지역 */
  weatherSourceRegion: string;
  /** 날씨 갱신 시각 */
  weatherUpdatedAt: string;
  roundJudgmentTips: string[];
  tomorrowHourlyForecast: HourlyForecastItem[];
  sidebar: CourseSidebarData;
  hallOfFameRecords: HallOfFameRecordCard[];
  monthlyWinners: MonthlyClubWinner[];
  equipmentRentalLabel: string;
  parkingLabel: string;
  oneLineIntro?: string;
  about: {
    highlights: string[];
    recommendedFor: string[];
    surroundings: string;
    beginnerFriendly: string;
    tournamentCapable: string;
    cautions: string[];
  };
  courses: CourseLayoutInfo[];
  facilities: CourseFacilityItem[];
  reservationGuide: {
    steps: string[];
    openTime?: string;
    individual?: string;
    group?: string;
    walkIn?: string;
    cancelPolicy?: string;
    idRequired?: string;
    residentPriority?: string;
  };
  location: {
    carGuide: string;
    transitGuide: string;
    parkingGuide: string;
    entranceGuide: string;
  };
  mapMarkers: CourseMapMarker[];
  mapPhotoPins: CourseMapPhotoPin[];
  nearbyPlacesData: CourseNearbyPlacesData;
  notices: CourseNoticeItem[];
  usageRules: string[];
  reviews: CourseReviewItem[];
  nearbyEvents: CourseNearbyEventItem[];
  nearbyInfo: {
    screenCourses: CourseNearbyInfoItem[];
    repairShops: CourseNearbyInfoItem[];
    sameRegion: CourseNearbyInfoItem[];
    news: CourseNearbyInfoItem[];
  };
  relatedCourseIds: string[];
};

export const operationStatusLabels: Record<CourseOperationStatus, string> = {
  operating: "정상 운영",
  seasonal: "계절 운영",
  tempClosed: "임시 휴장",
  unknown: "정보 미확인",
};

export const operationStatusStyles: Record<CourseOperationStatus, string> = {
  operating: "bg-emerald-50 text-emerald-800 ring-emerald-200/70",
  seasonal: "bg-sky-50 text-sky-800 ring-sky-200/70",
  tempClosed: "bg-amber-50 text-amber-800 ring-amber-200/70",
  unknown: "bg-slate-100 text-slate-600 ring-slate-200/80",
};

export const infoSourceLabels: Record<CourseInfoSource, string> = {
  operator: "운영자 확인",
  admin: "관리자 확인",
  member: "회원 제보",
  unverified: "미확인",
};

export const facilityStatusLabels: Record<FacilityStatus, string> = {
  available: "가능",
  unavailable: "불가",
  unknown: "확인 필요",
};

const goyangDetail: CourseDetailPageData = {
  isMock: true,
  operationStatus: "operating",
  distanceFromLocation: "현재 위치에서 약 12km · 차량 25분",
  operationVerifiedAt: "2026.07.05",
  infoSource: "operator",
  keyFeatureBadges: ["36홀", "주차 가능"],
  reservationUrl: "https://example.com/reserve/goyang-nuri",
  reservationGuideSummary: "공식 예약 사이트 또는 전화로 사전 예약",
  tagline: "고양시 대표 공원형 파크골프장 — 넓은 코스와 접근성 좋은 입구",
  images: ["/images/banner-community.jpg"],
  /* 프로모 배너(hero-park-golf·banner-course)는 대표사진으로 쓰지 않음 → 히어로 empty state.
   * 동호회 공개 사진만 유지(하단 미리보기). */
  photos: [
    {
      id: "cl-1",
      src: "/images/banner-community.jpg",
      alt: "동호회 월례회 단체 사진",
      source: "club",
      caption: "고양누리 동호회 5월 월례회 단체 사진",
      clubName: "고양누리 파크골프 동호회",
      uploaderNickname: "회장 김○○",
      takenAt: "2026.05.18",
      approved: true,
    },
    {
      id: "cl-2",
      src: "/images/banner-community.jpg",
      alt: "시니어 회원 라운딩",
      source: "club",
      caption: "오전 정기 라운드 모습",
      clubName: "경기 북부 시니어 파크골프회",
      uploaderNickname: "총무 이○○",
      takenAt: "2026.06.01",
      approved: true,
    },
    {
      id: "cl-3",
      src: "/images/banner-community.jpg",
      alt: "봄맞이 연습 라운드",
      source: "club",
      caption: "봄 시즌 오전 연습 라운드",
      clubName: "고양 덕양 파크골프회",
      uploaderNickname: "회원 박○○",
      takenAt: "2026.04.20",
      approved: true,
    },
    {
      id: "cl-4",
      src: "/images/banner-community.jpg",
      alt: "동호회 시상식",
      source: "club",
      caption: "월례회 시상식 후 기념 촬영",
      clubName: "고양누리 파크골프 동호회",
      uploaderNickname: "사진 담당 최○○",
      takenAt: "2026.06.15",
      approved: true,
    },
    {
      id: "cl-5",
      src: "/images/banner-community.jpg",
      alt: "가족 단위 라운딩",
      source: "club",
      caption: "가족 단위 주말 라운딩",
      clubName: "고양 덕양 파크골프회",
      uploaderNickname: "회원 정○○",
      takenAt: "2026.05.25",
      approved: true,
    },
  ],
  closedDays: "매주 월요일 (공원 휴장일과 동일할 수 있음)",
  courseCount: 4,
  fee: "이용요금은 시기·대상에 따라 달라질 수 있음 (방문 전 확인)",
  reservationMethod: "사전 예약 및 전화 확인",
  todayAvailable: "오늘 이용 가능 (예시 · 방문 전 전화 확인 권장)",
  hourlyForecast: [
    { time: "13시", condition: "맑음", temperature: "24℃", rainChance: "10%", icon: "partly-cloudy" },
    { time: "14시", condition: "구름", temperature: "25℃", rainChance: "15%", icon: "cloudy" },
    { time: "15시", condition: "구름", temperature: "25℃", rainChance: "20%", icon: "cloudy" },
    { time: "16시", condition: "흐림", temperature: "24℃", rainChance: "30%", icon: "cloudy" },
    { time: "17시", condition: "약한 비", temperature: "23℃", rainChance: "45%", icon: "rain" },
    { time: "18시", condition: "비", temperature: "22℃", rainChance: "60%", icon: "rain" },
  ],
  remainingTodayForecast: [
    { time: "15시", condition: "맑음", temperature: "24℃", rainChance: "10%", icon: "partly-cloudy", wind: "약함" },
    { time: "16시", condition: "구름", temperature: "24℃", rainChance: "15%", icon: "cloudy", wind: "약함" },
    { time: "17시", condition: "구름", temperature: "23℃", rainChance: "20%", icon: "cloudy", wind: "약함" },
    { time: "18시", condition: "흐림", temperature: "22℃", rainChance: "45%", icon: "cloudy", wind: "보통" },
    { time: "19시", condition: "비 가능", temperature: "21℃", rainChance: "60%", icon: "rain", wind: "보통" },
    { time: "21시", condition: "비", temperature: "20℃", rainChance: "70%", icon: "rain", wind: "보통" },
    { time: "23시", condition: "비", temperature: "19℃", rainChance: "65%", icon: "rain", wind: "보통" },
  ],
  weatherWarnings: [
    { id: "w1", type: "rain", message: "오후 4시 이후 강수 가능성 증가 (mock)" },
  ],
  rainOperationNote:
    "우천 시 잔디 보호를 위해 이용이 제한되거나 휴장될 수 있습니다. 방문 전 전화 확인을 권장합니다.",
  clubLeaderWeatherTip:
    "내일 오전 월례회: 강수 15%, 바람 약함 → 진행 가능 (예시). 오후 비 가능성 있으면 일정 조정을 검토하세요.",
  weatherDisclaimer:
    "실제 운영 및 행사 진행 여부는 골프장 또는 동호회 공지를 확인해 주세요.",
  weatherBriefNote:
    "오후 6시부터 비 가능성이 커집니다. 월례회와 단체 일정은 골프장 또는 동호회 공지를 확인해 주세요.",
  tomorrowRainSummary: "오후 비 60%",
  weatherSourceRegion: "경기 고양시",
  weatherUpdatedAt: "2026.07.11 14:30",
  roundJudgmentTips: ["라운드 적합", "오후 6시 이후 비 가능성 증가", "우산 준비 권장", "월례회·단체 일정은 골프장 또는 동호회 공지 확인"],
  tomorrowHourlyForecast: [
    { time: "09시", condition: "맑음", temperature: "22℃", rainChance: "5%", icon: "sunny" },
    { time: "12시", condition: "구름", temperature: "26℃", rainChance: "15%", icon: "partly-cloudy" },
    { time: "15시", condition: "흐림", temperature: "27℃", rainChance: "40%", icon: "cloudy" },
    { time: "18시", condition: "비", temperature: "24℃", rainChance: "60%", icon: "rain" },
  ],
  hallOfFameRecords: [
    {
      type: "holeInOne",
      label: "홀인원",
      totalCount: 28,
      recent: {
        memberName: "김영수",
        clubName: "고양누리 파크골프 동호회",
        date: "2026.07.08",
        courseHole: "B코스 6번 홀",
        photoSrc: "/images/banner-community.jpg",
        verified: true,
      },
    },
    {
      type: "albatross",
      label: "알바트로스",
      totalCount: 3,
      recent: {
        memberName: "박영희",
        clubName: "경기 북부 시니어 파크골프회",
        date: "2026.05.22",
        courseHole: "C코스 12번 홀",
        photoSrc: "/images/banner-community.jpg",
        verified: true,
      },
    },
    {
      type: "condor",
      label: "콘도르",
      totalCount: 0,
      recent: null,
    },
  ],
  monthlyWinners: [
    {
      id: "mw1",
      yearMonth: "2026년 6월",
      clubName: "고양누리 파크골프 동호회",
      meetingName: "6월 월례회",
      winnerName: "이정희",
      score: "32타",
      photoSrc: "/images/banner-community.jpg",
    },
    {
      id: "mw2",
      yearMonth: "2026년 6월",
      clubName: "경기 북부 시니어 파크골프회",
      meetingName: "6월 정기대회",
      winnerName: "최순자",
      score: "34타",
      photoSrc: "/images/banner-community.jpg",
    },
    {
      id: "mw3",
      yearMonth: "2026년 5월",
      clubName: "고양 덕양 파크골프회",
      meetingName: "5월 월례회",
      winnerName: "정대호",
      score: "31타",
    },
  ],
  equipmentRentalLabel: "장비대여 확인 필요",
  parkingLabel: "주차 가능",
  oneLineIntro: "넓은 36홀 공원형 파크골프장으로, 동호회 라운드와 가족 이용 모두 편리합니다.",
  about: {
    highlights: [
      "36홀 규모의 넓은 공원형 파크골프장",
      "초보자와 동호회 라운딩 모두 이용하기 좋은 코스 구성",
      "주차장과 휴게공간이 비교적 잘 갖춰진 편",
    ],
    recommendedFor: ["초보 입문자", "동호회 정기 라운드", "가족 단위 가벼운 라운딩"],
    surroundings: "공원 산책로와 휴게시설이 인접해 라운딩 전후 여유 시간을 보내기 좋습니다.",
    beginnerFriendly: "A코스 중심으로 입문 연습에 적합하며, 평탄한 홀이 많습니다.",
    tournamentCapable: "지역 대회·친선전 개최 이력이 있는 규모 (실제 일정은 별도 확인)",
    cautions: [
      "우천 시 잔디 보호를 위해 이용이 제한될 수 있습니다.",
      "성수기·주말에는 사전 예약 또는 전화 확인을 권장합니다.",
      "장비 대여 여부는 방문 전 확인이 필요합니다.",
    ],
  },
  courses: [
    {
      id: "a",
      name: "A코스",
      holes: 9,
      difficulty: "초급",
      features: "평탄한 코스, 입문 연습에 적합",
      surface: "잔디 (개발용 mock)",
      distance: "홀당 평균 45~55m (예시)",
      obstacles: "낮은 언덕 위주",
      beginnerRecommended: true,
    },
    {
      id: "b",
      name: "B코스",
      holes: 9,
      difficulty: "중급",
      features: "경사와 장애물 포함",
      surface: "잔디 (개발용 mock)",
      distance: "홀당 평균 50~65m (예시)",
      obstacles: "나무·언덕 장애물",
    },
    {
      id: "c",
      name: "C코스",
      holes: 18,
      difficulty: "중상급",
      features: "장거리 홀 포함, 체력 소모 있음",
      surface: "잔디 (개발용 mock)",
      distance: "홀당 평균 55~75m (예시)",
      obstacles: "연속 경사 구간",
    },
  ],
  facilities: [
    { id: "parking", label: "주차장", icon: "car", status: "available", note: "공원 주차장 이용" },
    { id: "restroom", label: "화장실", icon: "restroom", status: "available" },
    { id: "rest", label: "휴게실", icon: "sofa", status: "available" },
    { id: "water", label: "음수대", icon: "droplet", status: "available" },
    { id: "store", label: "매점", icon: "store", status: "unknown" },
    { id: "shade", label: "그늘막", icon: "umbrella", status: "available" },
    { id: "rental", label: "장비 대여", icon: "cart", status: "unknown" },
    { id: "locker", label: "락커", icon: "lock", status: "unknown" },
    { id: "accessible", label: "장애인 편의시설", icon: "accessibility", status: "unknown" },
    { id: "pet", label: "반려동물 동반", icon: "paw", status: "unavailable", note: "공원 규정 확인" },
  ],
  reservationGuide: {
    steps: [
      "이용 가능 날짜·시간 확인 (전화 또는 공식 안내)",
      "온라인 예약 또는 전화로 접수",
      "현장 접수처에서 신분 확인",
      "이용료 결제 (현장·온라인 방식은 시설마다 다름)",
      "배정 코스 이용 시작",
    ],
    openTime: "예약 오픈 시점은 시기별로 달라질 수 있음",
    individual: "개인 예약 가능 (방문 전 확인)",
    group: "단체 예약 가능 (사전 문의)",
    walkIn: "현장 접수 가능 여부는 혼잡도에 따라 제한될 수 있음",
    cancelPolicy: "취소·변경 규정은 운영기관 안내를 따름",
    idRequired: "신분증 확인이 필요할 수 있음",
    residentPriority: "지역 주민 우선 운영 여부는 시기별 확인 필요",
  },
  location: {
    carGuide: "경기 고양시 공원 인근 도로 이용 (개발용 mock 경로)",
    transitGuide: "지하철·버스 환승 후 도보 또는 마을버스 이용 가능 (노선은 방문 전 확인)",
    parkingGuide: "공원 주차장 이용, 주말·행사일 혼잡 가능",
    entranceGuide: "공원 정문 인근 접수·안내 데스크 (실제 위치는 방문 전 확인)",
  },
  mapMarkers: [
    { id: "m-course", type: "course", label: "파크골프장", x: 52, y: 42 },
    { id: "m-a", type: "hole", label: "A코스", x: 38, y: 35 },
    { id: "m-entrance", type: "entrance", label: "정문", x: 22, y: 72 },
    { id: "m-parking", type: "parking", label: "주차장", x: 14, y: 58 },
    { id: "m-reception", type: "reception", label: "접수처", x: 28, y: 65 },
    { id: "m-restroom", type: "restroom", label: "화장실", x: 68, y: 55 },
    { id: "m-rest", type: "rest", label: "휴게공간", x: 75, y: 38 },
    { id: "m-club", type: "club-meet", label: "동호회 모임", x: 62, y: 68 },
  ],
  mapPhotoPins: [
    { photoId: "cl-1", x: 12, y: 28 },
    { photoId: "cl-2", x: 8, y: 82 },
    { photoId: "cl-3", x: 78, y: 22 },
  ],
  notices: [
    {
      id: "n1",
      title: "우천 시 이용 제한 안내",
      date: "2026-06-01",
      summary: "강수 시 잔디 보호를 위해 이용이 제한될 수 있습니다.",
    },
    {
      id: "n2",
      title: "동절기 운영 시간 변경 예시",
      date: "2026-05-15",
      summary: "계절에 따라 운영 시간이 조정될 수 있습니다.",
    },
    {
      id: "n3",
      title: "지역 대회 일정 사전 공지 예시",
      date: "2026-04-20",
      summary: "대회 개최일에는 일부 코스 이용이 제한될 수 있습니다.",
    },
  ],
  usageRules: [
    "복장·장비는 파크골프장 일반 규정을 따릅니다.",
    "안전을 위해 타구 전 주변 확인을 해 주세요.",
    "잔디 보호 기간에는 운영자 안내에 따라 이용해 주세요.",
  ],
  reviews: [
    {
      id: "r1",
      author: "파크초보",
      rating: 4,
      facilityRating: 4,
      courseRating: 4,
      accessibilityRating: 5,
      crowdRating: 3,
      content: "입문하기 좋은 코스가 많고 주차도 편했습니다. 주말은 사람이 많아요.",
      date: "2026-05-12",
    },
    {
      id: "r2",
      author: "고양동호회원",
      rating: 5,
      facilityRating: 4,
      courseRating: 5,
      accessibilityRating: 4,
      crowdRating: 4,
      content: "동호회 월례회로 자주 이용합니다. A코스는 초보자에게 추천합니다.",
      date: "2026-04-28",
      hasPhoto: true,
    },
  ],
  nearbyEvents: [
    {
      id: "ev1",
      title: "고양 누리 봄맞이 오픈 대회 (예시)",
      date: "2026-04-18",
      status: "접수 중",
      targetAudience: "일반·동호회",
      benefitTags: ["경품", "가족 체험", "장비 시타회"],
      href: "/events",
    },
    {
      id: "ev2",
      title: "경기 북부 시니어 친선전 (예시)",
      date: "2026-05-10",
      status: "접수 예정",
      targetAudience: "시니어",
      benefitTags: ["지역상품권", "부대행사"],
      href: "/events",
    },
  ],
  nearbyInfo: {
    screenCourses: [
      {
        id: "sc1",
        label: "스크린 파크골프장",
        name: "일산 스크린 파크 (예시)",
        href: "/courses/9",
        note: "날씨 관계없이 연습",
      },
    ],
    repairShops: [
      {
        id: "rp1",
        label: "장비 수리",
        name: "PUL 장비관리센터 연결",
        href: "/market#equipment-care",
      },
    ],
    sameRegion: [
      {
        id: "sr1",
        label: "같은 지역",
        name: "수원 화성 파크골프장",
        href: "/courses/2",
      },
    ],
    news: [
      {
        id: "nw1",
        label: "관련 소식",
        name: "경기 북부 파크골프 시설 확충 소식 (예시)",
        href: "/news",
      },
    ],
  },
  relatedCourseIds: ["2", "9", "1"],
  sidebar: {
    showRainyAlternatives: true,
    rainyAlternatives: [
      {
        id: "ra1",
        name: "일산 스크린 파크 (예시)",
        distance: "4.2km",
        driveTime: "차량 12분",
        groupCapacity: "10인 이상 단체 가능",
        phone: "031-900-5500",
        href: "/courses/9",
      },
    ],
    meetingPlaces: [
      {
        id: "mp1",
        category: "식당",
        name: "고양 파크 한정식 (예시)",
        distance: "1.8km",
        driveTime: "차량 5분",
        groupCapacity: "20인 이상 가능",
        parking: "주차 가능",
        phone: "031-900-3300",
        listingBadge: "PUL 제휴",
        href: "#",
      },
    ],
    sponsoredCards: [
      {
        id: "sp1",
        category: "장비 수리·리폼",
        name: "PUL 제휴 그립 교체점",
        description: "동호회 단체 할인 가능 (mock)",
        badge: "PUL 제휴",
        distance: "2.1km",
        driveTime: "차량 7분",
        groupCapacity: "단체 예약 가능",
        parking: "주차 가능",
        phone: "031-900-8800",
        href: "/market#equipment-care",
      },
      {
        id: "sp2",
        category: "음식점",
        name: "고양 파크 한정식",
        description: "라운드 후 동호회 모임 추천 (mock)",
        badge: "협찬",
        distance: "1.8km",
        driveTime: "차량 5분",
        groupCapacity: "20인 이상",
        parking: "주차 가능",
        phone: "031-900-3300",
        href: "#",
      },
    ],
  },
  nearbyPlacesData: {
    screenGolf: [
      {
        id: "sg1",
        name: "일산 스크린 파크 (예시)",
        categoryLabel: "스크린 파크골프장",
        distance: "4.2km",
        driveTime: "차량 12분",
        groupCapacity: "10인 이상 단체 가능",
        parking: "주차 가능",
        phone: "031-900-5500",
        href: "/courses/9",
        tags: ["단체 가능", "예약 가능"],
      },
      {
        id: "sg2",
        name: "킨텍스 실내 파크 (예시)",
        categoryLabel: "스크린 파크골프장",
        distance: "6.5km",
        driveTime: "차량 18분",
        groupCapacity: "문의",
        parking: "주차 가능",
        phone: "031-900-6600",
        href: "/courses/9",
        tags: ["주차 가능"],
      },
    ],
    restaurants: [
      {
        id: "r1",
        name: "고양 누리 한정식",
        categoryLabel: "음식점",
        distance: "1.5km",
        driveTime: "차량 5분",
        groupCapacity: "30인 이상",
        parking: "주차 가능",
        phone: "031-900-2200",
        href: "#",
        menuOrType: "한정식 · 단체 상차림",
        tags: ["단체 가능", "주차 가능", "별실 있음", "20명 이상"],
      },
      {
        id: "r2",
        name: "덕양식당",
        categoryLabel: "음식점",
        distance: "2.3km",
        driveTime: "차량 8분",
        groupCapacity: "15인 이상",
        parking: "주차 가능",
        phone: "031-900-2210",
        href: "#",
        menuOrType: "백반 · 정식",
        tags: ["단체 가능", "주차 가능"],
      },
    ],
    meetingPlaces: [
      {
        id: "m1",
        name: "고양 파크 한정식 (예시)",
        categoryLabel: "단체 모임 장소",
        distance: "1.8km",
        driveTime: "차량 5분",
        groupCapacity: "20인 이상 가능",
        parking: "주차 가능",
        phone: "031-900-3300",
        href: "#",
        tags: ["단체 가능", "주차 가능", "별실 있음", "예약 가능"],
        listingBadge: "PUL 제휴",
      },
      {
        id: "m2",
        name: "누리 커뮤니티 센터",
        categoryLabel: "단체 모임 장소",
        distance: "3.0km",
        driveTime: "차량 10분",
        groupCapacity: "50인 이상",
        parking: "주차 가능",
        phone: "031-900-4400",
        href: "#",
        tags: ["20명 이상", "예약 가능"],
      },
    ],
    cafes: [
      {
        id: "c1",
        name: "공원 카페 거리",
        categoryLabel: "카페",
        distance: "1.2km",
        driveTime: "도보 15분",
        groupCapacity: "10인 내외",
        parking: "인근 공영주차",
        phone: "031-900-1100",
        href: "#",
        menuOrType: "커피 · 디저트",
        tags: ["주차 가능"],
      },
    ],
    repairShops: [
      {
        id: "rp1",
        name: "파크골프 장비 수리소 (예시)",
        categoryLabel: "장비 수리·리폼",
        distance: "3.5km",
        driveTime: "차량 10분",
        parking: "주차 가능",
        phone: "031-900-7700",
        href: "/market#equipment-care",
        menuOrType: "그립 교체 · 샤프트 점검",
      },
    ],
  },
};

const detailOverrides: Record<string, Partial<CourseDetailPageData>> = {
  "goyang-park-golf": goyangDetail,
};

function defaultCourses(course: CourseMapItem): CourseLayoutInfo[] {
  const perCourse = Math.max(1, Math.floor(course.holes / 9));
  const labels = ["A코스", "B코스", "C코스", "D코스"];
  return Array.from({ length: Math.min(perCourse, 3) }, (_, i) => ({
    id: `c${i}`,
    name: labels[i] ?? `${i + 1}코스`,
    holes: Math.min(9, course.holes - i * 9) || 9,
    difficulty: i === 0 ? "초급" : i === 1 ? "중급" : "중상급",
    features: course.features[i] ?? "코스 특성 정보 확인 필요",
    surface: "정보 확인 필요",
    beginnerRecommended: i === 0,
  }));
}

function defaultFacilities(course: CourseMapItem): CourseFacilityItem[] {
  const a = course.amenities;
  const toStatus = (v?: boolean): FacilityStatus =>
    v === true ? "available" : v === false ? "unavailable" : "unknown";
  return [
    { id: "parking", label: "주차장", icon: "car", status: toStatus(a.parking.available), note: a.parking.description },
    { id: "restroom", label: "화장실", icon: "restroom", status: toStatus(a.restroom.available), note: a.restroom.description },
    { id: "rest", label: "휴게공간", icon: "sofa", status: toStatus(a.restArea.available), note: a.restArea.description },
    { id: "water", label: "음수대", icon: "droplet", status: toStatus(a.water.available), note: a.water.description },
    { id: "store", label: "매점", icon: "store", status: toStatus(a.store.available), note: a.store.description },
    { id: "rental", label: "장비 대여", icon: "cart", status: course.features.includes("장비 대여") ? "available" : "unknown" },
  ];
}

function buildDefaultHallOfFameRecords(course: CourseMapItem): HallOfFameRecordCard[] {
  const holeInOne = course.hallOfFame.filter((e) => e.recordType.includes("홀인원"));
  const best = course.hallOfFame.filter((e) => e.recordType.includes("베스트") || e.recordType.includes("스코어"));
  const recentHio = holeInOne[0];
  const recentBest = best[0];

  return [
    {
      type: "holeInOne",
      label: "홀인원",
      totalCount: holeInOne.length > 0 ? holeInOne.length * 9 : 0,
      recent: recentHio
        ? {
            memberName: recentHio.name,
            clubName: recentHio.clubName,
            date: recentHio.date,
            courseHole: "A코스 (mock)",
            photoSrc: "/images/banner-community.jpg",
            verified: false,
          }
        : null,
    },
    {
      type: "albatross",
      label: "알바트로스",
      totalCount: recentBest ? 1 : 0,
      recent: recentBest
        ? {
            memberName: recentBest.name,
            clubName: recentBest.clubName,
            date: recentBest.date,
            courseHole: "B코스 (mock)",
            verified: false,
          }
        : null,
    },
    {
      type: "condor",
      label: "콘도르",
      totalCount: 0,
      recent: null,
    },
  ];
}

function buildDefaultMonthlyWinners(course: CourseMapItem): MonthlyClubWinner[] {
  return course.homeClubs.slice(0, 3).map((club, i) => ({
    id: `mw-${club.id}`,
    yearMonth: "2026년 6월",
    clubName: club.name,
    meetingName: `${6 - i}월 월례회`,
    winnerName: course.hallOfFame[i]?.name ?? "—",
    score: course.hallOfFame[i]?.record ?? "—",
    photoSrc: i < 2 ? "/images/banner-community.jpg" : undefined,
  }));
}

function buildDefaultDetail(course: CourseMapItem): CourseDetailPageData {
  const sameRegion = courseMapItems
    .filter((c) => c.id !== course.id && c.region === course.region)
    .slice(0, 2)
    .map((c) => ({
      id: c.id,
      label: "같은 지역",
      name: c.name,
      href: `/courses/${c.id}`,
    }));

  const screen = courseMapItems
    .filter((c) => c.id !== course.id && c.type === "screen")
    .slice(0, 1)
    .map((c) => ({
      id: c.id,
      label: "스크린",
      name: c.name,
      href: `/courses/${c.id}`,
    }));

  return {
    isMock: true,
    operationStatus: "unknown",
    distanceFromLocation: "선택 위치 기준 거리 확인 필요",
    operationVerifiedAt: "미확인",
    infoSource: "unverified",
    keyFeatureBadges: course.features.slice(0, 2),
    reservationUrl: undefined,
    reservationGuideSummary: course.reservation
      ? "예약 가능 — 방문 전 전화·안내 확인"
      : "전화 문의 또는 현장 접수",
    tagline: course.description,
    images: [],
    /* 프로모 이미지를 가짜 대표사진으로 넣지 않음 — 히어로 empty state */
    photos: [],
    closedDays: "정보 확인 필요",
    courseCount: Math.max(1, Math.ceil(course.holes / 9)),
    fee: "정보 확인 필요",
    reservationMethod: course.reservation ? "예약 가능 (방문 전 확인)" : "전화·현장 확인",
    todayAvailable: "방문 전 운영기관 확인 권장",
    hourlyForecast: [
      { time: "13시", condition: course.weather.today.condition, temperature: course.weather.today.temperature, rainChance: course.weather.today.rainChance, icon: course.weather.today.icon },
      { time: "15시", condition: course.weather.today.condition, temperature: course.weather.today.temperature, rainChance: course.weather.today.rainChance, icon: course.weather.today.icon },
      { time: "17시", condition: course.weather.today.condition, temperature: course.weather.today.temperature, rainChance: course.weather.today.rainChance, icon: course.weather.today.icon },
      { time: "19시", condition: course.weather.today.condition, temperature: course.weather.today.temperature, rainChance: course.weather.today.rainChance, icon: course.weather.today.icon },
      { time: "21시", condition: course.weather.today.condition, temperature: course.weather.today.temperature, rainChance: course.weather.today.rainChance, icon: course.weather.today.icon },
      { time: "23시", condition: course.weather.today.condition, temperature: course.weather.today.temperature, rainChance: course.weather.today.rainChance, icon: course.weather.today.icon },
    ],
    remainingTodayForecast: [
      { time: "15시", condition: course.weather.today.condition, temperature: course.weather.today.temperature, rainChance: course.weather.today.rainChance, icon: course.weather.today.icon },
      { time: "17시", condition: course.weather.today.condition, temperature: course.weather.today.temperature, rainChance: course.weather.today.rainChance, icon: course.weather.today.icon },
      { time: "19시", condition: course.weather.today.condition, temperature: course.weather.today.temperature, rainChance: course.weather.today.rainChance, icon: course.weather.today.icon },
      { time: "21시", condition: course.weather.today.condition, temperature: course.weather.today.temperature, rainChance: course.weather.today.rainChance, icon: course.weather.today.icon },
      { time: "23시", condition: course.weather.today.condition, temperature: course.weather.today.temperature, rainChance: course.weather.today.rainChance, icon: course.weather.today.icon },
    ],
    weatherWarnings:
      course.weather.today.playStatus === "주의"
        ? [{ id: "warn", type: "heat" as const, message: course.weather.today.forecastNote }]
        : [],
    rainOperationNote: "우천 시 이용 제한 또는 휴장될 수 있습니다. 방문 전 확인해 주세요.",
    clubLeaderWeatherTip: `내일 ${course.weather.tomorrow.condition}, 강수 ${course.weather.tomorrow.rainChance} → 월례회 일정 판단 참고 (mock)`,
    weatherDisclaimer:
      "실제 운영 및 행사 진행 여부는 골프장 또는 동호회 공지를 확인해 주세요.",
    weatherBriefNote: course.weather.today.forecastNote,
    tomorrowRainSummary: `오후 비 ${course.weather.tomorrow.rainChance}`,
    weatherSourceRegion: `${course.region} ${course.city}`,
    weatherUpdatedAt: "정보 갱신 시각 확인 중",
    roundJudgmentTips: [
      course.weather.today.playStatus === "좋음" ? "라운드 적합" : "주의 필요",
      parseInt(course.weather.today.rainChance.replace("%", ""), 10) > 30 ? "우산 준비 권장" : "강수 가능성 낮음",
      "운영기관 확인 권장",
    ],
    tomorrowHourlyForecast: [
      { time: "09시", condition: course.weather.tomorrow.condition, temperature: course.weather.tomorrow.low, rainChance: course.weather.tomorrow.rainChance, icon: course.weather.tomorrow.icon },
      { time: "15시", condition: course.weather.tomorrow.condition, temperature: course.weather.tomorrow.high, rainChance: course.weather.tomorrow.rainChance, icon: course.weather.tomorrow.icon },
    ],
    hallOfFameRecords: buildDefaultHallOfFameRecords(course),
    monthlyWinners: buildDefaultMonthlyWinners(course),
    equipmentRentalLabel: course.features.includes("장비 대여")
      ? "장비대여 가능 (확인)"
      : "장비대여 확인 필요",
    parkingLabel:
      course.amenities.parking.available === true
        ? "주차 가능"
        : course.amenities.parking.available === false
          ? "주차 불가"
          : "주차 확인 필요",
    oneLineIntro: course.description.slice(0, 60),
    about: {
      highlights: course.features.length > 0 ? course.features : ["상세 정보 확인 필요"],
      recommendedFor: ["일반 이용자", "동호회 라운딩"],
      surroundings: "주변 환경 정보 확인 필요",
      beginnerFriendly: course.tips,
      tournamentCapable: course.eventCount > 0 ? "대회 개최 이력 있음 (일정 별도 확인)" : "정보 확인 필요",
      cautions: [course.tips, "운영시간·요금은 방문 전 재확인해 주세요."],
    },
    courses: defaultCourses(course),
    facilities: defaultFacilities(course),
    reservationGuide: {
      steps: [
        "이용 가능 날짜 확인",
        "예약 또는 전화 문의",
        "현장 접수 및 확인",
        "이용료 결제",
        "코스 이용",
      ],
      walkIn: course.operation === "walkIn" ? "현장 접수 가능 (혼잡 시 제한)" : "방문 전 확인",
    },
    location: {
      carGuide: "자가용 이용 시 내비게이션 검색 권장",
      transitGuide: course.amenities.transit.description,
      parkingGuide: course.amenities.parking.description,
      entranceGuide: "정보 확인 필요",
    },
    mapMarkers: buildDefaultMapMarkers(course),
    mapPhotoPins: buildDefaultMapPhotoPins(),
    nearbyPlacesData: buildDefaultNearbyPlacesData(course),
    notices: [
      {
        id: "def-1",
        title: "운영 정보 변경 가능 안내",
        date: "2026-01-01",
        summary: "휴장·요금·예약 방식은 현장 사정에 따라 달라질 수 있습니다.",
      },
    ],
    usageRules: ["안전수칙 준수", "운영자 안내에 따라 이용"],
    reviews: [],
    nearbyEvents: course.events.map((e) => ({
      id: e.id,
      title: e.title,
      date: e.date,
      status: e.status,
      targetAudience: "일반",
      benefitTags: [],
      href: "/events",
    })),
    nearbyInfo: {
      screenCourses: screen,
      repairShops: [
        { id: "care", label: "장비 수리", name: "장비관리센터", href: "/market#equipment-care" },
      ],
      sameRegion,
      news: [{ id: "news", label: "소식", name: "뉴스·정보 보기", href: "/news" }],
    },
    relatedCourseIds: courseMapItems
      .filter((c) => c.id !== course.id && c.region === course.region)
      .slice(0, 3)
      .map((c) => c.id),
    sidebar: buildDefaultSidebar(course, screen),
  };
}

function buildDefaultMapMarkers(course: CourseMapItem): CourseMapMarker[] {
  return [
    { id: "m-course", type: "course", label: course.name.slice(0, 8), x: 50, y: 45 },
    { id: "m-entrance", type: "entrance", label: "입구", x: 25, y: 70 },
    { id: "m-parking", type: "parking", label: "주차장", x: 18, y: 55 },
    { id: "m-reception", type: "reception", label: "접수처", x: 32, y: 62 },
    { id: "m-restroom", type: "restroom", label: "화장실", x: 65, y: 50 },
    { id: "m-rest", type: "rest", label: "휴게공간", x: 72, y: 35 },
  ];
}

function buildDefaultMapPhotoPins(): CourseMapPhotoPin[] {
  return [];
}

function buildDefaultNearbyPlacesData(course: CourseMapItem): CourseNearbyPlacesData {
  const screenGolf = courseMapItems
    .filter((c) => c.id !== course.id && c.type === "screen")
    .slice(0, 2)
    .map((c) => ({
      id: `sg-${c.id}`,
      name: c.name,
      categoryLabel: "스크린 파크골프장",
      distance: "약 5km (mock)",
      driveTime: "차량 15분",
      groupCapacity: "문의",
      parking: "확인 필요",
      phone: c.phone,
      href: `/courses/${c.id}`,
      tags: ["단체 가능"] as string[],
    }));

  const restaurants = course.nearbyPlaces
    .filter((p) => p.category === "식당")
    .map((p) => ({
      id: p.id,
      name: p.name,
      categoryLabel: "음식점",
      distance: p.distance,
      driveTime: "이동시간 확인",
      groupCapacity: p.purpose,
      parking: "확인 필요",
      phone: "031-000-0000",
      href: "#",
      menuOrType: p.description,
      tags: ["단체 가능"] as string[],
    }));

  const cafes = course.nearbyPlaces
    .filter((p) => p.category === "카페")
    .map((p) => ({
      id: p.id,
      name: p.name,
      categoryLabel: "카페",
      distance: p.distance,
      driveTime: "이동시간 확인",
      phone: "031-000-0000",
      href: "#",
      menuOrType: p.description,
    }));

  const repairShops = course.nearbyPlaces
    .filter((p) => p.category === "장비점")
    .map((p) => ({
      id: p.id,
      name: p.name,
      categoryLabel: "장비 수리·리폼",
      distance: p.distance,
      driveTime: "이동시간 확인",
      phone: "031-000-0000",
      href: "#",
      menuOrType: p.purpose,
    }));

  const meetingPlaces = restaurants.slice(0, 1).map((r) => ({
    ...r,
    id: `meet-${r.id}`,
    categoryLabel: "단체 모임 장소",
    tags: ["단체 가능", "주차 가능"] as string[],
  }));

  return {
    screenGolf,
    restaurants,
    meetingPlaces,
    cafes,
    repairShops,
  };
}

function buildDefaultSidebar(
  course: CourseMapItem,
  screen: { id: string; label: string; name: string; href: string }[],
): CourseSidebarData {
  const rainChance = parseInt(course.weather.today.rainChance.replace("%", ""), 10);
  const showRainy = rainChance >= 20 || course.weather.today.icon === "rain";

  return {
    showRainyAlternatives: showRainy,
    rainyAlternatives: screen.map((s) => ({
      id: s.id,
      name: s.name,
      distance: "약 5km (mock)",
      driveTime: "차량 15분",
      groupCapacity: "문의",
      phone: "031-000-0000",
      href: s.href,
    })),
    meetingPlaces: course.nearbyPlaces
      .filter((p) => p.category === "식당" || p.category === "카페")
      .slice(0, 1)
      .map((p) => ({
        id: p.id,
        category: p.category as "식당" | "카페",
        name: p.name,
        distance: p.distance,
        driveTime: "차량 10분 (mock)",
        groupCapacity: "문의",
        parking: "확인 필요",
        phone: "031-000-0000",
        listingBadge: "일반" as const,
        href: "#",
      })),
    sponsoredCards: [],
  };
}

export function getCourseDetailPageData(course: CourseMapItem): CourseDetailPageData {
  const override = detailOverrides[course.id];
  const base = buildDefaultDetail(course);
  if (!override) return base;
  return {
    ...base,
    ...override,
    photos: override.photos ?? base.photos,
    hourlyForecast: override.hourlyForecast ?? base.hourlyForecast,
    remainingTodayForecast: override.remainingTodayForecast ?? base.remainingTodayForecast,
    tomorrowHourlyForecast: override.tomorrowHourlyForecast ?? base.tomorrowHourlyForecast,
    weatherWarnings: override.weatherWarnings ?? base.weatherWarnings,
    hallOfFameRecords: override.hallOfFameRecords ?? base.hallOfFameRecords,
    monthlyWinners: override.monthlyWinners ?? base.monthlyWinners,
    roundJudgmentTips: override.roundJudgmentTips ?? base.roundJudgmentTips,
    sidebar: { ...base.sidebar, ...override.sidebar },
    mapMarkers: override.mapMarkers ?? base.mapMarkers,
    mapPhotoPins: override.mapPhotoPins ?? base.mapPhotoPins,
    nearbyPlacesData: override.nearbyPlacesData ?? base.nearbyPlacesData,
    about: { ...base.about, ...override.about },
    reservationGuide: { ...base.reservationGuide, ...override.reservationGuide },
    location: { ...base.location, ...override.location },
    nearbyInfo: { ...base.nearbyInfo, ...override.nearbyInfo },
  };
}

export function getRelatedCourses(ids: string[]): CourseMapItem[] {
  return ids
    .map((id) => courseMapItems.find((c) => c.id === id))
    .filter((c): c is CourseMapItem => Boolean(c));
}
