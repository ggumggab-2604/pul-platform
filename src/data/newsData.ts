import type { NewsCategory, NewsPublicSection, NewsSourceType, PublicNewsArticle } from "@/lib/news/newsDirectory";

export const NEWS_PAGE_COPY = {
  title: "파크골프 뉴스·정보",
  disclaimer:
    "PUL 뉴스·정보는 파크골프 관련 소식과 홍보 정보를 쉽게 확인할 수 있도록 돕기 위한 정보 제공 영역입니다.\n신규 구장, 스크린 파크골프장, 대회 일정, 자격증 시험, 상품 정보, 업체 홍보 내용 등은 변경될 수 있으므로 반드시 공식 기관, 지자체, 협회, 업체의 최신 공지를 함께 확인해주세요.\nPUL은 각 소식의 결과, 참가 가능 여부, 자격 인정, 모집 여부, 상품 구매 결과, 업체 홍보 효과를 보증하지 않습니다.",
  inquiryNote:
    "소식 제보와 홍보 문의는 PUL 운영자가 확인한 뒤 게시 여부를 결정합니다.",
} as const;

export const publicSectionLabels: Record<NewsPublicSection, string> = {
  courseNews: "구장 소식",
  tournamentEvent: "대회·행사",
  notices: "공지·제도",
  screenEquipment: "스크린·장비",
  other: "기타 소식",
};

export const newsCategoryTabs = [
  { id: "all", label: "전체" },
  { id: "courseNews", label: publicSectionLabels.courseNews },
  { id: "tournamentEvent", label: publicSectionLabels.tournamentEvent },
  { id: "notices", label: publicSectionLabels.notices },
  { id: "screenEquipment", label: publicSectionLabels.screenEquipment },
] as const;

export const categoryLabels: Record<NewsCategory, string> = {
  parkGolfNews: "행사·대회 소식",
  screenParkGolf: "스크린·업체 소식",
  equipmentBrand: "브랜드·업체 소식",
  noticeOperation: "정책·운영 안내",
};

const defaultSection: Record<NewsCategory, NewsPublicSection> = {
  parkGolfNews: "other",
  screenParkGolf: "screenEquipment",
  equipmentBrand: "screenEquipment",
  noticeOperation: "notices",
};

export function newsSectionLabel(article: Pick<PublicNewsArticle, "category" | "publicSection">) {
  return publicSectionLabels[article.publicSection ?? defaultSection[article.category]];
}

export const sourceTypeLabels: Record<NewsSourceType, string> = {
  adminVerified: "PUL 운영자 확인",
  officialNotice: "공식 공지",
  organizationNotice: "협회·기관 안내",
  memberReport: "회원 제보 확인",
  brandPromotion: "업체 홍보",
};

export const sourceLinkLabels: Record<NewsSourceType, string> = {
  adminVerified: "참고 원문 보기",
  officialNotice: "기관 공지 원문",
  organizationNotice: "협회·기관 안내 원문",
  memberReport: "제보 출처 보기",
  brandPromotion: "업체 안내 보기",
};
