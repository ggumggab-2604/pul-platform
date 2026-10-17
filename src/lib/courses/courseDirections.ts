export type TravelMode = "transit" | "car";
export type DestinationKind = "facility" | "building" | "entrance" | "parking";
export type CourseDestination = { name: string; address: string; latitude: number | null; longitude: number | null; destinationKind?: DestinationKind | null };
// Device hints choose supported app links; they never establish app installation.
export function supportsMobileNavigationApps(userAgent: string, platform = "", maxTouchPoints = 0) {
  return /Android|iPhone|iPad|iPod/i.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1);
}

export function hasCourseCoordinates(c: CourseDestination) {
  return typeof c.latitude === "number" && Number.isFinite(c.latitude) && c.latitude >= -90 && c.latitude <= 90 &&
    typeof c.longitude === "number" && Number.isFinite(c.longitude) && c.longitude >= -180 && c.longitude <= 180;
}
export function hasVerifiedDestination(c: CourseDestination) {
  return hasCourseCoordinates(c) && ["facility", "building", "entrance", "parking"].includes(c.destinationKind ?? "");
}
export function hasVehicleDestination(c: CourseDestination) {
  return hasVerifiedDestination(c);
}
export function courseDestinationName(c: CourseDestination) {
  return c.name + (c.destinationKind === "parking" ? " 이용 주차장" : c.destinationKind === "entrance" ? " 출입구" : "");
}
export function kakaoNaviDestination(c: CourseDestination) {
  if (!hasVehicleDestination(c)) return null;
  return {
    name: courseDestinationName(c),
    x: c.longitude!, y: c.latitude!, coordType: "wgs84" as const, routeInfo: true,
  };
}
// Official mobile-web TMAP Invoke: route summary, without automatic guidance.
// Reuse the stored entrance/parking point, or the stored facility/building point.
// No link without a configured AppKey and a verified destination.
export function tmapCourseNavigationHref(c: CourseDestination, appKey?: string) {
  const key = appKey?.trim();
  if (!key || !hasVehicleDestination(c)) return null;
  const query = new URLSearchParams({
    appKey: key,
    goalname: courseDestinationName(c),
    goalx: String(c.longitude), goaly: String(c.latitude),
  });
  return "https://apis.openapi.sk.com/tmap/app/routes?" + query.toString();
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

// Address conversion and external searches use this value. Clipboard and displayed addresses keep the original.
export function courseSearchAddress(c: CourseDestination) {
  return c.address.replace(/\([^)]*\)/g, "").replace(/\s+(?:지하\s*)?\d+층.*$/, "").trim() || c.name;
}

// Official NAVER URL Scheme and Kakao Web links / Android v2 URL Scheme.
// Pass the destination only. The external app selects the start/current location;
// PUL never substitutes a made-up origin.
export function courseDirectionLinks(c: CourseDestination, mode: TravelMode, origin = "") {
  const query = encodeURIComponent(courseSearchAddress(c));
  const verified = hasVerifiedDestination(c);
  const ready = mode === "car" ? hasVehicleDestination(c) : hasTransitDestination(c);
  const usablePoint = verified && !(mode === "transit" && c.destinationKind === "parking");
  const destinationName = courseDestinationName(c);
  const point = usablePoint ? encodeURIComponent(destinationName) + "," + c.latitude + "," + c.longitude : null;
  let app: string | null = null;
  try {
    const url = new URL(origin);
    if (["http:", "https:"].includes(url.protocol) && !url.username && !url.password) app = encodeURIComponent(url.origin);
  } catch { /* No app link without its actual web origin. */ }
  const naverPoint = usablePoint && c.latitude! >= 31.43 && c.latitude! <= 44.35 && c.longitude! >= 122.37 && c.longitude! <= 132;
  return {
    kakaoWeb: point ? "https://map.kakao.com/link/" + (ready ? "to" : "map") + "/" + point : "https://map.kakao.com/link/search/" + query,
    kakaoApp: usablePoint ? "kakaomap://route?ep=" + c.latitude + "," + c.longitude + "&by=" + (mode === "transit" ? "publictransit" : "car") : null,
    naverApp: app && naverPoint && ready ? "nmap://" + (mode === "transit" ? "route/public" : "navigation") + "?dlat=" + c.latitude + "&dlng=" + c.longitude + "&dname=" + encodeURIComponent(destinationName) + "&appname=" + app : null,
    naverPlace: app && naverPoint ? "nmap://place?lat=" + c.latitude + "&lng=" + c.longitude + "&name=" + encodeURIComponent(destinationName) + "&appname=" + app : null,
    naverSearch: app ? "nmap://search?query=" + query + "&appname=" + app : null,
  };
}

export function courseDirectionsNote(c: CourseDestination, mode?: TravelMode) {
  if (mode === "car" && !hasVehicleDestination(c)) return "차량 경로에 사용할 구장 좌표가 아직 없습니다. 위치 확인 후 이용할 수 있습니다.";
  if (!hasVerifiedDestination(c)) return "구장 주소를 좌표로 변환하여 길찾기에 연결합니다.";
  if (c.destinationKind === "parking") return mode === "transit"
    ? "대중교통 도착점은 미확인입니다. 구장 주소를 검색해 주세요."
    : "차량 목적지는 이용 주차장입니다. 주차 후 구장까지 별도 이동합니다.";
  return mode === "transit" ? "구장 방문 위치를 전달합니다. 출발지는 외부 지도에서 확인해 주세요."
    : mode === "car" ? c.destinationKind === "entrance" ? "확인된 출입구를 목적지로 전달합니다. 앱에서 경로를 확인해 주세요."
      : "구장 위치를 목적지로 전달합니다. 앱에서 차량 경로를 확인해 주세요."
    : destinationKindLabels[c.destinationKind!] + (c.destinationKind === "entrance" ? "" : " 확인");
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
