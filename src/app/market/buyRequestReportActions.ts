"use server";
import {createClient} from "@/lib/supabase/server";
import type {MarketListingReportInput} from "@/lib/market/marketListingReports";
export async function submitBuyRequestReportAction(input:MarketListingReportInput){
 try{const c=await createClient();const {data,error}=await c.rpc("submit_market_buy_request_report",{p_buy_request_id:input.listingId,p_reason_code:input.reasonCode,p_note:input.note,p_request_id:input.requestId});
 if(error||!data?.report_key)return {ok:false as const,error:"신고를 접수하지 못했습니다. 로그인 상태와 내용을 확인하고 다시 시도해 주세요."};return {ok:true as const};
 }catch{return {ok:false as const,error:"연결을 확인하고 다시 시도해 주세요."};}}
