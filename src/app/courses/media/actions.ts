"use server";

import {
  createCourseMediaUploadIntent,
  failCourseMediaUpload,
  finalizeCourseMediaUpload,
  removeCourseMedia,
  type CreateCourseMediaUploadInput,
} from "@/lib/courses/courseMediaStorage";

export async function createCourseMediaUploadIntentAction(
  input: CreateCourseMediaUploadInput,
) {
  return createCourseMediaUploadIntent(input);
}

export async function failCourseMediaUploadAction(mediaKey: string) {
  return failCourseMediaUpload(mediaKey);
}

export async function finalizeCourseMediaUploadAction(mediaKey: string) {
  return finalizeCourseMediaUpload(mediaKey);
}

export async function removeCourseMediaAction(mediaKey: string) {
  return removeCourseMedia(mediaKey);
}
