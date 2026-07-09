import type { MarketCategory, MarketListing } from "@/types";

type ProductImageConfig = {
  src: string;
  position: string;
};

/**
 * TODO: 상품 이미지 업로드 시 자동 최적화
 * - 썸네일 600px, 상세 이미지 1200px 기준으로 자동 리사이즈
 * - WebP 변환 또는 JPG 압축 적용
 * - 원본 이미지는 필요 시 별도 저장
 */
export const marketCategoryImages: Record<MarketCategory, ProductImageConfig> = {
  club: { src: "/images/ad-club.jpg", position: "object-[center_42%]" },
  ball: { src: "/images/ad-ball.jpg", position: "object-[center_45%]" },
  bag: { src: "/images/ad-club.jpg", position: "object-[center_58%]" },
  apparel: { src: "/images/ad-wear.jpg", position: "object-[center_35%]" },
  shoes: { src: "/images/ad-shoes.jpg", position: "object-[center_40%]" },
  practice: { src: "/images/ad-ball.jpg", position: "object-[center_48%]" },
  other: { src: "/images/ad-ball.jpg", position: "object-center" },
  startupResale: { src: "/images/banner-equipment.jpg", position: "object-center" },
  facilityDevelopment: { src: "/images/banner-course.jpg", position: "object-center" },
};

const bannerImagePattern = /banner-/;

export function getProductImageConfig(item: MarketListing): ProductImageConfig {
  const categoryDefault = marketCategoryImages[item.category];

  if (bannerImagePattern.test(item.image)) {
    return categoryDefault;
  }

  if (item.image.includes("ad-wear-blue")) {
    return { src: item.image, position: "object-[center_32%]" };
  }

  if (item.image.includes("ad-wear")) {
    return { src: item.image, position: "object-[center_35%]" };
  }

  if (item.image.includes("ad-club")) {
    return { src: item.image, position: "object-[center_42%]" };
  }

  if (item.image.includes("ad-ball")) {
    return { src: item.image, position: "object-[center_45%]" };
  }

  if (item.image.includes("ad-shoes")) {
    return { src: item.image, position: "object-[center_40%]" };
  }

  return { src: item.image, position: categoryDefault.position };
}

export const marketCategoryPlaceholderLabels: Record<MarketCategory, string> = {
  club: "파크골프채",
  ball: "파크골프공",
  bag: "골프 가방",
  apparel: "파크골프 의류",
  shoes: "파크골프화",
  practice: "연습용품",
  other: "기타 용품",
  startupResale: "창업·매매",
  facilityDevelopment: "시설·조성",
};
