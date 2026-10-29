import Link from "next/link";
import {Container} from "@/components/ui/Container";
import {ClubPhotoDetail} from "@/components/clubs/detail/ClubPhotoDetail";
import {clubContentPage} from "@/lib/clubs/clubContentPage";
import {getClubGallery} from "@/lib/clubs/clubGallery";
export const metadata={title:'동호회 사진'};
export default async function ClubPhotoPage({params}:{params:Promise<{id:string;mediaId:string}>}){const {id,mediaId}=await params;const data=await clubContentPage(id).catch(()=>null);const gallery=data?await getClubGallery(data.client,id).catch(()=>null):null;const item=gallery?.items.find(p=>p.id===mediaId);return <Container className="py-6">{data&&item?<ClubPhotoDetail clubKey={id} clubId={data.clubId} viewerId={data.viewerId} item={item} courses={data.courses}/>:<div className="rounded-xl border bg-white p-5"><h1 className="text-xl font-bold">사진을 확인할 수 없습니다.</h1><p className="my-3">공개 범위와 로그인 상태를 확인해 주세요.</p><Link className="inline-flex min-h-11 items-center" href={'/clubs/'+id+'#club-gallery'}>동호회 갤러리</Link></div>}</Container>;}
