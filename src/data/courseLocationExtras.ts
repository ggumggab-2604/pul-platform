export type CourseAmenityItem = {
  available?: boolean;
  description: string;
};

export type CourseAmenities = {
  parking: CourseAmenityItem;
  restroom: CourseAmenityItem;
  water: CourseAmenityItem;
  restArea: CourseAmenityItem;
  store: CourseAmenityItem;
  transit: { description: string };
};

export type NearbyPlaceCategory =
  | "식당"
  | "카페"
  | "장비점"
  | "병원/약국"
  | "기타";

export type CourseNearbyPlace = {
  id: string;
  name: string;
  category: NearbyPlaceCategory;
  distance: string;
  purpose: string;
  description: string;
  ctaText: string;
};

export type CourseLocalBanner = {
  id: string;
  title: string;
  description: string;
  category: string;
  ctaText: string;
};

export type CourseLocationExtras = {
  amenities: CourseAmenities;
  nearbyPlaces: CourseNearbyPlace[];
  localBanners: CourseLocalBanner[];
};

/**
 * TODO:
 * - 골프장별 주차장 위치 지도 연동
 * - 화장실/음수대/휴게공간 위치 표시
 * - 주변 식당/카페/장비점 실제 데이터 등록
 * - 지역 제휴 광고 신청/승인
 * - 골프장별 지역 배너 노출
 * - 동호회 단체 식사 예약 문의 연결
 * - 길찾기 지도 앱 연결
 * - 이용자 후기 기반 추천 장소 정렬
 */
