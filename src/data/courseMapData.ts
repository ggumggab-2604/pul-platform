import { getCourseBoardPosts } from "@/data/courseBoardPosts";
import { getCourseDetailExtras } from "@/data/courseDetailExtras";
import { getCourseLocationExtras } from "@/data/courseLocationExtras";
import { getCourseStrategyVideos } from "@/data/courseStrategyVideos";
import type {
  CourseEvent,
  CourseHallOfFameEntry,
  CourseHomeClub,
} from "@/data/courseDetailExtras";
import type {
  CourseAmenities,
  CourseLocalBanner,
  CourseNearbyPlace,
} from "@/data/courseLocationExtras";
import type { CourseBoardPost } from "@/data/courseBoardPosts";
import type { CourseStrategyVideo } from "@/data/courseStrategyVideos";

export type CourseType = "field" | "screen";
export type CourseOperation = "reservation" | "phone" | "walkIn";

export type CoursePlayStatus = "좋음" | "주의" | "비추천";

export type WeatherIconKey =
  | "sunny"
  | "partly-cloudy"
  | "cloudy"
  | "rain"
  | "storm"
  | "wind"
  | "heat"
  | "cold";

export type CourseTodayWeather = {
  temperature: string;
  condition: string;
  icon: WeatherIconKey;
  rainChance: string;
  wind: string;
  forecastNote: string;
  playStatus: CoursePlayStatus;
  playIcon: string;
};

export type CourseTomorrowWeather = {
  low: string;
  high: string;
  condition: string;
  icon: WeatherIconKey;
  rainChance: string;
  wind: string;
  forecastNote: string;
  playStatus: CoursePlayStatus;
  playIcon: string;
};

export type CourseWeather = {
  today: CourseTodayWeather;
  tomorrow: CourseTomorrowWeather;
};

export type { CourseEvent, CourseHallOfFameEntry, CourseHomeClub } from "@/data/courseDetailExtras";
export type {
  CourseAmenities,
  CourseLocalBanner,
  CourseNearbyPlace,
  NearbyPlaceCategory,
} from "@/data/courseLocationExtras";
export type { CourseStrategyVideo, StrategyVideoCategory } from "@/data/courseStrategyVideos";
export type { CourseBoardPost, CourseBoardCategory } from "@/data/courseBoardPosts";

/**
 * TODO:
 * - 실제 날씨 API 연동
 * - 골프장 위도/경도 기준 날씨 조회
 * - 골프장 상세에서 해당 골프장을 홈구장으로 쓰는 동호회 필터링
 * - 골프장별 명예의 전당 실제 데이터 연동
 * - 골프장별 대회/이벤트 연동
 * - 회원 관심 골프장 등록
 * - 골프장 후기/평점
 * - 골프장별 주차장 위치 지도 연동
 * - 주변 식당/카페/장비점 실제 데이터 등록
 * - 지역 제휴 광고 신청/승인
 */

export const coursePlayStatusStyles: Record<CoursePlayStatus, string> = {
  좋음: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200/70",
  주의: "bg-amber-50 text-amber-800 ring-1 ring-amber-200/70",
  비추천: "bg-gray-100 text-gray-600 ring-1 ring-gray-200/80",
};

export type CourseMapItem = {
  id: string;
  name: string;
  type: CourseType;
  region: string;
  city: string;
  address: string;
  holes: number;
  hours: string;
  phone: string;
  operation: CourseOperation;
  reservation: boolean;
  parking: boolean;
  description: string;
  tips: string;
  clubCount: number;
  hallOfFameCount: number;
  eventCount: number;
  features: string[];
  weather: CourseWeather;
  homeClubs: CourseHomeClub[];
  hallOfFame: CourseHallOfFameEntry[];
  events: CourseEvent[];
  amenities: CourseAmenities;
  nearbyPlaces: CourseNearbyPlace[];
  localBanners: CourseLocalBanner[];
  strategyVideos: CourseStrategyVideo[];
  courseBoardPosts: CourseBoardPost[];
  lat: number;
  lng: number;
  markerX: number;
  markerY: number;
};

export const courseTypeLabels: Record<CourseType, string> = {
  field: "실제 필드",
  screen: "스크린 파크골프장",
};

export const operationLabels: Record<CourseOperation, string> = {
  reservation: "예약 가능",
  phone: "전화 문의",
  walkIn: "현장 접수",
};

