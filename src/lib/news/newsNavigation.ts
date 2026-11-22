import { isNewsCategory, isNewsPublicSection, isNewsRelatedTarget, type NewsCategory, type NewsPublicSection } from "@/lib/news/newsDirectory";

export const NEWS_PAGE_SIZE = 20;

type NewsPublicTab = Exclude<NewsPublicSection, "other">;
export type NewsCategoryFilter = "all" | NewsCategory | NewsPublicTab;

export function newsCategoryFilter(value: string | undefined): NewsCategoryFilter {
  if ((isNewsPublicSection(value) && value !== "other") || isNewsCategory(value)) return value;
  return "all";
}

export function newsPageNumber(value: string | undefined) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 && page <= Math.floor(2_147_483_647 / NEWS_PAGE_SIZE) + 1 ? page : 1;
}

export function newsListHref(category: NewsCategoryFilter = "all", keyword = "", page = 1) {
  const params = new URLSearchParams();
  if (category !== "all") params.set("category", category);
  if (keyword) params.set("keyword", keyword);
  if (page > 1) params.set("page", String(page));
  return params.size ? `/news?${params}` : "/news";
}

export function newsArticleHref(newsKey: string, returnTo = "/news") {
  const path = `/news/${encodeURIComponent(newsKey)}`;
  return returnTo === "/news" ? path : `${path}?${new URLSearchParams({ returnTo })}`;
}

export function newsReturnHref(value: string | string[] | undefined) {
  const path = Array.isArray(value) ? value[0] : value;
  if (!path) return "/news";
  const [pathname, query] = path.split("?", 2);
  const params = new URLSearchParams(query);
  if (pathname === "/search") {
    const keyword = params.get("q")?.trim();
    if (keyword && keyword.length <= 100) return `/search?q=${encodeURIComponent(keyword)}`;
  }
  if (pathname === "/news") {
    return newsListHref(
      newsCategoryFilter(params.get("category") ?? undefined),
      (params.get("keyword") ?? "").trim().slice(0, 100),
      newsPageNumber(params.get("page") ?? undefined),
    );
  }
  return "/news";
}

const destinations = {
  course: { path: "/courses/", label: "구장 상세 보기" },
  event: { path: "/events/", label: "대회·행사 상세 보기" },
  certification: { path: "/certification/courses/", label: "자격증·심판 상세 보기" },
  university: { path: "/lessons/university-departments/", label: "레슨·교육 상세 보기" },
} as const;

export function newsRelatedLink(target: string | null) {
  if (!isNewsRelatedTarget(target)) return null;
  const [kind, key] = target.split(":");
  const destination = destinations[kind as keyof typeof destinations];
  return destination ? { href: destination.path + encodeURIComponent(key), label: destination.label } : null;
}

export function newsRelatedTargetFromPath(path: string) {
  for (const [kind, destination] of Object.entries(destinations)) {
    if (!path.startsWith(destination.path)) continue;
    const key = path.slice(destination.path.length);
    if (/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(key)) return `${kind}:${key}`;
  }
  return null;
}
