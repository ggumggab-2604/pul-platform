export type CommunityCategory =
  | "free"
  | "question"
  | "review"
  | "equipment"
  | "course"
  | "club"
  | "lostFound"
  | "marketReview"
  | "notice";

export type CommunityCategoryFilter = "all" | CommunityCategory;

export type CommunityPostStatus = "published" | "checking" | "hidden" | "resolved";

export type CommunityRelatedMenu =
  | "community"
  | "courses"
  | "clubs"
  | "lessons"
  | "licenseReferee"
  | "market"
  | "events"
  | "news";

export type CommunityPost = {
  id: string;
  title: string;
  category: CommunityCategory;
  summary: string;
  authorNickname: string;
  createdAt: string;
  viewCount: number;
  commentCount: number;
  likeCount: number;
  isNew: boolean;
  isPinned: boolean;
  isPopular?: boolean;
  status: CommunityPostStatus;
  relatedMenu: CommunityRelatedMenu;
  tags?: string[];
};

export type QuestionType =
  | "beginner"
  | "rule"
  | "equipment"
  | "courseUse"
  | "reservation"
  | "club"
  | "license"
  | "etc";

export type QuestionResolveStatus =
  | "waiting"
  | "answered"
  | "resolved"
  | "needsAdmin";

export type CommunityQuestion = {
  id: string;
  title: string;
  questionType: QuestionType;
  answerCount: number;
  resolveStatus: QuestionResolveStatus;
  createdAt: string;
};

export type ReviewType =
  | "course"
  | "lesson"
  | "equipment"
  | "club"
  | "event"
  | "market";

export type CommunityReview = {
  id: string;
  title: string;
  reviewType: ReviewType;
  rating: number;
  summary: string;
  authorNickname: string;
  createdAt: string;
};

export type LostFoundKind = "lost" | "found";
export type LostFoundStatus = "searching" | "holding" | "resolved" | "needsAdmin";

export type CommunityLostFound = {
  id: string;
  kind: LostFoundKind;
  itemName: string;
  place: string;
  date: string;
  status: LostFoundStatus;
  contactHint: string;
};

export type NoticeType = "required" | "operation" | "update" | "event" | "report";

export type CommunityNotice = {
  id: string;
  title: string;
  noticeType: NoticeType;
  createdAt: string;
  isPinned: boolean;
};

export type CommunityMenuLink = {
  id: string;
  title: string;
  description: string;
  buttonLabel: string;
  href: string;
};

export const COMMUNITY_PAGE_COPY = {
  title: "PUL 커뮤니티",
  description:
    "회원이 직접 올리는 자유게시판, 질문답변, 이용 후기, 규정 Q&A, 동호회 이야기를 나누는 공간입니다.",
  subDescription:
    "운영자 공지·정책·행사 소식은 뉴스·정보 메뉴에서 확인하세요. 커뮤니티는 회원 참여 글 중심입니다.",
  guideTitle: "커뮤니티는 이런 공간입니다",
  guideDescription:
    "PUL 커뮤니티는 파크골프를 즐기는 회원들이 서로 정보를 나누고 도움을 주고받는 공간입니다.\n정확한 구장 운영 정보, 대회 일정, 자격증 정보, 거래 조건 등은 반드시 공식 안내와 당사자 확인을 함께 해주세요.",
  guideItems: [
    "서로 존중하는 말투를 사용해주세요.",
    "광고성 글은 운영자 확인 후 제한될 수 있습니다.",
    "거래 관련 글은 장터 메뉴를 이용해주세요.",
    "구장별 자세한 이야기는 골프장 상세 페이지의 이야기방과 연결될 수 있습니다.",
    "동호회 내부 공지는 각 동호회 게시판에서 운영될 수 있습니다.",
  ],
  writeSectionTitle: "커뮤니티에 글을 남겨보세요",
  writeSectionDescription:
    "질문 하나, 후기 하나가 다른 회원에게 큰 도움이 될 수 있습니다.\n처음 시작하는 회원에게는 작은 경험담도 좋은 정보가 됩니다.",
  disclaimer:
    "PUL 커뮤니티는 회원 간 정보 공유와 소통을 돕기 위한 공간입니다.\n게시글의 내용은 작성자의 경험과 의견일 수 있으며, 구장 운영, 예약, 대회 일정, 자격증, 거래 조건, 상품 정보 등은 반드시 공식 기관, 지자체, 협회, 업체, 당사자에게 직접 확인해주세요.\n비방, 욕설, 허위 정보, 사기 의심 글, 개인정보 노출, 반복 광고성 글은 운영 기준에 따라 숨김 또는 삭제될 수 있습니다.",
} as const;