export const mapFilterOptions = {
  types: ["전체", "실제 필드", "스크린 파크골프장"],
  regions: ["전체", "서울", "경기", "인천", "충청", "강원", "전라", "경상", "제주"],
  operations: ["전체", "예약 가능", "전화 문의", "현장 접수"],
  holes: ["전체", "9홀", "18홀", "27홀 이상"],
  features: ["동호회 있음", "대회 개최 이력", "레슨 가능", "장비 대여", "주차 가능"],
} as const;

const baseCourseMapItems: Omit<
  CourseMapItem,
  | "homeClubs"
  | "hallOfFame"
  | "events"
  | "amenities"
  | "nearbyPlaces"
  | "localBanners"
  | "strategyVideos"
  | "courseBoardPosts"
>[] = [
  {
    id: "1",
    name: "한강 시민공원 파크골프장",
    type: "field",
    region: "서울",
    city: "마포구",
    address: "서울특별시 마포구 상암동 1600",
    holes: 18,
    hours: "06:00 - 20:00",
    phone: "02-300-1200",
    operation: "reservation",
    reservation: true,
    parking: true,
    description: "한강변을 따라 조성된 접근성 좋은 도심형 파크골프장입니다.",
    tips: "오전 시간대가 비교적 여유롭고, 주말은 사전 예약을 권장합니다.",
    clubCount: 14,
    hallOfFameCount: 32,
    eventCount: 7,
    features: ["동호회 있음", "대회 개최 이력", "주차 가능"],
    weather: {
      today: {
        temperature: "24℃",
        condition: "맑음",
        icon: "partly-cloudy",
        rainChance: "10%",
        wind: "약함",
        forecastNote: "오후 2시 이후 비 가능성 낮음",
        playStatus: "좋음",
        playIcon: "✅",
      },
      tomorrow: {
        low: "20℃",
        high: "28℃",
        condition: "맑음",
        icon: "sunny",
        rainChance: "0%",
        wind: "약함",
        forecastNote: "동호회 라운딩 진행에 무리 없습니다.",
        playStatus: "좋음",
        playIcon: "✅",
      },
    },
    lat: 37.5665,
    lng: 126.8982,
    markerX: 46,
    markerY: 26,
  },
  {
    id: "2",
    name: "수원 화성 파크골프장",
    type: "field",
    region: "경기",
    city: "수원시",
    address: "경기도 수원시 팔달구 정조로 910",
    holes: 27,
    hours: "07:00 - 19:00",
    phone: "031-228-4500",
    operation: "reservation",
    reservation: true,
    parking: true,
    description: "넓은 페어웨이와 안정적인 코스 관리로 인기가 높은 27홀 구장입니다.",
    tips: "초보자는 1코스부터 이용하면 난이도 적응이 쉽습니다.",
    clubCount: 21,
    hallOfFameCount: 45,
    eventCount: 11,
    features: ["동호회 있음", "대회 개최 이력", "레슨 가능", "주차 가능"],
    weather: {
      today: {
        temperature: "23℃",
        condition: "구름 많음",
        icon: "cloudy",
        rainChance: "20%",
        wind: "보통",
        forecastNote: "오후 늦게 흐려질 수 있음",
        playStatus: "좋음",
        playIcon: "✅",
      },
      tomorrow: {
        low: "19℃",
        high: "26℃",
        condition: "구름 조금",
        icon: "partly-cloudy",
        rainChance: "15%",
        wind: "보통",
        forecastNote: "오전 라운딩에 적합합니다.",
        playStatus: "좋음",
        playIcon: "✅",
      },
    },
    lat: 37.2851,
    lng: 127.0169,
    markerX: 44,
    markerY: 40,
  },
  {
    id: "goyang-park-golf",
    name: "고양누리 파크골프장",
    type: "field",
    region: "경기",
    city: "고양시",
    address: "경기도 고양시 덕양구 고양누리길 1 (개발용 mock 주소)",
    holes: 36,
    hours: "06:30 - 18:00 (계절별 변동 가능)",
    phone: "031-900-1200",
    operation: "reservation",
    reservation: true,
    parking: true,
    description:
      "고양시 대표 공원형 파크골프장으로, 넓은 코스와 접근성 좋은 입구가 특징입니다. (개발용 mock)",
    tips: "A코스부터 이용하면 초보자도 부담 없이 시작할 수 있습니다. 주말은 사전 예약·전화 확인을 권장합니다.",
    clubCount: 11,
    hallOfFameCount: 19,
    eventCount: 6,
    features: ["동호회 있음", "대회 개최 이력", "주차 가능", "레슨 가능"],
    weather: {
      today: {
        temperature: "24℃",
        condition: "맑음",
        icon: "partly-cloudy",
        rainChance: "12%",
        wind: "약함",
        forecastNote: "오후 라운딩에 무리 없음 (예시)",
        playStatus: "좋음",
        playIcon: "✅",
      },
      tomorrow: {
        low: "19℃",
        high: "27℃",
        condition: "구름 조금",
        icon: "partly-cloudy",
        rainChance: "15%",
        wind: "약함",
        forecastNote: "동호회 일정에 적합 (예시)",
        playStatus: "좋음",
        playIcon: "✅",
      },
    },
    lat: 37.6584,
    lng: 126.832,
    markerX: 42,
    markerY: 28,
  },
  {
    id: "3",
    name: "송도 센트럴 스크린 파크",
    type: "screen",
    region: "인천",
    city: "연수구",
    address: "인천광역시 연수구 센트럴로 123",
    holes: 18,
    hours: "09:00 - 22:00",
    phone: "032-120-8800",
    operation: "phone",
    reservation: false,
    parking: true,
    description: "날씨와 관계없이 이용 가능한 실내 스크린 파크골프 시설입니다.",
    tips: "저녁 시간대는 전화 문의 후 방문하면 대기 시간을 줄일 수 있습니다.",
    clubCount: 6,
    hallOfFameCount: 18,
    eventCount: 3,
    features: ["동호회 있음", "레슨 가능", "장비 대여", "주차 가능"],
    weather: {
      today: {
        temperature: "26℃",
        condition: "맑음",
        icon: "sunny",
        rainChance: "5%",
        wind: "약함",
        forecastNote: "실내 이용 시 날씨 영향 적음",
        playStatus: "좋음",
        playIcon: "✅",
      },
      tomorrow: {
        low: "22℃",
        high: "29℃",
        condition: "맑음",
        icon: "sunny",
        rainChance: "5%",
        wind: "약함",
        forecastNote: "실내 라운딩 일정에 무리 없습니다.",
        playStatus: "좋음",
        playIcon: "✅",
      },
    },
    lat: 37.3932,
    lng: 126.6348,
    markerX: 34,
    markerY: 32,
  },
  {
    id: "4",
    name: "대전 엑스포 파크골프장",
    type: "field",
    region: "충청",
    city: "대전 유성구",
    address: "대전광역시 유성구 엑스포로 1",
    holes: 18,
    hours: "07:00 - 18:30",
    phone: "042-250-3300",
    operation: "walkIn",
    reservation: false,
    parking: true,
    description: "초보자와 가족 단위 이용객이 찾기 좋은 완만한 코스입니다.",
    tips: "현장 접수 위주라 주말 오전에는 일찍 도착하는 편이 좋습니다.",
    clubCount: 9,
    hallOfFameCount: 21,
    eventCount: 5,
    features: ["동호회 있음", "대회 개최 이력", "주차 가능"],
    weather: {
      today: {
        temperature: "22℃",
        condition: "비",
        icon: "rain",
        rainChance: "80%",
        wind: "보통",
        forecastNote: "30분 뒤 약해질 가능성 있음",
        playStatus: "주의",
        playIcon: "⚠️",
      },
      tomorrow: {
        low: "21℃",
        high: "27℃",
        condition: "비 예보",
        icon: "rain",
        rainChance: "70%",
        wind: "보통",
        forecastNote: "동호회 일정은 사전 확인을 권장합니다.",
        playStatus: "주의",
        playIcon: "⚠️",
      },
    },
    lat: 36.3745,
    lng: 127.3886,
    markerX: 48,
    markerY: 52,
  },
  {
    id: "5",
    name: "춘천 소양강 파크골프장",
    type: "field",
    region: "강원",
    city: "춘천시",
    address: "강원특별자치도 춘천시 소양로 45",
    holes: 36,
    hours: "06:00 - 19:00",
    phone: "033-256-7700",
    operation: "reservation",
    reservation: true,
    parking: true,
    description: "소양강을 조망하는 강원권 대표 대형 파크골프장입니다.",
    tips: "36홀 전체 이용 시 충분한 수분과 휴식 시간을 준비하세요.",
    clubCount: 18,
    hallOfFameCount: 57,
    eventCount: 14,
    features: ["동호회 있음", "대회 개최 이력", "레슨 가능", "주차 가능"],
    weather: {
      today: {
        temperature: "19℃",
        condition: "맑음",
        icon: "sunny",
        rainChance: "5%",
        wind: "약함",
        forecastNote: "오후까지 맑은 날씨가 이어집니다",
        playStatus: "좋음",
        playIcon: "✅",
      },
      tomorrow: {
        low: "14℃",
        high: "22℃",
        condition: "구름 조금",
        icon: "partly-cloudy",
        rainChance: "10%",
        wind: "약함",
        forecastNote: "대형 구장 이용 시 여벌 의류 준비를 권장합니다.",
        playStatus: "좋음",
        playIcon: "✅",
      },
    },
    lat: 37.8813,
    lng: 127.7298,
    markerX: 62,
    markerY: 24,
  },
  {
    id: "6",
    name: "부산 해운대 스크린 파크",
    type: "screen",
    region: "경상",
    city: "부산 해운대구",
    address: "부산광역시 해운대구 해운대해변로 264",
    holes: 9,
    hours: "10:00 - 23:00",
    phone: "051-749-2200",
    operation: "phone",
    reservation: false,
    parking: false,
    description: "도심 접근성이 좋은 실내 스크린 파크골프 연습 공간입니다.",
    tips: "장비 대여가 가능해 여행 중에도 가볍게 방문할 수 있습니다.",
    clubCount: 4,
    hallOfFameCount: 12,
    eventCount: 2,
    features: ["레슨 가능", "장비 대여"],
    weather: {
      today: {
        temperature: "25℃",
        condition: "바람 강함",
        icon: "wind",
        rainChance: "15%",
        wind: "강함",
        forecastNote: "해안 바람으로 샷 거리 변동에 유의하세요",
        playStatus: "주의",
        playIcon: "⚠️",
      },
      tomorrow: {
        low: "22℃",
        high: "28℃",
        condition: "흐림",
        icon: "cloudy",
        rainChance: "30%",
        wind: "강함",
        forecastNote: "동호회 일정은 바람 정보를 함께 공지하세요.",
        playStatus: "주의",
        playIcon: "⚠️",
      },
    },
    lat: 35.1587,
    lng: 129.1604,
    markerX: 70,
    markerY: 70,
  },
  {
    id: "7",
    name: "전주 한옥마을 파크골프장",
    type: "field",
    region: "전라",
    city: "전주시",
    address: "전북특별자치도 전주시 완산구 효자로 88",
    holes: 9,
    hours: "08:00 - 18:00",
    phone: "063-280-1500",
    operation: "walkIn",
    reservation: false,
    parking: true,
    description: "관광 코스와 함께 즐기기 좋은 9홀 생활체육형 구장입니다.",
    tips: "오후에는 단체 이용이 많아 오전 방문을 추천합니다.",
    clubCount: 7,
    hallOfFameCount: 10,
    eventCount: 2,
    features: ["동호회 있음", "주차 가능"],
    weather: {
      today: {
        temperature: "27℃",
        condition: "맑음",
        icon: "sunny",
        rainChance: "10%",
        wind: "보통",
        forecastNote: "오후 4시 이후 바람이 다소 강해질 수 있음",
        playStatus: "좋음",
        playIcon: "✅",
      },
      tomorrow: {
        low: "18℃",
        high: "29℃",
        condition: "맑음",
        icon: "sunny",
        rainChance: "5%",
        wind: "약함",
        forecastNote: "동호회 라운딩 진행에 무리 없습니다.",
        playStatus: "좋음",
        playIcon: "✅",
      },
    },
    lat: 35.815,
    lng: 127.1527,
    markerX: 43,
    markerY: 64,
  },
  {
    id: "8",
    name: "제주 올레 파크골프장",
    type: "field",
    region: "제주",
    city: "제주시",
    address: "제주특별자치도 제주시 애월읍 올레로 15",
    holes: 18,
    hours: "06:30 - 19:30",
    phone: "064-799-4400",
    operation: "reservation",
    reservation: true,
    parking: true,
    description: "제주 오름 풍경을 배경으로 라운딩할 수 있는 관광형 구장입니다.",
    tips: "바람이 강한 날이 많아 낮은 탄도의 샷을 준비해 보세요.",
    clubCount: 11,
    hallOfFameCount: 28,
    eventCount: 6,
    features: ["동호회 있음", "대회 개최 이력", "장비 대여", "주차 가능"],
    weather: {
      today: {
        temperature: "22℃",
        condition: "바람 강함",
        icon: "wind",
        rainChance: "25%",
        wind: "강함",
        forecastNote: "오후 소나기 가능성, 우산 준비 권장",
        playStatus: "주의",
        playIcon: "⚠️",
      },
      tomorrow: {
        low: "20℃",
        high: "26℃",
        condition: "소나기",
        icon: "storm",
        rainChance: "55%",
        wind: "강함",
        forecastNote: "동호회 일정은 사전 확인을 권장합니다.",
        playStatus: "주의",
        playIcon: "⚠️",
      },
    },
    lat: 33.462,
    lng: 126.3084,
    markerX: 31,
    markerY: 84,
  },
  {
    id: "9",
    name: "분당 시니어 스크린 파크",
    type: "screen",
    region: "경기",
    city: "성남시",
    address: "경기도 성남시 분당구 탄천로 28",
    holes: 18,
    hours: "09:00 - 22:00",
    phone: "031-701-7788",
    operation: "reservation",
    reservation: true,
    parking: true,
    description: "레슨과 장비 대여를 함께 제공하는 도심형 스크린 시설입니다.",
    tips: "처음 방문하면 기본 자세 점검 레슨을 함께 예약해 보세요.",
    clubCount: 8,
    hallOfFameCount: 16,
    eventCount: 4,
    features: ["동호회 있음", "레슨 가능", "장비 대여", "주차 가능"],
    weather: {
      today: {
        temperature: "25℃",
        condition: "맑음",
        icon: "partly-cloudy",
        rainChance: "8%",
        wind: "약함",
        forecastNote: "오후 2시 이후 비 가능성 낮음",
        playStatus: "좋음",
        playIcon: "✅",
      },
      tomorrow: {
        low: "21℃",
        high: "28℃",
        condition: "구름 조금",
        icon: "partly-cloudy",
        rainChance: "10%",
        wind: "약함",
        forecastNote: "실내 라운딩 일정에 무리 없습니다.",
        playStatus: "좋음",
        playIcon: "✅",
      },
    },
    lat: 37.3595,
    lng: 127.1052,
    markerX: 52,
    markerY: 42,
  },
  {
    id: "10",
    name: "청주 무심천 파크골프장",
    type: "field",
    region: "충청",
    city: "청주시",
    address: "충청북도 청주시 서원구 무심서로 99",
    holes: 27,
    hours: "06:30 - 18:30",
    phone: "043-201-4400",
    operation: "phone",
    reservation: false,
    parking: true,
    description: "무심천 산책로와 이어지는 넓고 쾌적한 27홀 구장입니다.",
    tips: "전화로 당일 혼잡도를 확인한 뒤 방문하면 좋습니다.",
    clubCount: 13,
    hallOfFameCount: 24,
    eventCount: 8,
    features: ["동호회 있음", "대회 개최 이력", "주차 가능"],
    weather: {
      today: {
        temperature: "30℃",
        condition: "폭염 주의",
        icon: "heat",
        rainChance: "5%",
        wind: "약함",
        forecastNote: "오후 폭염 경보, 수분 섭취와 휴식을 자주 하세요",
        playStatus: "주의",
        playIcon: "⚠️",
      },
      tomorrow: {
        low: "22℃",
        high: "33℃",
        condition: "폭염 주의",
        icon: "heat",
        rainChance: "10%",
        wind: "약함",
        forecastNote: "동호회 일정은 이른 아침 이용을 권장합니다.",
        playStatus: "주의",
        playIcon: "⚠️",
      },
    },
    lat: 36.6424,
    lng: 127.489,
    markerX: 50,
    markerY: 49,
  },
];

export const courseMapItems: CourseMapItem[] = baseCourseMapItems.map((item) => ({
  ...item,
  ...getCourseDetailExtras(item.id),
  ...getCourseLocationExtras(item.id),
  strategyVideos: getCourseStrategyVideos(item.id),
  courseBoardPosts: getCourseBoardPosts(item.id),
}));
