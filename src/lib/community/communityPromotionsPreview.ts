export const fields = {
  local: { label: "지역업체", trades: ["식당·카페", "숙박", "쇼핑·특산품", "관광·체험"] },
  service: { label: "생활서비스", trades: ["출장 수리", "청소", "차량·단체 이동"] },
  education: { label: "교육·강좌", trades: ["파크골프 레슨·강습", "교육기관 수강생 모집", "일반 강좌"] },
  equipment: { label: "파크골프 용품·시설", trades: ["파크골프채·용품", "스크린 시설", "기타 관련 시설"] },
  events: { label: "대회·행사", trades: [] },
  clubs: { label: "동호회 모집", trades: [] },
} satisfies Record<string, { label: string; trades: string[] }>;

export type Field = keyof typeof fields;
export type Scope = "visit" | "service" | "delivery" | "online";
export type SourceKind = "event" | "club" | "education" | "lesson" | "course" | "sale";

export type Source = {
  kind: SourceKind;
  key: string;
  title: string;
  visibility: "public" | "hidden" | "removed";
  recruitment?: "open" | "closed";
  example?: { summary: string; guidance: string };
};

export type Post = {
  id: string;
  title: string;
  body: string;
  field: Field;
  trade: string;
  scope: Scope;
  province: string;
  districts: string[];
  address?: string;
  contact?: string;
  deadline?: string;
  nearbyCourse?: Source;
  relatedSale?: Source;
  source?: Source;
  owner: boolean;
  visibility: "public" | "withdrawn" | "blinded";
  createdAt: number;
  version?: number;
};

export type Filters = { field: Field | ""; trade: string; province: string; district: string };
export const emptyFilters: Filters = { field: "", trade: "", province: "", district: "" };

export function matchesPromotionFilters(post: Post, filters: Filters) {
  return (!filters.field || post.field === filters.field) &&
    (!filters.trade || post.trade === filters.trade) &&
    (!filters.province || post.province === filters.province) &&
    (!filters.district || post.districts.includes(filters.district));
}

export type Placement = {
  id: string;
  postId: string;
  slotCode: string;
  startsAt: number;
  endsAt: number;
  paused: boolean;
};

export const day = 86_400_000;

export function sourceHref(source: Source) {
  if (source.visibility !== "public") return null;
  const key = encodeURIComponent(source.key);
  if (source.example) return `/community?source=${source.kind}:${key}`;

  const paths: Record<SourceKind, string> = {
    event: "/events/",
    club: "/clubs/",
    education: "/certification/courses/",
    lesson: "/lessons/university-departments/",
    course: "/courses/",
    sale: "/market?view=sale&listing=",
  };
  return paths[source.kind] + key;
}

export function isPublic(post: Post) {
  return post.visibility === "public" && (!post.source || post.source.visibility === "public");
}

export function placementStatus(placement: Placement, now: number, post?: Post) {
  if (!post || !isPublic(post)) return "blocked";
  if (placement.paused) return "paused";
  if (placement.endsAt <= now) return "ended";
  if (placement.startsAt > now) return "scheduled";
  return "live";
}

export function noticeLocation(post: Pick<Post, "field" | "trade">) {
  const trade = post.trade === "파크골프채·용품" ? "용품" : post.trade;
  return [fields[post.field].label, trade].filter(Boolean).join(" → ");
}

export function listPosts(posts: Post[], placements: Placement[], filters: Filters, now: number) {
  const postsById = new Map(posts.map((post) => [post.id, post]));
  const pinned = new Set(placements.filter((item) => placementStatus(item, now, postsById.get(item.postId)) === "live").map((item) => item.postId));
  const visible = posts
    .filter((post) => isPublic(post) && matchesPromotionFilters(post, filters))
    .sort((a, b) => b.createdAt - a.createdAt);
  return {
    notices: visible.filter((post) => pinned.has(post.id)),
    regular: visible.filter((post) => !pinned.has(post.id)),
  };
}

export function regionLabel(post: Post) {
  if (post.scope === "delivery") return "전국 배송";
  if (post.scope === "online") return "온라인 강좌";
  const area = [post.province, post.districts.join(", ")].filter(Boolean).join(" ");
  return post.scope === "service" ? `${area} · 이용 가능` : area;
}

const date = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" });

export function recruitmentLabel(post: Post, now: number) {
  if (post.source?.recruitment === "closed" || (post.deadline && post.deadline < date.format(now))) return "모집 마감";
  if (post.source?.recruitment === "open" || post.deadline || (!post.source && (post.field === "clubs" || post.field === "events"))) return "모집 중";
  return null;
}
