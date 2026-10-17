import {redirect} from "next/navigation";
import {getAuthenticatedSupabaseContext} from "@/lib/supabase/auth";
import {getPublicCourse} from "@/lib/courses/courseDirectory";
import {CourseApplicationWorkspace} from "@/components/courses/CourseApplicationWorkspace";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;const c=await getAuthenticatedSupabaseContext();if(!c)redirect("/login?next="+encodeURIComponent("/courses/"+id+"/operator-apply"));const course=await getPublicCourse(c.supabase,id);return <CourseApplicationWorkspace mode="entry" initialCourse={course}/>;}
