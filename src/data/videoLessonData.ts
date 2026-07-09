import type {
  FeaturedYoutubeInstructor,
  VideoLesson,
  VideoLessonCategory,
  VideoLessonLevel,
  YoutubePromotionType,
} from "@/types";

/**
 * TODO:
 * - YouTube 영상 등록 신청 폼
 * - 운영자 승인 후 영상 노출
 * - 카테고리별 인기 영상 집계
 * - 강사/채널 프로필 연결
 * - 무료 영상에서 유료 레슨으로 연결
 * - 영상 신고/품질 관리
 * - YouTube API 연동 여부 검토
 * - 입문 가이드 페이지와 연결
 *
 * TODO (유료 광고 전환):
 * - 추천 유튜브 교습가 유료 노출 상품
 * - 카테고리별 대표 강사 상단 노출
 * - 유튜브 채널 홍보 배너 신청
 * - 광고 기간/노출 순서 관리
 * - 무료 추천 채널과 유료 광고 채널 구분
 * - 영상 등록 수, 조회 클릭 수 기반 추천
 * - 부적절한 영상 신고/검수
 */

export const FEATURED_YOUTUBE_OPERATION_NOTICE =
  "초기에는 유익한 영상을 많이 제공한 강사·채널을 운영자가 선정해 소개합니다. 향후에는 추천 채널, 대표 영상, 카테고리별 상단 노출 광고로 확장될 수 있습니다.";

export const youtubePromotionTypeLabels: Record<YoutubePromotionType, string> = {
  editor_pick: "운영자 추천",
  popular_channel: "인기 채널",
  paid_ad_ready: "향후 유료 광고 가능",
};

export const featuredYoutubeInstructors: FeaturedYoutubeInstructor[] = [
    {
      id: "yt-instructor-1",
      channelName: "파크골프 입문 채널",
      instructorName: "김파크",
      mainCategory: "초보 입문 · 기본자세",
      representativeVideoTitle: "파크골프 처음 시작하는 법",
      description:
        "입문자 대상 기초 규칙, 자세, 연습 순서를 쉽게 설명하는 채널입니다.",
      youtubeChannelUrl: "https://www.youtube.com/@sample-park-beginner",
      youtubeVideoUrl: "https://www.youtube.com/watch?v=sample-park-beginner",
      promotionType: "editor_pick",
    },
    {
      id: "yt-instructor-2",
      channelName: "티샷 연구소",
      instructorName: "이드라이브",
      mainCategory: "티샷 · 방향성",
      representativeVideoTitle: "티샷 방향 잡는 기본 원리",
      description:
        "티샷과 방향성 교정에 특화된 실전형 강의를 꾸준히 업로드합니다.",
      youtubeChannelUrl: "https://www.youtube.com/@sample-park-teeshot",
      youtubeVideoUrl: "https://www.youtube.com/watch?v=sample-park-direction",
      promotionType: "popular_channel",
    },
    {
      id: "yt-instructor-3",
      channelName: "코스 공략 연구소",
      instructorName: "서전략",
      mainCategory: "실전 공략 · 대회 준비",
      representativeVideoTitle: "코스 공략 순서 이해하기",
      description:
        "코스 플레이 전략과 대회 준비 팁을 다루는 중급자 맞춤 채널입니다.",
      youtubeChannelUrl: "https://www.youtube.com/@sample-park-strategy",
      youtubeVideoUrl: "https://www.youtube.com/watch?v=sample-park-strategy",
      promotionType: "paid_ad_ready",
    },
  ];

export const certificationFeaturedVideoIds = ["video-12", "video-7"] as const;

export const certificationFeaturedInstructor: FeaturedYoutubeInstructor = {
  id: "yt-instructor-cert",
  channelName: "파크골프 자격TV",
  instructorName: "조자격",
  mainCategory: "자격증·심판 · 룰·매너",
  representativeVideoTitle: "심판·자격증 준비 입문",
  description:
    "지도자·심판 자격증 준비와 경기 규칙 학습을 돕는 자격증 전문 채널입니다.",
  youtubeChannelUrl: "https://www.youtube.com/@sample-park-cert",
  youtubeVideoUrl: "https://www.youtube.com/watch?v=sample-park-cert",
  promotionType: "editor_pick",
};

