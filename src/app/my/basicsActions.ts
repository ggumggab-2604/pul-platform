'use server';

import { revalidatePath } from 'next/cache';
import { getAuthenticatedSupabaseContext } from '@/lib/supabase/auth';
import type { ApplicationPhone, MemberBasics } from '@/lib/auth/memberBasics';

export async function saveMemberBasics(viewerId: string, input: MemberBasics) {
 const context = await getAuthenticatedSupabaseContext();
 if (!context || context.userId !== viewerId) return { error: '본인 로그인 상태를 확인해 주세요.' };
 if (!input || (input.gender !== null && input.gender !== 'male' && input.gender !== 'female') ||
     (input.phone !== null && (typeof input.phone !== 'string' || input.phone.length > 30)) ||
     [input.birthYear,input.birthMonth,input.birthDay].some(value => value !== null && !Number.isSafeInteger(value))) {
  return { error: '기본정보 입력 형식을 확인해 주세요.' };
 }
 const { error } = await context.supabase.rpc('save_my_member_basics', {
  p_viewer: viewerId, p_gender: input.gender, p_phone: input.phone,
  p_birth_year: input.birthYear, p_birth_month: input.birthMonth, p_birth_day: input.birthDay,
 });
 if (error) return { error: error.code === '22023' ? error.message : '기본정보를 저장하지 못했습니다. 로그인 상태와 입력을 확인해 주세요.' };
 revalidatePath('/my');
 return { ok: true };
}

export async function loadMyApplicationPhones(viewerId: string) {
 const context = await getAuthenticatedSupabaseContext();
 if (!context || context.userId !== viewerId) return { error: '본인 로그인 상태를 확인해 주세요.' };
 const { data,error } = await context.supabase.rpc('get_my_application_phones');
 if (error || !Array.isArray(data)) return { error: '가입 신청서 번호를 불러오지 못했습니다.' };
 return { choices: data as ApplicationPhone[] };
}
