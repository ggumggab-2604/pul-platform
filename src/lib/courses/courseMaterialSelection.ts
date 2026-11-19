import type { SupabaseClient } from "@supabase/supabase-js";
import { listCourseResources, type CourseResource, type ResourcePage } from "./courseContent";

export type MaterialKind = CourseResource["kind"];

export function readMaterialKind(value: unknown): MaterialKind {
  return value === "yardage" ? "yardage" : "video";
}

type CourseLabel = Pick<CourseResource, "scope" | "title">;

function courseCodes(text: string) {
  const labelled = text.matchAll(/(?:^|[^A-Z0-9])([A-D]+(?:\s*[·,/&+~–-]\s*[A-D]+)*)\s*코스/g);
  return [...labelled].map(([, label]) => label.replace(/([A-D])\s*[~–-]\s*([A-D])/g, (_, start, end) => {
    const from = "ABCD".indexOf(start);
    const to = "ABCD".indexOf(end);
    return "ABCD".slice(Math.min(from, to), Math.max(from, to) + 1);
  })).join("").replace(/[^A-D]/g, "");
}

function materialCodes({ scope, title }: CourseLabel) {
  const label = scope.normalize("NFKC").trim().toUpperCase();
  if (/^(?:[A-D]|AB|CD)$/.test(label)) return label;
  return courseCodes(label === "구장 전체" ? title.normalize("NFKC").toUpperCase() : label);
}

export function matchesMaterialCourse(item: CourseLabel, course: string) {
  if (course === "all") return true;
  const codes = materialCodes(item);
  return [...course].some(code => codes.includes(code));
}

function yardageOrder(item: CourseLabel) {
  const codes = materialCodes(item);
  const first = [..."ABCD"].findIndex(code => codes.includes(code));
  return first === -1 ? 4 : first;
}

export async function listCourseMaterialSelection(
  client: SupabaseClient, key: string, kind: MaterialKind, offset: number, limit: number, course = "all",
): Promise<ResourcePage> {
  if (course === "all" && kind === "video") {
    return listCourseResources(client, key, kind, offset, "", false, limit);
  }

  const batchSize = 24;
  const matches = new Map<string, CourseResource>();
  // The public RPC filters by kind. Match the course and sort yardage before slicing.
  for (let start = 0; ; start += batchSize) {
    const batch = await listCourseResources(client, key, kind, start, "", false, batchSize);
    for (const item of batch.items) {
      if (matchesMaterialCourse(item, course)) matches.set(item.id, item);
    }
    if (batch.items.length < batchSize || start + batchSize >= batch.total) break;
  }

  const items = [...matches.values()];
  if (kind === "yardage") items.sort((a, b) => yardageOrder(a) - yardageOrder(b));
  return { items: items.slice(offset, offset + limit), total: matches.size, limit, offset };
}
