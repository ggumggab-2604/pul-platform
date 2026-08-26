import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const correction = readFileSync(
  fileURLToPath(new URL("../../../supabase/migrations/20260916000100_pul_promotion_management_ui_read_model.sql", import.meta.url)),
  "utf8",
);
const management = readFileSync(new URL("./promotionManagement.ts", import.meta.url), "utf8");
const actions = readFileSync(new URL("../../app/manage/banners/actions.ts", import.meta.url), "utf8");
const editor = readFileSync(new URL("../../components/promotions/manage/PromotionEditor.tsx", import.meta.url), "utf8");
const list = readFileSync(new URL("../../components/promotions/manage/PromotionBannerList.tsx", import.meta.url), "utf8");
const hub = readFileSync(new URL("../../app/manage/page.tsx", import.meta.url), "utf8");
const detailPage = readFileSync(new URL("../../app/manage/banners/[promotionKey]/page.tsx", import.meta.url), "utf8");

test("read model is bounded, deterministic, manager-only, and privacy minimized", () => {
  assert.match(correction, /create function public\.list_promotion_slots_for_management\(\)/);
  assert.match(correction, /create function public\.list_promotion_overviews_for_management\(/);
  assert.match(correction, /private\.promotion_assert_manager\(\)/);
  assert.match(correction, /p_limit integer default 30/);
  assert.match(correction, /p_limit not between 1 and 100/);
  assert.match(correction, /left join lateral \([\s\S]*order by[\s\S]*placement\.updated_at desc[\s\S]*limit 1/);
  assert.match(correction, /revoke all on function public\.list_promotion_overviews_for_management[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(correction, /grant execute on function public\.list_promotion_overviews_for_management[\s\S]*to authenticated/);
  assert.doesNotMatch(correction, /'created_by'|'updated_by'|'actor_id'|'email'/);
});

test("client parsers and list helper use the exact management read RPC", () => {
  assert.match(management, /parsePromotionSlotDefinition/);
  assert.match(management, /parsePromotionManagementOverviewPage/);
  assert.match(management, /client\.rpc\("list_promotion_overviews_for_management"/);
  assert.match(management, /p_slot_codes/);
  assert.match(management, /p_display_status/);
  assert.match(management, /p_content_kind/);
});

test("UI keeps disabled HOF slot visible but unselectable and uses Korean labels", () => {
  assert.match(editor, /disabled=!\{slot\.enabled\}|disabled=\{!slot\.enabled\}/);
  assert.match(editor, /사용 중지/);
  assert.match(editor, /friendlySlotName/);
  assert.match(list, /promotionStatusLabels/);
  assert.match(hub, /href: "\/manage\/banners"/);
});

test("media UI preserves signed upload and finalize lifecycle without service credentials", () => {
  assert.match(editor, /uploadToSignedUrl\(intent\.upload\.path, intent\.upload\.token, file/);
  assert.match(editor, /finalizePromotionMediaUploadAction/);
  assert.match(editor, /failPromotionMediaUploadAction/);
  assert.match(editor, /removePromotionMediaAction/);
  assert.match(editor, /disabled=\{busy !== null \|\| archived\}\s+onClick=\{\(\) => void removeMedia\(existing\)\}/);
  assert.match(actions, /createPromotionMediaUploadIntent/);
  assert.match(actions, /finalizePromotionMediaUpload/);
  assert.doesNotMatch(editor + actions, /SUPABASE_SERVICE_ROLE_KEY|service_role/);
});

test("every UI mutation supplies a request ID and optimistic versions where required", () => {
  assert.match(editor, /crypto\.randomUUID\(\)/);
  assert.match(editor, /requestFor\(/);
  assert.match(actions, /p_expected_version|expectedVersion/);
  assert.match(actions, /requestId\(row\.requestId\)/);
  assert.match(detailPage, /다른 세션의 변경은 버전 충돌/);
});

test("dangerous actions use an explicit dialog while hard delete is absent", () => {
  assert.match(editor, /PromotionConfirmDialog/);
  assert.match(editor, /이 배너를 숨길까요/);
  assert.match(editor, /이 홍보 콘텐츠를 보관할까요/);
  assert.doesNotMatch(actions, /deletePromotion|hardDelete/);
});
