import "server-only";

import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export type ClubDirectoryCorrectionManagementIdentity = {
  authenticationStatus: "signedIn" | "signedOut";
  availability: "available" | "loadFailed";
  canManage: boolean;
  canManagePlatformWide: boolean;
};

export async function resolveClubDirectoryCorrectionManagement(
  clubUuid: string,
): Promise<ClubDirectoryCorrectionManagementIdentity> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) {
    return {
      authenticationStatus: "signedOut",
      availability: "available",
      canManage: false,
      canManagePlatformWide: false,
    };
  }

  try {
    const [clubPermission, platformPermission] = await Promise.all([
      context.supabase.rpc("current_user_has_club_permission", {
        p_club_id: clubUuid,
        p_permission_code: "club.settings.manage",
      }),
      context.supabase.rpc("current_user_has_platform_permission", {
        p_permission_code: "clubs.directory_corrections.manage",
      }),
    ]);
    if (
      clubPermission.error ||
      platformPermission.error ||
      typeof clubPermission.data !== "boolean" ||
      typeof platformPermission.data !== "boolean"
    ) {
      throw new Error("permission lookup failed");
    }
    return {
      authenticationStatus: "signedIn",
      availability: "available",
      canManage: clubPermission.data || platformPermission.data,
      canManagePlatformWide: platformPermission.data,
    };
  } catch {
    return {
      authenticationStatus: "signedIn",
      availability: "loadFailed",
      canManage: false,
      canManagePlatformWide: false,
    };
  }
}
