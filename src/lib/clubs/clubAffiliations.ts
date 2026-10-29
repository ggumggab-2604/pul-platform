import type { SupabaseClient } from "@supabase/supabase-js";
import { contentRpc } from "@/lib/courses/courseContent";
import type { ClubPost } from "./clubActivities";

export type ClubAffiliation = { club_key: string; name: string; region: string | null; status: "active" | "suspended"; eligible: boolean; is_primary: boolean };
export type ClubFederationLink = { region: string; club_key: string; name: string; automatic: boolean; independent: boolean };
export type MyClubAffiliations = { viewer_id: string; version: number; primary_club_key: string | null; automatic_enabled: boolean; memberships: ClubAffiliation[]; federations: ClubFederationLink[] };
export type ClubFederationPage = { region: string; club_id: string; club_key: string; name: string; viewer_id: string | null; automatic: boolean; independent: boolean; can_write: boolean; items: ClubPost[]; total: number; limit: number; offset: number };
export const federationHref = (region: string) => "/clubs/federations/" + encodeURIComponent(region);

export async function getMyClubAffiliations(client: SupabaseClient, viewerId: string): Promise<MyClubAffiliations> {
  const data = await contentRpc<MyClubAffiliations>(client, "get_my_club_affiliations", {});
  if (!data || data.viewer_id !== viewerId || !Number.isSafeInteger(data.version) || data.version < 0 || !Array.isArray(data.memberships) || !Array.isArray(data.federations)) throw Error("현재 계정의 소속을 다시 확인해 주세요.");
  return data;
}
export const getClubFederation = (client: SupabaseClient, region: string, offset = 0) => contentRpc<ClubFederationPage>(client, "get_club_federation", { p_region: region, p_limit: 20, p_offset: offset });
