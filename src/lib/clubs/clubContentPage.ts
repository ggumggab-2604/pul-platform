import "server-only";
import {createClient} from "@/lib/supabase/server";
import {getClubProfile} from "./clubProfile";
import {resolveClubMembershipApplicationIdentity} from "./resolveClubMembershipApplication";
import {resolveClubCoreContent} from "./resolveClubCoreContent";
/** Existing identity and core reader retain membership/event permission contracts. */
export async function clubContentPage(key:string){
 const client=await createClient();const [{data:{user}},profile,identity]=await Promise.all([client.auth.getUser(),getClubProfile(client,key),resolveClubMembershipApplicationIdentity(key)]);
 const core=await resolveClubCoreContent(key,identity.clubUuid);
 return {client,viewerId:user?.id,clubId:identity.clubUuid,profile,canNotice:core.capabilities.canManageNotice,courses:profile.courses.filter(c=>c.course_status==='active'&&c.course_type==='field').map(c=>({courseKey:c.course_key,name:c.name})),events:core.officialEvents.map(e=>({id:e.id,title:e.title,startsAt:e.startsAt,visibility:e.visibility==='public'?'public':'club_members'}))};
}
