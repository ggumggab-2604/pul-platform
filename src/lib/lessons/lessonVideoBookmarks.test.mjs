import assert from "node:assert/strict";
import { test } from "node:test";

import {
  LessonVideoBookmarkError,
  listMyLessonVideoBookmarks,
  normalizeLessonVideoBookmarkKeys,
  setLessonVideoBookmark,
} from "./lessonVideoBookmarks.ts";

const videoRow = {
  video_key: "video-1",
  title: "파크골프 기본 자세",
  category: "basic_stance",
  channel_name: "PUL 강의",
  instructor_name: "PUL 강사",
  level: "intro",
  duration_text: "08:30",
  description: "파크골프 기본 자세를 설명하는 공개 영상입니다.",
  youtube_url: "https://youtu.be/TestVideo123",
  youtube_channel_url: null,
  thumbnail_type: "green",
  tags: ["입문"],
  is_featured: false,
};

function client(handler) {
  return { rpc: handler };
}

test("bookmark mutation sends a normalized public video key and exact target state", async () => {
  let call;
  const result = await setLessonVideoBookmark(client(async (name, args) => {
    call = { name, args };
    return { data: { video_key: "video-1", saved: true }, error: null };
  }), " video-1 ", true);
  assert.deepEqual(call, {
    name: "set_lesson_video_bookmark",
    args: { p_video_key: "video-1", p_saved: true },
  });
  assert.deepEqual(result, { videoKey: "video-1", saved: true });
});

test("saved key input is validated, deduplicated, and bounded", () => {
  assert.deepEqual(normalizeLessonVideoBookmarkKeys(["video-1", "video-1", "video-2"]), ["video-1", "video-2"]);
  assert.throws(
    () => normalizeLessonVideoBookmarkKeys(["bad key"]),
    (error) => error instanceof LessonVideoBookmarkError && error.code === "validation",
  );
  assert.throws(
    () => normalizeLessonVideoBookmarkKeys(Array.from({ length: 51 }, (_, index) => `video-${index}`)),
    (error) => error instanceof LessonVideoBookmarkError && error.code === "validation",
  );
});

test("own bookmark list sends one bounded batch and parses public video DTOs", async () => {
  let call;
  const page = await listMyLessonVideoBookmarks(client(async (name, args) => {
    call = { name, args };
    return {
      data: { items: [videoRow], total: 1, limit: 24, offset: 0, has_more: false },
      error: null,
    };
  }), ["video-1", "video-1"], "basic_stance", 24, 0);
  assert.equal(call.name, "list_my_lesson_video_bookmarks");
  assert.deepEqual(call.args, {
    p_video_keys: ["video-1"],
    p_category: "basic_stance",
    p_limit: 24,
    p_offset: 0,
  });
  assert.equal(page.items[0].videoKey, "video-1");
  assert.equal(page.total, 1);
});

test("bookmark parsers reject response mismatches and internal fields", async () => {
  await assert.rejects(
    setLessonVideoBookmark(client(async () => ({
      data: { video_key: "video-1", saved: false }, error: null,
    })), "video-1", true),
    (error) => error instanceof LessonVideoBookmarkError && error.code === "unknown",
  );
  await assert.rejects(
    listMyLessonVideoBookmarks(client(async () => ({
      data: {
        items: [{ ...videoRow, user_id: "00000000-0000-0000-0000-000000000000" }],
        total: 1,
        limit: 24,
        offset: 0,
        has_more: false,
      },
      error: null,
    }))),
    (error) => error instanceof LessonVideoBookmarkError && error.code === "unknown",
  );
});
