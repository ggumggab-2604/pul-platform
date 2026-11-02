import {NextResponse} from 'next/server';
import {getAuthenticatedSupabaseContext} from '@/lib/supabase/auth';
import {resourceStorage} from '@/lib/courses/courseResourceStorage';
import {validatePhotoBytes} from '@/lib/images/validatePhotoBytes';
import {PHOTO_MULTIPART_BYTES} from '@/lib/images/photoPolicy';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(request:Request){const headers={'Cache-Control':'private, no-store','Vary':'Cookie'};try{
 const ctx=await getAuthenticatedSupabaseContext();if(!ctx)return NextResponse.json({error:'로그인 상태를 확인해 주세요.'},{status:401,headers});
 const length=Number(request.headers.get('content-length'));if(!Number.isFinite(length)||length<=0||length>PHOTO_MULTIPART_BYTES)return NextResponse.json({error:'사진 전송 크기를 확인해 주세요.'},{status:413,headers});
 const form=await request.formData(),file=form.get('file'),entry=form.get('entry_id');if(!(file instanceof File)||typeof entry!=='string')throw Error('사진과 참가자를 확인해 주세요.');
 const bytes=new Uint8Array(await file.arrayBuffer());await validatePhotoBytes(bytes,file.type,'photo');
 const prep=await ctx.supabase.rpc('prepare_tournament_award_photo',{p_entry_id:entry,p_mime:file.type});if(prep.error)return NextResponse.json({error:'본인 또는 회장·부회장의 현재 등록 권한을 확인해 주세요.'},{status:403,headers});
 const storage=resourceStorage();const upload=await storage.storage.from('tournament-awards-private').upload(prep.data.path,bytes,{contentType:file.type,upsert:false});if(upload.error)throw Error('사진 저장에 실패했습니다. 다시 시도해 주세요.');
 const ready=await storage.rpc('complete_tournament_award_photo',{p_photo_id:prep.data.id,p_owner_id:ctx.userId});if(ready.error)throw Error('사진 제출 준비에 실패했습니다. 다시 시도해 주세요.');return NextResponse.json({id:prep.data.id},{headers});
 }catch(e){return NextResponse.json({error:e instanceof Error&&/[가-힣]/.test(e.message)?e.message:'사진을 처리하지 못했습니다. 다시 시도해 주세요.'},{status:400,headers});}}
