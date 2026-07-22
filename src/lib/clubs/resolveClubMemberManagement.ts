import "server-only";

import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export type ClubMemberManagementIdentity = {
  clubLegacyId: string;
  clubUuid?: string;
  authenticatedUserId?: string;
  authenticationStatus: "signedIn" | "signedOut";
  availability: "available" | "clubNotFound" | "loadFailed";
  canRead: boolean;
};

async function resolveClubUuid(clubLegacyId: string): Promise<{
  clubUuid?: string;
  availability: ClubMemberManagementIdentity["availability"];
}> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("clubs")
      .select("id, legacy_key, club_status")
      .eq("legacy_key", clubLegacyId)
      .maybeSingle();

    if (error) return { availability: "loadFailed" };
    if (
      !data ||
      typeof data.id !== "string" ||
      data.legacy_key !== clubLegacyId ||
      data.club_status !== "active"
    ) {
      return { availability: "clubNotFound" };
    }
    return { clubUuid: data.id, availability: "available" };
  } catch {
    return { availability: "loadFailed" };
  }
}

export async function resolveClubMemberManagement(
  clubLegacyId: string,
): Promise<ClubMemberManagementIdentity> {
  const [club, context] = await Promise.all([
    resolveClubUuid(clubLegacyId),
    getAuthenticatedSupabaseContext(),
  ]);

  if (!context) {
    return {
      clubLegacyId,
      clubUuid: club.clubUuid,
      authenticationStatus: "signedOut",
      availability: club.availability,
      canRead: false,
    };
  }
  if (club.availability !== "available" || !club.clubUuid) {
    return {
      clubLegacyId,
      authenticatedUserId: context.userId,
      authenticationStatus: "signedIn",
      availability: club.availability,
      canRead: false,
    };
  }

  try {
    const { data, error } = await context.supabase.rpc(
      "current_user_has_club_permission",
      {
        p_club_id: club.clubUuid,
        p_permission_code: "club.members.read",
      },
    );
    if (error || typeof data !== "boolean") {
      return {
        clubLegacyId,
        clubUuid: club.clubUuid,
        authenticatedUserId: context.userId,
        authenticationStatus: "signedIn",
        availability: "loadFailed",
        canRead: false,
      };
    }
    return {
      clubLegacyId,
      clubUuid: club.clubUuid,
      authenticatedUserId: context.userId,
      authenticationStatus: "signedIn",
      availability: "available",
      canRead: data,
    };
  } catch {
    return {
      clubLegacyId,
      clubUuid: club.clubUuid,
      authenticatedUserId: context.userId,
      authenticationStatus: "signedIn",
      availability: "loadFailed",
      canRead: false,
    };
  }
}
