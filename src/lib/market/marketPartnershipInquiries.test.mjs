import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import {
  listMarketPartnershipInquiriesForManagement,
  MarketPartnershipInquiryError,
  resolveMarketPartnershipInquiry,
  submitMarketPartnershipInquiry,
} from "./marketPartnershipInquiries.ts";

const inquiryKey = "a".repeat(32);
const now = "2026-09-11T00:00:00.000Z";

function client(handler) {
  return { rpc: handler };
}

function managedRow(overrides = {}) {
  return {
    inquiry_key: inquiryKey,
    inquiry_type: "shop_entry",
    organization_name: "PUL 파크골프",
    proposal_summary: "장터 입점을 위한 기본 제안 내용을 전달합니다.",
    source_url: "https://example.com/market",
    inquiry_status: "pending",
    created_at: now,
    resolved_at: null,
    ...overrides,
  };
}

test("submit trims fields and sends the exact RPC arguments", async () => {
  let call;
  const result = await submitMarketPartnershipInquiry(client(async (name, args) => {
    call = { name, args };
    return { data: { inquiry_key: inquiryKey, inquiry_status: "pending" }, error: null };
  }), {
    inquiryType: "shop_entry",
    organizationName: "  PUL 파크골프  ",
    proposalSummary: "  장터 입점을 위한 기본 제안 내용을 전달합니다.  ",
    sourceUrl: "  https://example.com/market  ",
  });
  assert.deepEqual(call, {
    name: "submit_market_partnership_inquiry",
    args: {
      p_inquiry_type: "shop_entry",
      p_organization_name: "PUL 파크골프",
      p_proposal_summary: "장터 입점을 위한 기본 제안 내용을 전달합니다.",
      p_source_url: "https://example.com/market",
    },
  });
  assert.deepEqual(result, { inquiryKey, inquiryStatus: "pending" });
});

test("optional URL normalizes to null", async () => {
  let args;
  await submitMarketPartnershipInquiry(client(async (_name, payload) => {
    args = payload;
    return { data: { inquiry_key: inquiryKey, inquiry_status: "pending" }, error: null };
  }), {
    inquiryType: "advertising",
    organizationName: "PUL 광고사",
    proposalSummary: "파크골프 회원 대상 광고 제안 내용을 전달합니다.",
    sourceUrl: "   ",
  });
  assert.equal(args.p_source_url, null);
});

test("client validation rejects unknown types, field boundaries, and non-HTTPS URLs", async () => {
  for (const input of [
    { inquiryType: "unknown", organizationName: "PUL", proposalSummary: "충분히 자세한 문의 내용입니다.", sourceUrl: "" },
    { inquiryType: "shop_entry", organizationName: "가", proposalSummary: "충분히 자세한 문의 내용입니다.", sourceUrl: "" },
    { inquiryType: "shop_entry", organizationName: "PUL", proposalSummary: "짧음", sourceUrl: "" },
    { inquiryType: "partnership", organizationName: "PUL", proposalSummary: "충분히 자세한 문의 내용입니다.", sourceUrl: "http://example.com" },
  ]) {
    await assert.rejects(
      submitMarketPartnershipInquiry(client(async () => ({ data: null, error: null })), input),
      (error) => error instanceof MarketPartnershipInquiryError && error.code === "validation",
    );
  }
});

test("management list parses an exact privacy-minimized DTO", async () => {
  let call;
  const page = await listMarketPartnershipInquiriesForManagement(client(async (name, args) => {
    call = { name, args };
    return {
      data: { items: [managedRow()], total: 1, limit: 30, offset: 0, has_more: false },
      error: null,
    };
  }));
  assert.deepEqual(call, {
    name: "list_market_partnership_inquiries_for_management",
    args: { p_status: "pending", p_limit: 30, p_offset: 0 },
  });
  assert.equal(page.items[0].inquiryKey, inquiryKey);
  assert.equal("requesterUserId" in page.items[0], false);
});

test("strict parsers reject extra identity fields and exotic prototypes", async () => {
  for (const extra of ["id", "requester_user_id", "resolved_by"]) {
    await assert.rejects(
      listMarketPartnershipInquiriesForManagement(client(async () => ({
        data: {
          items: [managedRow({ [extra]: randomUUID() })],
          total: 1,
          limit: 30,
          offset: 0,
          has_more: false,
        },
        error: null,
      }))),
      (error) => error instanceof MarketPartnershipInquiryError && error.code === "unknown",
    );
  }

  const row = Object.create({ inherited: true });
  Object.assign(row, managedRow());
  await assert.rejects(
    listMarketPartnershipInquiriesForManagement(client(async () => ({
      data: { items: [row], total: 1, limit: 30, offset: 0, has_more: false },
      error: null,
    }))),
    (error) => error instanceof MarketPartnershipInquiryError && error.code === "unknown",
  );
});

test("resolution binds the response to the requested public key", async () => {
  const result = await resolveMarketPartnershipInquiry(client(async (name, args) => {
    assert.equal(name, "resolve_market_partnership_inquiry");
    assert.deepEqual(args, { p_inquiry_key: inquiryKey, p_resolution: "resolved" });
    return {
      data: { inquiry_key: inquiryKey, inquiry_status: "resolved", resolved_at: now },
      error: null,
    };
  }), inquiryKey, "resolved");
  assert.equal(result.inquiryStatus, "resolved");

  await assert.rejects(
    resolveMarketPartnershipInquiry(client(async () => ({
      data: { inquiry_key: "b".repeat(32), inquiry_status: "resolved", resolved_at: now },
      error: null,
    })), inquiryKey, "resolved"),
    (error) => error instanceof MarketPartnershipInquiryError && error.code === "unknown",
  );
});

test("database errors map to stable account, permission, conflict, and network errors", async () => {
  for (const [message, code] of [
    ["로그인이 필요합니다.", "authentication"],
    ["정상 활동 계정만 장터를 이용할 수 있습니다.", "account"],
    ["장터 광고·입점·제휴 문의 운영 권한이 없습니다.", "permission"],
    ["이미 처리된 광고·입점·제휴 문의입니다.", "conflict"],
    ["Failed to fetch", "network"],
  ]) {
    await assert.rejects(
      listMarketPartnershipInquiriesForManagement(client(async () => ({ data: null, error: { message } }))),
      (error) => error instanceof MarketPartnershipInquiryError && error.code === code,
    );
  }
});
