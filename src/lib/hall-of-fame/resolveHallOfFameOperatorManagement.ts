import "server-only";

import type { HallOfFameOperatorPermissions } from "@/lib/hall-of-fame/hallOfFameOperatorUi";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export type HallOfFameOperatorManagementIdentity = {
  authenticationStatus: "signedIn" | "signedOut";
  availability: "available" | "loadFailed";
  authenticatedUserId?: string;
  permissions: HallOfFameOperatorPermissions;
};

const noPermissions: HallOfFameOperatorPermissions = {
  canRead: false,
  canReview: false,
  canResolve: false,
  canCorrect: false,
  canRevoke: false,
};

export async function resolveHallOfFameOperatorManagement(): Promise<HallOfFameOperatorManagementIdentity> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) {
    return {
      authenticationStatus: "signedOut",
      availability: "available",
      permissions: noPermissions,
    };
  }

  const permissionCodes = [
    "hall_of_fame.disputes.read",
    "hall_of_fame.disputes.review",
    "hall_of_fame.disputes.resolve",
    "hall_of_fame.records.correct",
    "hall_of_fame.records.revoke",
  ] as const;

  try {
    const results = await Promise.all(
      permissionCodes.map((permissionCode) =>
        context.supabase.rpc("current_user_has_platform_permission", {
          p_permission_code: permissionCode,
        }),
      ),
    );
    if (results.some(({ data, error }) => error || typeof data !== "boolean")) {
      return {
        authenticationStatus: "signedIn",
        availability: "loadFailed",
        authenticatedUserId: context.userId,
        permissions: noPermissions,
      };
    }

    return {
      authenticationStatus: "signedIn",
      availability: "available",
      authenticatedUserId: context.userId,
      permissions: {
        canRead: results[0].data === true,
        canReview: results[1].data === true,
        canResolve: results[2].data === true,
        canCorrect: results[3].data === true,
        canRevoke: results[4].data === true,
      },
    };
  } catch {
    return {
      authenticationStatus: "signedIn",
      availability: "loadFailed",
      authenticatedUserId: context.userId,
      permissions: noPermissions,
    };
  }
}
