"use client";
import {useEffect,useRef,useState} from "react";
import {videoUrl} from "@/lib/courses/courseContent";
export function youtubeId(raw:string|null){try{return new URL(videoUrl(raw??"",true)).searchParams.get("v");}catch{return null;}}
export function ResourceThumbnail({url,title}:{url:string|null;title:string}){
 return <Thumbnail key={url} id={youtubeId(url)} title={title}/>;
}
function Thumbnail({id,title}:{id:string|null;title:string}){
 const [attempt,setAttempt]=useState(0),image=useRef<HTMLImageElement>(null);const sizes=["maxresdefault","hqdefault","mqdefault"];
 // A cached/tiny image may finish before hydration, before React's onLoad exists.
 // Advance once per source even when both the event and this check observe it.
 useEffect(()=>{const el=image.current;if(el?.complete&&el.naturalWidth<300)setAttempt(n=>n===attempt?n+1:n);},[attempt,id]);
 const next=()=>setAttempt(n=>n===attempt?n+1:n);
 if(!id||attempt>=sizes.length)return <div className="flex h-full min-h-32 items-center justify-center bg-pul-light text-sm text-pul-deep">동영상 · 원본 보기</div>;
 // YouTube can return a 120x90 placeholder with HTTP 200 for an absent size.
 // eslint-disable-next-line @next/next/no-img-element
 return <img ref={image} key={id+attempt} src={"https://i.ytimg.com/vi/"+id+"/"+sizes[attempt]+".jpg"} alt={title} loading="lazy" className="h-full w-full object-contain" onLoad={e=>{if(e.currentTarget.naturalWidth<300)next();}} onError={next}/>;
}
type Player={destroy:()=>void};
type YouTube={Player:new(element:HTMLIFrameElement,options:{events:{onReady:()=>void;onError:(event:{data:number})=>void}})=>Player};
let api:Promise<YouTube>|undefined;
function loadApi(){
 if(api)return api;
 api=new Promise<YouTube>((resolve,reject)=>{
  const win=window as Window&{YT?:YouTube;onYouTubeIframeAPIReady?:()=>void};if(win.YT?.Player){resolve(win.YT);return;}
  const previous=win.onYouTubeIframeAPIReady;win.onYouTubeIframeAPIReady=()=>{previous?.();if(win.YT)resolve(win.YT);else reject(Error("player"));};
  const script=document.createElement("script");script.src="https://www.youtube.com/iframe_api";script.onerror=()=>reject(Error("network"));document.head.append(script);
 });return api;
}
export function CourseResourceVideo({url,title}:{url:string;title:string}){
 const id=youtubeId(url),[playing,setPlaying]=useState(false),[error,setError]=useState("");const iframe=useRef<HTMLIFrameElement>(null);
 useEffect(()=>{if(!playing||!id)return;let active=true,player:Player|undefined;const timeout=setTimeout(()=>{if(active)setError("플레이어를 불러오지 못했습니다. 연결을 확인하거나 아래 원본 링크를 이용해 주세요.");},15000);
  void loadApi().then(YT=>{if(!active||!iframe.current)return;player=new YT.Player(iframe.current,{events:{onReady:()=>{if(active){clearTimeout(timeout);setError("");}},onError:event=>{if(active){clearTimeout(timeout);setError([100,101,150,153].includes(event.data)?"삭제·공개 설정 또는 외부 재생 제한으로 재생할 수 없습니다. 아래 원본 링크에서 확인해 주세요.":"영상을 재생하지 못했습니다. 아래 원본 링크에서 확인해 주세요.");}}}});}).catch(()=>{if(active){clearTimeout(timeout);setError("플레이어를 불러오지 못했습니다. 아래 원본 링크에서 확인해 주세요.");}});
  return()=>{active=false;clearTimeout(timeout);player?.destroy();};
 },[playing,id]);
 return <div>{id?<div className="relative aspect-video min-h-[210px] w-full overflow-hidden rounded-lg bg-black">{playing?<iframe ref={iframe} title={title} className="absolute inset-0 h-full w-full border-0" src={"https://www.youtube.com/embed/"+id+"?autoplay=1&playsinline=1&fs=1&enablejsapi=1&origin="+encodeURIComponent(window.location.origin)} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen referrerPolicy="strict-origin-when-cross-origin"/>:<button className="absolute inset-0 h-full w-full" type="button" aria-label="동영상 재생" onClick={()=>setPlaying(true)}><ResourceThumbnail url={url} title={title}/><span aria-hidden="true" className="absolute left-1/2 top-1/2 flex h-12 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-xl bg-red-600 text-2xl text-white">▶</span></button>}</div>:null}<a className="mt-3 inline-flex min-h-11 items-center text-sm text-pul-point underline" href={url} target="_blank" rel="noopener noreferrer">{id?"YouTube에서 원본 보기":"외부 원본 영상 보기"} ↗</a>{error?<p role="alert" className="text-sm leading-7 text-rose-700">{error}</p>:<p className="text-sm leading-7 text-pul-muted">원본의 공개 설정이나 삭제·재생 제한에 따라 영상이 재생되지 않을 수 있습니다.</p>}</div>;
}