export const courseLocationExtras: Record<string, CourseLocationExtras> = {
  "1": {
    amenities: {
      parking: { available: true, description: "공원 입구 공영주차장 이용" },
      restroom: { available: true, description: "구장 입구와 9홀 근처" },
      water: { available: true, description: "관리동 옆 음수대 이용 가능" },
      restArea: { available: true, description: "일부 그늘막과 벤치 있음" },
      store: { available: false, description: "구장 내 매점 없음" },
      transit: { description: "버스 정류장 도보 5분" },
    },
    nearbyPlaces: [
      {
        id: "n1-1",
        name: "한강식당",
        category: "식당",
        distance: "도보 7분",
        purpose: "동호회 단체 식사 가능",
        description: "라운딩 후 점심 모임에 적합한 한식당입니다.",
        ctaText: "길찾기",
      },
      {
        id: "n1-2",
        name: "상암 카페거리",
        category: "카페",
        distance: "도보 10분",
        purpose: "라운딩 후 휴식",
        description: "음료와 간단한 디저트를 즐길 수 있는 카페가 모여 있습니다.",
        ctaText: "길찾기",
      },
      {
        id: "n1-3",
        name: "마포 파크골프 장비점",
        category: "장비점",
        distance: "차량 8분",
        purpose: "클럽·공 구매·수리",
        description: "초보자용 세트부터 수리 서비스까지 이용할 수 있습니다.",
        ctaText: "길찾기",
      },
      {
        id: "n1-4",
        name: "상암연합내과",
        category: "병원/약국",
        distance: "차량 5분",
        purpose: "부상·건강 상담",
        description: "라운딩 중 컨디션 이상 시 가까운 내과 진료가 가능합니다.",
        ctaText: "길찾기",
      },
    ],
    localBanners: [
      {
        id: "b1-1",
        title: "동호회 단체 식사 제휴",
        description: "한강 인근 한식당 단체석 예약 및 할인 혜택",
        category: "식당",
        ctaText: "입점 문의",
      },
      {
        id: "b1-2",
        title: "근처 파크골프 장비점",
        description: "클럽 수리·그립 교체·신규 장비 상담",
        category: "장비점",
        ctaText: "입점 문의",
      },
      {
        id: "b1-3",
        title: "시니어 건강검진 제휴",
        description: "파크골프 동호회 회원 대상 검진 패키지 안내",
        category: "건강검진",
        ctaText: "입점 문의",
      },
    ],
  },
  "2": {
    amenities: {
      parking: { available: true, description: "구장 전용 주차장 80대" },
      restroom: { available: true, description: "클럽하우스 및 18홀 중간" },
      water: { available: true, description: "각 코스 시작점 음수대" },
      restArea: { available: true, description: "그늘막·정자 다수" },
      store: { available: true, description: "간단한 음료·간식 판매" },
      transit: { description: "수원역 버스 20분, 자가용 권장" },
    },
    nearbyPlaces: [
      {
        id: "n2-1",
        name: "화성한정식",
        category: "식당",
        distance: "차량 10분",
        purpose: "동호회 회식",
        description: "수원 화성 인근 단체 식사에 인기 있는 한정식집입니다.",
        ctaText: "길찾기",
      },
      {
        id: "n2-2",
        name: "수원 파크골프 프로샵",
        category: "장비점",
        distance: "차량 7분",
        purpose: "장비 구매·피팅",
        description: "27홀 이용 전 클럽 점검과 피팅 상담이 가능합니다.",
        ctaText: "길찾기",
      },
      {
        id: "n2-3",
        name: "팔달 카페룸",
        category: "카페",
        distance: "차량 12분",
        purpose: "라운딩 후 휴식",
        description: "넓은 테이블로 동호회 모임 후 차 한잔하기 좋습니다.",
        ctaText: "길찾기",
      },
    ],
    localBanners: [
      {
        id: "b2-1",
        title: "27홀 이용 단체 식사 제휴",
        description: "수원 화성 인근 식당 단체 예약 연결",
        category: "식당",
        ctaText: "입점 문의",
      },
      {
        id: "b2-2",
        title: "버스 대절 문의",
        description: "동호회 전세 버스 예약 및 견적 상담",
        category: "단체 서비스",
        ctaText: "입점 문의",
      },
    ],
  },
  "goyang-park-golf": {
    amenities: {
      parking: { available: true, description: "공원 주차장 이용 (주말 혼잡 가능)" },
      restroom: { available: true, description: "공원 화장실 및 구장 인근" },
      water: { available: true, description: "음수대 이용 가능 (위치 방문 전 확인)" },
      restArea: { available: true, description: "휴게실·그늘막·벤치" },
      store: { available: undefined, description: "매점 여부 확인 필요" },
      transit: { description: "지하철·버스 환승 후 도보 또는 마을버스 (노선 확인)" },
    },
    nearbyPlaces: [
      {
        id: "ng-1",
        name: "고양 파크골프 프로샵 (예시)",
        category: "장비점",
        distance: "차량 8분",
        purpose: "장비 점검·구매",
        description: "라운딩 전 그립·클럽 점검 상담 (mock)",
        ctaText: "길찾기",
      },
    ],
    localBanners: [],
  },
  "3": {
    amenities: {
      parking: { available: true, description: "건물 지하 주차장 이용" },
      restroom: { available: true, description: "실내 시설 내 화장실" },
      water: { available: true, description: "휴게 공간 정수기" },
      restArea: { available: true, description: "실내 휴게실 완비" },
      store: { available: true, description: "매점·장비 대여 카운터" },
      transit: { description: "송도역 도보 12분, 버스 이용 가능" },
    },
    nearbyPlaces: [
      {
        id: "n3-1",
        name: "센트럴파크 레스토랑",
        category: "식당",
        distance: "도보 5분",
        purpose: "가족·동호회 식사",
        description: "송도 센트럴파크 인근 분위기 좋은 레스토랑입니다.",
        ctaText: "길찾기",
      },
      {
        id: "n3-2",
        name: "스크린골프 장비 마트",
        category: "장비점",
        distance: "도보 8분",
        purpose: "장비 대여·구매",
        description: "실내용 클럽과 연습용 공구를 구매할 수 있습니다.",
        ctaText: "길찾기",
      },
      {
        id: "n3-3",
        name: "트리플스트리트 카페",
        category: "카페",
        distance: "도보 10분",
        purpose: "레슨 후 휴식",
        description: "레슨 후 회원들과 가볍게 모이기 좋은 카페 거리입니다.",
        ctaText: "길찾기",
      },
    ],
    localBanners: [
      {
        id: "b3-1",
        title: "실내 레슨 패키지 제휴",
        description: "스크린 파크골프 회원 대상 레슨 할인",
        category: "레슨",
        ctaText: "입점 문의",
      },
      {
        id: "b3-2",
        title: "임플란트 치과 상담",
        description: "시니어 회원 대상 무료 구강 검진",
        category: "치과",
        ctaText: "입점 문의",
      },
    ],
  },
  "4": {
    amenities: {
      parking: { available: true, description: "엑스포 공원 주차장 이용" },
      restroom: { available: true, description: "공원 화장실 및 구장 인근" },
      water: { available: true, description: "공원 내 음수대" },
      restArea: { available: true, description: "벤치와 파고라 일부" },
      store: { available: false, description: "구장 내 매점 없음" },
      transit: { description: "대전역 버스 25분" },
    },
    nearbyPlaces: [
      {
        id: "n4-1",
        name: "엑스포 한식당",
        category: "식당",
        distance: "도보 6분",
        purpose: "가족 단체 식사",
        description: "엑스포 과학공원 방문과 함께 이용하기 좋습니다.",
        ctaText: "길찾기",
      },
      {
        id: "n4-2",
        name: "유성 온천 카페",
        category: "카페",
        distance: "차량 10분",
        purpose: "라운딩 후 휴식",
        description: "온천 인근에서 편안하게 쉬어갈 수 있습니다.",
        ctaText: "길찾기",
      },
      {
        id: "n4-3",
        name: "대전 스포츠 약국",
        category: "병원/약국",
        distance: "차량 8분",
        purpose: "테이핑·파스 구매",
        description: "운동 손상 관련 기본 의약품을 구비하고 있습니다.",
        ctaText: "길찾기",
      },
    ],
    localBanners: [
      {
        id: "b4-1",
        title: "가족 파크골프 단체 식사",
        description: "유성구 인근 식당 단체 예약 연결",
        category: "식당",
        ctaText: "입점 문의",
      },
      {
        id: "b4-2",
        title: "시니어 건강검진 제휴",
        description: "대전 지역 검진 센터 회원 할인",
        category: "건강검진",
        ctaText: "입점 문의",
      },
    ],
  },
  "5": {
    amenities: {
      parking: { available: true, description: "대형 주차장 150대 이상" },
      restroom: { available: true, description: "각 코스 구간마다 화장실" },
      water: { available: true, description: "코스 전 구간 음수대" },
      restArea: { available: true, description: "그늘막·정자·휴게 pavilion" },
      store: { available: true, description: "매점에서 음료·간식 판매" },
      transit: { description: "춘천시외버스터미널 차량 15분" },
    },
    nearbyPlaces: [
      {
        id: "n5-1",
        name: "소양강 닭갈비거리",
        category: "식당",
        distance: "차량 12분",
        purpose: "동호회 회식",
        description: "춘천 대표 메뉴로 라운딩 후 회식에 인기입니다.",
        ctaText: "길찾기",
      },
      {
        id: "n5-2",
        name: "강원 파크골프 센터",
        category: "장비점",
        distance: "차량 10분",
        purpose: "장비 구매·수리",
        description: "36홀 이용자를 위한 장비 점검 서비스를 제공합니다.",
        ctaText: "길찾기",
      },
      {
        id: "n5-3",
        name: "소양호 전망 카페",
        category: "카페",
        distance: "차량 8분",
        purpose: "관광·휴식",
        description: "소양호 전망을 보며 라운딩 후 여유를 즐길 수 있습니다.",
        ctaText: "길찾기",
      },
      {
        id: "n5-4",
        name: "춘천종합병원",
        category: "병원/약국",
        distance: "차량 15분",
        purpose: "응급·건강 상담",
        description: "장거리 라운딩 중 컨디션 이상 시 이용할 수 있습니다.",
        ctaText: "길찾기",
      },
    ],
    localBanners: [
      {
        id: "b5-1",
        title: "36홀 이용 단체 버스",
        description: "서울·수도권 동호회 전세 버스 연결",
        category: "단체 서비스",
        ctaText: "입점 문의",
      },
      {
        id: "b5-2",
        title: "강원 특산품 제휴 매장",
        description: "라운딩 후 기념품·특산물 구매 안내",
        category: "기타",
        ctaText: "입점 문의",
      },
    ],
  },
  "6": {
    amenities: {
      parking: { available: false, description: "인근 유료 주차장 이용" },
      restroom: { available: true, description: "시설 내 화장실" },
      water: { available: true, description: "정수기 이용 가능" },
      restArea: { available: true, description: "실내 휴게 공간" },
      store: { available: true, description: "장비 대여·음료 판매" },
      transit: { description: "해운대역 도보 8분" },
    },
    nearbyPlaces: [
      {
        id: "n6-1",
        name: "해운대 횟집거리",
        category: "식당",
        distance: "도보 10분",
        purpose: "회식·관광객 식사",
        description: "바다 전망과 함께 식사할 수 있는 횟집이 많습니다.",
        ctaText: "길찾기",
      },
      {
        id: "n6-2",
        name: "마린시티 카페",
        category: "카페",
        distance: "도보 7분",
        purpose: "라운딩 후 휴식",
        description: "오션뷰 카페에서 동호회 모임을 이어갈 수 있습니다.",
        ctaText: "길찾기",
      },
      {
        id: "n6-3",
        name: "해운대 스포츠용품",
        category: "장비점",
        distance: "도보 12분",
        purpose: "장비 대여·구매",
        description: "여행 중 가볍게 장비를 대여할 수 있습니다.",
        ctaText: "길찾기",
      },
    ],
    localBanners: [
      {
        id: "b6-1",
        title: "관광객 동호회 식사 제휴",
        description: "해운대 인근 식당 단체 예약",
        category: "식당",
        ctaText: "입점 문의",
      },
    ],
  },
  "7": {
    amenities: {
      parking: { available: true, description: "구장 옆 소형 주차장" },
      restroom: { available: true, description: "구장 입구 화장실" },
      water: { available: true, description: "입구 음수대 1곳" },
      restArea: { available: true, description: "벤치 일부" },
      store: { available: false, description: "매점 없음" },
      transit: { description: "한옥마을 버스 정류장 도보 8분" },
    },
    nearbyPlaces: [
      {
        id: "n7-1",
        name: "전주 비빔밥골목",
        category: "식당",
        distance: "차량 10분",
        purpose: "관광·단체 식사",
        description: "전주 한옥마을 관광과 함께 비빔밥 맛집을 방문하세요.",
        ctaText: "길찾기",
      },
      {
        id: "n7-2",
        name: "한옥마을 찻집",
        category: "카페",
        distance: "도보 8분",
        purpose: "라운딩 후 휴식",
        description: "전통 찻집에서 여유로운 시간을 보낼 수 있습니다.",
        ctaText: "길찾기",
      },
      {
        id: "n7-3",
        name: "완산 파크골프샵",
        category: "장비점",
        distance: "차량 7분",
        purpose: "공·클럽 구매",
        description: "9홀 이용에 맞는 가벼운 장비를 추천받을 수 있습니다.",
        ctaText: "길찾기",
      },
    ],
    localBanners: [
      {
        id: "b7-1",
        title: "한옥마을 관광 패키지",
        description: "파크골프+한옥마을 투어 연계 상품",
        category: "기타",
        ctaText: "입점 문의",
      },
    ],
  },
  "8": {
    amenities: {
      parking: { available: true, description: "구장 주차장 50대" },
      restroom: { available: true, description: "클럽하우스 및 코스 중간" },
      water: { available: true, description: "코스 구간별 음수대" },
      restArea: { available: true, description: "오름 전망 휴게 정자" },
      store: { available: true, description: "간단한 음료·기념품" },
      transit: { description: "제주시외버스터미널 차량 20분" },
    },
    nearbyPlaces: [
      {
        id: "n8-1",
        name: "애월 흑돼지 맛집",
        category: "식당",
        distance: "차량 10분",
        purpose: "동호회 회식",
        description: "제주 여행 라운딩 후 인기 있는 회식 장소입니다.",
        ctaText: "길찾기",
      },
      {
        id: "n8-2",
        name: "올레길 카페",
        category: "카페",
        distance: "도보 5분",
        purpose: "관광·휴식",
        description: "올레길 코스 인근 감성 카페입니다.",
        ctaText: "길찾기",
      },
      {
        id: "n8-3",
        name: "제주 파크골프 전문점",
        category: "장비점",
        distance: "차량 15분",
        purpose: "장비 구매·수리",
        description: "바람 많은 제주 라운딩에 맞는 장비 상담이 가능합니다.",
        ctaText: "길찾기",
      },
      {
        id: "n8-4",
        name: "애월의원",
        category: "병원/약국",
        distance: "차량 8분",
        purpose: "건강 상담",
        description: "여행 중 가벼운 진료와 약 처방이 가능합니다.",
        ctaText: "길찾기",
      },
    ],
    localBanners: [
      {
        id: "b8-1",
        title: "제주 관광 동호회 패키지",
        description: "숙박·식사·라운딩 연계 상품",
        category: "단체 서비스",
        ctaText: "입점 문의",
      },
      {
        id: "b8-2",
        title: "렌터카 제휴",
        description: "동호회 회원 대상 차량 할인",
        category: "기타",
        ctaText: "입점 문의",
      },
    ],
  },
  "9": {
    amenities: {
      parking: { available: true, description: "건물 지하·지상 주차" },
      restroom: { available: true, description: "시설 내 화장실" },
      water: { available: true, description: "휴게실 정수기" },
      restArea: { available: true, description: "실내 대기·휴게 공간" },
      store: { available: true, description: "매점·장비 대여" },
      transit: { description: "정자역 도보 10분" },
    },
    nearbyPlaces: [
      {
        id: "n9-1",
        name: "분당 정자동 식당가",
        category: "식당",
        distance: "도보 12분",
        purpose: "동호회 식사",
        description: "다양한 메뉴의 식당이 모여 있어 회식 장소 선택이 쉽습니다.",
        ctaText: "길찾기",
      },
      {
        id: "n9-2",
        name: "탄천 카페",
        category: "카페",
        distance: "도보 8분",
        purpose: "레슨 후 모임",
        description: "탄천 산책로 인근에서 가볍게 모일 수 있습니다.",
        ctaText: "길찾기",
      },
      {
        id: "n9-3",
        name: "성남 골프프로샵",
        category: "장비점",
        distance: "차량 5분",
        purpose: "피팅·장비 구매",
        description: "레슨과 함께 장비 피팅을 받을 수 있습니다.",
        ctaText: "길찾기",
      },
    ],
    localBanners: [
      {
        id: "b9-1",
        title: "시니어 레슨 패키지 제휴",
        description: "분당 지역 레슨 프로 연결",
        category: "레슨",
        ctaText: "입점 문의",
      },
      {
        id: "b9-2",
        title: "근처 파크골프 장비점",
        description: "클럽·의류 할인 혜택",
        category: "장비점",
        ctaText: "입점 문의",
      },
    ],
  },
  "10": {
    amenities: {
      parking: { available: true, description: "무심천 공영주차장 이용" },
      restroom: { available: true, description: "구장 입구·18홀 중간" },
      water: { available: true, description: "코스 구간 음수대" },
      restArea: { available: true, description: "무심천 산책로 벤치 연계" },
      store: { available: false, description: "구장 내 매점 없음" },
      transit: { description: "청주 시내버스 15분" },
    },
    nearbyPlaces: [
      {
        id: "n10-1",
        name: "무심천 한우식당",
        category: "식당",
        distance: "도보 10분",
        purpose: "동호회 회식",
        description: "27홀 라운딩 후 든든한 한우 식사가 가능합니다.",
        ctaText: "길찾기",
      },
      {
        id: "n10-2",
        name: "청주 파크골프 아울렛",
        category: "장비점",
        distance: "차량 10분",
        purpose: "장비 구매",
        description: "다양한 가격대의 클럽과 용품을 비교할 수 있습니다.",
        ctaText: "길찾기",
      },
      {
        id: "n10-3",
        name: "서원구 약국",
        category: "병원/약국",
        distance: "차량 7분",
        purpose: "파스·비타민 구매",
        description: "폭염 시 수분 보충제와 파스를 구비하고 있습니다.",
        ctaText: "길찾기",
      },
      {
        id: "n10-4",
        name: "무심천 카페",
        category: "카페",
        distance: "도보 6분",
        purpose: "산책·휴식",
        description: "무심천 산책과 함께 라운딩 후 휴식하기 좋습니다.",
        ctaText: "길찾기",
      },
    ],
    localBanners: [
      {
        id: "b10-1",
        title: "동호회 단체 식사 제휴",
        description: "청주 무심천 인근 식당 단체 예약",
        category: "식당",
        ctaText: "입점 문의",
      },
      {
        id: "b10-2",
        title: "시니어 건강검진 제휴",
        description: "청주 지역 검진 센터 회원 할인",
        category: "건강검진",
        ctaText: "입점 문의",
      },
      {
        id: "b10-3",
        title: "임플란트 치과 상담",
        description: "시니어 회원 무료 구강 상담",
        category: "치과",
        ctaText: "입점 문의",
      },
    ],
  },
};

const defaultLocationExtras: CourseLocationExtras = {
  amenities: {
    parking: { available: false, description: "주차 정보 확인 필요" },
    restroom: { available: true, description: "화장실 위치 현장 안내" },
    water: { available: false, description: "음수대 없음" },
    restArea: { available: false, description: "휴게공간 제한" },
    store: { available: false, description: "매점 없음" },
    transit: { description: "대중교통 이용 시 사전 확인" },
  },
  nearbyPlaces: [],
  localBanners: [],
};

export function getCourseLocationExtras(courseId: string): CourseLocationExtras {
  return courseLocationExtras[courseId] ?? defaultLocationExtras;
}