export function getCertificationFeaturedVideos(lessons: VideoLesson[] = videoLessons) {
  return certificationFeaturedVideoIds
    .map((id) => lessons.find((lesson) => lesson.id === id))
    .filter((lesson): lesson is VideoLesson => lesson !== undefined);
}

export const VIDEO_LESSON_REGISTER_FORM_URL =
  "https://docs.google.com/forms/d/e/placeholder-video-lesson/viewform";

export const VIDEO_LESSON_REGISTER_NOTES = [
  "파크골프 유튜브 강사 또는 채널 운영자는 자신의 강의 영상을 PUL에 등록 요청할 수 있습니다.",
  "영상은 YouTube 링크 방식으로 연결됩니다.",
  "PUL은 카테고리별로 정리해 이용자가 쉽게 찾을 수 있도록 도와드립니다.",
  "초기에는 운영자가 확인 후 수동 등록합니다.",
];

export const videoLessonCategories: {
  value: VideoLessonCategory | "all";
  label: string;
}[] = [
  { value: "all", label: "전체" },
  { value: "beginner_intro", label: "초보 입문" },
  { value: "basic_stance", label: "기본자세" },
  { value: "swing", label: "스윙" },
  { value: "tee_shot", label: "티샷" },
  { value: "putting", label: "퍼팅" },
  { value: "approach", label: "어프로치" },
  { value: "distance_control", label: "거리 조절" },
  { value: "direction", label: "방향성" },
  { value: "rules_manner", label: "룰·매너" },
  { value: "practical_strategy", label: "실전 공략" },
  { value: "equipment", label: "장비 선택" },
  { value: "club_reservation", label: "동호회·예약" },
  { value: "tournament_prep", label: "대회 준비" },
  { value: "cert_referee", label: "자격증·심판" },
  { value: "other", label: "기타" },
];

export const videoLessonCategoryLabels: Record<VideoLessonCategory, string> = {
  beginner_intro: "초보 입문",
  basic_stance: "기본자세",
  swing: "스윙",
  tee_shot: "티샷",
  putting: "퍼팅",
  approach: "어프로치",
  distance_control: "거리 조절",
  direction: "방향성",
  rules_manner: "룰·매너",
  practical_strategy: "실전 공략",
  equipment: "장비 선택",
  club_reservation: "동호회·예약",
  tournament_prep: "대회 준비",
  cert_referee: "자격증·심판",
  other: "기타",
};

export const videoLessonLevelLabels: Record<VideoLessonLevel, string> = {
  intro: "입문",
  beginner: "초급",
  intermediate: "중급",
  advanced: "고급",
};

export const videoLessonLevelStyles: Record<VideoLessonLevel, string> = {
  intro: "bg-pul-light text-pul-deep",
  beginner: "bg-emerald-50 text-emerald-800",
  intermediate: "bg-teal-50 text-teal-800",
  advanced: "bg-pul-deep/10 text-pul-deep",
};

export const videoThumbnailStyles: Record<
  VideoLesson["thumbnailType"],
  string
> = {
  green: "from-pul-deep to-pul-point",
  teal: "from-teal-700 to-teal-500",
  emerald: "from-emerald-800 to-emerald-500",
  forest: "from-emerald-900 via-pul-deep to-emerald-600",
};

