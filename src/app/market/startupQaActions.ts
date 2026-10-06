"use server";
import {revalidatePath} from "next/cache";
import {createClient} from "@/lib/supabase/server";
import {getAuthenticatedSupabaseContext} from "@/lib/supabase/auth";
import {QaError,qaFilters,qaRpc,qaUuid,validateQaCommand,type QaCommand,type QaData} from "@/lib/market/marketStartupQa";
export async function loadStartupQaAction(search:string):Promise<QaData>{
 const p=new URLSearchParams(search),id=p.get("question"),f=qaFilters(search),client=await createClient();
 if(id){
  if(!qaUuid.test(id))return {items:[],hasMore:false,detail:null,answers:[],answerHasMore:false};
  return qaRpc<QaData>(client,"get_startup_qa_question",{p_id:id,p_answer_offset:f.answerOffset});
 }
 return qaRpc<QaData>(client,"list_startup_qa_questions",{p_query:f.query,p_category:f.category,p_offset:f.offset});
}
export async function saveStartupQaAction(command:QaCommand){
 try{
  validateQaCommand(command);
  const context=await getAuthenticatedSupabaseContext();
  if(!context)throw new QaError("rejected","로그인 후 다시 작성해 주세요.");
  // Actor is never supplied by the browser. The RPC enforces active account,
  // ownership, version and question visibility in the same transaction.
  const data=await qaRpc<{id:string;questionId:string;deleted:boolean}>(context.supabase,"mutate_startup_qa",{p_input:command});
  if(!data||data.id!==command.id||!qaUuid.test(data.questionId)||typeof data.deleted!=="boolean")throw new QaError("uncertain","저장 응답을 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.");
  revalidatePath("/market");revalidatePath("/my");
  return {ok:true as const,data};
 }catch(e){
  const error=e instanceof QaError?e:new QaError("uncertain","결과를 확인하지 못했습니다. 같은 요청으로 다시 확인해 주세요.");
  return {ok:false as const,code:error.code,message:error.message};
 }
}

