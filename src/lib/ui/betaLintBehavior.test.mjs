import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";
import { installDom } from "../hall-of-fame/applicationReviewTestDom.mjs";

const require = createRequire(import.meta.url);
const source = file => readFileSync(new URL(file, import.meta.url), "utf8");
function compile(file, stubs = {}) {
  const output = ts.transpileModule(source(file), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
  const compiledModule = { exports: {} };
  new Function("require", "module", "exports", output)(name => name in stubs ? stubs[name] : require(name), compiledModule, compiledModule.exports);
  return compiledModule.exports;
}
installDom();
const hook = compile("../../hooks/useHofSectionRotation.ts").useHofSectionRotation;
async function mount(t, element) {
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container); let mounted = true;
  const unmount = async () => { if (mounted) { await act(async () => root.unmount()); mounted = false; container.parentNode.removeChild(container); } };
  t.after(unmount);
  await act(async () => root.render(element));
  return { container, root, unmount };
}
async function rotation(t, initial) {
  let current, props = { count: 3, startDelayMs: 0, autoPlay: false, instant: true, ...initial };
  function Harness(options) { current = hook(options); return React.createElement("div", null, String(current.index)); }
  const mounted = await mount(t, React.createElement(Harness, props));
  return { ...mounted, current: () => current, update: async next => { props = { ...props, ...next }; await act(async () => mounted.root.render(React.createElement(Harness, props))); } };
}
const tick = async (t, ms) => { await act(async () => t.mock.timers.tick(ms)); };

test("HOF rotation keeps manual wrap, direct selection and instant reduced-motion behavior", async t => {
  const r = await rotation(t);
  assert.equal(r.current().index, 0);
  await act(async () => r.current().prev()); assert.equal(r.current().index, 2);
  await act(async () => r.current().next()); assert.equal(r.current().index, 0);
  await act(async () => r.current().goTo(4)); assert.equal(r.current().index, 1);
  assert.equal(r.current().fading, false);
  await r.update({ count: 1 });
  assert.equal(r.current().index, 0); assert.equal(r.current().canNavigate, false);
  await act(async () => r.current().next()); assert.equal(r.current().index, 0);
});

test("HOF rotation preserves stagger, 8-second interval, interaction pause and autoplay gates", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 100000 });
  const r = await rotation(t, { autoPlay: true, startDelayMs: 2500 });
  await tick(t, 2500); await tick(t, 7999); assert.equal(r.current().index, 0);
  await tick(t, 1); assert.equal(r.current().index, 1);
  await act(async () => r.current().next()); assert.equal(r.current().index, 2);
  await tick(t, 8000); assert.equal(r.current().index, 2);
  await tick(t, 8000); assert.equal(r.current().index, 0);
  await r.update({ autoPlay: false }); await tick(t, 30000); assert.equal(r.current().index, 0);
  await r.update({ autoPlay: true }); await tick(t, 2500); await tick(t, 8000); assert.equal(r.current().index, 1);
});

test("HOF fade completes after 320ms, cancels on count change and cannot restore an out-of-range index", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 100000 });
  const r = await rotation(t, { instant: false });
  await act(async () => r.current().next()); assert.equal(r.current().fading, true);
  await tick(t, 319); assert.equal(r.current().index, 0);
  await tick(t, 1); assert.equal(r.current().index, 1); assert.equal(r.current().fading, false);
  await act(async () => r.current().goTo(2));
  await r.update({ count: 1 });
  await tick(t, 400);
  assert.equal(r.current().index, 0); assert.equal(r.current().fading, false);
  await r.update({ count: 3 }); assert.equal(r.current().index, 0);
  await r.update({ instant: true }); await act(async () => r.current().next());
  assert.equal(r.current().index, 1); assert.equal(r.current().fading, false);
  await r.update({ count: 0 }); assert.equal(r.current().index, 0);
});

