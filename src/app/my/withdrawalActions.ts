"use server";
import {createClient} from "@/lib/supabase/server";
import {getWithdrawalRuntime} from "@/lib/auth/operatorRuntimeBindings.mjs";
import type {WithdrawalResult} from "@/lib/auth/accountWithdrawalTypes";

// A scope deliberately has no operational withdrawal runtime.
// Keep this explicit binding even if deployment environment variables are present.
function unavailable(): WithdrawalResult {
  if (getWithdrawalRuntime() !== null) return {status:"unavailable"};
  return {status:"not_configured"};
}
export async function prepareWithdrawalAction(expectedViewer: string): Promise<WithdrawalResult> {
  try {
    const client=await createClient();
    const {data,error}=await client.auth.getUser();
    if(error||!data.user||data.user.id!==expectedViewer)return {status:"auth_required"};
    return unavailable();
  } catch {return {status:"failed"};}
}
export async function executeWithdrawalAction(input: unknown): Promise<WithdrawalResult> {
  void input;
  try {
    const client=await createClient();
    const {data,error}=await client.auth.getUser();
    if(error||!data.user)return {status:"auth_required"};
    return unavailable();
  } catch {return {status:"failed"};}
}
// A scope cannot execute deletion or verify a receipt issued by another runtime.
export async function confirmWithdrawalAction(input: unknown): Promise<WithdrawalResult> {
  void input;
  return unavailable();
}
