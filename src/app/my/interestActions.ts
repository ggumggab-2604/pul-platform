"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { listInterests,marketInterestState,setInterest,type InterestKind,type InterestFilter } from "@/lib/interests/interests";
export async function listInterestsAction(kind:InterestFilter="all",offset=0) {return listInterests(await createClient(),kind,offset);}
export async function marketInterestStateAction(id:string) {return marketInterestState(await createClient(),id);}
export async function setInterestAction(kind:InterestKind,id:string,saved:boolean) {
  const result = await setInterest(await createClient(),kind,id,saved);
  revalidatePath("/my");
  return result;
}
