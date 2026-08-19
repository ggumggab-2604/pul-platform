"use server";

import {
  createClubMediaUploadIntent,
  failClubMediaUpload,
  finalizeClubMediaUpload,
  removeClubMedia,
  type CreateClubMediaUploadInput,
} from "@/lib/clubs/clubMediaStorage";

export async function createClubMediaUploadIntentAction(input: CreateClubMediaUploadInput) {
  return createClubMediaUploadIntent(input);
}

export async function failClubMediaUploadAction(mediaId: string) {
  return failClubMediaUpload(mediaId);
}

export async function finalizeClubMediaUploadAction(mediaId: string) {
  return finalizeClubMediaUpload(mediaId);
}

export async function removeClubMediaAction(mediaId: string) {
  return removeClubMedia(mediaId);
}
