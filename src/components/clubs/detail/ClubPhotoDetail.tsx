"use client";
import Image from "next/image";
import Link from "next/link";
import {useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {MessagingSessionBoundary} from "@/components/messaging/MessagingSessionBoundary";
import {clubPhotoUrl,type ClubGalleryItem} from "@/lib/clubs/clubGallery";
import type {ClubPostingCourse} from "@/lib/clubs/clubActivities";
import {ClubPhotoEditor} from "./ClubPhotoEditor";
import {ClubContentReport} from "./ClubContentReport";
import {clubButton} from "./ClubEditorDialog";
type Props={clubKey:string;clubId?:string;viewerId?:string;item:ClubGalleryItem;courses:ClubPostingCourse[]};
export function ClubPhotoDetail(props:Props){return props.viewerId?<MessagingSessionBoundary viewerId={props.viewerId}><Detail {...props}/></MessagingSessionBoundary>:<Detail {...props}/>;}
function Detail({clubKey,clubId,viewerId,item,courses}:Props){const router=useRouter(),[edit,setEdit]=useState(false),[report,setReport]=useState(false);const trigger=useRef<HTMLElement|null>(null);const close=()=>{setEdit(false);setReport(false);requestAnimationFrame(()=>trigger.current?.focus());};return <article className="rounded-xl border border-pul-border bg-white p-4 sm:p-6"><Link className={clubButton} href={'/clubs/'+clubKey+'#club-gallery'}>동호회 갤러리</Link><h1 className="my-4 break-words text-xl font-bold">{item.caption||'동호회 사진'}</h1><p className="mb-3 text-sm text-pul-muted">{item.visibility==='public'?'전체 공개':'회원만'}{item.hidden?' · 숨김':''}</p><Image unoptimized width={800} height={600} src={clubPhotoUrl(item.id)} alt={item.caption||'동호회 사진'} className="max-h-[70dvh] w-full object-contain"/><div className="mt-4 flex flex-wrap gap-2">{item.can_edit&&clubId&&viewerId?<button className={clubButton} onClick={e=>{trigger.current=e.currentTarget;setEdit(true);}}>사진 수정·숨김</button>:null}{!item.is_owner?(viewerId?<button className={clubButton} onClick={e=>{trigger.current=e.currentTarget;setReport(true);}}>사진 신고</button>:<Link className={clubButton} href={'/login?next='+encodeURIComponent('/clubs/'+clubKey+'/photos/'+item.id)}>로그인 후 신고</Link>):null}</div>{edit&&clubId&&viewerId?<ClubPhotoEditor clubId={clubId} viewerId={viewerId} item={item} courses={courses} onClose={close} onSaved={()=>{close();router.refresh();}}/>:null}{report?<ClubContentReport mediaId={item.id} onClose={close}/>:null}</article>;}
