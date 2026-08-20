"use server";

import { revalidatePath } from "next/cache";

import {
  ClubDirectoryError,
  registerClub,
  type ClubRegistrationInput,
} from "@/lib/clubs/clubDirectory";
import { createClient } from "@/lib/supabase/server";

export async function registerClubAction(input: {
  requestId: string;
  payload: ClubRegistrationInput;
}) {
  try {
    const result = await registerClub(
      await createClient(),
      input.requestId,
      input.payload,
    );
    revalidatePath("/");
    revalidatePath("/clubs");
    revalidatePath(`/clubs/${encodeURIComponent(result.publicKey)}`);
    return { ok: true as const, data: result };
  } catch (error) {
    return {
      ok: false as const,
      error:
        error instanceof ClubDirectoryError
          ? error.userMessage
          : "동호회 등록을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      authenticationRequired:
        error instanceof ClubDirectoryError && error.code === "authentication",
    };
  }
}
