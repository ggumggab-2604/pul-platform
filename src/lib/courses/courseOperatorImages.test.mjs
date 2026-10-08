import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const compile = async source => import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString("base64")}`);
const source = readFileSync(new URL("./courseOperatorImages.ts", import.meta.url), "utf8").replace('import { contentRpc, uuid } from "./courseContent";', 'const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i; const contentRpc=async(client,name,args)=>{const r=await client.rpc(name,args);if(r.error)throw r.error;return r.data;};');
const { parseCourseOperatorSnapshot, getCourseOperatorImages, parseCourseOperatorUnfinished, getCourseOperatorUnfinished } = await compile(source);
const { appendCourseMediaPage } = await compile(readFileSync(new URL("./courseMedia.ts", import.meta.url), "utf8").replace('import { getSupabasePublicEnv } from "@/lib/supabase/env";', 'const getSupabasePublicEnv=()=>({url:"https://example.invalid"});'));
const item = { id: "456e9870-1234-4567-8a90-123456789abc", caption: "안내", purpose: "document", createdAt: "2026-10-08T00:00:00Z", width: 2560, height: 1700 };
test("rejects malformed, duplicated and over-limit operator image metadata", () => {
  const data = { items: [item], version: 2, canManage: false };
  assert.equal(parseCourseOperatorSnapshot(data), data);
  for (const bad of [{ ...data, canManage: "true" }, { ...data, items: [item, item] }, { ...data, items: [{ ...item, purpose: "photo" }] }, { ...data, items: [{ ...item, width: 3000 }] }, { ...data, version: -1 }]) assert.throws(() => parseCourseOperatorSnapshot(bad));
});
test("uses the target course RPC and preserves anonymous read-only scope", async () => {
  let call;
  const result = await getCourseOperatorImages({ rpc: async (name, args) => { call = { name, args }; return { data: { items: [], version: 0, canManage: false } }; } }, "screen-fixture");
  assert.deepEqual(call, { name: "course_operator_images", args: { p_course_key: "screen-fixture" } });
  assert.equal(result.canManage, false);
});
test("merges overlapping pages without replacing actual server total with loaded length", () => {
  const current = { items: [{ mediaKey: "a" }, { mediaKey: "b" }], total: 19, limit: 12, offset: 0, hasMore: true };
  const next = { items: [{ mediaKey: "b" }, { mediaKey: "c" }], total: 20, limit: 12, offset: 12, hasMore: true };
  const merged = appendCourseMediaPage(current, next);
  assert.deepEqual(merged.items.map(item => item.mediaKey), ["a", "b", "c"]);
  assert.equal(merged.total, 20);
  assert.equal(merged.hasMore, true);
  assert.equal(current.items.length, 2);
});

test("unfinished recovery accepts only bounded own-state metadata", () => {
  const row = { id: item.id, status: "uploaded", purpose: "photo", createdAt: item.createdAt };
  assert.deepEqual(parseCourseOperatorUnfinished({ items: [row] }).items, [row]);
  for (const value of [null, { items: [row, row] }, { items: [{ ...row, status: "ready" }] }, { items: [{ ...row, createdAt: "bad" }] }, { items: Array(9).fill(row) }]) assert.throws(() => parseCourseOperatorUnfinished(value));
});
test("unfinished lookup uses only the authenticated target-course RPC", async () => {
  let call;
  const result = await getCourseOperatorUnfinished({ rpc: async (name, args) => { call = { name, args }; return { data: { items: [] } }; } }, "screen-fixture");
  assert.deepEqual(call, { name: "course_operator_images_unfinished", args: { p_course_key: "screen-fixture" } });
  assert.deepEqual(result.items, []);
});
