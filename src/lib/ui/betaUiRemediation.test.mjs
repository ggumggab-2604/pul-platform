import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React, { act, useState } from "react";
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
const dom = installDom();
const focus = HTMLElement.prototype.focus;
HTMLElement.prototype.focus = function () {
  focus.call(this);
  this.dispatchEvent(new Event("focusin"));
};
HTMLElement.prototype.getClientRects = function () { return this.isConnected && !this.hidden ? [this.getBoundingClientRect()] : []; };
dom.window.scrollY = 120;
dom.window.innerWidth = 390;
dom.document.documentElement.clientWidth = 390;
dom.window.scrollTo = () => {};
const viewportListeners = new Set();
const desktop = { matches: false, addEventListener: (_event, listener) => viewportListeners.add(listener), removeEventListener: (_event, listener) => viewportListeners.delete(listener) };
dom.window.matchMedia = () => desktop;
const cn = (...values) => values.filter(Boolean).join(" ");
const link = { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) };
const context = compile("../../components/layout/MobileMenuContext.tsx");
const scrollLock = compile("../../components/ui/InfoModal.tsx", { "@/lib/utils": { cn } });
let pathname = "/community";
const navigation = { usePathname: () => pathname };
const navData = {
  navItems: [{ label: "홈", href: "/", icon: "home" }, { label: "이야기방", href: "/community", icon: "chat" }],
  mobileNavItems: [{ label: "홈", href: "/", icon: "home" }, { label: "전체", href: "#menu", icon: "menu" }],
};
const stubs = {
  "@/components/layout/MobileMenuContext": context,
  "@/components/ui/Icon": { Icon: () => null },
  "@/components/ui/InfoModal": scrollLock,
  "@/components/auth/LogoutButton": { LogoutButton: () => React.createElement("button", null, "로그아웃") },
  "@/hooks/useAuthSessionStatus": { useAuthSessionStatus: () => "signedOut" },
  "@/data/homeData": navData, "@/lib/utils": { cn }, "next/link": link, "next/navigation": navigation,
};
const Menu = compile("../../components/layout/MobileFullMenu.tsx", stubs).MobileFullMenu;
const BottomNav = compile("../../components/layout/MobileBottomNav.tsx", stubs).MobileBottomNav;
const Tabs = compile("../../components/certification/CertificationPageTabs.tsx", { "@/lib/utils": { cn } }).CertificationPageTabs;

async function mount(t, element) {
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container);
  let mounted = true;
  const unmount = async () => { if (mounted) { await act(async () => root.unmount()); mounted = false; container.parentNode.removeChild(container); } };
  t.after(unmount);
  await act(async () => root.render(element));
  return { container, root, unmount };
}
async function click(node) { assert.ok(node); await act(async () => node.click()); }
async function key(node, key, shiftKey = false) {
  const event = new KeyboardEvent("keydown", { key, shiftKey });
  await act(async () => node.dispatchEvent(event));
  return event;
}
async function menu(t) {
  pathname = "/community";
  desktop.matches = false;
  const element = () => React.createElement(context.MobileMenuProvider, null,
    React.createElement("button", { id: "background" }, "배경"),
    React.createElement(BottomNav), React.createElement(Menu));
  const mounted = await mount(t, element());
  const trigger = mounted.container.querySelector('[aria-haspopup="dialog"]');
  const background = mounted.container.querySelector("#background");
  return { ...mounted, trigger, background, element, dialog: () => mounted.container.querySelector('[role="dialog"]') };
}
const controls = dialog => dialog.querySelectorAll("button, [href], [tabindex]").filter(node => node.tabIndex >= 0 && !node.disabled);

test("mobile menu focuses inside, traps both Tab boundaries, restores trigger and scroll lock on Escape", async t => {
  const m = await menu(t);
  m.trigger.focus();
  await click(m.trigger);
  assert.equal(m.trigger.getAttribute("aria-expanded"), "true");
  const items = controls(m.dialog());
  assert.equal(document.activeElement, items[0]);
  assert.equal(items[0].getAttribute("aria-label"), "닫기");
  assert.equal(document.body.style.overflow, "hidden");
  items.at(-1).focus();
  assert.equal((await key(items.at(-1), "Tab")).defaultPrevented, true);
  assert.equal(document.activeElement, items[0]);
  assert.equal((await key(items[0], "Tab", true)).defaultPrevented, true);
  assert.equal(document.activeElement, items.at(-1));
  items[1].focus();
  assert.equal((await key(items[1], "Tab")).defaultPrevented, false);
  await key(items[1], "Escape");
  assert.equal(m.dialog(), null);
  assert.equal(document.activeElement, m.trigger);
  assert.equal(m.trigger.getAttribute("aria-expanded"), "false");
  assert.notEqual(document.body.style.overflow, "hidden");
});

test("mobile menu contains programmatic background focus and supports repeated pointer open/close", async t => {
  const m = await menu(t);
  for (let i = 0; i < 3; i++) {
    m.background.focus();
    await click(m.trigger);
    assert(m.dialog().contains(document.activeElement));
    m.background.focus();
    assert(m.dialog().contains(document.activeElement));
    await click(m.dialog().querySelector('[aria-label="메뉴 닫기"]'));
    assert.equal(m.dialog(), null);
    assert.equal(document.activeElement, m.trigger);
    m.background.focus();
    assert.equal(document.activeElement, m.background);
    assert.equal((await key(m.background, "Tab")).defaultPrevented, false);
  }
});

