import {loadPersonalBests} from '@/lib/clubs/personalBestsServer';
import {PersonalBestsView,PersonalBestError} from '@/components/clubs/scores/PersonalBests';
export const dynamic='force-dynamic';
export default async function Page({params}:{params:Promise<{id:string}>}) {
 const {id}=await params;let data;
 try{data=await loadPersonalBests(id);}catch(e){return <PersonalBestError clubKey={id} message={e instanceof Error?e.message:'기록을 불러오지 못했습니다.'}/>;}
 return <PersonalBestsView data={data}/>;
}
