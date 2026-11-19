import { safeCourseReturn } from "./courseNavigation";

export function safeMaterialReturn(raw: unknown, key: string) {
  const detail = "/courses/" + encodeURIComponent(key);
  const fallback = detail + "/resources";
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//") || /[\\\x00-\x1f]/.test(raw)) return fallback;
  try {
    const url = new URL(raw, "https://pul.invalid");
    if (url.origin !== "https://pul.invalid") return fallback;

    if (url.pathname === detail && url.hash === "#course-resources") {
      const kind = url.searchParams.get("kind");
      if (url.searchParams.getAll("kind").length !== 1 || (kind !== "video" && kind !== "yardage")) return fallback;
      const query = new URLSearchParams({ kind });
      if (url.searchParams.get("map") === "1") query.set("map", "1");
      if (url.searchParams.has("returnTo")) query.set("returnTo", safeCourseReturn(url.searchParams.get("returnTo")));
      return detail + "?" + query + url.hash;
    }
    if (url.pathname !== fallback) return fallback;
    const query = new URLSearchParams();
    for (const key of ["q", "kind", "saved", "page", "returnTo"]) {
      const value = url.searchParams.get(key);
      if (value !== null) query.set(key, key === "returnTo" ? safeCourseReturn(value) : value);
    }
    return fallback + (query.size ? "?" + query : "");
  } catch {
    return fallback;
  }
}