test("HOF sections rotate independently and unmount cancels all pending changes", async t => {
  t.mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: 100000 });
  const a = await rotation(t, { autoPlay: true, startDelayMs: 1000 });
  const b = await rotation(t, { autoPlay: true, startDelayMs: 4500 });
  await tick(t, 1000); await tick(t, 3500); await tick(t, 4500);
  assert.equal(a.current().index, 1); assert.equal(b.current().index, 0);
  await a.unmount(); const before = a.current().index;
  await tick(t, 3500); assert.equal(b.current().index, 1);
  await tick(t, 20000); assert.equal(a.current().index, before);
});

test("quick actions collapse more-menu on leaving compact mode, and retain Escape and action behavior", async t => {
  let intersect, mediaChange, disconnected = 0, invoked = 0;
  const media = { matches: true, addEventListener: (_event, fn) => { mediaChange = fn; }, removeEventListener: () => { mediaChange = null; } };
  window.matchMedia = () => media;
  const oldObserver = globalThis.IntersectionObserver;
  globalThis.IntersectionObserver = class {
    constructor(fn) { intersect = fn; }
    observe() {}
    disconnect() { disconnected++; }
  };
  t.after(() => { globalThis.IntersectionObserver = oldObserver; });
  const Quick = compile("../../components/courses/detail/sidebar/CourseQuickActions.tsx", {
    "@/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") },
    "next/link": { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) },
  }).CourseQuickActions;
  const m = await mount(t, React.createElement(Quick, { mapsUrl: "https://maps.invalid", phoneHref: "tel:000", reservationGuideSummary: "", usageGuideLabel: "이용 안내", onUsageGuide: () => invoked++, onReport: () => {}, onMoreNearby: () => {} }));
  const toggle = () => m.container.querySelector('[aria-controls]');
  const click = async node => { await act(async () => node.click()); };
  await act(async () => intersect([{ isIntersecting: false }]));
  await click(toggle()); assert.equal(toggle().getAttribute("aria-expanded"), "true");
  await act(async () => intersect([{ isIntersecting: true }]));
  assert.equal(toggle().getAttribute("aria-expanded"), "false");
  await act(async () => intersect([{ isIntersecting: false }]));
  assert.equal(toggle().getAttribute("aria-expanded"), "false");
  await click(toggle());
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })));
  assert.equal(toggle().getAttribute("aria-expanded"), "false"); assert.equal(document.activeElement, toggle());
  await click(toggle());
  const panel = m.container.querySelector('[aria-label="추가 빠른 이용"]');
  await click(panel.querySelector("button")); assert.equal(invoked, 1); assert.equal(toggle().getAttribute("aria-expanded"), "false");
  await click(toggle()); media.matches = false; await act(async () => mediaChange());
  assert.equal(toggle().getAttribute("aria-expanded"), "false");
  await m.unmount(); assert(disconnected > 0); assert.equal(mediaChange, null);
});

test("market signed-out startup navigation preserves login return path and signed-in workflow", async () => {
  const text = source("../../components/market/MarketPageContent.tsx");
  const body = text.match(/const openStartupEntry = async \([\s\S]*?=> \{([\s\S]*?)\n  \};/)[1];
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const calls = [], trigger = {}, triggerRef = { current: null };
  const run = new AsyncFunction("trigger", "triggerRef", "createClient", "router", "setStartupEntryDialog", "setError", "setMessage", "initialCategory", "initialConsultation", body);
  for (const signedIn of [false, true]) {
    calls.length = 0;
    await run(trigger, triggerRef, () => ({ auth: { getSession: async () => ({ data: { session: signedIn ? {} : null } }) } }), { push: href => calls.push(["push", href]) }, value => calls.push(["entry", value]), () => {}, () => {}, "startup", "general");
    assert.equal(triggerRef.current, trigger);
    assert.deepEqual(calls, signedIn ? [["entry", { initialCategory: "startup", initialConsultation: "general" }]] : [["push", "/login?next=/market"]]);
  }
  assert.match(text, /useRouter.*from "next\/navigation"/);
});
