import Link from "next/link";
import {Container} from "@/components/ui/Container";
import {ClubPostDetail} from "@/components/clubs/detail/ClubPostDetail";
import {clubContentPage} from "@/lib/clubs/clubContentPage";
import {getClubPost} from "@/lib/clubs/clubActivities";
import {uuid} from "@/lib/courses/courseContent";
export const metadata={title:'동호회 글'};
export default async function ClubPostPage({params}:{params:Promise<{id:string;postId:string}>}){
 const {id,postId}=await params;const data=await clubContentPage(id).catch(()=>null);const post=data&&uuid.test(postId)?await getClubPost(data.client,postId).catch(()=>null):null;
 if(!data||!post||post.club_key!==id)return <Container className="py-8"><h1 className="text-xl font-bold">글을 확인할 수 없습니다.</h1><p className="my-4">회원 전용이거나 숨김·삭제된 글일 수 있습니다. 로그인 상태와 동호회 가입 상태를 확인해 주세요.</p><Link className="inline-flex min-h-11 items-center font-semibold text-pul-point" href={'/clubs/'+id}>동호회로 돌아가기</Link></Container>;
 return <Container className="py-6"><ClubPostDetail post={post} viewerId={data.viewerId} clubId={data.clubId} courses={data.courses} events={data.events}/></Container>;
}
