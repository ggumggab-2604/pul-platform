import "server-only";

import type { HallOfFameOperatorPermissions } from "@/lib/hall-of-fame/hallOfFameOperatorUi";
import { APPLICATION_PERMISSIONS, type ApplicationPermissions } from "@/lib/hall-of-fame/hallOfFameApplicationReview";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";

export type HallOfFameOperatorManagementIdentity = {
  authenticationStatus: "signedIn" | "signedOut";
  availability: "available" | "loadFailed";
  authenticatedUserId?: string;
  permissions: HallOfFameOperatorPermissions;
  applicationPermissions: ApplicationPermissions;
};

const noPermissions: HallOfFameOperatorPermissions = {
  canRead: false,
  canReview: false,
  canResolve: false,
  canCorrect: false,
  canRevoke: false,
};
const noApplicationPermissions: ApplicationPermissions = { canRead: false, canReview: false, canDecide: false };

export async function resolveHallOfFameOperatorManagement(): Promise<HallOfFameOperatorManagementIdentity> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) {
    return {
      authenticationStatus: "signedOut",
      availability: "available",
      permissions: noPermissions,
      applicationPermissions: noApplicationPermissions,
    };
  }

  const permissionCodes = [
    "hall_of_fame.disputes.read",
    "hall_of_fame.disputes.review",
    "hall_of_fame.disputes.resolve",
    "hall_of_fame.records.correct",
    "hall_of_fame.records.revoke",
    APPLICATION_PERMISSIONS.read,
    APPLICATION_PERMISSIONS.review,
    APPLICATION_PERMISSIONS.decide,
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
        applicationPermissions: noApplicationPermissions,
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
      applicationPermissions: { canRead: results[5].data === true, canReview: results[6].data === true, canDecide: results[7].data === true },
    };
  } catch {
    return {
      authenticationStatus: "signedIn",
      availability: "loadFailed",
      authenticatedUserId: context.userId,
      permissions: noPermissions,
      applicationPermissions: noApplicationPermissions,
    };
  }
}
