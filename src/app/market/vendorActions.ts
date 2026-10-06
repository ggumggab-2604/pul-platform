"use server";
import {revalidatePath} from "next/cache";
import {createClient} from "@/lib/supabase/server";
import {getAuthenticatedSupabaseContext} from "@/lib/supabase/auth";
import {VendorError,vendorRpc,vendorUuid,validateVendorProfile,type Vendor,type VendorWorkspace,type VendorCommand} from "@/lib/market/marketVendors";
export async function loadVendorsAction(search:string){
 const p=new URLSearchParams(search),id=p.get("provider"),client=await createClient();
 if(id){if(!vendorUuid.test(id))return {detail:null,items:[] as Vendor[],hasMore:false};const detail=await vendorRpc<Vendor|null>(client,"get_market_vendor",{p_id:id});return {detail,items:[] as Vendor[],hasMore:false};}
 const offset=Number(p.get("care_offset")??0);if(!Number.isInteger(offset)||offset<0||offset>10000)throw new Error("목록 범위를 확인해 주세요.");
 return {...await vendorRpc<{items:Vendor[];hasMore:boolean}>(client,"list_market_vendors",{p_query:(p.get("care_q")??"").slice(0,100),p_region:(p.get("care_region")??"").slice(0,80),p_field:p.get("care_field")??"",p_offset:offset}),detail:null};
}
export async function loadVendorWorkspaceAction(manage=false){const c=await getAuthenticatedSupabaseContext();if(!c)throw new Error("로그인이 필요합니다.");return vendorRpc<VendorWorkspace[]>(c.supabase,"read_market_vendor_workspace",{p_manage:manage});}
export async function saveVendorAction(input:VendorCommand){try{const c=await getAuthenticatedSupabaseContext();if(!c)throw new VendorError("rejected","로그인이 필요합니다.");
 if(!vendorUuid.test(input.id)||!vendorUuid.test(input.requestId)||!Number.isInteger(input.version))throw new VendorError("invalid","요청을 확인해 주세요.");
 if(input.operation==="save"||input.operation==="submit")validateVendorProfile(input.profile!);
 // Workspace RPC repeats active account / owner / management authorization before mutation.
 const managed=["approve","reject","publish","restrict","restore"].includes(input.operation);
 const rows=await vendorRpc<VendorWorkspace[]>(c.supabase,"read_market_vendor_workspace",{p_manage:managed});
 if(!managed&&rows.length&&rows.every(x=>x.id!==input.id))throw new VendorError("rejected","내 업체만 수정할 수 있습니다.");
 const data=await vendorRpc<VendorWorkspace>(c.supabase,"mutate_market_vendor",{p_input:input});revalidatePath("/market");revalidatePath("/my");return {ok:true as const,data};
 }catch(e){const error=e instanceof VendorError?e:new VendorError("uncertain","결과가 불확실합니다. 같은 요청으로 다시 확인해 주세요.");return {ok:false as const,code:error.code,message:error.message};}}
