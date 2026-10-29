import {Container} from "@/components/ui/Container";
import {ClubProfileForm} from "@/components/clubs/ClubProfileForm";
import {getClubSettings,getClubProfile} from "@/lib/clubs/clubProfile";
import {createClient} from "@/lib/supabase/server";
import Link from "next/link";
export default async function ClubEditPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;const client=await createClient();const {data:{user}}=await client.auth.getUser();
 const result=await Promise.all([getClubSettings(client,id),getClubProfile(client,id)]).catch(()=>null);
 if(!result||!user)return <Container className="py-10"><h1 className="text-2xl font-bold">동호회 정보 수정</h1><p role="alert" className="my-5">정보 설정 권한이 없거나 정보를 불러오지 못했습니다. 현재 로그인·동호회 소속을 확인해 주세요.</p><Link href={"/clubs/"+id}>동호회로 돌아가기</Link></Container>;
 const [settings,profile]=result;
 return <Container className="py-8"><Link href={"/clubs/"+id} className="text-pul-point">동호회로 돌아가기</Link><section className="mx-auto mt-5 max-w-4xl rounded-xl border border-pul-border bg-white p-5 sm:p-8"><h1 className="mb-5 text-2xl font-bold">동호회 정보 수정</h1><p className="mb-4 text-sm text-pul-muted">현재 연결: {profile.courses.length?profile.courses.map(c=>c.name+(c.course_status!=="active"?" (비활성)":"")).join(" · "):"없음"}</p><ClubProfileForm viewerId={user.id} initialCourseNames={Object.fromEntries(profile.courses.map(c=>[c.course_key,c.name+(c.course_status!=="active"?" (비활성)":"")]))} key={settings.version} initial={settings.payload} clubKey={id} version={settings.version} linkConflict={profile.link_conflict}/></section></Container>;
}
