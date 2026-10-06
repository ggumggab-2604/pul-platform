"use server";
import {revalidatePath} from "next/cache";
import {createClient} from "@/lib/supabase/server";
import {getAuthenticatedSupabaseContext} from "@/lib/supabase/auth";
import {StoreError,storeRpc,storeFilters,storeUuid,validateStoreCommand,type StoreCommand,type StorePage} from "@/lib/market/marketStores";
export async function loadStoresAction(search:string,own=false):Promise<StorePage>{
 const p=new URLSearchParams(search),id=p.get("store"),f=storeFilters(search);
 const c=own?await getAuthenticatedSupabaseContext():null;if(own&&!c)throw new StoreError("rejected","로그인이 필요합니다.");
 const client=c?.supabase??await createClient();
 if(id&&!own){if(!storeUuid.test(id))return {detail:null,items:[],hasMore:false};return {detail:await storeRpc(client,"get_market_store",{p_id:id}),items:[],hasMore:false};}
 return storeRpc<StorePage>(client,"list_market_stores",{p_query:f.query,p_region:f.region,p_status:f.status,p_offset:f.offset,p_own:own});
}
export async function saveStoreAction(command:StoreCommand){try{
 validateStoreCommand(command);const c=await getAuthenticatedSupabaseContext();if(!c)throw new StoreError("rejected","로그인이 필요합니다.");
 const data=await storeRpc<{id:string;deleted:boolean}>(c.supabase,"mutate_market_store",{p_input:command});
 if(!data||data.id!==command.id||data.deleted!==(command.operation==="delete"))throw new StoreError("uncertain","저장 결과를 확인하지 못했습니다. 같은 요청으로 확인해 주세요.");
 revalidatePath("/market");revalidatePath("/market/stores");revalidatePath("/my");return {ok:true as const,data};
 }catch(e){const error=e instanceof StoreError?e:new StoreError("uncertain","결과가 불확실합니다. 같은 요청 결과를 확인해 주세요.");return {ok:false as const,code:error.code,message:error.message};}}
