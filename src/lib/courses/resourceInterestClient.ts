"use client";
import {createClient} from "@/lib/supabase/client";
import {resourceInterestReads,resourceInterestSave} from "@/app/courses/resourceInterestActions";
type Entry={saved?:boolean;pending?:boolean;busy?:boolean;error?:string;retry?:boolean};
type State={viewer:string|null|undefined;epoch:number;authError:boolean;entries:ReadonlyMap<string,Entry>};
const empty:State={viewer:undefined,epoch:0,authError:false,entries:new Map()};
const bounded=<T,>(request:Promise<T>)=>new Promise<T>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error("timeout")),12000);request.then(resolve,reject).finally(()=>clearTimeout(timer));});
// Resource-only browser state; no persistence, notification choices, or course-store changes.
export function createResourceInterestClient(){
 let state=empty,started=false,authRevision=0;
 const listeners=new Set<()=>void>(),watched=new Map<string,number>(),revisions=new Map<string,number>(),flights=new Map<string,Promise<void>>();
 let queued=new Set<string>(),scheduled=false;
 const emit=()=>listeners.forEach(fn=>fn());
 const patch=(id:string,value:Entry)=>{state={...state,entries:new Map(state.entries).set(id,value)};emit();};
 const current=(epoch:number,viewer:State["viewer"])=>epoch===state.epoch&&viewer===state.viewer;
 function identify(viewer:string|null){const changed=viewer!==state.viewer;state={viewer,epoch:state.epoch+(changed?1:0),authError:false,entries:changed?new Map():state.entries};if(changed){revisions.clear();flights.clear();queued.clear();}emit();if(changed)watched.forEach((_,id)=>queue(id));}
 async function verify(){const ticket=++authRevision;try{const {data,error}=await bounded(createClient().auth.getSession());if(ticket!==authRevision)return;if(error)throw error;identify(data.session?.user.id??null);}catch{if(ticket===authRevision){state={...state,authError:true};emit();}}}
 function start(){if(started||typeof window==="undefined")return;started=true;createClient().auth.onAuthStateChange((event,session)=>{if(event==="INITIAL_SESSION")return;authRevision++;identify(session?.user.id??null);});window.addEventListener("pul-auth-signed-out",()=>{authRevision++;identify(null);});window.addEventListener("focus",()=>{void verify().then(()=>watched.forEach((_,id)=>queue(id)));});void verify();}
 function queue(id:string){if(!state.viewer||state.authError||state.entries.get(id)?.busy||flights.has(id))return;queued.add(id);if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;const ids=[...queued];queued=new Set();for(let i=0;i<ids.length;i+=24)void read(ids.slice(i,i+24));});}
 function read(ids:string[]){
  ids=ids.filter(id=>!state.entries.get(id)?.busy&&!flights.has(id));
  if(!state.viewer||state.authError||!ids.length)return Promise.resolve();
  const {viewer,epoch}=state,versions=new Map(ids.map(id=>[id,revisions.get(id)??0]));
  ids.forEach(id=>patch(id,{...state.entries.get(id),pending:true}));
  const flight=bounded(resourceInterestReads(viewer,ids)).then(values=>{ids.forEach(id=>{if(!current(epoch,viewer)||versions.get(id)!==(revisions.get(id)??0))return;if(typeof values[id]!=="boolean")throw Error("unavailable");patch(id,{...state.entries.get(id),saved:values[id],pending:false,error:undefined,retry:undefined});});}).catch(()=>{ids.forEach(id=>{if(current(epoch,viewer)&&versions.get(id)===(revisions.get(id)??0))patch(id,{...state.entries.get(id),pending:false,error:"관심 상태를 확인하지 못했습니다. 다시 확인해 주세요."});});}).finally(()=>ids.forEach(id=>{if(flights.get(id)===flight)flights.delete(id);}));
  ids.forEach(id=>flights.set(id,flight));return flight;
 }
 async function choose(id:string){const previous=state.entries.get(id);if(!state.viewer||state.authError||previous?.saved===undefined||previous.busy)return false;
  const {viewer,epoch}=state,revision=(revisions.get(id)??0)+1,desired=previous.retry??!previous.saved;revisions.set(id,revision);flights.delete(id);patch(id,{...previous,busy:true,pending:false,error:undefined,retry:desired});
  try{const saved=await bounded(resourceInterestSave(viewer,id,desired));if(!current(epoch,viewer)||revisions.get(id)!==revision)return false;if(saved!==desired)throw Error("save");patch(id,{saved,busy:false});return true;}
  catch{if(current(epoch,viewer)&&revisions.get(id)===revision)patch(id,{...previous,busy:false,pending:false,retry:desired,error:"저장 결과를 확인하지 못했습니다. 같은 설정으로 다시 시도해 주세요."});return false;}
 }
 return {subscribe(fn:()=>void){listeners.add(fn);return()=>{listeners.delete(fn);};},snapshot:()=>state,serverSnapshot:()=>empty,watch(id:string){start();watched.set(id,(watched.get(id)??0)+1);queue(id);return()=>{const n=(watched.get(id)??1)-1;if(n)watched.set(id,n);else watched.delete(id);};},retry(id:string){if(state.authError){void verify().then(()=>queue(id));}else queue(id);},choose};
}
export const resourceInterests=createResourceInterestClient();
