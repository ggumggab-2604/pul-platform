export const startupQuickAccessItems = [
  {
    id: "qa-1",
    title: "스크린 창업 문의",
    description: "스크린 파크골프 창업 비용, 공간, 장비 구성이 궁금할 때",
    boardCategory: "screenStartup" as const,
  },
  {
    id: "qa-2",
    title: "스크린 매장 매매",
    description: "기존 스크린 파크골프장 양도·양수 정보를 확인할 때",
    boardCategory: "screenResale" as const,
  },
  {
    id: "qa-3",
    title: "필드 구장 신설",
    description: "유휴지나 토지를 활용해 파크골프장 조성을 검토할 때",
    boardCategory: "fieldCourseDevelopment" as const,
  },
  {
    id: "qa-4",
    title: "시설·시공 문의",
    description: "인조잔디, 안전망, 조명, 배수, 설계·시공 업체 상담이 필요할 때",
    boardCategory: "constructionFacility" as const,
  },
] as const;
