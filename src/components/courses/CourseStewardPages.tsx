import {MessagingSessionBoundary} from "@/components/messaging/MessagingSessionBoundary";
import "server-only";
import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import type {ReactNode} from "react";
import {createClient} from "@/lib/supabase/server";
import {getAuthenticatedSupabaseContext} from "@/lib/supabase/auth";
import {getPublicCourse} from "@/lib/courses/courseDirectory";
import {contentRpc,type ContentWorkspace,getCourseOverview} from "@/lib/courses/courseContent";
import {readStories,getStewardWorkspace,type StoryCategory,type StoryPage} from "@/lib/courses/courseSteward";
import {CourseManagement,CourseStoryList,CourseStoryDetail,CourseStoryEditor} from "./CourseStewardUI";
import {SharedInquiry} from "./CourseNextUI";
import {Container} from "@/components/ui/Container";
type Props={params:Promise<{id:string;postKey?:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>};
function Frame({courseKey,name,children}:{courseKey:string;name:string;children:ReactNode}){return <Container className="max-w-6xl py-5"><Link prefetch={false} className="mb-4 inline-flex min-h-11 items-center font-semibold text-pul-deep" href={`/courses/${courseKey}`}>← {name}</Link>{children}</Container>;}
async function context(id:string,required=false,path=`/courses/${id}/manage`){const ctx=await getAuthenticatedSupabaseContext();if(required&&!ctx)redirect(`/login?next=${encodeURIComponent(path)}`);const client=ctx?.supabase??await createClient();try{return {ctx,client,course:await getPublicCourse(client,id)};}catch(e){if(e&&typeof e==="object"&&"code" in e&&e.code==="notFound")notFound();throw e;}}
export async function StewardManagePage({params,searchParams}:Props){
 const {id}=await params,q=await searchParams,{ctx,client,course}=await context(id,true);
 const tab=typeof q.tab==="string"?q.tab:"info";
 if(course.courseType==="screen"&&tab==="stories")notFound();
 const result=await Promise.all([
  getStewardWorkspace(client,id),contentRpc<ContentWorkspace>(client,"course_content_workspace",{p_course_key:id}),
  getCourseOverview(client,id),course.courseType==="field"?readStories(client,id,{manage:true}):Promise.resolve({items:[],total:0,notice:[],can_manage:true,reports:[]} as StoryPage)
 ]).catch(e=>{if(e&&typeof e==="object"&&"code" in e&&e.code==="42501")return null;throw e;});
 if(!result)return <Frame courseKey={id} name={course.name}><p className="rounded-xl border border-pul-border bg-white p-5">현재 이 구장의 담당 관리 권한이 없습니다. 해제된 담당자는 편집·숨김·발송을 이용할 수 없습니다.</p></Frame>;
 const [workspace,content,overview,stories]=result;
 return <Frame courseKey={id} name={course.name}><CourseManagement courseKey={id} viewerId={ctx!.userId} workspace={workspace} content={content} stories={stories} tab={tab} platformManager={overview.manager}/></Frame>;
}
export async function StoryListPage({params,searchParams}:Props){const {id}=await params,q=await searchParams,{client,course}=await context(id);if(course.courseType!=="field")notFound();const category=["free","question","lost"].includes(String(q.category))?String(q.category) as StoryCategory:undefined,page=Math.max(1,Math.min(10000,Number(q.page)||1)),offset=(page-1)*20;const data=await readStories(client,id,{category,offset});return <Frame courseKey={id} name={course.name}><CourseStoryList courseKey={id} courseName={course.name} page={data} category={category} offset={offset}/></Frame>;}
export async function StoryDetailPage({params}:Props){
 const {id,postKey}=await params,{ctx,client,course}=await context(id);
 if(course.courseType!=="field"||!postKey||!/^[0-9a-f]{32}$/.test(postKey))notFound();
 const p=await readStories(client,id,{postKey}).catch(e=>{if(e&&typeof e==="object"&&"code" in e&&e.code==="P0002")notFound();throw e;});
 return <Frame courseKey={id} name={course.name}><CourseStoryDetail courseKey={id} viewerId={ctx?.userId??null} p={p}/></Frame>;
}
export async function StoryEditorPage({params,searchParams}:Props){const {id,postKey}=await params,q=await searchParams,{ctx,client,course}=await context(id,true,`/courses/${id}/stories/${postKey?postKey+"/edit":"new"}`);if(course.courseType!=="field")notFound();const notice=q.notice==="1";if(notice)await getStewardWorkspace(client,id);const initial=postKey?await readStories(client,id,{postKey}).catch(e=>{if(e&&typeof e==="object"&&"code" in e&&e.code==="P0002")notFound();throw e;}):undefined;if(initial&&!initial.can_edit)notFound();return <Frame courseKey={id} name={course.name}><CourseStoryEditor courseKey={id} viewerId={ctx!.userId} initial={initial} notice={notice}/></Frame>;}
export async function PrivateInquiryPage({params}:Props){const {id}=await params;const {course,ctx}=await context(id,true,"/courses/"+id+"/inquiry");return <Frame courseKey={id} name={course.name}><MessagingSessionBoundary viewerId={ctx!.userId}><SharedInquiry courseKey={id}/></MessagingSessionBoundary></Frame>;}
