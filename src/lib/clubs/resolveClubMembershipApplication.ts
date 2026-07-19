import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ClubJoinApplicationRuntimeIdentity, ClubRecruitStatus } from "@/types";

function isRecruitmentStatus(value: unknown): value is ClubRecruitStatus {
  return value === "recruiting" || value === "waiting" || value === "closed";
}

export async function resolveClubMembershipApplicationIdentity(
  clubLegacyId: string,
): Promise<ClubJoinApplicationRuntimeIdentity> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("clubs")
      .select("id, legacy_key, club_status, membership_recruitment_status")
      .eq("legacy_key", clubLegacyId)
      .maybeSingle();

    if (error) {
      return {
        clubLegacyId,
        featureAvailability: "unavailable",
        featureError: "loadFailed",
      };
    }

    if (
      !data ||
      typeof data.id !== "string" ||
      data.legacy_key !== clubLegacyId ||
      data.club_status !== "active" ||
      !isRecruitmentStatus(data.membership_recruitment_status)
    ) {
      return {
        clubLegacyId,
        featureAvailability: "unavailable",
        featureError: "clubNotFound",
      };
    }

    return {
      clubLegacyId,
      clubUuid: data.id,
      recruitmentStatus: data.membership_recruitment_status,
      featureAvailability: "available",
    };
  } catch {
    return {
      clubLegacyId,
      featureAvailability: "unavailable",
      featureError: "loadFailed",
    };
  }
}