export type StrategyVideoCategory =
  | "전체 공략"
  | "홀별 공략"
  | "티샷"
  | "퍼팅"
  | "바람 공략"
  | "초보 주의구간"
  | "동호회 라운딩 후기";

export type StrategyVideoFeaturedType = "운영자 추천" | "인기 영상" | "최신 영상";

export type CourseStrategyVideo = {
  id: string;
  title: string;
  channelName: string;
  authorType: string;
  category: StrategyVideoCategory;
  level: string;
  duration: string;
  description: string;
  youtubeUrl: string;
  featuredType: StrategyVideoFeaturedType;
};

/**
 * TODO:
 * - 골프장별 공략 영상 등록 신청
 * - 운영자 승인 후 영상 노출
 * - 인기순/최신순/초보 추천 정렬
 * - 홀별 공략 카테고리
 * - 동호회 회원 영상 구분
 * - 부적절한 영상 신고/검수
 * - YouTube 링크 유효성 확인
 * - 골프장 상세에서 전체 공략 영상 페이지 연결
 */
export const courseStrategyVideos: Record<string, CourseStrategyVideo[]> = {
  "1": [
    {
      id: "v1-1",
      title: "한강 시민공원 1번홀 티샷 방향 잡기",
      channelName: "마포 파크골프 TV",
      authorType: "동호회 회원",
      category: "티샷",
      level: "초급",
      duration: "8:20",
      description: "초보자가 자주 우측으로 밀리는 구간을 기준으로 티샷 방향을 설명합니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "운영자 추천",
    },
    {
      id: "v1-2",
      title: "한강 시민공원 전체 코스 공략",
      channelName: "PUL 파크골프",
      authorType: "운영자",
      category: "전체 공략",
      level: "중급",
      duration: "15:40",
      description: "18홀 전체 흐름과 주의 구간을 한 번에 정리했습니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "인기 영상",
    },
    {
      id: "v1-3",
      title: "한강 동호회 토요 라운딩 후기",
      channelName: "한강 시민 파크골프 동호회",
      authorType: "동호회 회원",
      category: "동호회 라운딩 후기",
      level: "전체",
      duration: "12:05",
      description: "주말 오전 라운딩 일정과 동호회 모임 팁을 공유합니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "최신 영상",
    },
    {
      id: "v1-4",
      title: "9번홀 퍼팅 라인 읽기",
      channelName: "마포 파크골프 TV",
      authorType: "동호회 회원",
      category: "퍼팅",
      level: "중급",
      duration: "6:30",
      description: "그린 경사가 까다로운 9번홀 퍼팅 포인트를 설명합니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "인기 영상",
    },
  ],
  "2": [
    {
      id: "v2-1",
      title: "수원 화성 27홀 코스 선택 가이드",
      channelName: "수원 화성 파크골프회",
      authorType: "동호회 회원",
      category: "전체 공략",
      level: "초급",
      duration: "11:20",
      description: "처음 방문 시 1코스부터 이용하는 방법을 안내합니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "운영자 추천",
    },
    {
      id: "v2-2",
      title: "화성 3코스 바람 대응 티샷",
      channelName: "경기 남부 시니어",
      authorType: "동호회 회원",
      category: "바람 공략",
      level: "중급",
      duration: "7:45",
      description: "바람이 강한 날 낮은 탄도로 안정적으로 보내는 방법입니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "인기 영상",
    },
    {
      id: "v2-3",
      title: "27홀 마라톤 라운딩 후기",
      channelName: "수원 파크골프 브이로그",
      authorType: "이용자",
      category: "동호회 라운딩 후기",
      level: "전체",
      duration: "18:00",
      description: "27홀 전체 이용 시 휴식 타이밍과 준비물을 정리했습니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "최신 영상",
    },
  ],
  "3": [
    {
      id: "v3-1",
      title: "송도 스크린 파크 기본 자세",
      channelName: "송도 센트럴 파크골프",
      authorType: "동호회 회원",
      category: "초보 주의구간",
      level: "초급",
      duration: "9:10",
      description: "실내 이용 시 스크린 거리감에 맞추는 연습 방법입니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "운영자 추천",
    },
    {
      id: "v3-2",
      title: "스크린 파크 18홀 코스 공략",
      channelName: "PUL 파크골프",
      authorType: "운영자",
      category: "전체 공략",
      level: "초급",
      duration: "13:25",
      description: "실내 코스별 난이도와 추천 클럽을 소개합니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "인기 영상",
    },
    {
      id: "v3-3",
      title: "금요일 저녁 동호회 라운딩",
      channelName: "인천 연수 스크린",
      authorType: "동호회 회원",
      category: "동호회 라운딩 후기",
      level: "전체",
      duration: "10:30",
      description: "직장인 동호회 저녁 라운딩 일정을 공유합니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "최신 영상",
    },
  ],
  "4": [
    {
      id: "v4-1",
      title: "대전 엑스포 초보자 주의 구간",
      channelName: "대전 엑스포 파크골프회",
      authorType: "동호회 회원",
      category: "초보 주의구간",
      level: "초급",
      duration: "8:50",
      description: "완만해 보이지만 OB가 잦은 구간을 짚어드립니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "운영자 추천",
    },
    {
      id: "v4-2",
      title: "엑스포 파크골프 전체 공략",
      channelName: "유성구 시니어 파크",
      authorType: "동호회 회원",
      category: "전체 공략",
      level: "초급",
      duration: "14:15",
      description: "가족 단위 이용에 맞춘 18홀 코스 안내입니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "인기 영상",
    },
    {
      id: "v4-3",
      title: "주말 현장 접수 이용 후기",
      channelName: "대전 파크 브이로그",
      authorType: "이용자",
      category: "동호회 라운딩 후기",
      level: "전체",
      duration: "7:20",
      description: "현장 접수 대기 시간과 추천 도착 시각을 정리했습니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "최신 영상",
    },
  ],
  "5": [
    {
      id: "v5-1",
      title: "소양강 36홀 체력 분배 공략",
      channelName: "춘천 소양강 파크골프회",
      authorType: "동호회 회원",
      category: "전체 공략",
      level: "중급",
      duration: "16:40",
      description: "대형 구장 36홀 이용 시 전반·후반 페이스 조절법입니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "운영자 추천",
    },
    {
      id: "v5-2",
      title: "소양강 바람 많은 날 티샷",
      channelName: "강원 36홀 챌린저스",
      authorType: "동호회 회원",
      category: "바람 공략",
      level: "중급",
      duration: "9:05",
      description: "강풍 시 안정적인 티샷 각도와 클럽 선택 팁입니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "인기 영상",
    },
    {
      id: "v5-3",
      title: "소양강 12번홀 홀별 공략",
      channelName: "춘천 파크골프 TV",
      authorType: "이용자",
      category: "홀별 공략",
      level: "중급",
      duration: "5:55",
      description: "전망이 좋지만 난이도 높은 12번홀 공략입니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "최신 영상",
    },
  ],
  "6": [
    {
      id: "v6-1",
      title: "해운대 스크린 9홀 빠른 공략",
      channelName: "해운대 스크린 파크",
      authorType: "동호회 회원",
      category: "전체 공략",
      level: "초급",
      duration: "7:30",
      description: "9홀 짧은 코스를 효율적으로 돌아보는 방법입니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "운영자 추천",
    },
    {
      id: "v6-2",
      title: "여행 중 스크린 파크 이용 팁",
      channelName: "부산 파크골프",
      authorType: "이용자",
      category: "동호회 라운딩 후기",
      level: "초급",
      duration: "6:15",
      description: "장비 대여와 저녁 시간대 이용 후기를 담았습니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "인기 영상",
    },
    {
      id: "v6-3",
      title: "스크린 퍼팅 감각 익히기",
      channelName: "해운대 스크린 파크",
      authorType: "동호회 회원",
      category: "퍼팅",
      level: "초급",
      duration: "8:00",
      description: "실내 그린에서 거리감을 맞추는 연습 루틴입니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "최신 영상",
    },
  ],
  "7": [
    {
      id: "v7-1",
      title: "한옥마을 9홀 전체 공략",
      channelName: "전주 한옥마을 파크골프회",
      authorType: "동호회 회원",
      category: "전체 공략",
      level: "초급",
      duration: "10:20",
      description: "관광과 함께 즐기는 9홀 코스 안내입니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "운영자 추천",
    },
    {
      id: "v7-2",
      title: "오전 라운딩 추천 이유",
      channelName: "전북 관광 파크골프",
      authorType: "동호회 회원",
      category: "동호회 라운딩 후기",
      level: "전체",
      duration: "6:40",
      description: "오후 단체 이용 전 오전 방문이 좋은 이유를 설명합니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "인기 영상",
    },
    {
      id: "v7-3",
      title: "5번홀 티샷 주의사항",
      channelName: "전주 파크골프",
      authorType: "이용자",
      category: "티샷",
      level: "초급",
      duration: "4:50",
      description: "좁은 페어웨이에서 자주 막히는 5번홀 공략입니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "최신 영상",
    },
  ],
  "8": [
    {
      id: "v8-1",
      title: "제주 올레 바람 공략 총정리",
      channelName: "제주 올레 파크골프회",
      authorType: "동호회 회원",
      category: "바람 공략",
      level: "중급",
      duration: "12:30",
      description: "제주 바람에 맞춘 티샷과 어프로치 전략입니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "운영자 추천",
    },
    {
      id: "v8-2",
      title: "올레 파크골프 18홀 전체 공략",
      channelName: "PUL 파크골프",
      authorType: "운영자",
      category: "전체 공략",
      level: "중급",
      duration: "17:10",
      description: "오름 풍경 코스의 홀별 포인트를 정리했습니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "인기 영상",
    },
    {
      id: "v8-3",
      title: "제주 동호회 라운딩 브이로그",
      channelName: "제주 바람과 함께",
      authorType: "동호회 회원",
      category: "동호회 라운딩 후기",
      level: "전체",
      duration: "14:25",
      description: "관광형 라운딩 일정과 준비물을 공유합니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "최신 영상",
    },
  ],
  "9": [
    {
      id: "v9-1",
      title: "분당 시니어 스크린 초보 입문",
      channelName: "성남 파크골프 레슨클럽",
      authorType: "동호회 회원",
      category: "초보 주의구간",
      level: "초급",
      duration: "9:45",
      description: "처음 방문 시 레슨과 함께 이용하는 방법입니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "운영자 추천",
    },
    {
      id: "v9-2",
      title: "분당 스크린 18홀 코스 공략",
      channelName: "분당 시니어 스크린",
      authorType: "동호회 회원",
      category: "전체 공략",
      level: "초급",
      duration: "11:50",
      description: "실내 18홀 코스별 난이도와 추천 루트입니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "인기 영상",
    },
    {
      id: "v9-3",
      title: "화목 오후 동호회 라운딩",
      channelName: "분당 시니어 스크린",
      authorType: "동호회 회원",
      category: "동호회 라운딩 후기",
      level: "전체",
      duration: "8:35",
      description: "시니어 동호회 정기 모임 일정을 소개합니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "최신 영상",
    },
  ],
  "10": [
    {
      id: "v10-1",
      title: "무심천 27홀 코스 선택법",
      channelName: "청주 무심천 파크골프회",
      authorType: "동호회 회원",
      category: "전체 공략",
      level: "중급",
      duration: "13:40",
      description: "27홀 중 체력에 맞는 코스 조합을 추천합니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "운영자 추천",
    },
    {
      id: "v10-2",
      title: "폭염 날 이른 아침 라운딩",
      channelName: "충북 27홀 마스터즈",
      authorType: "동호회 회원",
      category: "바람 공략",
      level: "중급",
      duration: "7:10",
      description: "여름철 오전 시간대 이용과 수분 보충 팁입니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "인기 영상",
    },
    {
      id: "v10-3",
      title: "무심천 7번홀 홀별 공략",
      channelName: "청주 파크골프 TV",
      authorType: "이용자",
      category: "홀별 공략",
      level: "초급",
      duration: "5:20",
      description: "그린 주변 벙커가 있는 7번홀 공략법입니다.",
      youtubeUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      featuredType: "최신 영상",
    },
  ],
};

const FEATURED_ORDER: StrategyVideoFeaturedType[] = [
  "운영자 추천",
  "인기 영상",
  "최신 영상",
];

export function getCourseStrategyVideos(courseId: string): CourseStrategyVideo[] {
  return courseStrategyVideos[courseId] ?? [];
}

export function getFeaturedStrategyVideos(
  videos: CourseStrategyVideo[],
  limit = 3,
): CourseStrategyVideo[] {
  const picked: CourseStrategyVideo[] = [];

  for (const type of FEATURED_ORDER) {
    const found = videos.find((video) => video.featuredType === type);
    if (found && !picked.some((v) => v.id === found.id)) {
      picked.push(found);
    }
  }

  for (const video of videos) {
    if (picked.length >= limit) break;
    if (!picked.some((v) => v.id === video.id)) {
      picked.push(video);
    }
  }

  return picked.slice(0, limit);
}

export function getStrategyVideosSearchUrl(courseName: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${courseName} 파크골프 공략`)}`;
}
