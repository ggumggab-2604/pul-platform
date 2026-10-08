import { validatePhotoBytes } from "@/lib/images/validatePhotoBytes";
import { readPhotoForm, PhotoRequestError } from "@/lib/images/photoRequest";
import {createHash} from "node:crypto";
import {getAuthenticatedSupabaseContext} from "@/lib/supabase/auth";
import {validateClubMediaBytes,validateClubMediaDeclaration,validateClubMediaFilename} from "@/lib/clubs/clubMediaValidation";
import {resourceStorage} from "@/lib/courses/courseResourceStorage";
import {contentRpc,uuid} from "@/lib/courses/courseContent";
export async function POST(request:Request){
 const headers={"Cache-Control":"private, no-store"};
 try{
  const origin=request.headers.get("origin");
  // Next may construct an internal URL behind a proxy/custom server. Compare the browser origin to the received HTTP authority.
  if(!origin || new URL(origin).host!==request.headers.get("host") || !["http:","https:"].includes(new URL(origin).protocol) || (request.headers.get("sec-fetch-site") && request.headers.get("sec-fetch-site")!=="same-origin"))return Response.json({error:"요청 경로를 확인해 주세요."},{status:403,headers});
  const ctx=await getAuthenticatedSupabaseContext();if(!ctx)return Response.json({error:"로그인이 필요합니다."},{status:401,headers});
  const form=await readPhotoForm(request);
  const file=form.get("file"),key=String(form.get("courseKey")??""),requestId=String(form.get("requestId")??"");
  if(!(file instanceof File)||!uuid.test(requestId))throw new Error("파일과 요청 정보를 확인해 주세요.");
  const mime=validateClubMediaDeclaration(file.type,file.size);validateClubMediaFilename(file.name,mime);const bytes=new Uint8Array(await file.arrayBuffer());validateClubMediaBytes(bytes,mime,file.size,file.type);await validatePhotoBytes(bytes,mime,"document");const hash=createHash("sha256").update(bytes).digest("hex");
  const service=resourceStorage();const intent=await contentRpc<{id:string;ready:boolean}>(service,"course_content_image_prepare",{p_actor:ctx.userId,p_course_key:key,p_request_id:requestId,p_mime:mime,p_bytes:file.size,p_hash:hash});
  if(!intent.ready){const saved=await service.storage.from("course-resources").upload(intent.id,bytes,{contentType:mime,upsert:false});if(saved.error){const existing=await service.storage.from("course-resources").download(intent.id);if(existing.error||createHash("sha256").update(new Uint8Array(await existing.data.arrayBuffer())).digest("hex")!==hash)throw new Error("이미지를 저장하지 못했습니다. 다시 시도해 주세요.");}
   await contentRpc(service,"course_content_image_finish",{p_actor:ctx.userId,p_id:intent.id,p_hash:hash});
  }bytes.fill(0);return Response.json({id:intent.id},{headers});
 }catch(e){return Response.json({error:e instanceof Error&&/[가-힣]/.test(e.message)?e.message:"JPG·PNG·WebP 형식과 처리 후 4MB 크기를 확인해 주세요."},{status:e instanceof PhotoRequestError?413:400,headers});}
}
