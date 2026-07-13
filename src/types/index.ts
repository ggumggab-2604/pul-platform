export type NavItem = {
  label: string;
  href: string;
  icon: string;
};

export type MobileNavItem = {
  label: string;
  href: string;
  icon: string;
};

export type AdBannerData = {
  id: string;
  badge?: string;
  title: string;
  subtitle?: string;
  discount?: string;
  cta: string;
  variant: "club" | "ball" | "apparel" | "shoes" | "academy" | "uv";
};

export type QuickMenuItem = {
  label: string;
  href: string;
  icon: string;
};

export type LiveNewsItem = {
  id: string;
  title: string;
  badge: string;
  badgeColor: string;
  time: string;
};

export type WeatherData = {
  location: string;
  /** 예: 관심 지역 · 예시 데이터 */
  locationNote?: string;
  temperature: number;
  condition: string;
  fineDust: string;
  rainChance?: string;
  wind?: string;
  forecast: { label: string; temp: number }[];
  detailHref?: string;
};

export type ClubItem = {
  id: string;
  name: string;
  location: string;
  members: number;
  tag: string;
};

export type FeaturedEvent = {
  title: string;
  date: string;
  location: string;
  cta: string;
};

export type EventScheduleItem = {
  id: string;
  date: string;
  title: string;
};

/** 메인 명예의 전당 기록 종류 (bestScore/winner는 모바일 기존 UI용) */
export type HallOfFameTab =
  | "holeInOne"
  | "albatross"
  | "condor"
  | "clubWinner"
  | "tournamentWinner"
  | "bestScore"
  | "winner";

export type HallOfFamePerson = {
  id: string;
  /** 회원명 또는 우승자명 */
  name: string;
  tab: HallOfFameTab;
  /** 한 줄 요약(하위 호환·보조 표시) */
  achievement?: string;
  recordLabel?: string;
  courseName?: string;
  holeInfo?: string;
  date?: string;
  clubName?: string;
  /** 동호회 우승: 대회·월례회명 */
  eventName?: string;
  /** 대회 우승: 대회명 */
  tournamentName?: string;
};

/** PC 포털 명예의 전당 — 특별 기록 */
export type SpecialRecordType = "holeInOne" | "albatross" | "condor";

export type SpecialRecord = {
  id: string;
  type: SpecialRecordType;
  memberName: string;
  courseName: string;
  hole: string;
  recordDate?: string;
  clubName?: string;
  profileImage?: string;
};

/** PC 포털 명예의 전당 — 동호회 최저타수 */
export type ClubBestScore = {
  id: string;
  memberName: string;
  score: number;
  clubName: string;
  courseName: string;
  recordMonth: string;
  profileImage?: string;
};

/** PC 포털 명예의 전당 — 대회 우승자 */
export type TournamentWinner = {
  id: string;
  winnerName: string;
  tournamentName: string;
  clubName?: string;
  courseName?: string;
  winDate: string;
  profileImage?: string;
};

export type HallOfFamePortalData = {
  specialRecords: SpecialRecord[];
  clubBestScores: ClubBestScore[];
  tournamentWinners: TournamentWinner[];
};

export type EducationCardItem = {
  id: string;
  title: string;
  href: string;
  icon: string;
};

export type FeatureBannerItem = {
  id: string;
  title: string;
  description: string;
  href: string;
  variant: "course" | "equipment" | "community";
};

export type PopularPost = {
  id: string;
  rank: number;
  title: string;
  views: number;
};

export type NewsItem = {
  id: string;
  title: string;
  category: string;
};

export type RecommendedClub = {
  id: string;
  name: string;
  location: string;
  members: number;
};

export type MarketItem = {
  id: string;
  name: string;
  price: number;
};

export type MembershipBenefit = {
  icon: string;
  label: string;
};

export type GolfCourse = {
  id: string;
  name: string;
  region: string;
  district: string;
  address: string;
  holes: number;
  operatingHours: string;
  phone: string;
  tags: string[];
  reservable: boolean;
  featured?: boolean;
  description?: string;
  lat?: number;
  lng?: number;
};

