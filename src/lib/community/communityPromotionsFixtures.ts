import { day, type Placement, type Post, type Source } from "./communityPromotionsPreview";

export const nearbyCourses: Source[] = [
  {
    kind: "course", key: "goesan-riverside", title: "괴산 강변 파크골프장", visibility: "public",
    example: { summary: "충북 괴산군 · 야외 파크골프장", guidance: "구장 상세에서는 운영시간, 이용요금, 주차와 길찾기를 확인할 수 있습니다." },
  },
  {
    kind: "course", key: "cheongju-park", title: "청주 공원 파크골프장", visibility: "public",
    example: { summary: "충북 청주시 · 야외 파크골프장", guidance: "구장 상세에서는 이용 안내와 구장 위치를 확인할 수 있습니다." },
  },
];

export function demoPosts(now: number): Post[] {
  const defaults = { scope: "visit", province: "충북", districts: ["괴산군"], owner: false, visibility: "public" } as const;
  const deadline = (days: number) => new Date(now + days * day + 9 * 3_600_000).toISOString().slice(0, 10);
  const items: (Partial<Post> & Pick<Post, "id" | "title" | "body" | "field" | "trade">)[] = [
    {
      id: "lodge", field: "local", trade: "숙박", owner: true,
      title: "괴산 숲길스테이 · 파크골프 모임 숙박",
      body: "괴산에서 파크골프를 즐긴 뒤 함께 쉬어 갈 수 있는 숙소입니다. 단체 투숙과 아침 식사 시간은 예약할 때 문의해 주세요.",
      address: "충북 괴산군 괴산읍 (예시)", contact: "숲길스테이 예약 담당 (시연용 문의)", nearbyCourse: nearbyCourses[0],
    },
    {
      id: "screen", field: "equipment", trade: "스크린 시설",
      title: "스크린파크골프장 오픈",
      body: "청주에서 실내 스크린파크골프를 체험해 보세요. 예약과 단체 이용을 안내합니다.",
      districts: ["청주시"], address: "충북 청주시 흥덕구 (예시)", contact: "스크린 시설 데스크 (시연용 문의)",
    },
    {
      id: "travel", field: "local", trade: "관광·체험", owner: true,
      title: "여행사의 파크골프 여행 상품",
      body: "괴산 강변 라운드와 지역 체험을 묶은 1박 2일 여행입니다. 출발 날짜와 단체 일정을 문의해 주세요.",
      address: "충북 괴산군 일대 (예시)", contact: "PUL 여행 상담 데스크 (시연용 문의)", nearbyCourse: nearbyCourses[0],
    },
    {
      id: "equipment", field: "equipment", trade: "파크골프채·용품",
      title: "파크골프채 신제품", scope: "delivery", province: "", districts: [],
      body: "입문자용 파크골프채 신제품을 소개합니다. 관련 장터 글에서 상세 사양과 문의 동선을 볼 수 있습니다.",
      relatedSale: {
        kind: "sale", key: "starter-club", title: "입문용 파크골프채 판매", visibility: "public",
        example: { summary: "파크골프채 · 전국 배송", guidance: "판매 상세의 쪽지 문의에서 판매자에게 상품 상태와 배송 방법을 물을 수 있습니다." },
      },
    },
    {
      id: "tournament", field: "events", trade: "", deadline: deadline(12),
      title: "대회 개최 및 참가자 모집",
      body: "괴산에서 열리는 지역 교류 대회입니다. 대회 상세에서 참가 자격과 접수 정보를 확인하세요.",
      source: {
        kind: "event", key: "goesan-open", title: "괴산 파크골프 교류대회", visibility: "public", recruitment: "open",
        example: { summary: "충북 괴산군 · 지역 교류 대회", guidance: "대회 안내에서 참가 자격과 접수 기간을 확인한 뒤 주최 측에 참가를 신청하는 예시입니다." },
      },
    },
    {
      id: "lesson", field: "education", trade: "파크골프 레슨·강습", deadline: deadline(8),
      title: "레슨·강습 수강생 모집",
      body: "파크골프 기본 자세부터 규칙, 코스 매너까지 배우는 입문 과정입니다.",
      source: {
        kind: "education", key: "park-golf-basics", title: "파크골프 입문 실기 과정", visibility: "public", recruitment: "open",
        example: { summary: "기초 이론과 실기 · 4회 과정", guidance: "과정 상세에서 교육기관, 일정과 비용을 확인하고 교육기관의 신청 안내를 따르는 예시입니다." },
      },
    },
    {
      id: "guesthouse", field: "local", trade: "숙박",
      title: "괴산 산벚꽃 민박 · 주말 객실 안내",
      body: "주말에 이용할 수 있는 소규모 객실을 안내합니다. 구장과 숙소 간 이동과 주차 문의가 가능합니다.",
      address: "충북 괴산군 칠성면 (예시)", contact: "산벚꽃 민박 예약 담당 (시연용 문의)", nearbyCourse: nearbyCourses[0],
    },
    {
      id: "transport", field: "service", trade: "차량·단체 이동", scope: "service", districts: ["괴산군", "청주시"],
      title: "괴산 구장까지 단체 차량 운행",
      body: "청주에서 출발해 괴산의 파크골프장까지 단체 이동을 지원합니다. 출발지와 인원에 따라 운행 시간을 조율합니다.",
      address: "충북 청주시 흥덕구 사무실 (예시)", contact: "단체 이동 담당 (시연용 문의)",
    },
    {
      id: "city-stay", field: "local", trade: "숙박", districts: ["청주시"],
      title: "청주 호수뷰 호텔 · 동호회 숙박",
      body: "청주에서 라운드하는 동호회를 위한 단체 객실 안내입니다.",
      address: "충북 청주시 상당구 (예시)", contact: "호텔 객실 담당 (시연용 문의)", nearbyCourse: nearbyCourses[1],
    },
    {
      id: "club", field: "clubs", trade: "", deadline: deadline(-4),
      title: "괴산 아침산책 동호회 회원 모집",
      body: "매주 아침 괴산에서 라운드하는 동호회입니다. 이번 정기 모집은 마감됐습니다.",
      source: {
        kind: "club", key: "morning-walk", title: "괴산 아침산책 파크골프동호회", visibility: "public", recruitment: "closed",
        example: { summary: "충북 괴산군 · 주말 정기 라운드", guidance: "이번 모집은 마감됐습니다. 동호회 상세의 가입 안내에서 다음 모집 일정을 확인할 수 있습니다." },
      },
    },
    {
      id: "online-lesson", field: "education", trade: "일반 강좌", scope: "online", province: "", districts: [],
      title: "집에서 듣는 파크골프 규칙 온라인 강좌",
      body: "스코어카드 작성, 벌타, 경기 진행 규칙을 영상 수업으로 배웁니다.",
      deadline: deadline(17), contact: "온라인 강좌 담당 (시연용 문의)",
    },
  ];

  return items.map((post, index) => ({ ...defaults, districts: [...defaults.districts], ...post, createdAt: now - (index + 1) * day }));
}

export function demoPlacements(now: number): Placement[] {
  const active = [
    ["lodge-main", "lodge", "home.rail_left.01"],
    ["lodge-list", "lodge", "community.top.01"],
    ["screen-banner", "screen", "courses.top.01"],
    ["product-banner", "equipment", "market.list_top.01"],
    ["travel-banner", "travel", "home.rail_right.short.01"],
    ["event-banner", "tournament", "events.top.01"],
    ["lesson-banner", "lesson", "certification.top.01"],
  ];
  return [
    ...active.map(([id, postId, slotCode]) => ({ id, postId, slotCode, startsAt: now - day, endsAt: now + 13 * day, paused: false })),
    { id: "future", postId: "guesthouse", slotCode: "community.after_posts.01", startsAt: now + day, endsAt: now + 15 * day, paused: false },
    { id: "past", postId: "city-stay", slotCode: "clubs.top.01", startsAt: now - 15 * day, endsAt: now - day, paused: false },
  ];
}
