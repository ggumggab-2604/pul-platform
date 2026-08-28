import assert from "node:assert/strict";
import { test } from "node:test";

import {
  OperationsDashboardResponseError,
  operationsQueueRegistry,
  parseOperationsDashboard,
} from "./operationsDashboard.ts";

function validDashboard(overrides = {}) {
  return {
    schema_version: 1,
    generated_at: "2026-09-20T00:00:00.000Z",
    attention: [{
      queue_key: "lesson_submission_requests",
      count: 2,
      oldest_at: "2026-09-17T00:00:00.000Z",
      age_days: 3,
      urgency: "attention",
    }],
    upcoming: [{
      item_key: "promotions_ending_soon",
      count: 1,
      next_at: "2026-09-24T00:00:00.000Z",
      severity: "info",
    }],
    automation_signals: [{
      signal_key: "promotion_media_attention",
      count: 1,
      severity: "warning",
    }],
    recent_activity: [{
      domain: "promotions",
      action: "promotion.placement.publish",
      occurred_at: "2026-09-19T10:00:00.000Z",
      outcome: "success",
    }],
    ...overrides,
  };
}

test("strict parser maps the exact version-one dashboard contract", () => {
  const parsed = parseOperationsDashboard(validDashboard());
  assert.equal(parsed.schemaVersion, 1);
  assert.equal(parsed.attention[0].count, 2);
  assert.equal(parsed.attention[0].urgency, "attention");
  assert.equal(parsed.upcoming[0].nextAt, "2026-09-24T00:00:00.000Z");
  assert.equal(parsed.automationSignals[0].severity, "warning");
  assert.equal(parsed.recentActivity[0].action, "promotion.placement.publish");
});

test("nullable upcoming timestamp is accepted without inventing a date", () => {
  const parsed = parseOperationsDashboard(validDashboard({
    upcoming: [{
      item_key: "events_status_mismatch",
      count: 1,
      next_at: null,
      severity: "warning",
    }],
  }));
  assert.equal(parsed.upcoming[0].nextAt, undefined);
});

test("extra keys, unsupported versions, malformed timestamps and negative counts fail closed", () => {
  const invalid = [
    { ...validDashboard(), unexpected: true },
    validDashboard({ schema_version: 2 }),
    validDashboard({ generated_at: "not-a-date" }),
    validDashboard({ attention: [{
      queue_key: "lesson_submission_requests",
      count: -1,
      oldest_at: "2026-09-17T00:00:00.000Z",
      age_days: 3,
      urgency: "attention",
    }] }),
    validDashboard({ upcoming: [{
      item_key: "promotions_ending_soon",
      count: 1,
      next_at: "invalid",
      severity: "info",
    }] }),
  ];
  for (const value of invalid) {
    assert.throws(() => parseOperationsDashboard(value), OperationsDashboardResponseError);
  }
});

test("unknown queue, urgency, severity, action and outcome values fail closed", () => {
  const cases = [
    validDashboard({ attention: [{ queue_key: "private_queue", count: 1, oldest_at: "2026-09-19T00:00:00Z", age_days: 1, urgency: "normal" }] }),
    validDashboard({ attention: [{ queue_key: "news_inquiries", count: 1, oldest_at: "2026-09-19T00:00:00Z", age_days: 1, urgency: "urgent" }] }),
    validDashboard({ automation_signals: [{ signal_key: "promotion_media_attention", count: 1, severity: "bad" }] }),
    validDashboard({ recent_activity: [{ domain: "promotions", action: "promotion.secret", occurred_at: "2026-09-19T00:00:00Z", outcome: "success" }] }),
    validDashboard({ recent_activity: [{ domain: "promotions", action: "promotion.update", occurred_at: "2026-09-19T00:00:00Z", outcome: "failure" }] }),
  ];
  for (const value of cases) assert.throws(() => parseOperationsDashboard(value));
});

test("queue registry contains real routes and explicit unbuilt destinations", () => {
  assert.equal(operationsQueueRegistry.lesson_information_reports.href, "/lessons/manage/reports");
  assert.equal(operationsQueueRegistry.market_repair_shop_inquiries.href, "/market/manage/repair-shop-inquiries");
  assert.equal(operationsQueueRegistry.market_partnership_inquiries.href, "/market/manage/partnership-inquiries");
  assert.equal(operationsQueueRegistry.course_information_reports.href, "/courses/manage/reports");
  assert.equal(operationsQueueRegistry.hall_of_fame_application_reviews.href, undefined);
});
