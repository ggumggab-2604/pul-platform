import { redirect } from "next/navigation";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { CourseApplicationWorkspace } from "@/components/courses/CourseApplicationWorkspace";
export default async function CourseApplicationReviewPage(){if(!await getAuthenticatedSupabaseContext())redirect("/login?next=/courses/manage/applications");return <CourseApplicationWorkspace mode="review"/>;}
