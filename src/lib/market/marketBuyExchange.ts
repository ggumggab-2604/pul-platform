import type { SupabaseClient } from "@supabase/supabase-js";
import type {MarketBuyRequest,MarketCategory,MarketTradeType,MarketListingContactMethod} from "@/types";
import {MarketError,parsePage,parseMutation,mapError,validateMarketContact,MARKET_POLICY_VERSION,MARKET_POLICY_ERROR,type MarketBuyRequestOperation} from "./market";
import type {MarketQuery} from "./marketNavigation";
export type BuyExchangeInput={removeMediaIds?:string[];requestType:"buy"|"exchange";title:string;category:MarketCategory;budget:number|null;budgetNegotiable:boolean;region:string;summary:string;exchangeWanted:string|null;tradeType:MarketTradeType;publicContactMethod:MarketListingContactMethod|null;publicContactValue:string;publicContactConsent:boolean;tradeNoticeConfirmed:boolean};
export type BuyExchangeDetail=MarketBuyRequest & {publicContactMethod:MarketListingContactMethod|null;publicContactValue:string|null;publicContactConsentValid:boolean;tradeNoticeConfirmed:boolean;tradeNoticeVersion:string|null};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cats=["club","ball","bag","apparel","shoes","practice","other"],regions=["전국","서울","경기","인천","충청","강원","전라","경상","제주"],trades=["direct","delivery","negotiable"];
function invalid():never{throw new MarketError("unknown","장터 응답 형식이 올바르지 않습니다.");}
export function buyExchangeHref(id:string){if(!uuid.test(id))invalid();return "/market?view=buy&request="+encodeURIComponent(id);}
export function buyExchangeStatus(item:Pick<MarketBuyRequest,"requestType"|"requestStatus">){return (item.requestType==="exchange"?"교환":"구매")+(item.requestStatus==="closed"?" 완료":" 중");}
export function validateBuyExchangeInput(input:BuyExchangeInput,update=false){
 const fail=(message:string):never=>{throw new MarketError("validation",message);};
 if(input.removeMediaIds!==undefined&&(!Array.isArray(input.removeMediaIds)||input.removeMediaIds.length>5||input.removeMediaIds.some(x=>!uuid.test(x))||new Set(input.removeMediaIds).size!==input.removeMediaIds.length))fail("삭제할 사진을 확인해 주세요.");
 const title=input.title.trim(),summary=input.summary.trim(),wanted=input.exchangeWanted?.trim()||null;
 if(!["buy","exchange"].includes(input.requestType))fail("글 유형을 확인해 주세요.");
 if(Array.from(title).length<2||Array.from(title).length>100)fail("제목은 2~100자로 입력해 주세요.");
 if(!cats.includes(input.category)||!regions.includes(input.region)||!trades.includes(input.tradeType))fail("카테고리·거래 방식·지역을 선택해 주세요.");
 if(Array.from(summary).length<10||Array.from(summary).length>1000)fail("내용은 10~1000자로 입력해 주세요.");
 if(input.requestType==="buy"){
  if(wanted!==null)fail("삽니다에는 교환 조건을 저장할 수 없습니다.");
  if(typeof input.budgetNegotiable!=="boolean"||(input.budgetNegotiable?input.budget!==null:typeof input.budget!=="number"||!Number.isSafeInteger(input.budget)||input.budget<1||input.budget>1000000000))fail("희망 예산을 입력하거나 예산 협의를 선택해 주세요.");
 }else if(input.budget!==null||input.budgetNegotiable||!wanted||Array.from(wanted).length<10||Array.from(wanted).length>1000)fail("원하는 교환 물품·조건은 10~1000자로 입력해 주세요.");
 if(input.tradeNoticeConfirmed!==true)fail(MARKET_POLICY_ERROR);
 const contact=input.publicContactMethod?validateMarketContact(input,!update):null;
 if(!contact&&(input.publicContactValue||input.publicContactConsent))fail("연락 방법을 확인해 주세요.");
 return {...input,title,summary,exchangeWanted:wanted,publicContactValue:contact?.publicContactValue??""};
}
export function parseBuyExchange(value:unknown):BuyExchangeDetail{
 if(!value||typeof value!=="object"||Array.isArray(value))invalid();const r=value as Record<string,unknown>;
 const keys=["id","title","category","region","budget","summary","author_display_name","request_status","created_at","updated_at","version","can_edit","request_type","budget_negotiable","exchange_wanted","trade_type","public_contact_method","public_contact_value","public_contact_consent_valid","trade_notice_confirmed","trade_notice_version","image_paths"];
 if(Object.keys(r).sort().join()!==keys.sort().join()||typeof r.id!=="string"||!uuid.test(r.id)||typeof r.title!=="string"||typeof r.summary!=="string"||typeof r.author_display_name!=="string"||!cats.includes(String(r.category))||!regions.includes(String(r.region))||!trades.includes(String(r.trade_type))||!["buy","exchange"].includes(String(r.request_type))||!["open","closed"].includes(String(r.request_status))||!Number.isSafeInteger(r.version)||Number(r.version)<1||typeof r.can_edit!=="boolean"||typeof r.budget_negotiable!=="boolean"||typeof r.public_contact_consent_valid!=="boolean"||typeof r.trade_notice_confirmed!=="boolean"||(r.trade_notice_version!==null&&r.trade_notice_version!==MARKET_POLICY_VERSION))invalid();
 if(r.request_type==="buy"?(r.exchange_wanted!==null||(r.budget_negotiable?r.budget!==null:typeof r.budget!=="number"||!Number.isSafeInteger(r.budget)||r.budget<1||r.budget>1000000000)):(r.budget!==null||r.budget_negotiable||typeof r.exchange_wanted!=="string"))invalid();
 if(!Array.isArray(r.image_paths)||r.image_paths.length>5||r.image_paths.some(p=>typeof p!=="string"||!p.startsWith(r.id+"/")||!uuid.test(p.split("/")[1])||p.split("/")[2]!=="original"||p.split("/").length!==3)||(r.request_type==="buy"&&r.image_paths.length))invalid();
 let c:{publicContactMethod:MarketListingContactMethod|null;publicContactValue:string|null}={publicContactMethod:null,publicContactValue:null};
 if(r.public_contact_method!==null){if(typeof r.public_contact_value!=="string")invalid();c=validateMarketContact({publicContactMethod:r.public_contact_method as MarketListingContactMethod,publicContactValue:r.public_contact_value,publicContactConsent:false},false);}else if(r.public_contact_value!==null)invalid();
 if(typeof r.created_at!=="string"||!Number.isFinite(Date.parse(r.created_at))||typeof r.updated_at!=="string"||!Number.isFinite(Date.parse(r.updated_at)))invalid();
 return {id:r.id,title:r.title,category:r.category as MarketCategory,region:r.region as string,budget:typeof r.budget==="number"?r.budget.toLocaleString("ko-KR")+"원":r.request_type==="exchange"?"교환합니다":"예산 협의",budgetAmount:r.budget as number|null,budgetNegotiable:r.budget_negotiable,requestType:r.request_type as "buy"|"exchange",summary:r.summary,exchangeWanted:r.exchange_wanted as string|null,tradeType:r.trade_type as MarketTradeType,authorNickname:r.author_display_name,createdAt:new Intl.DateTimeFormat("ko-KR",{year:"numeric",month:"short",day:"numeric"}).format(new Date(r.created_at)),requestStatus:r.request_status as "open"|"closed",version:r.version as number,canEdit:r.can_edit,isSample:false,...c,publicContactConsentValid:r.public_contact_consent_valid,tradeNoticeConfirmed:r.trade_notice_confirmed,tradeNoticeVersion:r.trade_notice_version as string|null,images:r.image_paths.map(p=>"/market/exchange-media/"+r.id+"/"+String(p).split("/")[1])};
}
export async function listBuyExchange(client:SupabaseClient,filters:Pick<MarketQuery,"keyword"|"category"|"region"|"status"|"requestType">,limit=24,offset=0){
 const {data,error}=await client.rpc("list_market_buy_requests_v3",{p_keyword:filters.keyword.trim()||null,p_category_code:filters.category==="all"?null:filters.category,p_region_code:filters.region==="전체"?null:filters.region,p_request_status:filters.status==="all"?null:filters.status,p_request_type:!filters.requestType||filters.requestType==="all"?null:filters.requestType,p_limit:limit,p_offset:offset});if(error)mapError(error);return parsePage(data,parseBuyExchange);
}
export async function getBuyExchange(client:SupabaseClient,id:string){if(!uuid.test(id))invalid();const {data,error}=await client.rpc("get_market_buy_request_v3",{p_buy_request_id:id});if(error)mapError(error);if(data===null)throw new MarketError("notFound","현재 볼 수 없는 글입니다.");return parseBuyExchange(data);}
export async function mutateBuyExchange(client:SupabaseClient,operation:MarketBuyRequestOperation,id:string|null,version:number|null,input:BuyExchangeInput|null,requestId:string){
 const v=input?validateBuyExchangeInput(input,operation==="update"):null;
 const {data,error}=await client.rpc("mutate_market_buy_request_v3",{p_operation:operation,p_buy_request_id:id,p_expected_version:version,p_request_id:requestId,p_payload:v?{remove_media_ids:v.removeMediaIds??[],title:v.title,category:v.category,budget:v.budget,budget_negotiable:v.budgetNegotiable,request_type:v.requestType,region:v.region,summary:v.summary,exchange_wanted:v.exchangeWanted,trade_type:v.tradeType,public_contact_method:v.publicContactMethod,public_contact_value:v.publicContactValue,public_contact_consent:v.publicContactConsent,trade_notice_confirmed:v.tradeNoticeConfirmed,trade_notice_version:MARKET_POLICY_VERSION}:{}});
 if(error)mapError(error);return parseMutation(data,"buy_request",requestId);
}
