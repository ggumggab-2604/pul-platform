export type TravelMode = "transit" | "car";
export type DestinationKind = "facility" | "building" | "entrance" | "parking";
export type CourseDestination = { name: string; address: string; latitude: number | null; longitude: number | null; destinationKind?: DestinationKind | null };
export function hasCourseCoordinates(c: CourseDestination) {
  return typeof c.latitude === "number" && Number.isFinite(c.latitude) && c.latitude >= -90 && c.latitude <= 90 &&
    typeof c.longitude === "number" && Number.isFinite(c.longitude) && c.longitude >= -180 && c.longitude <= 180;
}
export function hasVerifiedDestination(c: CourseDestination) {
  return hasCourseCoordinates(c) && ["facility", "building", "entrance", "parking"].includes(c.destinationKind ?? "");
}
export function hasVehicleDestination(c: CourseDestination) {
  return hasVerifiedDestination(c) && (c.destinationKind === "entrance" || c.destinationKind === "parking");
}
export const destinationKindLabels: Record<DestinationKind, string> = { facility: "구장 시설 위치", building: "매장이 있는 건물 위치", entrance: "확인된 출입구", parking: "확인된 주차장" };
// Official contracts: Kakao Web guide / Android v2 URL Scheme; NAVER Maps URL Scheme.
// No fabricated start point. Desktop fallback deliberately asks the user to choose travel mode.
export function courseDirectionLinks(c: CourseDestination, mode: TravelMode, origin = "") {
  const address = c.address.replace(/\([^)]*\)/g, "").replace(/\s+(?:지하\s*)?\d+층.*$/, "").trim();
  const query = encodeURIComponent(address || c.name);
  const coordinates = hasVerifiedDestination(c);
  const destinationName = c.destinationKind === "parking" ? `${c.name} 이용 주차장` : c.destinationKind === "entrance" ? `${c.name} 출입구` : c.name;
  const point = coordinates ? `${encodeURIComponent(destinationName)},${c.latitude},${c.longitude}` : null;
  let app: string | null = null;
  try { const url=new URL(origin); if (["http:","https:"].includes(url.protocol)) app=encodeURIComponent(url.origin); } catch { /* No app link without its actual web origin. */ }
  return {
    kakaoWeb: point ? `https://map.kakao.com/link/${mode === "car" && !hasVehicleDestination(c) ? "map" : "to"}/${point}` : `https://map.kakao.com/link/search/${query}`,
    kakaoApp: coordinates ? `kakaomap://look?p=${c.latitude},${c.longitude}` : null,
    naverApp: app && coordinates && (mode === "transit" || hasVehicleDestination(c)) && c.latitude! >= 31.43 && c.latitude! <= 44.35 && c.longitude! >= 122.37 && c.longitude! <= 132 ? `nmap://${mode === "transit" ? "route/public" : "navigation"}?dlat=${c.latitude}&dlng=${c.longitude}&dname=${encodeURIComponent(destinationName)}&appname=${app}` : null,
    naverPlace: app && coordinates && c.latitude! >= 31.43 && c.latitude! <= 44.35 && c.longitude! >= 122.37 && c.longitude! <= 132 ? `nmap://place?lat=${c.latitude}&lng=${c.longitude}&name=${encodeURIComponent(destinationName)}&appname=${app}` : null,
    naverSearch: app ? `nmap://search?query=${query}&appname=${app}` : null,
  };
}
export const nearbyCategories = ["편의점","음식점","카페","병원","약국","주차장"] as const;
export function nearbySearchQuery(c: CourseDestination, category: typeof nearbyCategories[number]) {
  const parts=c.address.replace(/\([^)]*\)/g,"").trim().split(/\s+/);
  const road=parts.findIndex(p=>/[로길동읍면리]$/.test(p));
  return `${parts.slice(0,road>=0?road+1:Math.min(parts.length,3)).join(" ")} ${category}`;
}
export function safeReservationUrl(value: string | null) {
  if (!value) return null;
  try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password ? u.href : null; } catch { return null; }
}
