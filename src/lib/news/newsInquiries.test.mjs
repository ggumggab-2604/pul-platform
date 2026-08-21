import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import {
  listNewsInquiriesForManagement,
  NewsInquiryError,
  resolveNewsInquiry,
  submitNewsInquiry,
} from "./newsInquiries.ts";

const inquiryKey = "a".repeat(32);
const now = "2026-09-04T00:00:00.000Z";

function client(handler) {
  return { rpc: handler };
}

function managedRow(overrides = {}) {
  return {
    inquiry_key: inquiryKey,
    inquiry_type: "news_report",
    inquiry_body: "지역 파크골프 행사 일정과 공식 안내 출처를 제보합니다.",
    inquiry_status: "pending",
    created_at: now,
    resolved_at: null,
    ...overrides,
  };
}

test("submit trims input and sends exact RPC arguments", async () => {
  let call;
  const result = await submitNewsInquiry(client(async (name, args) => {
    call = { name, args };
    return { data: { inquiry_key: inquiryKey, inquiry_status: "pending" }, error: null };
  }), {
    inquiryType: "news_report",
    inquiryBody: "  지역 파크골프 행사 일정과 공식 안내 출처를 제보합니다.  ",
  });
  assert.deepEqual(call, {
    name: "submit_news_inquiry",
    args: {
      p_inquiry_type: "news_report",
      p_inquiry_body: "지역 파크골프 행사 일정과 공식 안내 출처를 제보합니다.",
    },
  });
  assert.deepEqual(result, { inquiryKey, inquiryStatus: "pending" });
});

test("client validation rejects invalid types and body lengths", async () => {
  for (const input of [
    { inquiryType: "bad", inquiryBody: "충분히 자세한 뉴스 제보 내용입니다." },
    { inquiryType: "news_report", inquiryBody: "짧음" },
    { inquiryType: "promotion_inquiry", inquiryBody: "가".repeat(3001) },
  ]) {
    await assert.rejects(
      submitNewsInquiry(client(async () => ({ data: null, error: null })), input),
      (error) => error instanceof NewsInquiryError && error.code === "validation",
    );
  }
});

test("management list parses an exact privacy-minimized DTO", async () => {
  let call;
  const page = await listNewsInquiriesForManagement(client(async (name, args) => {
    call = { name, args };
    return {
      data: { items: [managedRow()], total: 1, limit: 30, offset: 0, has_more: false },
      error: null,
    };
  }));
  assert.deepEqual(call, {
    name: "list_news_inquiries_for_management",
    args: { p_status: "pending", p_limit: 30, p_offset: 0 },
  });
  assert.equal(page.items[0].inquiryKey, inquiryKey);
  assert.equal("requesterUserId" in page.items[0], false);
});

test("strict parsers reject additional internal identity fields", async () => {
  for (const extra of ["id", "requester_user_id", "resolved_by"]) {
    await assert.rejects(
      listNewsInquiriesForManagement(client(async () => ({
        data: {
          items: [managedRow({ [extra]: randomUUID() })],
          total: 1,
          limit: 30,
          offset: 0,
          has_more: false,
        },
        error: null,
      }))),
      (error) => error instanceof NewsInquiryError && error.code === "unknown",
    );
  }
});

test("resolution binds a strict result to the requested public inquiry key", async () => {
  const result = await resolveNewsInquiry(client(async (name, args) => {
    assert.equal(name, "resolve_news_inquiry");
    assert.deepEqual(args, { p_inquiry_key: inquiryKey, p_resolution: "resolved" });
    return {
      data: { inquiry_key: inquiryKey, inquiry_status: "resolved", resolved_at: now },
      error: null,
    };
  }), inquiryKey, "resolved");
  assert.equal(result.inquiryStatus, "resolved");

  await assert.rejects(
    resolveNewsInquiry(client(async () => ({
      data: { inquiry_key: "b".repeat(32), inquiry_status: "resolved", resolved_at: now },
      error: null,
    })), inquiryKey, "resolved"),
    (error) => error instanceof NewsInquiryError && error.code === "unknown",
  );
});

test("database errors map to stable authentication, permission, conflict, and network errors", async () => {
  for (const [message, code] of [
    ["로그인이 필요합니다.", "authentication"],
    ["뉴스·정보 운영 권한이 없습니다.", "permission"],
    ["이미 처리된 뉴스 제보 또는 홍보 문의입니다.", "conflict"],
    ["Failed to fetch", "network"],
  ]) {
    await assert.rejects(
      listNewsInquiriesForManagement(client(async () => ({ data: null, error: { message } }))),
      (error) => error instanceof NewsInquiryError && error.code === code,
    );
  }
});
