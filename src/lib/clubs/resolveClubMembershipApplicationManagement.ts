import "server-only";

import type { ClubMembershipApplicationManagementPermissions } from "@/lib/clubs/membershipApplicationManagement";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export type ClubMembershipApplicationManagementIdentity = {
  clubLegacyId: string;
  clubUuid?: string;
  authenticatedUserId?: string;
  authenticationStatus: "signedIn" | "signedOut";
  availability: "available" | "clubNotFound" | "loadFailed";
  permissions: ClubMembershipApplicationManagementPermissions;
};

const noPermissions: ClubMembershipApplicationManagementPermissions = {
  canRead: false,
  canManage: false,
  canDecide: false,
};

async function resolveClubUuid(clubLegacyId: string): Promise<{
  clubUuid?: string;
  availability: ClubMembershipApplicationManagementIdentity["availability"];
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

export async function resolveClubMembershipApplicationManagement(
  clubLegacyId: string,
): Promise<ClubMembershipApplicationManagementIdentity> {
  const club = await resolveClubUuid(clubLegacyId);
  const context = await getAuthenticatedSupabaseContext();

  if (!context) {
    return {
      clubLegacyId,
      clubUuid: club.clubUuid,
      authenticationStatus: "signedOut",
      availability: club.availability,
      permissions: noPermissions,
    };
  }
  if (club.availability !== "available" || !club.clubUuid) {
    return {
      clubLegacyId,
      authenticatedUserId: context.userId,
      authenticationStatus: "signedIn",
      availability: club.availability,
      permissions: noPermissions,
    };
  }

  try {
    const permissionCodes = [
      "club.membership_applications.read",
      "club.membership_applications.manage",
      "club.membership_applications.decide",
    ] as const;
    const results = await Promise.all(
      permissionCodes.map((permissionCode) =>
        context.supabase.rpc("current_user_has_club_permission", {
          p_club_id: club.clubUuid,
          p_permission_code: permissionCode,
        }),
      ),
    );
    if (results.some(({ error, data }) => error || typeof data !== "boolean")) {
      return {
        clubLegacyId,
        clubUuid: club.clubUuid,
        authenticatedUserId: context.userId,
        authenticationStatus: "signedIn",
        availability: "loadFailed",
        permissions: noPermissions,
      };
    }
    return {
      clubLegacyId,
      clubUuid: club.clubUuid,
      authenticatedUserId: context.userId,
      authenticationStatus: "signedIn",
      availability: "available",
      permissions: {
        canRead: results[0].data === true,
        canManage: results[1].data === true,
        canDecide: results[2].data === true,
      },
    };
  } catch {
    return {
      clubLegacyId,
      clubUuid: club.clubUuid,
      authenticatedUserId: context.userId,
      authenticationStatus: "signedIn",
      availability: "loadFailed",
      permissions: noPermissions,
    };
  }
}
