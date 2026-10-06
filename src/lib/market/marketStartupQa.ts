import type {SupabaseClient} from "@supabase/supabase-js";
export const qaCategories={space:"공간·시설",equipment:"프로그램·장비",cost:"공사·비용",operation:"운영·매출",experience:"창업·운영 경험"} as const;
export type QaCategory=keyof typeof qaCategories;
export type QaQuestion={id:string;category:QaCategory;title:string;body:string;author:string;mine:boolean;version:number;createdAt:string;updatedAt:string;answerCount:number;lastAnswerAt:string|null};
export type QaAnswer={id:string;questionId:string;body:string;author:string;mine:boolean;version:number;createdAt:string;updatedAt:string;vendor:{id:string;name:string}|null};
export type QaData={items:QaQuestion[];hasMore:boolean;detail:QaQuestion|null;answers:QaAnswer[];answerHasMore:boolean};
export type QaCommand={target:"question"|"answer";operation:"create"|"update"|"delete";id:string;requestId:string;version:number;questionId?:string;category?:QaCategory;title?:string;body?:string};
export const qaUuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export class QaError extends Error{constructor(public code:string,message:string){super(message);}}
export function qaHref(search="",change:Record<string,string>={}){
 const p=new URLSearchParams(search);p.set("view","business");
 for(const [key,value] of Object.entries(change)){if(value)p.set(key,value);else p.delete(key);}
 return "/market?"+p;
}
export function qaFilters(search:string){
 const p=new URLSearchParams(search),category=p.get("qa_category")??"";
 const offset=Number(p.get("qa_offset")??0),answerOffset=Number(p.get("qa_answer_offset")??0);
 if(![offset,answerOffset].every(x=>Number.isInteger(x)&&x>=0&&x<=10000))throw new QaError("invalid","목록 범위를 확인해 주세요.");
 return {query:(p.get("qa_q")??"").trim().slice(0,100),category:Object.hasOwn(qaCategories,category)?category:"",offset,answerOffset};
}
export function validateQaCommand(c:QaCommand){
 if(!c||!["question","answer"].includes(c.target)||!["create","update","delete"].includes(c.operation)||
 !qaUuid.test(c.id)||!qaUuid.test(c.requestId)||!Number.isInteger(c.version)||c.version<0||
 (c.operation==="create"?c.version!==0:c.version<1)||
 Object.keys(c).some(k=>!["target","operation","id","requestId","version","questionId","category","title","body"].includes(k)))
 throw new QaError("invalid","요청을 확인해 주세요.");
 if(c.target==="answer"&&(!c.questionId||!qaUuid.test(c.questionId)))throw new QaError("invalid","질문을 확인해 주세요.");
 if(c.operation==="delete")return;
 if(c.target==="question"&&(!c.category||!Object.hasOwn(qaCategories,c.category)||typeof c.title!=="string"||!c.title.trim()||[...c.title].length>120))throw new QaError("invalid","분류와 제목(120자 이내)을 확인해 주세요.");
 if(typeof c.body!=="string"||!c.body.trim()||[...c.body].length>5000)throw new QaError("invalid","내용을 1~5,000자로 입력해 주세요.");
}
export async function qaRpc<T>(client:SupabaseClient,name:string,args:Record<string,unknown>):Promise<T>{
 let result;
 try{result=await client.rpc(name,args);}catch{throw new QaError("uncertain","결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.");}
 if(result.error){
  const e=result.error;
  if(e.code==="PGRST202")throw new QaError("unavailable","질문답변 저장 기능이 아직 연결되지 않았습니다. 입력을 보관해 주세요.");
  if(e.message?.includes("qa_conflict"))throw new QaError("conflict","다른 변경이 먼저 저장되었습니다. 입력을 보관하고 최신 글을 다시 확인해 주세요.");
  if(e.code==="42501"||e.message?.startsWith("qa_")||e.message?.startsWith("messaging_"))throw new QaError("rejected","본인 글인지, 질문 공개 상태와 계정 권한을 확인해 주세요.");
  throw new QaError("uncertain","결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.");
 }
 if(result.data===undefined)throw new QaError("uncertain","응답을 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.");
 return result.data as T;
}