export type MarketCategory =
  | "club"
  | "ball"
  | "bag"
  | "apparel"
  | "shoes"
  | "practice"
  | "other"
  | "startupResale"
  | "facilityDevelopment";

export type MarketCondition = "likeNew" | "lightUse" | "normal" | "needsRepair";

export type MarketTradeType = "direct" | "delivery" | "negotiable";

export type MarketSaleStatus = "selling" | "reserved" | "sold";

export type MarketSellerType =
  | "personal"
  | "business"
  | "verified_business"
  | "official_brand"
  | "startupResale";

export type MarketStartupCategory =
  | "screenStartup"
  | "screenResale"
  | "screenSystem"
  | "fieldCourseDevelopment"
  | "idleLandUse"
  | "constructionFacility"
  | "facilityVendor";

export type MarketStartupStatus =
  | "available"
  | "promo"
  | "resaleConsult"
  | "preparing"
  | "checking";

export type MarketStartupSellerType = "consultant" | "facilityVendor" | "business";

export type MarketStartupResaleItem = {
  id: string;
  title: string;
  itemType: "startupResale";
  category: MarketStartupCategory;
  transactionType: "startupResale";
  region: string;
  scaleLabel: string;
  consultationType: string;
  priceLabel: string;
  summary: string;
  status: MarketStartupStatus;
  sellerType: MarketStartupSellerType;
  featured?: boolean;
  tags?: string[];
};

export type StartupBoardCategory =
  | "screenStartup"
  | "screenResale"
  | "fieldCourseDevelopment"
  | "idleLandUse"
  | "constructionFacility"
  | "vendorAnswer";

export type StartupBoardCategoryFilter = "all" | StartupBoardCategory;

export type StartupBoardConsultationType =
  | "startupInquiry"
  | "resaleInquiry"
  | "transfer"
  | "courseDevelopment"
  | "idleLandUse"
  | "facilityConsulting"
  | "vendorAnswer";

export type StartupBoardAuthorType =
  | "prospectiveFounder"
  | "storeOwner"
  | "landOwner"
  | "screenVendor"
  | "facilityVendor"
  | "constructionVendor"
  | "pulAdmin";

export type StartupBoardStatus =
  | "waitingAnswer"
  | "vendorAnswered"
  | "consultationAvailable"
  | "resaleConsulting"
  | "needCheck"
  | "completed";

export type StartupBoardPost = {
  id: string;
  title: string;
  category: StartupBoardCategory;
  region: string;
  desiredScale: string;
  consultationType: StartupBoardConsultationType;
  authorType: StartupBoardAuthorType;
  answerCount: number;
  viewCount: number;
  createdAt: string;
  status: StartupBoardStatus;
  summary: string;
  tags?: string[];
};

export type MarketListing = {
  id: string;
  name: string;
  category: MarketCategory;
  sellerType: MarketSellerType;
  price: number;
  region: string;
  condition: MarketCondition;
  tradeType: MarketTradeType;
  saleStatus: MarketSaleStatus;
  description: string;
  sellerNickname: string;
  createdAt: string;
  image: string;
  featured?: boolean;
  /** 운영 준비용 샘플 매물 여부 */
  isSample?: boolean;
};

export type MarketBuyRequest = {
  id: string;
  title: string;
  category: MarketCategory;
  region: string;
  budget: string;
  summary: string;
  authorNickname: string;
  createdAt: string;
  isSample?: boolean;
};

export type ClubProvince =
  | "서울"
  | "경기"
  | "인천"
  | "충북"
  | "충남"
  | "강원"
  | "전북"
  | "전남"
  | "경북"
  | "경남"
  | "부산"
  | "대구"
  | "광주"
  | "대전"
  | "울산"
  | "제주";

export type ClubBannerType = "local" | "province" | "default";

export type ClubPartnerBannerItem = {
  id: string;
  title: string;
  description: string;
  bannerType: ClubBannerType;
  province: string;
  district?: string;
  category: string;
  ctaText: string;
};

export type ClubRecruitStatus = "recruiting" | "waiting" | "closed";

export type ClubScheduleType = "weekday" | "weekend" | "both";

