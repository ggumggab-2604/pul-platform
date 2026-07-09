export type CourseHomeClub = {
  id: string;
  name: string;
  memberCount: number;
  schedule: string;
  recruitStatus: string;
  beginnerFriendly: boolean;
};

export type CourseHallOfFameEntry = {
  id: string;
  name: string;
  recordType: string;
  record: string;
  date: string;
  clubName: string;
};

export type CourseEvent = {
  id: string;
  title: string;
  date: string;
  status: string;
};

export type CourseDetailExtras = {
  homeClubs: CourseHomeClub[];
  hallOfFame: CourseHallOfFameEntry[];
  events: CourseEvent[];
};

/**
 * 골프장별 동호회·명예의 전당·대회 샘플 데이터
 * TODO:
 * - 골프장 상세에서 해당 골프장을 홈구장으로 쓰는 동호회 필터링
 * - 골프장별 명예의 전당 실제 데이터 연동
 * - 골프장별 대회/이벤트 연동
 */
export const courseDetailExtras: Record<string, CourseDetailExtras> = {
  "1": {
    homeClubs: [
      {
        id: "c1-1",
        name: "한강 시민 파크골프 동호회",
        memberCount: 48,
        schedule: "매주 토요일 오전",
        recruitStatus: "모집 중",
        beginnerFriendly: true,
      },
      {
        id: "c1-2",
        name: "마포 파크골프회",
        memberCount: 32,
        schedule: "매주 수·토 오전",
        recruitStatus: "정원 마감",
        beginnerFriendly: true,
      },
      {
        id: "c1-3",
        name: "PUL 드림파크",
        memberCount: 24,
        schedule: "격주 일요일",
        recruitStatus: "모집 중",
        beginnerFriendly: false,
      },
    ],
    hallOfFame: [
      {
        id: "h1-1",
        name: "김영수",
        recordType: "홀인원",
        record: "3회",
        date: "2025년 11월",
        clubName: "한강 시민 파크골프 동호회",
      },
      {
        id: "h1-2",
        name: "이정희",
        recordType: "베스트 스코어",
        record: "28타",
        date: "2026년 3월",
        clubName: "마포 파크골프회",
      },
      {
        id: "h1-3",
        name: "박민호",
        recordType: "월례회 우승",
        record: "2026년 6월",
        date: "2026-06-14",
        clubName: "PUL 드림파크",
      },
    ],
    events: [
      {
        id: "e1-1",
        title: "한강 시민공원 봄맞이 오픈 대회",
        date: "2026-04-12",
        status: "접수 중",
      },
      {
        id: "e1-2",
        title: "마포구 동호회 연합 친선전",
        date: "2026-05-03",
        status: "접수 예정",
      },
    ],
  },
  "2": {
    homeClubs: [
      {
        id: "c2-1",
        name: "수원 화성 파크골프회",
        memberCount: 56,
        schedule: "매주 토·일 오전",
        recruitStatus: "모집 중",
        beginnerFriendly: true,
      },
      {
        id: "c2-2",
        name: "경기 남부 시니어 파크골프",
        memberCount: 38,
        schedule: "매주 화·목 오후",
        recruitStatus: "정원 마감",
        beginnerFriendly: true,
      },
    ],
    hallOfFame: [
      {
        id: "h2-1",
        name: "최순자",
        recordType: "베스트 스코어",
        record: "26타",
        date: "2025년 9월",
        clubName: "수원 화성 파크골프회",
      },
      {
        id: "h2-2",
        name: "정대호",
        recordType: "홀인원",
        record: "1회",
        date: "2026년 1월",
        clubName: "경기 남부 시니어 파크골프",
      },
    ],
    events: [
      {
        id: "e2-1",
        title: "수원 화성 27홀 챌린지",
        date: "2026-04-26",
        status: "접수 중",
      },
    ],
  },
  "3": {
    homeClubs: [
      {
        id: "c3-1",
        name: "송도 센트럴 파크골프",
        memberCount: 18,
        schedule: "매주 금요일 저녁",
        recruitStatus: "모집 중",
        beginnerFriendly: true,
      },
      {
        id: "c3-2",
        name: "인천 연수 스크린 동호회",
        memberCount: 14,
        schedule: "격주 수요일",
        recruitStatus: "모집 중",
        beginnerFriendly: true,
      },
    ],
    hallOfFame: [
      {
        id: "h3-1",
        name: "윤미경",
        recordType: "월례회 우승",
        record: "2026년 2월",
        date: "2026-02-21",
        clubName: "송도 센트럴 파크골프",
      },
    ],
    events: [
      {
        id: "e3-1",
        title: "송도 실내 파크골프 친선 대회",
        date: "2026-05-10",
        status: "접수 예정",
      },
    ],
  },
  "4": {
    homeClubs: [
      {
        id: "c4-1",
        name: "대전 엑스포 파크골프회",
        memberCount: 29,
        schedule: "매주 토요일 오전",
        recruitStatus: "모집 중",
        beginnerFriendly: true,
      },
      {
        id: "c4-2",
        name: "유성구 시니어 파크",
        memberCount: 22,
        schedule: "매주 수요일 오전",
        recruitStatus: "정원 마감",
        beginnerFriendly: true,
      },
    ],
    hallOfFame: [
      {
        id: "h4-1",
        name: "한병철",
        recordType: "베스트 스코어",
        record: "30타",
        date: "2025년 12월",
        clubName: "대전 엑스포 파크골프회",
      },
    ],
    events: [
      {
        id: "e4-1",
        title: "대전 가족 파크골프 페스티벌",
        date: "2026-05-17",
        status: "접수 예정",
      },
    ],
  },
  "5": {
    homeClubs: [
      {
        id: "c5-1",
        name: "춘천 소양강 파크골프회",
        memberCount: 42,
        schedule: "매주 토·일 오전",
        recruitStatus: "모집 중",
        beginnerFriendly: false,
      },
      {
        id: "c5-2",
        name: "강원 36홀 챌린저스",
        memberCount: 35,
        schedule: "격주 일요일",
        recruitStatus: "모집 중",
        beginnerFriendly: false,
      },
      {
        id: "c5-3",
        name: "춘천 시니어 파크",
        memberCount: 28,
        schedule: "매주 화요일 오전",
        recruitStatus: "정원 마감",
        beginnerFriendly: true,
      },
    ],
    hallOfFame: [
      {
        id: "h5-1",
        name: "강태웅",
        recordType: "홀인원",
        record: "2회",
        date: "2025년 8월",
        clubName: "춘천 소양강 파크골프회",
      },
      {
        id: "h5-2",
        name: "서영희",
        recordType: "베스트 스코어",
        record: "27타",
        date: "2026년 4월",
        clubName: "강원 36홀 챌린저스",
      },
    ],
    events: [
      {
        id: "e5-1",
        title: "소양강 봄맞이 36홀 마라톤",
        date: "2026-04-19",
        status: "접수 중",
      },
      {
        id: "e5-2",
        title: "강원 동호회 연합 대회",
        date: "2026-06-07",
        status: "접수 예정",
      },
    ],
  },
  "6": {
    homeClubs: [
      {
        id: "c6-1",
        name: "해운대 스크린 파크",
        memberCount: 12,
        schedule: "매주 목요일 저녁",
        recruitStatus: "모집 중",
        beginnerFriendly: true,
      },
    ],
    hallOfFame: [
      {
        id: "h6-1",
        name: "오진수",
        recordType: "월례회 우승",
        record: "2026년 1월",
        date: "2026-01-18",
        clubName: "해운대 스크린 파크",
      },
    ],
    events: [
      {
        id: "e6-1",
        title: "부산 실내 파크골프 밤 대회",
        date: "2026-05-24",
        status: "접수 예정",
      },
    ],
  },
  "7": {
    homeClubs: [
      {
        id: "c7-1",
        name: "전주 한옥마을 파크골프회",
        memberCount: 20,
        schedule: "매주 토요일 오전",
        recruitStatus: "모집 중",
        beginnerFriendly: true,
      },
      {
        id: "c7-2",
        name: "전북 관광 파크골프",
        memberCount: 16,
        schedule: "격주 일요일",
        recruitStatus: "모집 중",
        beginnerFriendly: true,
      },
    ],
    hallOfFame: [
      {
        id: "h7-1",
        name: "임수진",
        recordType: "베스트 스코어",
        record: "29타",
        date: "2026년 2월",
        clubName: "전주 한옥마을 파크골프회",
      },
    ],
    events: [
      {
        id: "e7-1",
        title: "한옥마을 9홀 친선 대회",
        date: "2026-04-05",
        status: "접수 중",
      },
    ],
  },
  "8": {
    homeClubs: [
      {
        id: "c8-1",
        name: "제주 올레 파크골프회",
        memberCount: 34,
        schedule: "매주 토요일 오전",
        recruitStatus: "모집 중",
        beginnerFriendly: false,
      },
      {
        id: "c8-2",
        name: "제주 바람과 함께",
        memberCount: 26,
        schedule: "매주 일요일 오전",
        recruitStatus: "정원 마감",
        beginnerFriendly: true,
      },
    ],
    hallOfFame: [
      {
        id: "h8-1",
        name: "고민재",
        recordType: "홀인원",
        record: "1회",
        date: "2025년 10월",
        clubName: "제주 올레 파크골프회",
      },
      {
        id: "h8-2",
        name: "문선영",
        recordType: "베스트 스코어",
        record: "31타",
        date: "2026년 3월",
        clubName: "제주 바람과 함께",
      },
    ],
    events: [
      {
        id: "e8-1",
        title: "제주 올레 파크골프 오픈",
        date: "2026-05-01",
        status: "접수 중",
      },
    ],
  },
  "9": {
    homeClubs: [
      {
        id: "c9-1",
        name: "분당 시니어 스크린",
        memberCount: 22,
        schedule: "매주 화·목 오후",
        recruitStatus: "모집 중",
        beginnerFriendly: true,
      },
      {
        id: "c9-2",
        name: "성남 파크골프 레슨클럽",
        memberCount: 18,
        schedule: "매주 수요일",
        recruitStatus: "모집 중",
        beginnerFriendly: true,
      },
    ],
    hallOfFame: [
      {
        id: "h9-1",
        name: "배은정",
        recordType: "월례회 우승",
        record: "2026년 3월",
        date: "2026-03-08",
        clubName: "분당 시니어 스크린",
      },
    ],
    events: [
      {
        id: "e9-1",
        title: "분당 시니어 스크린 챔피언십",
        date: "2026-06-14",
        status: "접수 예정",
      },
    ],
  },
  "10": {
    homeClubs: [
      {
        id: "c10-1",
        name: "청주 무심천 파크골프회",
        memberCount: 40,
        schedule: "매주 토·일 오전",
        recruitStatus: "모집 중",
        beginnerFriendly: true,
      },
      {
        id: "c10-2",
        name: "충북 27홀 마스터즈",
        memberCount: 30,
        schedule: "격주 토요일",
        recruitStatus: "정원 마감",
        beginnerFriendly: false,
      },
    ],
    hallOfFame: [
      {
        id: "h10-1",
        name: "류장호",
        recordType: "베스트 스코어",
        record: "25타",
        date: "2025년 7월",
        clubName: "청주 무심천 파크골프회",
      },
      {
        id: "h10-2",
        name: "신옥자",
        recordType: "홀인원",
        record: "1회",
        date: "2026년 2월",
        clubName: "충북 27홀 마스터즈",
      },
    ],
    events: [
      {
        id: "e10-1",
        title: "무심천 27홀 오픈 챔피언십",
        date: "2026-04-26",
        status: "접수 중",
      },
      {
        id: "e10-2",
        title: "충북 동호회 연합 대회",
        date: "2026-06-21",
        status: "접수 예정",
      },
    ],
  },
};

export const defaultCourseDetailExtras: CourseDetailExtras = {
  homeClubs: [],
  hallOfFame: [],
  events: [],
};

export function getCourseDetailExtras(courseId: string): CourseDetailExtras {
  return courseDetailExtras[courseId] ?? defaultCourseDetailExtras;
}
