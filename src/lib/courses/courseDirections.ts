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
export function kakaoNaviDestination(c: CourseDestination) {
  if (!hasVehicleDestination(c)) return null;
  return {
    name: c.name + (c.destinationKind === "parking" ? " 이용 주차장" : " 출입구"),
    x: c.longitude!, y: c.latitude!, coordType: "wgs84" as const,
  };
}
export type KakaoNaviSdk = {
  isInitialized(): boolean;
  Navi: { start(destination: NonNullable<ReturnType<typeof kakaoNaviDestination>>): void };
};
// Called only by the current click. Readiness never queues a later app launch.
export function startCourseKakaoNavi(c: CourseDestination, sdk: KakaoNaviSdk | undefined) {
  const destination = kakaoNaviDestination(c);
  if (!destination) return "destination-unverified";
  if (!sdk?.isInitialized()) return "not-ready";
  sdk.Navi.start(destination);
  return "requested";
}
// The existing record has one point. A parking point is never a transit arrival point.
export function hasTransitDestination(c: CourseDestination) {
  return hasVerifiedDestination(c) && c.destinationKind !== "parking";
}
export const destinationKindLabels: Record<DestinationKind, string> = {
  facility: "구장 시설 위치", building: "매장이 있는 건물 위치", entrance: "확인된 출입구", parking: "확인된 주차장",
};

// Only external searches use this value. Clipboard and displayed addresses keep the original.
export function courseSearchAddress(c: CourseDestination) {
  return c.address.replace(/\([^)]*\)/g, "").replace(/\s+(?:지하\s*)?\d+층.*$/, "").trim() || c.name;
}

// Official NAVER URL Scheme and Kakao Web links / Android v2 URL Scheme.
// Kakao's route example supplies sp: without a verified start point, use its documented
// location view and let the user select transit there. Do not invent a start or claim a route.
export function courseDirectionLinks(c: CourseDestination, mode: TravelMode, origin = "") {
  const query = encodeURIComponent(courseSearchAddress(c));
  const verified = hasVerifiedDestination(c);
  const ready = mode === "car" ? hasVehicleDestination(c) : hasTransitDestination(c);
  const usablePoint = verified && !(mode === "transit" && c.destinationKind === "parking");
  const destinationName = c.destinationKind === "parking" ? c.name + " 이용 주차장" : c.destinationKind === "entrance" ? c.name + " 출입구" : c.name;
  const point = usablePoint ? encodeURIComponent(destinationName) + "," + c.latitude + "," + c.longitude : null;
  let app: string | null = null;
  try {
    const url = new URL(origin);
    if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) app = encodeURIComponent(url.origin);
  } catch { /* No app link without its actual web origin. */ }
  const naverPoint = usablePoint && c.latitude! >= 31.43 && c.latitude! <= 44.35 && c.longitude! >= 122.37 && c.longitude! <= 132;
  return {
    kakaoWeb: point ? "https://map.kakao.com/link/" + (ready ? "to" : "map") + "/" + point : "https://map.kakao.com/link/search/" + query,
    kakaoApp: usablePoint ? "kakaomap://look?p=" + c.latitude + "," + c.longitude : null,
    naverApp: app && naverPoint && ready ? "nmap://" + (mode === "transit" ? "route/public" : "navigation") + "?dlat=" + c.latitude + "&dlng=" + c.longitude + "&dname=" + encodeURIComponent(destinationName) + "&appname=" + app : null,
    naverPlace: app && naverPoint ? "nmap://place?lat=" + c.latitude + "&lng=" + c.longitude + "&name=" + encodeURIComponent(destinationName) + "&appname=" + app : null,
    naverSearch: app ? "nmap://search?query=" + query + "&appname=" + app : null,
  };
}

export function courseDirectionsNote(c: CourseDestination, mode?: TravelMode) {
  if (!hasVerifiedDestination(c)) return "구장 위치 미확인 · 주소를 검색해 구장을 선택해 주세요.";
  if (c.destinationKind === "parking") return mode === "transit"
    ? "대중교통 도착점은 미확인입니다. 구장 주소를 검색해 주세요."
    : "차량 목적지는 이용 주차장입니다. 주차 후 구장까지 별도 이동합니다.";
  if (mode === "car" && !hasVehicleDestination(c)) return "차량 입구 미확인 · 지도에서 입구·주차장을 선택해 주세요.";
  return mode === "transit" ? "구장 방문 위치를 전달합니다. 출발지는 외부 지도에서 확인해 주세요."
    : mode === "car" ? "확인된 출입구를 전달합니다. 앱에서 경로를 확인해 주세요."
    : destinationKindLabels[c.destinationKind!] + (c.destinationKind === "entrance" ? "" : " 확인") + (hasVehicleDestination(c) ? "" : " · 차량 입구 미확인");
}

export const nearbyCategories = ["음식점", "카페", "편의점", "주차장", "약국", "병원"] as const;
export type NearbyCategory = typeof nearbyCategories[number];
export function nearbySearchQuery(c: CourseDestination, category: NearbyCategory) {
  const parts = courseSearchAddress(c).replace(/([가-힣](?:대로|로|길))(?=\d)/g, "$1 ").split(/\s+/);
  const road = parts.findIndex(p => /(?:대로|로|길)$/.test(p));
  // Keep all administrative parts, including a ri following an eup/myeon.
  let end = road >= 0 ? road + 1 : parts.findIndex(p => /^\d/.test(p));
  if (end < 0) end = parts.length;
  const region = parts.slice(0, end).join(" ") || courseSearchAddress(c);
  return region + " " + category;
}
// Observed consumer web URLs, not a permanent API contract or a radius search.
export function naverWebSearch(query: string, mobile: boolean) {
  return mobile ? "https://m.place.naver.com/place/list?query=" + encodeURIComponent(query)
    : "https://map.naver.com/p/search/" + encodeURIComponent(query);
}
export function nearbySearchHref(c: CourseDestination, category: NearbyCategory, mobile: boolean) {
  return naverWebSearch(nearbySearchQuery(c, category), mobile);
}
export function safeReservationUrl(value: string | null) {
  if (!value) return null;
  try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password ? u.href : null; } catch { return null; }
}
