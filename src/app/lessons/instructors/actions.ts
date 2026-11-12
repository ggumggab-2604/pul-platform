"use server";

import { revalidatePath } from "next/cache";
import { getAuthenticatedSupabaseContext } from "@/lib/supabase/auth";
import {
  instructorChannelApplyHref,
  instructorChannelHref,
  instructorChannelManageHref,
  instructorChannelRpc,
  youtubeChannelUrl,
  type InstructorChannelApplication,
} from "@/lib/lessons/lessonInstructorChannels";
import { isLessonInstructorId } from "@/lib/lessons/lessonInstructorBookmarks";

export type ChannelActionState = { ok: boolean; message: string };

function value(form: FormData, name: string) {
  const entry = form.get(name);
  return typeof entry === "string" ? entry.trim() : "";
}

export async function applyInstructorChannelAction(_: ChannelActionState, form: FormData): Promise<ChannelActionState> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { ok: false, message: "로그인이 필요합니다." };
  const url = youtubeChannelUrl(value(form, "channelUrl"));
  if (!url) return { ok: false, message: "YouTube 채널의 @핸들 또는 채널 ID 주소를 입력해 주세요." };
  try {
    await instructorChannelRpc(context.supabase, "apply_lesson_instructor_channel", {
      p_channel_name: value(form, "channelName"),
      p_instructor_name: value(form, "instructorName"),
      p_channel_url: url,
      p_introduction: value(form, "introduction"),
    });
    revalidatePath(instructorChannelApplyHref);
    revalidatePath(instructorChannelManageHref);
    return { ok: true, message: "교습가 채널 신청을 접수했습니다." };
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? error.code : null;
    return { ok: false, message: code === "23505" ? "이미 신청된 YouTube 채널 주소입니다."
      : "채널 신청을 저장하지 못했습니다. 신청 상태와 입력 내용을 확인해 주세요." };
  }
}

const reviewConflictMessages: Readonly<Record<string, string>> = Object.freeze({
  application_changed: "신청 내용이 변경됐습니다. 페이지를 새로고침한 뒤 다시 확인해 주세요.",
  channel_url_confirmation: "기존 교습가의 채널 주소와 소유를 확인한 뒤 연결할 교습가를 선택해 주세요.",
  instructor_linked: "이미 신청 계정에 연결된 교습가입니다. 연결 대상을 다시 확인해 주세요.",
  payment_required: "홍보비 결제를 확인해 주세요.",
  invalid_status: "현재 신청 상태에서는 처리할 수 없습니다. 페이지를 새로고침해 주세요.",
});

export async function reviewInstructorChannelAction(
  application: InstructorChannelApplication, action: string, _: ChannelActionState, form: FormData,
): Promise<ChannelActionState> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { ok: false, message: "로그인이 필요합니다." };
  const choice = action === "activate" ? value(form, "instructorChoice") : "";
  if (choice && choice !== "new" && !isLessonInstructorId(choice)) {
    return { ok: false, message: "연결할 교습가를 다시 선택해 주세요." };
  }
  try {
    await instructorChannelRpc(context.supabase, "review_lesson_instructor_channel", {
      p_id: application.id, p_action: action, p_expected: application,
      p_payment_confirmed: value(form, "paymentConfirmed") === "yes",
      p_existing_instructor_id: isLessonInstructorId(choice) ? choice : null,
      p_confirm_new_instructor: choice === "new",
    });
    revalidatePath(instructorChannelManageHref);
    revalidatePath(instructorChannelApplyHref);
    revalidatePath("/lessons");
    revalidatePath("/lessons/instructors/[id]", "page");
    return { ok: true, message: "채널 상태를 변경했습니다." };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "PT409"
      && "details" in error && typeof error.details === "string" && Object.hasOwn(reviewConflictMessages, error.details)) {
      return { ok: false, message: reviewConflictMessages[error.details] };
    }
    return { ok: false, message: "상태를 변경하지 못했습니다. 운영 권한과 연결 상태를 확인해 주세요." };
  }
}

export async function writeInstructorChannelBoardAction(
  instructorId: string, postId: string, action: "question" | "notice" | "reply", _: ChannelActionState, form: FormData,
): Promise<ChannelActionState> {
  const context = await getAuthenticatedSupabaseContext();
  if (!context) return { ok: false, message: "로그인이 필요합니다." };
  if (!isLessonInstructorId(instructorId) || !isLessonInstructorId(postId)) {
    return { ok: false, message: "채널과 글을 확인해 주세요." };
  }
  try {
    await instructorChannelRpc(context.supabase, "mutate_lesson_instructor_channel_board", {
      p_instructor_id: instructorId, p_post_id: postId, p_action: action, p_body: value(form, "body"),
    });
    revalidatePath(instructorChannelHref(instructorId));
    return { ok: true, message: "게시판에 저장했습니다." };
  } catch {
    return { ok: false, message: "저장하지 못했습니다. 관심 저장 상태 또는 채널 권한을 확인해 주세요." };
  }
}
