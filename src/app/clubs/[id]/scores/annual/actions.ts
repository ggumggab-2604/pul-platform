"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { annualHref, validRoomId } from "@/lib/clubs/clubParticipation";
import type { Award } from "@/lib/clubs/annualClubActivity";

export async function confirmAnnualAward(viewerId: string, clubKey: string, year: number, category: Award, condition: string, member: string) {
  const context = await getAuthenticatedSupabaseContext();
  if (!context || context.userId !== viewerId || !validRoomId(member)) return { error: "로그인과 수상자 정보를 확인해 주세요." };
  const { error } = await context.supabase.rpc("confirm_club_annual_award", {
    p_club_key: clubKey, p_year: year, p_category: category, p_competition: condition, p_user: member,
  });
  if (error) return { error: error.code === "22023" || error.code === "42501" ? error.message : "수상 내역을 저장하지 못했습니다." };
  revalidatePath(annualHref(clubKey));
  return {};
}

