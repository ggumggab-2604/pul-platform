import { redirect } from "next/navigation";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { CourseApplicationWorkspace } from "@/components/courses/CourseApplicationWorkspace";
export default async function CourseApplicationsPage(){if(!await getAuthenticatedSupabaseContext())redirect("/login?next=/courses/applications");return <CourseApplicationWorkspace mode="mine"/>;}
