import assert from "node:assert/strict";
import test from "node:test";
import { day, emptyFilters, listPosts, placementStatus, recruitmentLabel, sourceHref } from "./communityPromotionsPreview.ts";

const now = Date.parse("2026-11-23T03:00:00Z");
const lodge = { id: "lodge", field: "local", trade: "숙박", province: "충북", districts: ["괴산군"], visibility: "public", createdAt: now - day };
const newer = { ...lodge, id: "newer", createdAt: now };
const city = { ...lodge, id: "city", districts: ["청주시"] };
const filter = { field: "local", trade: "숙박", province: "충북", district: "괴산군" };
const placement = { id: "first", postId: lodge.id, slotCode: "home.hero.01", startsAt: now, endsAt: now + day, paused: false };

test("pins a matching public post once and returns it to its original sort order", () => {
  const second = { ...placement, id: "second", slotCode: "community.top.01" };
  const posts = [lodge, newer, city];
  assert.deepEqual(listPosts(posts, [placement, second], filter, now), { notices: [lodge], regular: [newer] });
  assert.deepEqual(listPosts(posts, [{ ...placement, paused: true }, second], filter, now).notices, [lodge]);
  assert.deepEqual(listPosts(posts, [placement, second], filter, now + day), { notices: [], regular: [newer, lodge] });
  assert.equal(placementStatus({ ...placement, startsAt: now + 1 }, now, lodge), "scheduled");
  for (const visibility of ["withdrawn", "blinded"]) {
    const hidden = { ...lodge, visibility };
    assert.deepEqual(listPosts([hidden], [placement], emptyFilters, now), { notices: [], regular: [] });
    assert.equal(placementStatus(placement, now, hidden), "blocked");
  }
});

test("matches service areas and suppresses deleted original content", () => {
  const service = { ...lodge, field: "service", scope: "service", districts: ["청주시", "괴산군"], address: "충북 청주시" };
  assert.deepEqual(listPosts([service], [], { ...filter, field: "service", trade: "" }, now).regular, [service]);
  const event = { kind: "event", key: "public-event", visibility: "public", recruitment: "closed" };
  assert.equal(sourceHref(event), "/events/public-event");
  assert.equal(sourceHref({ ...event, kind: "club" }), "/clubs/public-event");
  assert.equal(sourceHref({ ...event, kind: "education" }), "/certification/courses/public-event");
  assert.equal(sourceHref({ ...event, kind: "lesson" }), "/lessons/university-departments/public-event");
  assert.equal(sourceHref({ ...event, kind: "course" }), "/courses/public-event");
  assert.equal(sourceHref({ ...event, kind: "sale" }), "/market?view=sale&listing=public-event");
  assert.equal(recruitmentLabel({ ...lodge, source: event }, now), "모집 마감");
  assert.equal(recruitmentLabel({ ...lodge, field: "events", source: { ...event, recruitment: undefined } }, now), null);
  assert.equal(recruitmentLabel({ ...lodge, deadline: "2026-11-23" }, now), "모집 중");
  const deleted = { ...event, visibility: "removed" };
  assert.equal(sourceHref(deleted), null);
  assert.deepEqual(listPosts([{ ...lodge, source: deleted }], [placement], emptyFilters, now), { notices: [], regular: [] });
});
