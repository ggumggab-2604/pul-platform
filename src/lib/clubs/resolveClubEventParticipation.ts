import "server-only";

import {
  emptyClubEventParticipation,
  fetchClubEventParticipation,
  type ClubEventParticipationSnapshot,
} from "@/lib/clubs/clubEventParticipation";
import { createClient } from "@/lib/supabase/server";

export async function resolveClubEventParticipation(
  clubUuid?: string,
): Promise<ClubEventParticipationSnapshot> {
  if (!clubUuid) return emptyClubEventParticipation("clubNotFound");

  try {
    const supabase = await createClient();
    return await fetchClubEventParticipation(supabase, clubUuid);
  } catch {
    return emptyClubEventParticipation("loadFailed");
  }
}