export const LATEST_POST_PC_PREVIEW = 6;
export const LATEST_POST_MOBILE_PREVIEW = 3;
export const POPULAR_POST_PC_PREVIEW = 3;
export const POPULAR_POST_MOBILE_PREVIEW = 5;
export const QUESTION_PC_PREVIEW = 4;
export const QUESTION_MOBILE_PREVIEW = 2;
export const PENDING_QUESTION_PC_PREVIEW = 3;
export const PENDING_QUESTION_MOBILE_PREVIEW = 3;
export const REVIEW_PC_PREVIEW = 3;
export const REVIEW_MOBILE_PREVIEW = 3;
export const LOST_FOUND_PC_PREVIEW = 3;
export const LOST_FOUND_MOBILE_PREVIEW = 2;
export const NOTICE_PC_PREVIEW = 3;
export const NOTICE_MOBILE_PREVIEW = 2;
export const MENU_LINK_PC_PREVIEW = 5;
export const MENU_LINK_MOBILE_PREVIEW = 3;

/** 모바일 게시판 바로가기 (기존 카테고리·메뉴 경로 재사용) */
export const communityBoardShortcuts: {
  id: string;
  label: string;
  category?: CommunityCategoryFilter;
  href?: string;
  scrollTarget?: string;
}[] = [
  { id: "free", label: "자유게시판", category: "free", scrollTarget: "section-latest" },
  { id: "question", label: "질문·답변", category: "question", scrollTarget: "section-questions" },
  { id: "equipment", label: "장비 후기", category: "equipment", scrollTarget: "section-reviews" },
  { id: "course", label: "골프장 후기", category: "course", scrollTarget: "section-reviews" },
  { id: "club", label: "대회·동호회 후기", category: "club", scrollTarget: "section-reviews" },
  { id: "license", label: "자격증·시험", href: "/certification" },
  { id: "report", label: "건의·신고", scrollTarget: "section-notices" },
];

export const communityCategoryTabs: {
  id: CommunityCategoryFilter;
  label: string;
}[] = [
  { id: "all", label: "전체" },
  { id: "free", label: "자유게시판" },
  { id: "question", label: "질문·답변" },
  { id: "review", label: "이용 후기" },
  { id: "equipment", label: "장비 이야기" },
  { id: "course", label: "구장 이야기" },
  { id: "club", label: "동호회 이야기" },
  { id: "lostFound", label: "분실·습득" },
  { id: "marketReview", label: "중고거래 후기" },
];

export const communityCategoryLabels: Record<CommunityCategory, string> = {
  free: "자유게시판",
  question: "질문·답변",
  review: "파크골프 후기",
  equipment: "장비 이야기",
  course: "구장 이야기",
  club: "동호회 이야기",
  lostFound: "분실·습득",
  marketReview: "중고거래 후기",
  notice: "운영자 공지",
};

export const questionTypeLabels: Record<QuestionType, string> = {
  beginner: "초보 질문",
  rule: "룰 질문",
  equipment: "장비 질문",
  courseUse: "구장 이용",
  reservation: "예약",
  club: "동호회",
  license: "자격증",
  etc: "기타",
};

export const questionResolveLabels: Record<QuestionResolveStatus, string> = {
  waiting: "답변 대기",
  answered: "답변 있음",
  resolved: "해결됨",
  needsAdmin: "운영자 확인 필요",
};

export const reviewTypeLabels: Record<ReviewType, string> = {
  course: "구장 후기",
  lesson: "레슨 후기",
  equipment: "장비 후기",
  club: "동호회 후기",
  event: "대회 후기",
  market: "중고거래 후기",
};

export const lostFoundKindLabels: Record<LostFoundKind, string> = {
  lost: "분실",
  found: "습득",
};

export const lostFoundStatusLabels: Record<LostFoundStatus, string> = {
  searching: "찾는 중",
  holding: "보관 중",
  resolved: "해결됨",
  needsAdmin: "운영자 확인 필요",
};