export type ClubMemberStyle =
  | "beginner"
  | "women"
  | "senior"
  | "family"
  | "competition";

export type ClubEventStatus =
  | "monthlyMeeting"
  | "regularRound"
  | "friendlyMatch"
  | "memberEvent"
  | "none";

export type ClubEventType =
  | "monthlyMeeting"
  | "friendlyMatch"
  | "regularRound"
  | "memberEvent"
  | "casualRound";

export type ClubEventRecruitmentStatus =
  | "open"
  | "membersOnly"
  | "inquiryNeeded"
  | "closed"
  | "needCheck";

export type ClubEvent = {
  id: string;
  title: string;
  eventType: ClubEventType;
  clubName: string;
  region: string;
  courseName: string;
  dateText: string;
  participationCondition: string;
  recruitmentStatus: ClubEventRecruitmentStatus;
  summary: string;
  relatedClubId: string;
  tags?: string[];
};

export type ParkGolfClub = {
  id: string;
  name: string;
  province: ClubProvince;
  district: string;
  regionLabel: string;
  homeCourse: string;
  homeCourseId: string;
  memberCount: number;
  schedule: ClubScheduleType;
  scheduleLabel: string;
  time: string;
  recruitStatus: ClubRecruitStatus;
  beginnerFriendly: boolean;
  memberStyles: ClubMemberStyle[];
  tags: string[];
  description: string;
  detailSummary?: string;
  leaderName: string;
  feeInfo: string;
  joinConditions: string;
  beginnerGuide: string;
  mainActivities: string[];
  activityAtmosphere?: string[];
  meetingInfo: string;
  notices: string[];
  contactMethod: string;
  recentEvent: string;
  nextMonthlyMeeting: string;
  eventStatus: ClubEventStatus;
  featured?: boolean;
};

export type ClubDetailNotice = {
  id: string;
  title: string;
  date?: string;
  important?: boolean;
};

export type ClubDetailPost = {
  id: string;
  relatedClubId: string;
  title: string;
  postType:
    | "general"
    | "flashMeeting"
    | "companion"
    | "question"
    | "roundReview"
    | "eventReview"
    | "information";
  createdAt?: string;
  startsAt?: string;
  endsAt?: string;
  linkedCourseId?: string;
  courseName?: string;
  location?: string;
  authorName?: string;
  authorRole: "clubAdmin" | "clubManager" | "member";
  capacity?: number;
  participantCount?: number;
  participantTarget?: string;
  recruitmentStatus?: "recruiting" | "full" | "closed" | "completed" | "cancelled";
  summary?: string;
  visibility: "public" | "clubMembers";
  moderationStatus: "visible" | "review" | "hidden";
};

export type ClubActivityPhoto = {
  id: string;
  src: string;
  alt: string;
};

export type ClubRecentActivity = {
  id: string;
  title: string;
  date?: string;
  summary?: string;
};

export type ClubContactInfo = {
  role?: string;
  name?: string;
  availableTime?: string;
  method: string;
  region: string;
};

export type ClubOfficialEventType =
  | "monthlyMeeting"
  | "clubTournament"
  | "screenTournament"
  | "friendlyMatch"
  | "outing"
  | "yearEndParty"
  | "newYearEvent"
  | "generalMeeting"
  | "training"
  | "other";

export type ClubOfficialEventStatus =
  | "draft"
  | "scheduled"
  | "registrationOpen"
  | "registrationClosed"
  | "completed"
  | "cancelled";

export type ClubOfficialEventAuthorRole = "clubAdmin" | "clubManager";

export type ClubOfficialEventReservationMethod =
  | "individualSynchronized"
  | "clubGroupBooking"
  | "walkIn"
  | "noReservation"
  | "checking";

export type ClubOfficialParticipationStatus =
  | "upcoming"
  | "open"
  | "closed"
  | "completed"
  | "cancelled";

export type ClubEventApplicationStatus =
  | "applied"
  | "cancelled"
  | "waitlisted"
  | "confirmed"
  | "rejected";

export type ClubEventReservationStatus =
  | "notRequired"
  | "pending"
  | "completed"
  | "failed"
  | "needsReview";

