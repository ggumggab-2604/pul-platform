"use server";
import { stopCourseAction } from "@/lib/courses/courseCutover";
import { validatePhotoTransfer } from "@/lib/images/photoPolicy";

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
  stopCourseAction();
  validatePhotoTransfer({size:input.declaredByteSize});
  return createCourseMediaUploadIntent(input);
}

export async function failCourseMediaUploadAction(mediaKey: string) {
  stopCourseAction();
  return failCourseMediaUpload(mediaKey);
}

export async function finalizeCourseMediaUploadAction(mediaKey: string) {
  stopCourseAction();
  return finalizeCourseMediaUpload(mediaKey);
}

export async function removeCourseMediaAction(mediaKey: string) {
  stopCourseAction();
  return removeCourseMedia(mediaKey);
}