export const noticeTypeLabels: Record<NoticeType, string> = {
  required: "필독",
  operation: "운영 안내",
  update: "업데이트",
  event: "이벤트",
  report: "신고 안내",
};

export const communityPosts: CommunityPost[] = [
  {
    id: "post-1",
    title: "처음 파크골프장 갈 때 혼자 가도 괜찮을까요?",
    category: "question",
    summary: "동호회 가입 전 혼자 이용 가능한지 궁금해하는 초보 회원의 질문입니다.",
    authorNickname: "초보골퍼A",
    createdAt: "2026-03-08",
    viewCount: 412,
    commentCount: 18,
    likeCount: 32,
    isNew: true,
    isPinned: false,
    isPopular: true,
    status: "published",
    relatedMenu: "community",
    tags: ["초보", "혼자이용"],
  },
  {
    id: "post-2",
    title: "초보자가 중고채 살 때 꼭 봐야 할 부분",
    category: "equipment",
    summary: "그립, 헤드 상태, 길이, 공인 여부를 확인하는 방법을 공유합니다.",
    authorNickname: "장비덕후",
    createdAt: "2026-03-07",
    viewCount: 356,
    commentCount: 14,
    likeCount: 41,
    isNew: true,
    isPinned: false,
    isPopular: true,
    status: "published",
    relatedMenu: "market",
  },
  {
    id: "post-3",
    title: "주말 오전 예약이 어려운 구장은 어떻게 이용하시나요?",
    category: "course",
    summary: "지역별 예약 팁과 현장 접수 경험을 나누는 글입니다.",
    authorNickname: "새벽티샷",
    createdAt: "2026-03-06",
    viewCount: 298,
    commentCount: 22,
    likeCount: 27,
    isNew: false,
    isPinned: false,
    isPopular: true,
    status: "published",
    relatedMenu: "courses",
  },
  {
    id: "post-4",
    title: "오늘도 라운드 다녀왔습니다",
    category: "free",
    summary: "날씨 좋은 날 파크골프 라운드 느낌을 가볍게 나눕니다.",
    authorNickname: "파크러버",
    createdAt: "2026-03-08",
    viewCount: 88,
    commentCount: 5,
    likeCount: 9,
    isNew: true,
    isPinned: false,
    status: "published",
    relatedMenu: "community",
  },
  {
    id: "post-5",
    title: "첫 18홀 후기 — 생각보다 더 재밌었어요",
    category: "review",
    summary: "처음 배운 지 한 달 만에 완주한 소감과 준비 팁을 정리했습니다.",
    authorNickname: "만학도B",
    createdAt: "2026-03-05",
    viewCount: 210,
    commentCount: 11,
    likeCount: 19,
    isNew: false,
    isPinned: false,
    status: "published",
    relatedMenu: "community",
  },
  {
    id: "post-6",
    title: "우리 동네 동호회 월례회 분위기 공유",
    category: "club",
    summary: "첫 가입 월례회 후기와 신입 환영 방식이 궁금한 분께 도움이 될 수 있습니다.",
    authorNickname: "동호회원C",
    createdAt: "2026-03-04",
    viewCount: 167,
    commentCount: 8,
    likeCount: 15,
    isNew: false,
    isPinned: false,
    status: "published",
    relatedMenu: "clubs",
  },
  {
    id: "post-7",
    title: "검정색 파크골프 장갑 분실했습니다",
    category: "lostFound",
    summary: "○○파크골프장 근처에서 분실했습니다. 목격하신 분 댓글 부탁드립니다.",
    authorNickname: "장갑주인",
    createdAt: "2026-03-03",
    viewCount: 94,
    commentCount: 3,
    likeCount: 2,
    isNew: false,
    isPinned: false,
    status: "published",
    relatedMenu: "courses",
  },
  {
    id: "post-8",
    title: "중고채 거래 후기 — 친절한 판매자였어요",
    category: "marketReview",
    summary: "장터에서 만난 거래 경험을 공유합니다. 개인 거래 시 주의점도 적었습니다.",
    authorNickname: "안심거래",
    createdAt: "2026-03-02",
    viewCount: 143,
    commentCount: 6,
    likeCount: 12,
    isNew: false,
    isPinned: false,
    status: "published",
    relatedMenu: "market",
  },
  {
    id: "post-9",
    title: "커뮤니티 이용 기본 안내",
    category: "notice",
    summary: "게시판 이용 시 꼭 알아두실 기본 운영 기준을 안내합니다.",
    authorNickname: "PUL운영자",
    createdAt: "2026-02-20",
    viewCount: 520,
    commentCount: 2,
    likeCount: 45,
    isNew: false,
    isPinned: true,
    status: "published",
    relatedMenu: "community",
  },
  {
    id: "post-10",
    title: "공인 골프채 확인 방법 궁금합니다",
    category: "question",
    summary: "중고 장터 구매 전에 공인 여부를 어떻게 확인하는지 질문입니다.",
    authorNickname: "확인중",
    createdAt: "2026-03-01",
    viewCount: 131,
    commentCount: 9,
    likeCount: 7,
    isNew: false,
    isPinned: false,
    status: "published",
    relatedMenu: "market",
  },
];

