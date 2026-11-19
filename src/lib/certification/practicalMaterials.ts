import type { SupabaseClient } from "@supabase/supabase-js";
import { listCourseResources, type CourseResource } from "@/lib/courses/courseContent";
import { listCourseMaterialSelection, type MaterialKind } from "@/lib/courses/courseMaterialSelection";
import type { MaterialCourse } from "./examPrepSelection";

type PracticalMaterial = Pick<CourseResource, "id" | "kind" | "title" | "video_url" | "images">;
export type PracticalMaterialPage = {
  items: PracticalMaterial[];
  counts: Record<MaterialKind, number>;
  hasNext: boolean;
};

const pageSize = 9;
const preview = ({ id, kind, title, video_url, images }: CourseResource): PracticalMaterial =>
  ({ id, kind, title, video_url, images });

export async function listPracticalMaterials(
  client: SupabaseClient, key: string, course: MaterialCourse, page: number, kind: MaterialKind = "video",
): Promise<PracticalMaterialPage> {
  const offset = (page - 1) * pageSize;
  const other = kind === "video" ? "yardage" : "video";
  const [current, inactive] = await Promise.all([
    listCourseMaterialSelection(client, key, kind, offset, pageSize, course),
    course === "all"
      ? listCourseResources(client, key, other, 0, "", false, 1)
      : listCourseMaterialSelection(client, key, other, 0, 1, course),
  ]);
  return {
    items: current.items.map(preview),
    counts: kind === "video" ? { video: current.total, yardage: inactive.total } : { video: inactive.total, yardage: current.total },
    hasNext: offset + pageSize < current.total,
  };
}
