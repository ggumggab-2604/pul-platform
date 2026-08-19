import { notFound } from "next/navigation";
import type { Metadata } from "next";

import { CommunityPostDetailContent } from "@/components/community/CommunityPostDetailContent";
import { Container } from "@/components/ui/Container";
import { CommunityError, getCommunityPost, listCommunityComments } from "@/lib/community/community";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "커뮤니티 게시글",
  description: "PUL 커뮤니티 회원 게시글과 댓글을 확인합니다.",
};

export default async function CommunityPostPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const client = await createClient();
  let post;
  try {
    post = await getCommunityPost(client, id);
  } catch (error) {
    if (error instanceof CommunityError && error.code === "notFound") notFound();
    throw error;
  }

  let commentsLoadFailed = false;
  let comments;
  try {
    comments = await listCommunityComments(client, id, 100, 0);
  } catch {
    commentsLoadFailed = true;
    comments = { items: [], total: 0, limit: 100, offset: 0, hasMore: false };
  }

  return <div className="bg-pul-page"><Container className="px-3 py-4 sm:py-6"><CommunityPostDetailContent initialPost={post} initialComments={comments} commentsLoadFailed={commentsLoadFailed} /></Container></div>;
}