export type ClubEventParticipantVisibility =
  | "countOnly"
  | "membersMasked"
  | "staffOnly";

export type ClubEventViewerAuthentication =
  | "unavailable"
  | "anonymous"
  | "authenticated";

export type ClubEventViewerRole =
  | "unknown"
  | "nonMember"
  | "member"
  | "manager"
  | "admin";

export type ClubOfficialEventParticipation = {
  eventId: string;
  memberId: string;
  applicationStatus: ClubEventApplicationStatus;
  reservationStatus: ClubEventReservationStatus;
  appliedAt: string;
  cancelledAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  note?: string;
  createdAt?: string;
  updatedAt?: string;
  statusChangedAt?: string;
  statusChangedBy?: string;
  notificationSentAt?: string;
  reminderSentAt?: string;
  auditNote?: string;
};

export type ClubEventParticipantPreview = {
  memberId: string;
  maskedName?: string;
  publicNickname?: string;
};

export type ClubEventParticipationContext = {
  featureAvailability: "preparing" | "available";
  authenticationStatus: ClubEventViewerAuthentication;
  viewerRole: ClubEventViewerRole;
  memberId?: string;
  myApplication?: ClubOfficialEventParticipation;
  participantPreviews?: ClubEventParticipantPreview[];
  canManageParticipants: boolean;
};

export type ClubJoinInquiryStatus =
  | "received"
  | "reviewing"
  | "replied"
  | "approved"
  | "onHold"
  | "rejected"
  | "withdrawn";

export type ClubJoinInquiryExperience =
  | "beginner"
  | "underOneYear"
  | "oneToThreeYears"
  | "overThreeYears";

export type ClubJoinInquiryAvailableDay =
  | "weekday"
  | "weekend"
  | "both"
  | "flexible";

export type ClubJoinInquiryInterest =
  | "regularRound"
  | "friendlyMatch"
  | "screenPractice"
  | "beginnerEducation"
  | "clubEvent";

export type ClubJoinInquiryAuditStatus =
  | "pending"
  | "verified"
  | "needsReview";

export type ClubJoinInquiryViewerRole =
  | "unknown"
  | "prospectiveMember"
  | "member"
  | "manager"
  | "admin";

export type ClubJoinInquiryFormData = {
  experience: ClubJoinInquiryExperience;
  availableDays: ClubJoinInquiryAvailableDay[];
  interests: ClubJoinInquiryInterest[];
  message: string;
};

/** 가입 문의는 공개 게시물이 아니며 신청자·인증 운영진·관리자만 조회합니다. */
export type ClubJoinInquiry = ClubJoinInquiryFormData & {
  inquiryId: string;
  clubId: string;
  applicantId: string;
  status: ClubJoinInquiryStatus;
  assignedOperatorId?: string;
  submittedAt: string;
  reviewedAt?: string;
  repliedAt?: string;
  completedAt?: string;
  withdrawnAt?: string;
  lastUpdatedAt: string;
  internalNote?: string;
  auditStatus: ClubJoinInquiryAuditStatus;
};

/** 신청자 화면에 전달 가능한 최소 가입 문의 상태. 운영자 내부 정보는 포함하지 않습니다. */
export type ClubJoinInquiryApplicantView = Pick<
  ClubJoinInquiry,
  | "inquiryId"
  | "clubId"
  | "applicantId"
  | "status"
  | "submittedAt"
  | "withdrawnAt"
  | "lastUpdatedAt"
>;

export type ClubJoinInquiryContext = {
  featureAvailability: "preparing" | "available";
  authenticationStatus: ClubEventViewerAuthentication;
  viewerRole: ClubJoinInquiryViewerRole;
  applicantId?: string;
  applicantDisplayName?: string;
  activeInquiry?: ClubJoinInquiryApplicantView;
  canSubmit: boolean;
  canWithdraw: boolean;
  canManage: boolean;
};

