import type { SupabaseClient } from "@supabase/supabase-js";
import { listCourseResources, type CourseResource } from "@/lib/courses/courseContent";
import type { MaterialCourse } from "./examPrepSelection";

type PracticalMaterial = Pick<CourseResource, "id" | "kind" | "title" | "video_url" | "images">;
export type PracticalMaterialPage = { items: PracticalMaterial[]; hasNext: boolean };

const pageSize = 9;
const batchSize = 24;
const preview = ({ id, kind, title, video_url, images }: CourseResource): PracticalMaterial =>
  ({ id, kind, title, video_url, images });

function courseCodes(text: string) {
  const labelled = text.matchAll(/(?:^|[^A-Z0-9])([A-D]+(?:\s*[·,/&+~–-]\s*[A-D]+)*)\s*코스/g);
  return [...labelled].map(([, label]) => label.replace(/([A-D])\s*[~–-]\s*([A-D])/g, (_, start, end) => {
    const from = "ABCD".indexOf(start);
    const to = "ABCD".indexOf(end);
    return "ABCD".slice(Math.min(from, to), Math.max(from, to) + 1);
  })).join("").replace(/[^A-D]/g, "");
}

export function matchesPracticalMaterial({ scope, title }: Pick<CourseResource, "scope" | "title">, course: MaterialCourse) {
  if (course === "all") return true;
  const label = scope.normalize("NFKC").trim().toUpperCase();
  const codes = /^(?:[A-D]|AB|CD)$/.test(label) ? label : label === "구장 전체"
    ? courseCodes(title.normalize("NFKC").toUpperCase())
    : courseCodes(label);
  return [...course].some((code) => codes.includes(code));
}

export async function listPracticalMaterials(client: SupabaseClient, key: string, course: MaterialCourse, page: number): Promise<PracticalMaterialPage> {
  const start = (page - 1) * pageSize;
  if (course === "all") {
    const { items, total } = await listCourseResources(client, key, "video", start, "", false, pageSize);
    return { items: items.map(preview), hasNext: start + pageSize < total };
  }

  const items: PracticalMaterial[] = [];
  const seen = new Set<string>();
  let matches = 0;

  // The shared RPC pages the public rows. Count matching rows across batches before slicing.
  for (let offset = 0; ; offset += batchSize) {
    const batch = await listCourseResources(client, key, "video", offset, "", false, batchSize);
    for (const resource of batch.items) {
      if (seen.has(resource.id) || !matchesPracticalMaterial(resource, course)) continue;
      seen.add(resource.id);
      if (matches++ < start) continue;
      if (items.length === pageSize) return { items, hasNext: true };
      items.push(preview(resource));
    }
    if (batch.items.length < batchSize || offset + batchSize >= batch.total) return { items, hasNext: false };
  }
}
