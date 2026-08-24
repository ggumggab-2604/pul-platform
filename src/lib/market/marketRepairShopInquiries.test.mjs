import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";

import {
  listMarketRepairShopInquiriesForManagement,
  MarketRepairShopInquiryError,
  resolveMarketRepairShopInquiry,
  submitMarketRepairShopInquiry,
} from "./marketRepairShopInquiries.ts";

const inquiryKey = "a".repeat(32);
const now = "2026-09-09T00:00:00.000Z";

function client(handler) {
  return { rpc: handler };
}

function managedRow(overrides = {}) {
  return {
    inquiry_key: inquiryKey,
    shop_name: "PUL 파크골프 수리",
    region: "서울 영등포구",
    summary: "파크골프 채 수리와 그립 교체 서비스를 제공합니다.",
    source_url: "https://example.com/repair",
    inquiry_status: "pending",
    created_at: now,
    resolved_at: null,
    ...overrides,
  };
}

test("submit trims fields and sends the exact RPC arguments", async () => {
  let call;
  const result = await submitMarketRepairShopInquiry(client(async (name, args) => {
    call = { name, args };
    return { data: { inquiry_key: inquiryKey, inquiry_status: "pending" }, error: null };
  }), {
    shopName: "  PUL 파크골프 수리  ",
    region: "  서울 영등포구  ",
    summary: "  파크골프 채 수리와 그립 교체 서비스를 제공합니다.  ",
    sourceUrl: "  https://example.com/repair  ",
  });
  assert.deepEqual(call, {
    name: "submit_market_repair_shop_inquiry",
    args: {
      p_shop_name: "PUL 파크골프 수리",
      p_region: "서울 영등포구",
      p_summary: "파크골프 채 수리와 그립 교체 서비스를 제공합니다.",
      p_source_url: "https://example.com/repair",
    },
  });
  assert.deepEqual(result, { inquiryKey, inquiryStatus: "pending" });
});

test("optional fields normalize to null", async () => {
  let args;
  await submitMarketRepairShopInquiry(client(async (_name, payload) => {
    args = payload;
    return { data: { inquiry_key: inquiryKey, inquiry_status: "pending" }, error: null };
  }), {
    shopName: "PUL 수리점",
    region: "   ",
    summary: "파크골프 장비 수리 서비스를 안내합니다.",
    sourceUrl: "",
  });
  assert.equal(args.p_region, null);
  assert.equal(args.p_source_url, null);
});

test("client validation rejects field boundaries and non-HTTPS URLs", async () => {
  for (const input of [
    { shopName: "가", region: "", summary: "충분히 자세한 수리업체 소개 내용입니다.", sourceUrl: "" },
    { shopName: "PUL 수리점", region: "가".repeat(101), summary: "충분히 자세한 수리업체 소개 내용입니다.", sourceUrl: "" },
    { shopName: "PUL 수리점", region: "", summary: "짧음", sourceUrl: "" },
    { shopName: "PUL 수리점", region: "", summary: "충분히 자세한 수리업체 소개 내용입니다.", sourceUrl: "http://example.com" },
  ]) {
    await assert.rejects(
      submitMarketRepairShopInquiry(client(async () => ({ data: null, error: null })), input),
      (error) => error instanceof MarketRepairShopInquiryError && error.code === "validation",
    );
  }
});

test("management list parses an exact privacy-minimized DTO", async () => {
  let call;
  const page = await listMarketRepairShopInquiriesForManagement(client(async (name, args) => {
    call = { name, args };
    return {
      data: { items: [managedRow()], total: 1, limit: 30, offset: 0, has_more: false },
      error: null,
    };
  }));
  assert.deepEqual(call, {
    name: "list_market_repair_shop_inquiries_for_management",
    args: { p_status: "pending", p_limit: 30, p_offset: 0 },
  });
  assert.equal(page.items[0].inquiryKey, inquiryKey);
  assert.equal("requesterUserId" in page.items[0], false);
});

test("strict parsers reject extra internal identity fields and exotic prototypes", async () => {
  for (const extra of ["id", "requester_user_id", "resolved_by"]) {
    await assert.rejects(
      listMarketRepairShopInquiriesForManagement(client(async () => ({
        data: {
          items: [managedRow({ [extra]: randomUUID() })],
          total: 1,
          limit: 30,
          offset: 0,
          has_more: false,
        },
        error: null,
      }))),
      (error) => error instanceof MarketRepairShopInquiryError && error.code === "unknown",
    );
  }

  const row = Object.create({ inherited: true });
  Object.assign(row, managedRow());
  await assert.rejects(
    listMarketRepairShopInquiriesForManagement(client(async () => ({
      data: { items: [row], total: 1, limit: 30, offset: 0, has_more: false },
      error: null,
    }))),
    (error) => error instanceof MarketRepairShopInquiryError && error.code === "unknown",
  );
});

test("resolution binds the response to the requested public key", async () => {
  const result = await resolveMarketRepairShopInquiry(client(async (name, args) => {
    assert.equal(name, "resolve_market_repair_shop_inquiry");
    assert.deepEqual(args, { p_inquiry_key: inquiryKey, p_resolution: "resolved" });
    return {
      data: { inquiry_key: inquiryKey, inquiry_status: "resolved", resolved_at: now },
      error: null,
    };
  }), inquiryKey, "resolved");
  assert.equal(result.inquiryStatus, "resolved");

  await assert.rejects(
    resolveMarketRepairShopInquiry(client(async () => ({
      data: { inquiry_key: "b".repeat(32), inquiry_status: "resolved", resolved_at: now },
      error: null,
    })), inquiryKey, "resolved"),
    (error) => error instanceof MarketRepairShopInquiryError && error.code === "unknown",
  );
});

test("database errors map to stable account, permission, conflict, and network errors", async () => {
  for (const [message, code] of [
    ["로그인이 필요합니다.", "authentication"],
    ["정상 활동 계정만 장터를 이용할 수 있습니다.", "account"],
    ["장터 수리업체 등록 문의 운영 권한이 없습니다.", "permission"],
    ["이미 처리된 수리업체 등록 문의입니다.", "conflict"],
    ["Failed to fetch", "network"],
  ]) {
    await assert.rejects(
      listMarketRepairShopInquiriesForManagement(client(async () => ({ data: null, error: { message } }))),
      (error) => error instanceof MarketRepairShopInquiryError && error.code === code,
    );
  }
});
