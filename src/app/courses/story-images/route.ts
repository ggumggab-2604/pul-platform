import {createHash} from "node:crypto";
import {getAuthenticatedSupabaseContext} from "@/lib/supabase/auth";
import {readPhotoForm,PhotoRequestError} from "@/lib/images/photoRequest";
import {validatePhotoBytes} from "@/lib/images/validatePhotoBytes";
import {validateClubMediaDeclaration,validateClubMediaFilename,validateClubMediaBytes} from "@/lib/clubs/clubMediaValidation";
import {resourceStorage} from "@/lib/courses/courseResourceStorage";
import {contentRpc,uuid} from "@/lib/courses/courseContent";
export async function POST(request:Request){const headers={"Cache-Control":"private, no-store"};try{
 const origin=request.headers.get("origin");if(!origin||new URL(origin).host!==request.headers.get("host")||!["http:","https:"].includes(new URL(origin).protocol)||request.headers.get("sec-fetch-site")&&request.headers.get("sec-fetch-site")!=="same-origin")return Response.json({error:"요청 경로를 확인해 주세요."},{status:403,headers});
 const ctx=await getAuthenticatedSupabaseContext();if(!ctx)return Response.json({error:"로그인이 필요합니다."},{status:401,headers});
 const form=await readPhotoForm(request),file=form.get("file"),key=String(form.get("courseKey")??""),requestId=String(form.get("requestId")??"");if(!(file instanceof File)||!uuid.test(requestId))throw Error("사진과 요청 정보를 확인해 주세요.");
 const mime=validateClubMediaDeclaration(file.type,file.size);validateClubMediaFilename(file.name,mime);const bytes=new Uint8Array(await file.arrayBuffer());validateClubMediaBytes(bytes,mime,file.size,file.type);await validatePhotoBytes(bytes,mime,"photo");const hash=createHash("sha256").update(bytes).digest("hex"),service=resourceStorage();
 const intent=await contentRpc<{id:string;ready:boolean}>(service,"course_story_image_prepare",{p_actor:ctx.userId,p_course_key:key,p_request_id:requestId,p_mime:mime,p_bytes:file.size,p_hash:hash});
 if(!intent.ready){const saved=await service.storage.from("course-story-images").upload(intent.id,bytes,{contentType:mime,upsert:false});if(saved.error){const existing=await service.storage.from("course-story-images").download(intent.id);if(existing.error||!existing.data||createHash("sha256").update(new Uint8Array(await existing.data.arrayBuffer())).digest("hex")!==hash)throw Error("사진을 저장하지 못했습니다. 입력과 선택 사진을 유지합니다.");}await contentRpc(service,"course_story_image_finish",{p_actor:ctx.userId,p_id:intent.id,p_hash:hash});}
 bytes.fill(0);return Response.json({id:intent.id},{headers});
 }catch(e){return Response.json({error:e instanceof Error&&/[가-힣]/.test(e.message)?e.message:"사진 형식·긴 변 800px·처리 후 4MB 크기를 확인해 주세요."},{status:e instanceof PhotoRequestError?413:400,headers});}}
