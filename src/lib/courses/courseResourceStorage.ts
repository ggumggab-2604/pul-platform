import "server-only";
import {createClient} from "@supabase/supabase-js";
import {getSupabasePublicEnv} from "@/lib/supabase/env";
let client:ReturnType<typeof createClient>|undefined;
export function resourceStorage(){if(client)return client;const key=process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();if(!key)throw new Error("이미지 저장 서비스를 사용할 수 없습니다.");client=createClient(getSupabasePublicEnv().url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});return client;}
