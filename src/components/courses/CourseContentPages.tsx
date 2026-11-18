import {SharedInquiry} from "./CourseNextUI";
import {CourseContentLink as Link} from "./CourseContentLink";
import {safeCourseReturn} from "@/lib/courses/courseNavigation";
import {safeMaterialReturn} from "@/lib/courses/courseMaterialNavigation";
import {notFound,redirect} from "next/navigation";
import type {ReactNode} from "react";
import {Container} from "@/components/ui/Container";
import {createClient} from "@/lib/supabase/server";
import {getAuthenticatedSupabaseContext} from "@/lib/supabase/auth";
import {getPublicCourse,CourseDirectoryError} from "@/lib/courses/courseDirectory";
import {contentRpc,getCourseResource,listCourseResources,type CourseNotice,type ContentWorkspace,uuid} from "@/lib/courses/courseContent";
import {CourseResourcePanel,CourseResourceDetail,CourseNotices} from "./CourseContentUI";
import {CourseResourceForm,CourseContentWorkspace} from "./CourseContentForms";
type Props={params:Promise<{id:string;resourceId?:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>};
async function context(key:string,requiredPath?:string){const auth=requiredPath?await getAuthenticatedSupabaseContext():null;if(requiredPath&&!auth)redirect("/login?next="+encodeURIComponent(requiredPath));const client=auth?.supabase??await createClient();try{return {client,course:await getPublicCourse(client,key)};}catch(e){if(e instanceof CourseDirectoryError&&e.code==="notFound")notFound();throw e;}}
function ExamReturn({ href }: { href: string }) {
  return href.startsWith("/certification?") ? <Link className="inline-flex min-h-11 items-center rounded-lg border border-pul-border px-3 font-bold text-pul-point" href={href}>실기 준비로 돌아가기</Link> : null;
}
function Frame({ courseKey, name, children, returnTo = "" }: { courseKey: string; name: string; children: ReactNode; returnTo?: string }) {
  return <Container className="max-w-5xl py-5">
    <nav aria-label="구장 자료 이동" className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
      <Link className="inline-flex min-h-11 items-center font-bold text-pul-deep" href={"/courses/" + courseKey}>{name}</Link>
      <ExamReturn href={returnTo} />
    </nav>
    {children}
  </Container>;
}
function resourceNavigation(q: Awaited<Props["searchParams"]>, id: string) {
  const returnTo = safeCourseReturn(q.returnTo);
  const params = new URLSearchParams();
  if (typeof q.returnTo === "string") params.set("returnTo", returnTo);
  if (typeof q.materialsReturn === "string") params.set("materialsReturn", safeMaterialReturn(q.materialsReturn, id));
  return { returnTo, suffix: params.size ? "?" + params : "" };
}
export async function ResourceListPage({params,searchParams}:Props){
 const {id}=await params,q=await searchParams;
 const kind=["video","yardage"].includes(String(q.kind))?String(q.kind):null;
 const query=typeof q.q==="string"?q.q.trim().slice(0,200):"",saved=q.saved==="1";
 const n=Math.max(1,Math.min(10000,Number.parseInt(String(q.page??"1"))||1));
 const filters=new URLSearchParams();if(kind)filters.set("kind",kind);if(query)filters.set("q",query);if(saved)filters.set("saved","1");if(n>1)filters.set("page",String(n));if(typeof q.returnTo==="string")filters.set("returnTo",safeCourseReturn(q.returnTo));
 const returnTo=safeCourseReturn(q.returnTo);
 const required=saved?"/courses/"+id+"/resources?"+filters.toString():undefined;
 const {client,course}=await context(id,required);
 let page:{items:Awaited<ReturnType<typeof getCourseResource>>[];total:number;limit:number;offset:number}={items:[],total:0,limit:12,offset:(n-1)*12},failed=false;
 try{page=await listCourseResources(client,id,kind,(n-1)*12,query,saved);}catch{failed=true;}
 return <Container className="py-5"><div className="mx-auto max-w-[1180px]"><nav className="mb-4 flex flex-wrap gap-x-4"><Link className="inline-flex min-h-11 items-center font-bold text-pul-deep" href={"/courses/"+id}>{course.name}</Link><ExamReturn href={returnTo}/></nav><CourseResourcePanel courseKey={id} screen={course.courseType==="screen"} page={page} all kind={kind??""} query={query} saved={saved} failed={failed}/></div></Container>;
}
export async function ResourceNewPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { returnTo, suffix } = resourceNavigation(await searchParams, id);
  const { course } = await context(id, "/courses/" + id + "/resources/new" + suffix);
  return <Frame courseKey={id} name={course.name} returnTo={returnTo}><CourseResourceForm courseKey={id} screen={course.courseType === "screen"}/></Frame>;
}
async function resourceFor(id: string, resourceId: string | undefined, requiredPath?: string) {
  if (!resourceId || !uuid.test(resourceId)) notFound();
  const c = await context(id, requiredPath);
  const resource = await getCourseResource(c.client, resourceId).catch((e) => { if (e?.code === "P0002") notFound(); throw e; });
  if (!resource || resource.course_key !== id) notFound();
  return { ...c, resource };
}
export async function ResourceDetailPage({ params, searchParams }: Props) {
  const { id, resourceId } = await params;
  const { course, resource } = await resourceFor(id, resourceId);
  const returnTo = safeCourseReturn((await searchParams).returnTo);
  return <Frame courseKey={id} name={course.name} returnTo={returnTo}>
    <CourseResourceDetail courseKey={id} resource={resource}/>
    <Link className="mt-4 inline-flex min-h-11 items-center font-bold text-pul-deep" href={"/courses/" + id + "/resources"}>자료 전체 목록</Link>
  </Frame>;
}
export async function ResourceEditPage({ params, searchParams }: Props) {
  const { id, resourceId } = await params;
  const { returnTo, suffix } = resourceNavigation(await searchParams, id);
  const { course, resource } = await resourceFor(id, resourceId, "/courses/" + id + "/resources/" + resourceId + "/edit" + suffix);
  return <Frame courseKey={id} name={course.name} returnTo={returnTo}>
    {resource.can_edit ? <CourseResourceForm courseKey={id} screen={course.courseType === "screen"} initial={resource}/> :
      <p>본인이 작성한 공개 자료만 수정할 수 있습니다.</p>}
  </Frame>;
}
export async function NoticeListPage({params,searchParams}:Props){const {id}=await params,{client,course}=await context(id);if(course.courseType!=="screen")notFound();const q=await searchParams,n=Math.max(1,Math.min(10000,Number.parseInt(String(q.page??"1"))||1));const page=await contentRpc<{items:CourseNotice[];total:number}>(client,"course_content_notices",{p_course_key:id,p_limit:20,p_offset:(n-1)*20});return <Frame courseKey={id} name={course.name}><CourseNotices courseKey={id} page={page} all/><nav className="mt-4 flex justify-center gap-5" aria-label="공지 페이지">{n>1?<Link href={"?page="+(n-1)}>이전</Link>:null}<span>{n} / {Math.max(1,Math.ceil(page.total/20))}</span>{n*20<page.total?<Link href={"?page="+(n+1)}>다음</Link>:null}</nav></Frame>}
export async function ContentManagePage({params}:Props){const {id}=await params,{client,course}=await context(id,"/courses/"+id+"/content/manage");let workspace:ContentWorkspace;try{workspace=await contentRpc<ContentWorkspace>(client,"course_content_workspace",{p_course_key:id});}catch{return <Frame courseKey={id} name={course.name}><p>현재 이 구장의 공지를 관리할 권한이 없습니다.</p></Frame>;}return <Frame courseKey={id} name={course.name}><CourseContentWorkspace courseKey={id} workspace={workspace}/></Frame>}
export async function InquiryPage({params}:Props){const {id}=await params;const {course}=await context(id,"/courses/"+id+"/inquiry");return <Frame courseKey={id} name={course.name}><SharedInquiry courseKey={id}/></Frame>;}
