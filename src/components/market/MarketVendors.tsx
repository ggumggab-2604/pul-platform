"use client";
/* eslint-disable @next/next/no-img-element -- Same-origin private media must be reauthorized on every request. */
import {useEffect,useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {loadVendorsAction} from "@/app/market/vendorActions";
import {vendorFields,type Vendor,type VendorProfile} from "@/lib/market/marketVendors";
import {MarketInterest} from "@/components/interests/MarketInterest";
import {marketListingRegions} from "@/data/marketData";
export const vendorButton="inline-flex min-h-11 items-center justify-center rounded-lg border border-pul-border px-4 py-2 text-sm font-bold";
export const vendorInput="mt-1 min-h-11 w-full min-w-0 rounded-lg border border-pul-border bg-white p-3 text-base";
export function VendorProfileView({profile:p,id,authenticated=false,preview=false}:{profile:VendorProfile;id:string;authenticated?:boolean;preview?:boolean}){
 return <article className="min-w-0 space-y-5 break-words rounded-xl border border-pul-border bg-white p-4 sm:p-6">
 <header><p className="text-sm font-bold text-pul-point">주력 · {vendorFields[p.primary]}</p><h2 className="mt-2 text-2xl font-bold [overflow-wrap:anywhere]">{p.name}</h2><p className="mt-3 text-base leading-7">{p.summary}</p><p className="mt-2 text-sm text-pul-muted">소재 지역 {p.region} · 서비스 지역 {p.area}</p></header>
 {!preview?<div className="flex flex-wrap gap-2"><Link prefetch={false} href={`/messages/new?provider=${encodeURIComponent(id)}`} className={`${vendorButton} bg-pul-point text-white`}>업체에 문의</Link><MarketInterest id={id} kind="vendor" authenticated={authenticated}/></div>:<p className="rounded-lg bg-pul-light p-3 text-sm">공개 예정 미리보기 · 문의는 공개 승인 후 이용할 수 있습니다.</p>}
 <section><h3 className="font-bold">취급 분야</h3><div className="mt-2 flex flex-wrap gap-2">{p.fields.map(f=><span key={f} className="rounded-full bg-pul-light px-3 py-1 text-sm">{vendorFields[f]}</span>)}</div></section>
 <section><h3 className="font-bold">서비스 소개</h3><p className="mt-2 whitespace-pre-wrap leading-7">{p.services}</p></section><section><h3 className="font-bold">문의 전에 확인해 주세요</h3><p className="mt-2 whitespace-pre-wrap leading-7">{p.before}</p></section>
 {p.photos.length?<section><h3 className="mb-3 font-bold">대표 사진·작업 사례</h3><div className="grid gap-3 sm:grid-cols-2">{p.photos.map((photo,i)=><img key={photo} src={`/market/vendor-media/${photo}`} alt={`${p.name} ${i===0?"대표 사진":`작업 사례 ${i}`}`} className="w-full rounded-lg object-contain"/>)}</div></section>:null}
 </article>;
}
export function MarketVendors({search,authenticated}:{search:string;authenticated:boolean}){
 const router=useRouter(),params=new URLSearchParams(search),id=params.get("provider");
 const region=params.get("care_region")??"",regions=marketListingRegions.filter(value=>value!=="전체");
 const legacyRegion=region!==""&&!regions.some(value=>value===region);
 const [data,setData]=useState<{items:Vendor[];hasMore:boolean;detail:Vendor|null}|null>(null),[error,setError]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{let active=true;loadVendorsAction(search).then(x=>{if(active){setData(x);setError(false);}}).catch(()=>{if(active)setError(true);});return()=>{active=false;};},[search,retry]);
 function url(change:Record<string,string>){const p=new URLSearchParams(search);p.set("view","care");for(const [k,v] of Object.entries(change)){if(v)p.set(k,v);else p.delete(k);}return `/market?${p}`;}
 return <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-bold">장비 수리·제작</h2><Link prefetch={false} href="/market/providers" className={vendorButton}>업체 등록·관리</Link></div>
 {id?<><Link href={url({provider:""})} className={vendorButton}>← 업체 목록</Link>{data?.detail?<VendorProfileView profile={data.detail.profile} id={data.detail.id} authenticated={authenticated}/>:data&&!error?<p role="status" className="rounded-xl border p-5">비공개이거나 존재하지 않는 업체입니다.</p>:null}</>:<><p className="text-sm leading-6 text-pul-muted">필요한 작업과 서비스 지역을 확인하고 업체에 직접 문의하세요.</p><form key={search} className="grid grid-cols-2 gap-3 lg:grid-cols-[minmax(8rem,1fr)_minmax(8rem,1fr)_minmax(0,3fr)]" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);router.push(url({care_q:String(f.get("q")),care_region:String(f.get("region")),care_field:String(f.get("field")),care_offset:""}));}}>
 <label className="min-w-0 text-sm font-bold">취급 분야<select name="field" defaultValue={params.get("care_field")??""} className={vendorInput}><option value="">전체</option>{Object.entries(vendorFields).map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
 <label className="min-w-0 text-sm font-bold">서비스 지역<select name="region" defaultValue={region} className={vendorInput}><option value="">전체</option>{regions.map(value=><option key={value} value={value}>{value}</option>)}{legacyRegion?<option value={region}>기존 조건: {region}</option>:null}</select></label>
 <div className="col-span-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto] gap-3 lg:col-span-1"><label className="min-w-0 text-sm font-bold">업체 검색<input name="q" maxLength={100} defaultValue={params.get("care_q")??""} className={vendorInput} placeholder="업체명·소개 검색"/></label><button type="submit" className={`${vendorButton} self-end bg-pul-point text-white`}>검색</button></div></form>
 {data?.items.length===0&&!error?<p className="rounded-xl bg-pul-light/30 p-5">조건에 맞는 공개 업체가 없습니다.</p>:null}<div className="grid gap-3 sm:grid-cols-2">{data?.items.map(v=><article key={v.id} className="min-w-0 rounded-xl border border-pul-border p-4"><Link prefetch={false} href={url({provider:v.id})} className="block min-h-11"><p className="text-sm font-bold text-pul-point">주력 · {vendorFields[v.profile.primary]}</p><h3 className="mt-1 text-lg font-bold [overflow-wrap:anywhere]">{v.profile.name}</h3><p className="mt-2 text-sm leading-6">{v.profile.summary}</p><p className="mt-2 text-sm text-pul-muted">{v.profile.region} · {v.profile.area}</p></Link><div className="mt-3"><MarketInterest id={v.id} kind="vendor" authenticated={authenticated}/></div></article>)}</div>
 <div className="flex flex-wrap gap-2">{Number(params.get("care_offset"))>0?<Link className={vendorButton} href={url({care_offset:String(Math.max(0,Number(params.get("care_offset"))-12))})}>이전</Link>:null}{data?.hasMore?<Link className={vendorButton} href={url({care_offset:String(Number(params.get("care_offset")??0)+12)})}>다음</Link>:null}</div></>}
 {error?<div role="alert" className="rounded-lg border p-4">업체 정보를 불러오지 못했습니다. <button className={vendorButton} onClick={()=>setRetry(x=>x+1)}>다시 시도</button></div>:!data?<p role="status">업체 정보를 불러오는 중…</p>:null}
 </div>;
}
