import { hasVerifiedDestination, type CourseDestination, type NearbyCategory } from "./courseDirections";

export const nearbyCategoryCodes: Record<NearbyCategory, string> = {
  음식점: "FD6", 카페: "CE7", 편의점: "CS2", 주차장: "PK6", 약국: "PM9", 병원: "HP8",
};
export const nearbyRadius = 3000;
export const nearbyLimit = 15;
export type NearbyCenter = { latitude: number; longitude: number };
export type NearbyPlace = NearbyCenter & { id: string; name: string; address: string; distanceMetres: number };
export type NearbyState = { status: "idle" | "loading" | "ready" | "empty" | "failed" | "unavailable"; places: NearbyPlace[] };
export type CategoryOptions = { location: object; radius: number; size: number; page: number; sort: string; useMapCenter: false; useMapBounds: false };
export type CategoryService = { categorySearch(code: string, callback: (data: unknown[], status: string) => void, options: CategoryOptions): void };

// The current record has one point. A vehicle-only parking point is not a course search centre.
export function nearbyCourseCenter(course: CourseDestination): NearbyCenter | null {
  return hasVerifiedDestination(course) && course.destinationKind !== "parking"
    ? { latitude: course.latitude!, longitude: course.longitude! } : null;
}
export function straightDistance(a: NearbyCenter, b: NearbyCenter) {
  const rad = Math.PI / 180;
  const lat = Math.sin((b.latitude - a.latitude) * rad / 2);
  const lng = Math.sin((b.longitude - a.longitude) * rad / 2);
  return 6371000 * 2 * Math.asin(Math.min(1, Math.sqrt(lat * lat + Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * lng * lng)));
}
export function nearbyPlaces(data: unknown[], center: NearbyCenter): NearbyPlace[] {
  const seen = new Set<string>();
  return data.flatMap(value => {
    if (!value || typeof value !== "object") return [];
    const p = value as Record<string, unknown>;
    if (typeof p.id !== "string" || !p.id || seen.has(p.id) || typeof p.place_name !== "string" || !p.place_name.trim()) return [];
    if (typeof p.x !== "string" || !p.x.trim() || typeof p.y !== "string" || !p.y.trim()) return [];
    const point = { latitude: Number(p.y), longitude: Number(p.x) };
    if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) return [];
    const distance = straightDistance(center, point);
    if (distance > nearbyRadius) return [];
    seen.add(p.id);
    return [{ ...point, id: p.id, name: p.place_name,
      address: typeof p.road_address_name === "string" && p.road_address_name ? p.road_address_name : typeof p.address_name === "string" ? p.address_name : "주소 정보 없음",
      distanceMetres: Math.round(distance) }];
  }).sort((a,b) => a.distanceMetres - b.distanceMetres).slice(0, nearbyLimit);
}

// A component-scoped session deduplicates StrictMode and repeated category choices.
// Only pending and successful requests are cached; failures do not trigger automatic retries.
export class NearbySearchSession {
  private requests = new Map<string, Promise<NearbyPlace[]>>();
  constructor(private service: CategoryService, private point: (center: NearbyCenter) => object,
    private constants: { OK: string; ZERO_RESULT: string; DISTANCE: string }, private timeoutMs = 10000) {}
  search(center: NearbyCenter, category: NearbyCategory, attempt: number) {
    const id = [center.latitude, center.longitude, category, attempt].join("|");
    const existing = this.requests.get(id);
    if (existing) return existing;
    const pending = new Promise<NearbyPlace[]>((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => { settled = true; reject(new Error("Nearby search timed out")); }, this.timeoutMs);
      try {
        this.service.categorySearch(nearbyCategoryCodes[category], (data, status) => {
          if (settled) return;
          settled = true; clearTimeout(timeout);
          if (status === this.constants.ZERO_RESULT) resolve([]);
          else if (status === this.constants.OK && Array.isArray(data)) resolve(nearbyPlaces(data, center));
          else reject(new Error("Nearby search failed"));
        }, { location: this.point(center), radius: nearbyRadius, size: nearbyLimit, page: 1, sort: this.constants.DISTANCE, useMapCenter: false, useMapBounds: false });
      } catch { settled = true; clearTimeout(timeout); reject(new Error("Nearby search failed")); }
    });
    if (this.requests.size >= 24) this.requests.delete(this.requests.keys().next().value!);
    this.requests.set(id, pending);
    void pending.catch(() => {
      if (this.requests.get(id) === pending) this.requests.delete(id);
    });
    return pending;
  }
}