test("mobile menu links and close control retain pointer behavior; route change clears listeners", async t => {
  const m = await menu(t);
  await click(m.trigger);
  await click(m.dialog().querySelector('[href]'));
  assert.equal(m.dialog(), null);
  await click(m.trigger);
  await click(m.dialog().querySelector('[aria-label="닫기"]'));
  assert.equal(document.activeElement, m.trigger);
  await click(m.trigger);
  pathname = "/certification";
  await act(async () => m.root.render(m.element()));
  assert.equal(m.dialog(), null);
  m.background.focus();
  assert.equal(document.activeElement, m.background);
  assert.equal((await key(m.background, "Tab")).defaultPrevented, false);
});

test("mobile menu unmount removes focus/key handlers and releases scroll lock", async t => {
  const beforeKey = (document.listeners.get("keydown") ?? []).length;
  const beforeFocus = (document.listeners.get("focusin") ?? []).length;
  const m = await menu(t);
  await click(m.trigger);
  await m.unmount();
  assert.equal((document.listeners.get("keydown") ?? []).length, beforeKey);
  assert.equal((document.listeners.get("focusin") ?? []).length, beforeFocus);
  assert.notEqual(document.body.style.overflow, "hidden");
  assert.equal(viewportListeners.size, 0);
});

test("mobile menu releases its focus trap when a desktop viewport hides the menu", async t => {
  const m = await menu(t);
  await click(m.trigger);
  desktop.matches = true;
  await act(async () => { for (const listener of viewportListeners) listener(); });
  assert.equal(m.dialog(), null);
  assert.equal(viewportListeners.size, 0);
  m.background.focus();
  assert.equal(document.activeElement, m.background);
});

const tabIds = ["guide", "exam-prep", "courses", "activity"];
test("certification tabs activate and focus with arrows, wrap, Home/End and pointer clicks", async t => {
  function Harness() {
    const [active, setActive] = useState("courses");
    return React.createElement(React.Fragment, null,
      React.createElement(Tabs, { activeTab: active, onChange: setActive }),
      React.createElement("div", { id: "certification-panel-" + active, role: "tabpanel", "aria-labelledby": "certification-tab-" + active }, active));
  }
  const { container } = await mount(t, React.createElement(Harness));
  const tabs = container.querySelectorAll('[role="tab"]');
  const check = index => {
    tabs.forEach((tab, i) => {
      assert.equal(tab.tabIndex, i === index ? 0 : -1);
      assert.equal(tab.getAttribute("aria-selected"), String(i === index));
      assert.equal(tab.getAttribute("aria-controls"), "certification-panel-" + tabIds[i]);
    });
    const panel = container.querySelector('[role="tabpanel"]');
    assert.equal(panel.id, tabs[index].getAttribute("aria-controls"));
    assert.equal(panel.getAttribute("aria-labelledby"), tabs[index].id);
  };
  check(2); tabs[2].focus();
  for (const [keyName, index] of [["ArrowRight", 3], ["ArrowRight", 0], ["ArrowLeft", 3], ["ArrowLeft", 2], ["Home", 0], ["End", 3]]) {
    assert.equal((await key(document.activeElement, keyName)).defaultPrevented, true);
    assert.equal(document.activeElement, tabs[index]);
    check(index);
  }
  assert.equal((await key(tabs[3], "ArrowDown")).defaultPrevented, false);
  check(3);
  await click(tabs[1]); check(1);
});

test("certification keyboard retains existing URL query navigation and real tab/panel relationship", () => {
  const content = source("../../components/certification/CertificationPageContent.tsx");
  assert.match(content, /onChange=\{selectTab\}/);
  assert.match(content, /setOptional\(params, "tab", tab === "guide" \? undefined : tab\)/);
  assert.match(content, /router\.replace\([^;]+scroll: false/);
  assert.match(content, /id=\{\x60certification-panel-\$\{activeTab\}\x60\}/);
  assert.match(content, /aria-labelledby=\{\x60certification-tab-\$\{activeTab\}\x60\}/);
});

test("community university CTA promises information and links to the supported directory tab", () => {
  const data = compile("../../data/communityData.ts");
  const links = Object.values(data).find(value => Array.isArray(value) && value.some(item => item?.id === "link-university"));
  assert(links);
  const university = links.find(item => item.id === "link-university");
  assert.equal(university.href, "/lessons?tab=university-departments");
  assert.match(university.title, /정보/);
  assert.doesNotMatch([university.title, university.description, university.buttonLabel].join(" "), /게시판|활동\s*글/);
  const expected = { "link-course": "/courses", "link-club": "/clubs", "link-license": "/certification", "link-market": "/market" };
  for (const [id, href] of Object.entries(expected)) assert.equal(links.find(item => item.id === id)?.href, href);
  const lessons = source("../../components/lessons/LessonsPageContent.tsx");
  assert.match(lessons, /"university-departments"\]\.includes\(initialTab\)/);
  assert.match(lessons, /activeTab === "university-departments"/);
});
