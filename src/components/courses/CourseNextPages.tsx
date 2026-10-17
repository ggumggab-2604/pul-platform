import "server-only";
import {redirect} from "next/navigation";
import Link from "next/link";
import {getAuthenticatedSupabaseContext} from "@/lib/supabase/auth";
import {MessagingSessionBoundary} from "@/components/messaging/MessagingSessionBoundary";
import {SharedInquiry,CourseInvitations} from "./CourseNextUI";
export async function NextCoursePage({courseKey,threadId,manage=false,invitations=false}:{courseKey?:string;threadId?:string;manage?:boolean;invitations?:boolean}){
 const path=invitations?"/my/course-invitations":manage?"/courses/"+courseKey+"/inquiries"+(threadId?"/"+threadId:""):"/messages/courses"+(threadId?"/"+threadId:"");
 const c=await getAuthenticatedSupabaseContext();if(!c)redirect("/login?next="+encodeURIComponent(path));
 return <main className="mx-auto max-w-4xl space-y-4 px-3 py-6"><nav className="flex flex-wrap gap-4"><Link className="inline-flex min-h-11 items-center underline" href="/messages">개인 쪽지함</Link><Link className="inline-flex min-h-11 items-center underline" href="/messages/courses">내 구장 문의</Link>{courseKey?<Link className="inline-flex min-h-11 items-center underline" href={"/courses/"+courseKey}>구장 상세</Link>:null}</nav><MessagingSessionBoundary viewerId={c.userId}>{invitations?<CourseInvitations/>:<SharedInquiry courseKey={courseKey} threadId={threadId} manage={manage}/>}</MessagingSessionBoundary></main>;
}