export const videoLessons: VideoLesson[] = [
  {
    id: "video-1",
    title: "파크골프 처음 시작하는 법",
    category: "beginner_intro",
    channelName: "파크골프 입문 채널",
    instructorName: "김파크",
    level: "intro",
    duration: "12:40",
    description:
      "파크골프가 처음인 분을 위한 기본 규칙, 장비, 연습 순서를 10분 안에 정리합니다.",
    youtubeUrl: "https://www.youtube.com/watch?v=sample-park-beginner",
    thumbnailType: "green",
    tags: ["입문", "기초", "규칙"],
  },
  {
    id: "video-2",
    title: "티샷 방향 잡는 기본 원리",
    category: "direction",
    channelName: "티샷 연구소",
    instructorName: "이드라이브",
    level: "beginner",
    duration: "9:15",
    description: "티잉 위치와 어깨 방향만으로 방향성을 잡는 기본 원리를 설명합니다.",
    youtubeUrl: "https://www.youtube.com/watch?v=sample-park-direction",
    thumbnailType: "teal",
    tags: ["방향성", "티샷", "기초"],
  },
  {
    id: "video-3",
    title: "퍼팅 거리감 맞추는 연습법",
    category: "putting",
    channelName: "그린 마스터",
    instructorName: "박퍼트",
    level: "beginner",
    duration: "14:02",
    description: "짧은 퍼팅부터 롱 퍼팅까지 거리감을 키우는 단계별 연습법입니다.",
    youtubeUrl: "https://www.youtube.com/watch?v=sample-park-putting",
    thumbnailType: "emerald",
    tags: ["퍼팅", "거리감", "연습"],
  },
  {
    id: "video-4",
    title: "어드레스 자세 체크",
    category: "basic_stance",
    channelName: "기본기 파크골프",
    instructorName: "최자세",
    level: "intro",
    duration: "8:33",
    description: "거울 없이도 스스로 점검할 수 있는 기본자세 체크리스트 5가지입니다.",
    youtubeUrl: "https://www.youtube.com/watch?v=sample-park-stance",
    thumbnailType: "forest",
    tags: ["기본자세", "어드레스", "입문"],
  },
  {
    id: "video-5",
    title: "초보자가 자주 하는 스윙 실수",
    category: "swing",
    channelName: "스윙 교정 연구소",
    instructorName: "정스윙",
    level: "beginner",
    duration: "11:28",
    description: "초보자가 반복하는 상체 힘주기, 탑 위치 오류를 짚고 교정합니다.",
    youtubeUrl: "https://www.youtube.com/watch?v=sample-park-swing",
    thumbnailType: "green",
    tags: ["스윙", "실수", "교정"],
  },
  {
    id: "video-6",
    title: "어프로치 기본 감각 만들기",
    category: "approach",
    channelName: "숏게임 클래스",
    instructorName: "한어프로",
    level: "intermediate",
    duration: "10:50",
    description: "그린 앞 어프로치에서 구질과 거리를 조절하는 기본 감각을 익힙니다.",
    youtubeUrl: "https://www.youtube.com/watch?v=sample-park-approach",
    thumbnailType: "teal",
    tags: ["어프로치", "숏게임"],
  },
  {
    id: "video-7",
    title: "파크골프 룰과 매너 기본",
    category: "rules_manner",
    channelName: "파크골프 매너TV",
    instructorName: "윤매너",
    level: "intro",
    duration: "7:45",
    description: "라운딩 전 꼭 알아야 할 경기 규칙과 동호회 매너를 정리했습니다.",
    youtubeUrl: "https://www.youtube.com/watch?v=sample-park-rules",
    thumbnailType: "emerald",
    tags: ["룰", "매너", "입문"],
  },
  {
    id: "video-8",
    title: "코스 공략 순서 이해하기",
    category: "practical_strategy",
    channelName: "코스 공략 연구소",
    instructorName: "서전략",
    level: "intermediate",
    duration: "13:20",
    description: "홀별 공략 순서와 안전한 플레이 루트를 선택하는 방법을 소개합니다.",
    youtubeUrl: "https://www.youtube.com/watch?v=sample-park-strategy",
    thumbnailType: "forest",
    tags: ["공략", "코스", "전략"],
  },
  {
    id: "video-9",
    title: "골프 경험자를 위한 파크골프 전환 팁",
    category: "practical_strategy",
    channelName: "전환 레슨 채널",
    instructorName: "강전환",
    level: "intermediate",
    duration: "15:10",
    description: "필드 골프 경험자가 파크골프 클럽과 거리감에 빠르게 적응하는 팁입니다.",
    youtubeUrl: "https://www.youtube.com/watch?v=sample-park-transition",
    thumbnailType: "green",
    tags: ["전환", "골프경험", "실전"],
  },
  {
    id: "video-10",
    title: "동호회 가입 전 알아야 할 것",
    category: "club_reservation",
    channelName: "파크골프 생활",
    instructorName: "오동호",
    level: "intro",
    duration: "9:55",
    description: "동호회 가입 전 확인할 활동 요일, 회비, 구장 예약 방식을 안내합니다.",
    youtubeUrl: "https://www.youtube.com/watch?v=sample-park-club",
    thumbnailType: "teal",
    tags: ["동호회", "예약", "입문"],
  },
  {
    id: "video-11",
    title: "장비 선택 기초",
    category: "equipment",
    channelName: "파크골프 장비랩",
    instructorName: "임장비",
    level: "beginner",
    duration: "11:05",
    description: "입문자가 첫 클럽과 볼을 고를 때 참고할 기준을 설명합니다.",
    youtubeUrl: "https://www.youtube.com/watch?v=sample-park-equipment",
    thumbnailType: "emerald",
    tags: ["장비", "클럽", "입문"],
  },
  {
    id: "video-12",
    title: "심판·자격증 준비 입문",
    category: "cert_referee",
    channelName: "파크골프 자격TV",
    instructorName: "조자격",
    level: "advanced",
    duration: "16:30",
    description: "지도자·심판 자격증 준비 과정과 학습 로드맵을 소개합니다.",
    youtubeUrl: "https://www.youtube.com/watch?v=sample-park-cert",
    thumbnailType: "forest",
    tags: ["자격증", "심판", "지도자"],
  },
  {
    id: "video-13",
    title: "파크골프 티샷 올리는 법",
    category: "tee_shot",
    channelName: "티샷 연구소",
    instructorName: "이드라이브",
    level: "beginner",
    duration: "10:20",
    description: "티잉 위치 설정부터 임팩트까지, 티샷을 안정적으로 올리는 기본 연습법입니다.",
    youtubeUrl: "https://www.youtube.com/watch?v=sample-park-teeshot",
    thumbnailType: "teal",
    tags: ["티샷", "기초", "연습"],
  },
  {
    id: "video-14",
    title: "클럽별 거리 조절 기본",
    category: "distance_control",
    channelName: "거리감 연구소",
    instructorName: "나거리",
    level: "beginner",
    duration: "12:15",
    description: "클럽 선택과 스윙 크기로 거리를 조절하는 기본 원리를 단계별로 설명합니다.",
    youtubeUrl: "https://www.youtube.com/watch?v=sample-park-distance",
    thumbnailType: "green",
    tags: ["거리조절", "클럽선택", "기초"],
  },
  {
    id: "video-15",
    title: "대회 전 체크리스트",
    category: "tournament_prep",
    channelName: "대회 준비 채널",
    instructorName: "배대회",
    level: "intermediate",
    duration: "9:40",
    description: "월례회·지역대회 전에 확인할 장비, 컨디션, 룰 체크 항목을 정리했습니다.",
    youtubeUrl: "https://www.youtube.com/watch?v=sample-park-tournament",
    thumbnailType: "emerald",
    tags: ["대회", "준비", "체크리스트"],
  },
  {
    id: "video-16",
    title: "라운딩 전 스트레칭 5분",
    category: "other",
    channelName: "파크골프 건강TV",
    instructorName: "김건강",
    level: "intro",
    duration: "5:30",
    description: "라운딩 전 어깨·허리·손목을 풀어주는 간단한 스트레칭 루틴입니다.",
    youtubeUrl: "https://www.youtube.com/watch?v=sample-park-stretch",
    thumbnailType: "forest",
    tags: ["스트레칭", "부상예방", "준비운동"],
  },
  {
    id: "video-17",
    title: "초보자를 위한 연습 루틴 만들기",
    category: "other",
    channelName: "파크골프 생활",
    instructorName: "이루틴",
    level: "beginner",
    duration: "11:00",
    description: "짧은 시간에 기본기를 유지하는 주 2회 연습 루틴과 멘탈 관리 팁을 소개합니다.",
    youtubeUrl: "https://www.youtube.com/watch?v=sample-park-routine",
    thumbnailType: "teal",
    tags: ["연습루틴", "멘탈", "입문"],
  },
];

export function filterVideoLessons(
  lessons: VideoLesson[],
  category: VideoLessonCategory | "all",
) {
  if (category === "all") return lessons;
  return lessons.filter((lesson) => lesson.category === category);
}
