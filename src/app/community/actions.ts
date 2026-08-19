"use server";

import { revalidatePath } from "next/cache";

import {
  CommunityError,
  getCommunityPost,
  listCommunityComments,
  listCommunityPosts,
  mutateCommunityComment,
  mutateCommunityPost,
  type CommunityCommentMutationOperation,
  type CommunityPostInput,
  type CommunityPostMutationOperation,
  type CommunitySortOrder,
  type CommunityWritableCategory,
} from "@/lib/community/community";
import { createClient } from "@/lib/supabase/server";

export async function listCommunityPostsAction(category: "all" | CommunityWritableCategory, keyword: string, sortOrder: CommunitySortOrder, limit = 24, offset = 0) {
  return listCommunityPosts(await createClient(), category, keyword, sortOrder, limit, offset);
}

export async function getCommunityPostAction(postId: string) {
  return getCommunityPost(await createClient(), postId);
}

export async function listCommunityCommentsAction(postId: string, limit = 50, offset = 0) {
  return listCommunityComments(await createClient(), postId, limit, offset);
}

export async function mutateCommunityPostAction(input: {
  operation: CommunityPostMutationOperation;
  postId: string | null;
  expectedVersion: number | null;
  payload?: CommunityPostInput | { lostFoundStatus: "searching" | "holding" | "resolved" };
}) {
  try {
    const result = await mutateCommunityPost(await createClient(), input.operation, input.postId, input.expectedVersion, input.payload);
    revalidatePath("/community");
    revalidatePath(`/community/${result.postId}`);
    return { ok: true as const, data: result };
  } catch (error) {
    return { ok: false as const, error: error instanceof CommunityError ? error.userMessage : "커뮤니티 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", shouldRefresh: error instanceof CommunityError && error.shouldRefresh };
  }
}

export async function mutateCommunityCommentAction(input: {
  operation: CommunityCommentMutationOperation;
  postId: string | null;
  commentId: string | null;
  expectedVersion: number | null;
  body?: string;
}) {
  try {
    const result = await mutateCommunityComment(await createClient(), input.operation, input.postId, input.commentId, input.expectedVersion, input.body);
    revalidatePath("/community");
    revalidatePath(`/community/${result.postId}`);
    return { ok: true as const, data: result };
  } catch (error) {
    return { ok: false as const, error: error instanceof CommunityError ? error.userMessage : "커뮤니티 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.", shouldRefresh: error instanceof CommunityError && error.shouldRefresh };
  }
}
