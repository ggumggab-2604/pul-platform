"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { courseInterestState,listInterests,marketInterestState,setInterest,type InterestKind,type InterestFilter } from "@/lib/interests/interests";
export async function listInterestsAction(kind:InterestFilter="all",offset=0) {return listInterests(await createClient(),kind,offset);}
export async function marketInterestStateAction(id:string,kind:"market"|"buy_request"|"vendor"|"startup_question"|"store"="market") {return marketInterestState(await createClient(),id,kind);}
export async function setInterestAction(kind:InterestKind,id:string,saved:boolean) {
  const result = await setInterest(await createClient(),kind,id,saved);
  revalidatePath("/my");
  return result;
}

export async function courseInterestStateAction(id:string) { return courseInterestState(await createClient(),id); }