/** 운영진이 등록하는 공식 일정. 회원 게시판 모집글과 분리해 관리합니다. */
export type ClubOfficialEvent = {
  id: string;
  relatedClubId: string;
  officialEventType: ClubOfficialEventType;
  officialEventStatus: ClubOfficialEventStatus;
  title: string;
  scheduledForLabel: string;
  scheduleDetail: string;
  startsAt?: string;
  endsAt?: string;
  applicationOpensAt?: string;
  applicationDeadline?: string;
  applicationDeadlineLabel?: string;
  cancellationDeadline?: string;
  reservationOpenAt?: string;
  reservationOpenLabel?: string;
  participationStatus: ClubOfficialParticipationStatus;
  participantVisibility: ClubEventParticipantVisibility;
  capacity?: number;
  participantCount?: number;
  participantIds?: string[];
  linkedCourseId?: string;
  location?: string;
  participantTarget?: string;
  fee?: string;
  reservationMethod: ClubOfficialEventReservationMethod;
  memberReservationGuidance?: string;
  postReservationGuidance?: string;
  organizerGuidance?: string;
  createdByRole: ClubOfficialEventAuthorRole;
  visibility: "public" | "clubMembers";
  moderationStatus: "visible" | "review" | "hidden";
  notificationEnabled?: boolean;
  lastVerifiedAt?: string;
};

export type ClubDetailData = {
  club: ParkGolfClub;
  officialEvents: ClubOfficialEvent[];
  participationContext: ClubEventParticipationContext;
  joinInquiryContext: ClubJoinInquiryContext;
  notices: ClubDetailNotice[];
  posts: ClubDetailPost[];
  photos: ClubActivityPhoto[];
  recentActivities: ClubRecentActivity[];
  contact: ClubContactInfo;
};

export type LessonType =
  | "beginner"
  | "improvement"
  | "group"
  | "certification"
  | "referee"
  | "instructor"
  | "online";

export type LessonRegion =
  | "서울"
  | "경기"
  | "인천"
  | "충청"
  | "강원"
  | "전라"
  | "경상"
  | "제주";

export type LessonFormat = "offline" | "online" | "field" | "group";

export type LessonTarget =
  | "absolute_beginner"
  | "golf_experienced"
  | "senior"
  | "club_member"
  | "cert_prep";

export type LessonScheduleTag =
  | "this_week"
  | "this_month"
  | "always"
  | "closing_soon";

export type LessonRecruitStatus = "recruiting" | "waiting" | "closed";

export type ParkGolfLesson = {
  id: string;
  title: string;
  type: LessonType;
  province: LessonRegion;
  district: string;
  regionLabel: string;
  location: string;
  instructor: string;
  organizer: string;
  target: LessonTarget[];
  schedule: string;
  scheduleTags: LessonScheduleTag[];
  time: string;
  price: string;
  format: LessonFormat;
  recruitStatus: LessonRecruitStatus;
  description: string;
  curriculum: string;
  supplies: string;
  notices: string[];
  contactMethod: string;
  featured?: boolean;
};

export type VideoLessonCategory =
  | "beginner_intro"
  | "basic_stance"
  | "swing"
  | "tee_shot"
  | "putting"
  | "approach"
  | "distance_control"
  | "direction"
  | "rules_manner"
  | "practical_strategy"
  | "equipment"
  | "club_reservation"
  | "tournament_prep"
  | "cert_referee"
  | "other";

export type VideoLessonLevel = "intro" | "beginner" | "intermediate" | "advanced";

export type VideoThumbnailType = "green" | "teal" | "emerald" | "forest";

export type VideoLesson = {
  id: string;
  title: string;
  category: VideoLessonCategory;
  channelName: string;
  instructorName: string;
  level: VideoLessonLevel;
  duration: string;
  description: string;
  youtubeUrl: string;
  thumbnailType: VideoThumbnailType;
  tags: string[];
};

export type YoutubePromotionType =
  | "editor_pick"
  | "popular_channel"
  | "paid_ad_ready";

export type FeaturedYoutubeInstructor = {
  id: string;
  channelName: string;
  instructorName: string;
  mainCategory: string;
  representativeVideoTitle: string;
  description: string;
  youtubeChannelUrl: string;
  youtubeVideoUrl: string;
  promotionType: YoutubePromotionType;
};
