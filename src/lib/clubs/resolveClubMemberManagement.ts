import "server-only";

import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";

export type ClubMemberManagementIdentity = {
  clubLegacyId: string;
  clubUuid?: string;
  authenticatedUserId?: string;
  actorMembershipId: string | null;
  authenticationStatus: "signedIn" | "signedOut";
  availability: "available" | "clubNotFound" | "loadFailed";
  canRead: boolean;
  canManageMembershipStatus: boolean;
  canManageClubRoles: boolean;
};
const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function parseActorMembershipId(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<PropertyKey, unknown>;
  const prototype = Object.getPrototypeOf(record);
  if (prototype !== Object.prototype && prototype !== null) {
    return null;
  }

  const ownKeys = Reflect.ownKeys(record);
  if (ownKeys.length !== 1 || ownKeys[0] !== "id") {
    return null;
  }

  const idDescriptor = Object.getOwnPropertyDescriptor(record, "id");
  if (
    !idDescriptor ||
    !("value" in idDescriptor) ||
    idDescriptor.enumerable !== true
  ) {
    return null;
  }

  const id = idDescriptor.value;
  return typeof id === "string" && canonicalUuidPattern.test(id) ? id : null;
}

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
      actorMembershipId: null,
      authenticationStatus: "signedOut",
      availability: club.availability,
      canRead: false,
      canManageMembershipStatus: false,
      canManageClubRoles: false,
    };
  }
  if (club.availability !== "available" || !club.clubUuid) {
    return {
      clubLegacyId,
      authenticatedUserId: context.userId,
      actorMembershipId: null,
      authenticationStatus: "signedIn",
      availability: club.availability,
      canRead: false,
      canManageMembershipStatus: false,
      canManageClubRoles: false,
    };
  }

  try {
    const [
      readPermissionResult,
      managePermissionResult,
      rolePermissionResult,
      actorMembershipResult,
    ] = await Promise.allSettled([
      context.supabase.rpc("current_user_has_club_permission", {
        p_club_id: club.clubUuid,
        p_permission_code: "club.members.read",
      }),
      context.supabase.rpc("current_user_has_club_permission", {
        p_club_id: club.clubUuid,
        p_permission_code: "club.members.manage",
      }),
      context.supabase.rpc("current_user_has_club_permission", {
        p_club_id: club.clubUuid,
        p_permission_code: "club.roles.manage",
      }),
      context.supabase
        .from("club_memberships")
        .select("id")
        .eq("club_id", club.clubUuid)
        .eq("user_id", context.userId)
        .eq("membership_status", "active")
        .maybeSingle(),
    ]);
    if (
      readPermissionResult.status !== "fulfilled" ||
      managePermissionResult.status !== "fulfilled"
    ) {
      throw new Error("Required member management permission check failed.");
    }
    const readPermission = readPermissionResult.value;
    const managePermission = managePermissionResult.value;
    if (
      readPermission.error ||
      managePermission.error ||
      typeof readPermission.data !== "boolean" ||
      typeof managePermission.data !== "boolean"
    ) {
      return {
        clubLegacyId,
        clubUuid: club.clubUuid,
        authenticatedUserId: context.userId,
        actorMembershipId: null,
        authenticationStatus: "signedIn",
        availability: "loadFailed",
        canRead: false,
        canManageMembershipStatus: false,
        canManageClubRoles: false,
      };
    }
    const rolePermission =
      rolePermissionResult.status === "fulfilled"
        ? rolePermissionResult.value
        : undefined;
    const actorMembership =
      actorMembershipResult.status === "fulfilled"
        ? actorMembershipResult.value
        : undefined;
    const actorMembershipId = !actorMembership?.error
      ? parseActorMembershipId(actorMembership?.data)
      : null;
    const canManageClubRoles =
      !rolePermission?.error &&
      rolePermission?.data === true &&
      actorMembershipId !== null
        ? rolePermission.data
        : false;
    return {
      clubLegacyId,
      clubUuid: club.clubUuid,
      authenticatedUserId: context.userId,
      actorMembershipId: canManageClubRoles ? actorMembershipId : null,
      authenticationStatus: "signedIn",
      availability: "available",
      canRead: readPermission.data,
      canManageMembershipStatus: managePermission.data,
      canManageClubRoles,
    };
  } catch {
    return {
      clubLegacyId,
      clubUuid: club.clubUuid,
      authenticatedUserId: context.userId,
      actorMembershipId: null,
      authenticationStatus: "signedIn",
      availability: "loadFailed",
      canRead: false,
      canManageMembershipStatus: false,
      canManageClubRoles: false,
    };
  }
}
