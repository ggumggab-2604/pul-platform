import "server-only";

import {
  emptyClubCoreContent,
  fetchClubCoreContent,
  type ClubCoreContentSnapshot,
} from "@/lib/clubs/clubCoreContent";
import { createClient } from "@/lib/supabase/server";

export async function resolveClubCoreContent(
  clubLegacyId: string,
  clubUuid?: string,
): Promise<ClubCoreContentSnapshot> {
  if (!clubUuid) return emptyClubCoreContent("clubNotFound");

  try {
    const supabase = await createClient();
    return await fetchClubCoreContent(supabase, clubUuid, clubLegacyId);
  } catch {
    return emptyClubCoreContent("loadFailed");
  }
}
