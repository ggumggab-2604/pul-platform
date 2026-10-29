import Link from "next/link";
import {Container} from "@/components/ui/Container";
import {ClubActivitiesPanel} from "@/components/clubs/detail/ClubActivitiesPanel";
import {clubContentPage} from "@/lib/clubs/clubContentPage";
import {listClubActivities} from "@/lib/clubs/clubActivities";
export const metadata={title:'동호회 활동기록'};
export default async function ActivitiesPage({params}:{params:Promise<{id:string}>}){
 const {id}=await params;const data=await clubContentPage(id).catch(()=>null);if(!data)return <Container className="py-8"><h1 className="text-xl font-bold">동호회 활동기록</h1><p className="mt-4">동호회 정보를 불러오지 못했습니다.</p><Link href={'/clubs/'+id}>동호회로 돌아가기</Link></Container>;
 const initial=await listClubActivities(data.client,id,20).catch(()=>null);
 return <Container className="py-6"><Link className="mb-4 inline-flex min-h-11 items-center font-semibold text-pul-point" href={'/clubs/'+id}>동호회로 돌아가기</Link><ClubActivitiesPanel viewerId={data.viewerId} clubKey={id} clubId={data.clubId} initial={initial} courses={data.courses} events={data.events} canNotice={data.canNotice} full/></Container>;
}
