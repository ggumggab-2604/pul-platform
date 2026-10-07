// Address prefixes only: never infer a province from an ambiguous legacy region/city.
export const courseProvinces = ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"] as const;
export type CourseProvince = typeof courseProvinces[number];
const aliases: Record<string, CourseProvince> = {
  서울: "서울", 서울특별시: "서울", 부산: "부산", 부산광역시: "부산", 대구: "대구", 대구광역시: "대구",
  인천: "인천", 인천광역시: "인천", 광주: "광주", 광주광역시: "광주", 대전: "대전", 대전광역시: "대전",
  울산: "울산", 울산광역시: "울산", 세종: "세종", 세종특별자치시: "세종", 경기: "경기", 경기도: "경기",
  강원: "강원", 강원도: "강원", 강원특별자치도: "강원", 충북: "충북", 충청북도: "충북", 충남: "충남", 충청남도: "충남",
  전북: "전북", 전라북도: "전북", 전북특별자치도: "전북", 전남: "전남", 전라남도: "전남", 경북: "경북", 경상북도: "경북",
  경남: "경남", 경상남도: "경남", 제주: "제주", 제주도: "제주", 제주특별자치도: "제주",
};
export function courseAddressRegion(address: string) {
  const [prefix, second = "", third = ""] = address.trim().split(/\s+/);
  const province = Object.prototype.hasOwnProperty.call(aliases, prefix) ? aliases[prefix] : null;
  const district = province && /^[가-힣]+[시군구]$/.test(second)
    ? second + (second.endsWith("시") && /^[가-힣]+구$/.test(third) ? ` ${third}` : "") : null;
  return { province, district };
}
export type CourseRegionOption = { province: CourseProvince; districts: string[] };
