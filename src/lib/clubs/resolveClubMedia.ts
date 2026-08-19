import "server-only";

import { emptyClubMedia, fetchClubMedia, type ClubMediaSnapshot } from "@/lib/clubs/clubMedia";
import { createClient } from "@/lib/supabase/server";

export async function resolveClubMedia(
  clubLegacyId: string,
  clubUuid?: string,
): Promise<ClubMediaSnapshot> {
  if (!clubUuid) return emptyClubMedia("clubNotFound");
  try {
    const supabase = await createClient();
    return await fetchClubMedia(supabase, clubUuid, clubLegacyId);
  } catch {
    return emptyClubMedia("loadFailed");
  }
}
