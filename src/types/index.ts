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
  temperature: number;
  condition: string;
  fineDust: string;
  forecast: { label: string; temp: number }[];
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

export type HallOfFameTab = "holeInOne" | "bestScore" | "winner";

export type HallOfFamePerson = {
  id: string;
  name: string;
  achievement: string;
  tab: HallOfFameTab;
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
  leaderName: string;
  feeInfo: string;
  joinConditions: string;
  beginnerGuide: string;
  mainActivities: string[];
  meetingInfo: string;
  notices: string[];
  contactMethod: string;
  recentEvent: string;
  nextMonthlyMeeting: string;
  eventStatus: ClubEventStatus;
  featured?: boolean;
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
