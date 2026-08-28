import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EventManagementError,
  formatEventManagementTimestamp,
  getEventForManagement,
  listEventsForManagement,
  parseManagedEvent,
  parseManagedEventPage,
  validateManagedEventInput,
} from "./eventManagement.ts";

const timestamp = "2026-09-22T00:00:00.000Z";

function row(overrides = {}) {
  return {
    event_key: "test-event",
    title: "TEST 파크골프 대회",
    match_type: "field",
    event_scale: "city",
    region: "서울",
    venue_name: "TEST 파크골프장",
    venue_type: "publicCourse",
    start_date: "2026-09-25",
    end_date: "2026-09-26",
    schedule_note: null,
    registration_status: "open",
    target_audience: ["PUL TEST 회원"],
    organizer: "PUL TEST 운영진",
    summary: "TEST 대회·이벤트 운영 상세 설명입니다.",
    benefits: ["TEST 기념품"],
    recruitment_status: "none",
    related_course_key: null,
    official_url: "https://example.invalid/event",
    registration_url: null,
    registration_note: null,
    is_featured: false,
    publication_status: "published",
    version: 2,
    updated_at: timestamp,
    freshness_status: "starting-soon",
    ...overrides,
  };
}

function input(overrides = {}) {
  return {
    title: "TEST 파크골프 대회",
    matchType: "field",
    eventScale: "city",
    region: "서울",
    venueName: "TEST 파크골프장",
    venueType: "publicCourse",
    startDate: "2026-09-25",
    endDate: "2026-09-26",
    scheduleNote: null,
    registrationStatus: "open",
    targetAudience: ["PUL TEST 회원"],
    organizer: "PUL TEST 운영진",
    summary: "TEST 대회·이벤트 운영 상세 설명입니다.",
    benefits: ["TEST 기념품"],
    recruitmentStatus: "none",
    relatedCourseKey: null,
    officialUrl: "https://example.invalid/event",
    registrationUrl: null,
    registrationNote: null,
    isFeatured: false,
    ...overrides,
  };
}

function client(data, error = null) {
  return { rpc: async (name, args) => ({ data: typeof data === "function" ? data(name, args) : data, error }) };
}

test("strict managed-event parser accepts exact nullable DTO and rejects extra or invalid fields", () => {
  assert.equal(parseManagedEvent(row()).freshnessStatus, "starting-soon");
  assert.equal(parseManagedEvent(row({ start_date: null, end_date: null, schedule_note: "2026년 가을 예정", freshness_status: null })).startDate, null);
  assert.throws(() => parseManagedEvent({ ...row(), internal_id: "private" }), EventManagementError);
  assert.throws(() => parseManagedEvent(row({ freshness_status: "stale" })), EventManagementError);
  assert.throws(() => parseManagedEvent(row({ related_course_key: "bad key" })), EventManagementError);
});

test("management timestamps render deterministic KST text without server locale variance", () => {
  assert.equal(formatEventManagementTimestamp("2026-08-28T05:35:29.000Z"), "2026. 8. 28. 14:35:29");
  assert.equal(formatEventManagementTimestamp("2026-08-28T15:35:29.000Z", false), "2026. 8. 29.");
  assert.throws(() => formatEventManagementTimestamp("not-a-timestamp"), EventManagementError);
});

test("page parser enforces exact pagination math", () => {
  const parsed = parseManagedEventPage({ items: [row()], total: 2, limit: 1, offset: 0, has_more: true });
  assert.equal(parsed.items[0].eventKey, "test-event");
  assert.throws(() => parseManagedEventPage({ items: [row()], total: 1, limit: 1, offset: 0, has_more: true }), EventManagementError);
});

test("event validator normalizes text while preserving deterministic schedule contract", () => {
  const valid = validateManagedEventInput(input({ title: "  TEST 파크골프 대회  ", targetAudience: ["  PUL TEST 회원  "] }));
  assert.equal(valid.title, "TEST 파크골프 대회");
  assert.deepEqual(valid.targetAudience, ["PUL TEST 회원"]);
  assert.throws(() => validateManagedEventInput(input({ startDate: null, endDate: null, scheduleNote: null })), /시작일 또는 일정/);
  assert.throws(() => validateManagedEventInput(input({ endDate: "2026-09-24" })), /빠를 수 없습니다/);
  assert.throws(() => validateManagedEventInput(input({ officialUrl: "http://example.invalid" })), /https/);
});

test("management RPC helpers send exact search, filter, reference and stable-key arguments", async () => {
  let listCall;
  await listEventsForManagement(client((name, args) => {
    listCall = { name, args };
    return { items: [row()], total: 1, limit: 30, offset: 0, has_more: false };
  }), { keyword: " TEST ", publicationStatus: "published", registrationStatus: "open", freshness: "starting-soon", referenceAt: timestamp }, 30, 0);
  assert.equal(listCall.name, "list_events_for_management");
  assert.deepEqual(listCall.args, {
    p_keyword: "TEST",
    p_publication_status: "published",
    p_registration_status: "open",
    p_freshness: "starting-soon",
    p_reference_at: timestamp,
    p_limit: 30,
    p_offset: 0,
  });
  let detailCall;
  await getEventForManagement(client((name, args) => { detailCall = { name, args }; return row(); }), "test-event", timestamp);
  assert.deepEqual(detailCall, { name: "get_event_for_management", args: { p_event_key: "test-event", p_reference_at: timestamp } });
});

test("permission, conflict and network failures become safe Korean management errors", async () => {
  await assert.rejects(() => listEventsForManagement(client(null, { message: "운영 권한이 없습니다." })), (error) => error instanceof EventManagementError && error.code === "permission");
  await assert.rejects(() => listEventsForManagement(client(null, { message: "다른 운영자가 변경했습니다. 최신 상태로 변경되었습니다." })), (error) => error instanceof EventManagementError && error.code === "conflict" && error.shouldRefresh);
  await assert.rejects(() => listEventsForManagement(client(null, { message: "fetch failed" })), (error) => error instanceof EventManagementError && error.code === "network");
});