export const communityPendingQuestions: CommunityQuestion[] = [
  {
    id: "q-pending-1",
    title: "파크골프채 길이는 키에 맞춰 골라야 하나요?",
    questionType: "equipment",
    answerCount: 0,
    resolveStatus: "waiting",
    createdAt: "2026-03-08",
  },
  {
    id: "q-pending-2",
    title: "초보자는 어떤 공을 쓰는 게 좋을까요?",
    questionType: "beginner",
    answerCount: 1,
    resolveStatus: "waiting",
    createdAt: "2026-03-07",
  },
  {
    id: "q-pending-3",
    title: "동호회 가입 전에 혼자 라운드해도 괜찮을까요?",
    questionType: "club",
    answerCount: 2,
    resolveStatus: "waiting",
    createdAt: "2026-03-06",
  },
];

export const communityQuestions: CommunityQuestion[] = [
  {
    id: "q-1",
    title: "파크골프채는 처음부터 새 제품을 사야 할까요?",
    questionType: "equipment",
    answerCount: 7,
    resolveStatus: "answered",
    createdAt: "2026-03-07",
  },
  {
    id: "q-2",
    title: "공이 물웅덩이에 들어가면 어떻게 해야 하나요?",
    questionType: "rule",
    answerCount: 4,
    resolveStatus: "resolved",
    createdAt: "2026-03-06",
  },
  {
    id: "q-3",
    title: "동호회 가입은 어디서 알아보나요?",
    questionType: "club",
    answerCount: 5,
    resolveStatus: "answered",
    createdAt: "2026-03-05",
  },
  {
    id: "q-4",
    title: "구장 예약은 보통 며칠 전에 해야 하나요?",
    questionType: "reservation",
    answerCount: 0,
    resolveStatus: "waiting",
    createdAt: "2026-03-08",
  },
];

/** 카테고리 클릭 시 스크롤할 섹션 (없으면 최신 글 영역) */
export const categoryScrollTargets: Partial<Record<CommunityCategoryFilter, string>> = {
  question: "section-questions",
  review: "section-reviews",
  lostFound: "section-lost-found",
  notice: "section-notices",
};

export const communityReviews: CommunityReview[] = [
  {
    id: "rv-1",
    title: "○○파크골프장 이용 후기",
    reviewType: "course",
    rating: 4,
    summary: "초보자도 걷기에 편하고 안내가 친절했습니다.",
    authorNickname: "라운드러버",
    createdAt: "2026-03-06",
  },
  {
    id: "rv-2",
    title: "입문 레슨 3회 수강 후기",
    reviewType: "lesson",
    rating: 5,
    summary: "기본 자세부터 차근히 알려주셔서 혼자 연습이 가능해졌습니다.",
    authorNickname: "레슨준비생",
    createdAt: "2026-03-04",
  },
  {
    id: "rv-3",
    title: "중고채 구매 사용 후기",
    reviewType: "equipment",
    rating: 4,
    summary: "상태 설명이 정확했고, 초보용으로 부담 없이 시작했습니다.",
    authorNickname: "알뜰구매",
    createdAt: "2026-03-02",
  },
];

