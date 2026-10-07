import { redirect } from "next/navigation";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { CourseApplicationWorkspace } from "@/components/courses/CourseApplicationWorkspace";
export default async function CourseApplyPage(){if(!await getAuthenticatedSupabaseContext())redirect("/login?next=/courses/apply");return <CourseApplicationWorkspace mode="entry"/>;}
