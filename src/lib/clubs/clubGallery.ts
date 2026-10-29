import type { SupabaseClient } from "@supabase/supabase-js";
export type ClubPhotoVisibility = "public" | "club_members";
export type ClubSharedCourse = { key:string;name:string;course_hidden?:boolean };
export type ClubGalleryItem = { id:string;caption:string|null;hidden:boolean;visibility:ClubPhotoVisibility;version:number;can_edit:boolean;is_owner:boolean;public_consent:boolean;can_restore:boolean;shared_course:ClubSharedCourse|null };
export type ClubGallery = { items:ClubGalleryItem[];primary_id:string|null;can_manage:boolean;can_upload:boolean;viewer_id:string|null;version:number|null };
export const clubPhotoUrl=(id:string)=>`/clubs/photos/${encodeURIComponent(id)}/file`;
export async function getClubGallery(client:SupabaseClient,key:string):Promise<ClubGallery>{
 const {data,error}=await client.rpc("get_club_gallery",{p_club_key:key});
 if(error||!data||!Array.isArray(data.items)||typeof data.can_manage!=="boolean"||typeof data.can_upload!=="boolean"||data.items.some((p:ClubGalleryItem)=>typeof p.id!=="string"||!["public","club_members"].includes(p.visibility)||typeof p.version!=="number"))throw Error("사진을 불러오지 못했습니다. 다시 불러와 주세요.");
 return {items:data.items.map((p:ClubGalleryItem)=>({id:p.id,caption:p.caption,hidden:p.hidden,visibility:p.visibility,version:p.version,can_edit:p.can_edit,is_owner:p.is_owner,public_consent:p.public_consent,can_restore:p.can_restore,shared_course:p.shared_course})),primary_id:data.primary_id,can_manage:data.can_manage,can_upload:data.can_upload,viewer_id:data.viewer_id,version:data.version};
}
