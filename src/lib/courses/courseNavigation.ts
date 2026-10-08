import type { CourseFilters } from "./courseDirectory";
export type CourseView = "list" | "map";
export function courseSearchHref(filters: CourseFilters, page = 1, view: CourseView = "list") {
  const p = new URLSearchParams();
  if (filters.keyword?.trim()) p.set("q", filters.keyword.trim());
  if (filters.courseType) p.set("type", filters.courseType);
  if (filters.region) p.set("region", filters.region); // Preserve old bookmarked queries.
  if (filters.province) p.set("province", filters.province);
  if (filters.district && filters.province) p.set("district", filters.district);
  if (filters.operation) p.set("operation", filters.operation);
  if (filters.courseType === "field" && filters.holes) p.set("holes", filters.holes);
  if (filters.hasEvent) p.set("hasEvent", "1");
  if (filters.hasVideo) p.set("hasVideo", "1");
  if (filters.courseType !== "screen" && filters.hasYardage) p.set("hasYardage", "1");
  for (const f of filters.features ?? []) p.append("feature", f);
  if (page > 1) p.set("page", String(page));
  if (view === "map") p.set("view", view);
  return `/courses${p.size ? `?${p}` : ""}`;
}
export function safeCourseReturn(value: unknown): string {
  if (typeof value !== "string" || value.length > 2000 || /[\\\r\n]/.test(value) || !/^\/courses(?:\?|$)/.test(value)) return "/courses";
  const parsed = new URL(value, "https://pul.invalid");
  if (parsed.origin !== "https://pul.invalid" || parsed.pathname !== "/courses" || parsed.hash) return "/courses";
  const allowed = new Set(["hasEvent", "hasVideo", "hasYardage", "q", "type", "region", "province", "district", "operation", "holes", "feature", "page", "view"]);
  for (const key of [...parsed.searchParams.keys()]) if (!allowed.has(key)) parsed.searchParams.delete(key);
  return parsed.pathname + parsed.search;
}
export function courseDetailHref(key: string, returnTo: string) {
  return `/courses/${encodeURIComponent(key)}?returnTo=${encodeURIComponent(safeCourseReturn(returnTo))}`;
}
