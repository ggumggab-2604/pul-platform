import {createClient} from "@/lib/supabase/server";
import {resourceStorage} from "@/lib/courses/courseResourceStorage";
import {uuid} from "@/lib/courses/courseContent";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}){
 const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"sandbox"},missing=()=>new Response(null,{status:404,headers});
 try{const {id}=await params;if(!uuid.test(id))return missing();const {data,error}=await(await createClient()).rpc("get_club_photo_file",{p_media_id:id});if(error||!data||data.id!==id||!["club-media","club-media-private"].includes(data.bucket)||!/^image\/(jpeg|png|webp)$/.test(data.mime_type))return missing();const file=await resourceStorage().storage.from(data.bucket).download(data.path);if(file.error||!file.data)return missing();return new Response(file.data,{headers:{...headers,"Content-Type":data.mime_type}});}catch{return missing();}
}
