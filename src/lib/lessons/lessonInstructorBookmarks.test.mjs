import assert from "node:assert/strict";
import { test } from "node:test";

import { videoLessonCategories, videoLessonCategoryLabels } from "../../data/videoLessonData.ts";
import {
  lessonInstructorHref,
  listMyLessonInstructorBookmarkKeys,
  setLessonInstructorBookmark,
} from "./lessonInstructorBookmarks.ts";

test("free video labels use the requested order and keep existing category keys", () => {
  const visible = videoLessonCategories.filter(({ value }) => value !== "cert_referee");
  assert.deepEqual(visible.map(({ value }) => value), [
    "all", "beginner_intro", "basic_stance", "swing", "tee_shot", "putting", "approach",
    "distance_control", "direction", "rules_manner", "practical_strategy", "equipment",
    "club_reservation", "tournament_prep", "other",
  ]);
  assert.deepEqual(visible.map(({ label }) => label), [
    "전체", "초보 입문", "기본자세", "스윙", "티샷", "퍼팅", "어프로치", "거리 조절",
    "방향성", "룰·매너", "실전 공략", "장비 선택", "동호회·예약", "대회 준비", "기타",
  ]);
  for (const { value, label } of visible.slice(1)) assert.equal(videoLessonCategoryLabels[value], label);
});

const instructorId = "11111111-1111-4111-8111-111111111111";

test("instructor links and saved state use the same stable ID", async () => {
  const url = new URL(lessonInstructorHref(instructorId), "http://example.invalid");
  assert.equal(url.searchParams.get("instructorId"), instructorId);
  const rpc = async (name, args) => {
    assert.equal(name, "list_my_lesson_instructor_bookmarks");
    assert.deepEqual(args, { p_instructor_ids: [instructorId] });
    return { data: [instructorId], error: null };
  };
  assert.deepEqual(await listMyLessonInstructorBookmarkKeys({ rpc }, [instructorId]), [instructorId]);
});

test("instructor mutation rejects invalid IDs and mismatched responses", async () => {
  const rpc = async (name, args) => {
    assert.equal(name, "set_lesson_instructor_bookmark");
    assert.deepEqual(args, { p_instructor_id: instructorId, p_saved: false });
    return { data: false, error: null };
  };
  await setLessonInstructorBookmark({ rpc }, instructorId, false);
  await assert.rejects(setLessonInstructorBookmark({ rpc }, "not-an-id", false), /교습가 정보를 확인/);
  await assert.rejects(setLessonInstructorBookmark({ rpc: async () => ({ data: true, error: null }) }, instructorId, false));
});