export const communityLostFoundItems: CommunityLostFound[] = [
  {
    id: "lf-1",
    kind: "lost",
    itemName: "검정색 파크골프 장갑",
    place: "○○파크골프장",
    date: "2026-03-03",
    status: "searching",
    contactHint: "댓글 또는 운영자 문의",
  },
  {
    id: "lf-2",
    kind: "found",
    itemName: "볼마커",
    place: "△△파크골프장 3번 홀 근처",
    date: "2026-03-02",
    status: "holding",
    contactHint: "댓글 또는 운영자 문의",
  },
  {
    id: "lf-3",
    kind: "lost",
    itemName: "파크골프공 2개",
    place: "□□구장",
    date: "2026-03-01",
    status: "needsAdmin",
    contactHint: "댓글 또는 운영자 문의",
  },
];

export const communityNotices: CommunityNotice[] = [
  {
    id: "nt-1",
    title: "커뮤니티 이용 기본 안내",
    noticeType: "required",
    createdAt: "2026-02-20",
    isPinned: true,
  },
  {
    id: "nt-2",
    title: "광고성 글과 반복 홍보글 운영 기준",
    noticeType: "operation",
    createdAt: "2026-02-22",
    isPinned: true,
  },
  {
    id: "nt-3",
    title: "안전한 중고거래를 위한 안내",
    noticeType: "report",
    createdAt: "2026-02-25",
    isPinned: false,
  },
  {
    id: "nt-4",
    title: "분실·습득 게시글 작성 방법",
    noticeType: "update",
    createdAt: "2026-03-01",
    isPinned: false,
  },
];

export const communityMenuLinks: CommunityMenuLink[] = [
  {
    id: "link-course",
    title: "구장 이야기방",
    description:
      "각 파크골프장 상세 페이지에서 구장별 이야기, 분실·습득, 카풀, 구장 상태를 확인할 수 있습니다.",
    buttonLabel: "골프장 찾기",
    href: "/courses",
  },
  {
    id: "link-club",
    title: "동호회 게시판",
    description: "동호회별 공지, 자유게시판, 월례회 안내를 확인할 수 있습니다.",
    buttonLabel: "동호회 보기",
    href: "/clubs",
  },
  {
    id: "link-license",
    title: "자격증 시험 준비 이야기방",
    description: "필기, 실기, 구술, 연수 관련 질문과 후기를 나눌 수 있습니다.",
    buttonLabel: "자격증·심판 보기",
    href: "/certification",
  },
  {
    id: "link-university",
    title: "대학·학과 게시판",
    description: "파크골프 관련 대학·학과별 게시판과 학과 활동 글을 확인할 수 있습니다.",
    buttonLabel: "대학·학과 보기",
    href: "/lessons",
  },
  {
    id: "link-market",
    title: "장터 후기",
    description: "중고거래 후기, 거래 주의사항, 업체 제품 후기를 공유할 수 있습니다.",
    buttonLabel: "장터 보기",
    href: "/market",
  },
];

export function filterCommunityPosts(
  posts: CommunityPost[],
  filter: CommunityCategoryFilter,
) {
  if (filter === "all") return posts;
  return posts.filter((post) => post.category === filter);
}

export function getPopularPosts(
  filter: CommunityCategoryFilter,
  limit = POPULAR_POST_PC_PREVIEW,
) {
  const filtered = filterCommunityPosts(communityPosts, filter);
  const popular = filtered.filter((post) => post.isPopular);
  if (popular.length >= limit) return popular.slice(0, limit);
  const popularIds = new Set(popular.map((post) => post.id));
  const fillers = [...filtered]
    .filter((post) => !popularIds.has(post.id))
    .sort((a, b) => b.viewCount - a.viewCount);
  return [...popular, ...fillers].slice(0, limit);
}

export type CommunitySortOrder = "latest" | "comments" | "views" | "likes";

export function sortCommunityPosts(
  posts: CommunityPost[],
  sortOrder: CommunitySortOrder,
) {
  const sorted = [...posts];
  if (sortOrder === "comments") {
    return sorted.sort((a, b) => b.commentCount - a.commentCount);
  }
  if (sortOrder === "views") {
    return sorted.sort((a, b) => b.viewCount - a.viewCount);
  }
  if (sortOrder === "likes") {
    return sorted.sort((a, b) => b.likeCount - a.likeCount);
  }
  return sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
