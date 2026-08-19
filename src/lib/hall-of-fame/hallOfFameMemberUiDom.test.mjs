import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { test } from "node:test";

import React, { act, useState } from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";

import * as memberUi from "./hallOfFameMemberUi.ts";

const require = createRequire(import.meta.url);
const timestamp = "2026-08-18T10:00:00.000Z";
const USER_A = "00000000-0000-4000-8000-00000000000a";
const USER_B = "00000000-0000-4000-8000-00000000000b";

class TestEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = init.bubbles ?? true;
    this.cancelable = init.cancelable ?? true;
    this.defaultPrevented = false;
    this.propagationStopped = false;
    Object.assign(this, init);
  }

  preventDefault() {
    if (this.cancelable) this.defaultPrevented = true;
  }

  stopPropagation() {
    this.propagationStopped = true;
  }
}

class TestNode {
  constructor(nodeType, ownerDocument) {
    this.nodeType = nodeType;
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.childNodes = [];
    this.listeners = new Map();
  }

  get firstChild() {
    return this.childNodes[0] ?? null;
  }

  get lastChild() {
    return this.childNodes.at(-1) ?? null;
  }

  get nextSibling() {
    if (!this.parentNode) return null;
    const index = this.parentNode.childNodes.indexOf(this);
    return this.parentNode.childNodes[index + 1] ?? null;
  }

  get previousSibling() {
    if (!this.parentNode) return null;
    const index = this.parentNode.childNodes.indexOf(this);
    return this.parentNode.childNodes[index - 1] ?? null;
  }

  get isConnected() {
    return this.nodeType === 9 || this.parentNode?.isConnected === true;
  }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  insertBefore(child, before) {
    if (before == null) return this.appendChild(child);
    const index = this.childNodes.indexOf(before);
    if (index < 0) throw new Error("insertBefore reference is not a child");
    if (child.parentNode) child.parentNode.removeChild(child);
    child.parentNode = this;
    this.childNodes.splice(index, 0, child);
    return child;
  }

  removeChild(child) {
    const index = this.childNodes.indexOf(child);
    if (index < 0) throw new Error("removeChild target is not a child");
    this.childNodes.splice(index, 1);
    child.parentNode = null;
    return child;
  }

  contains(candidate) {
    for (let current = candidate; current; current = current.parentNode) {
      if (current === this) return true;
    }
    return false;
  }

  addEventListener(type, listener, options) {
    const entries = this.listeners.get(type) ?? [];
    entries.push({ listener, capture: options === true || options?.capture === true });
    this.listeners.set(type, entries);
  }

  removeEventListener(type, listener, options) {
    const capture = options === true || options?.capture === true;
    const entries = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      entries.filter((entry) => entry.listener !== listener || entry.capture !== capture),
    );
  }

  dispatchEvent(event) {
    if (!event.target) event.target = this;
    const path = [this];
    while (path.at(-1)?.parentNode) path.push(path.at(-1).parentNode);
    const invoke = (node, capture) => {
      event.currentTarget = node;
      for (const entry of node.listeners.get(event.type) ?? []) {
        if (entry.capture === capture) entry.listener.call(node, event);
        if (event.propagationStopped) return;
      }
    };
    for (const node of [...path].reverse()) invoke(node, true);
    if (!event.propagationStopped) {
      for (const node of path) {
        invoke(node, false);
        if (event.propagationStopped || !event.bubbles) break;
      }
    }
    return !event.defaultPrevented;
  }

  get textContent() {
    if (this.nodeType === 3 || this.nodeType === 8) return this.nodeValue;
    return this.childNodes.map((child) => child.textContent).join("");
  }

  set textContent(value) {
    for (const child of this.childNodes) child.parentNode = null;
    this.childNodes = [];
    if (value !== "" && value != null) {
      this.appendChild(this.ownerDocument.createTextNode(String(value)));
    }
  }
}

class TestText extends TestNode {
  constructor(value, ownerDocument, nodeType = 3) {
    super(nodeType, ownerDocument);
    this.nodeValue = value;
    this.nodeName = nodeType === 8 ? "#comment" : "#text";
  }

  get data() {
    return this.nodeValue;
  }

  set data(value) {
    this.nodeValue = value;
  }
}

function matchesSelector(element, selector) {
  const normalized = selector.trim();
  if (!normalized) return false;
  const disabledForbidden = normalized.includes(":not([disabled])");
  const tabIndexForbidden = normalized.includes(':not([tabindex="-1"])');
  const base = normalized.replace(/:not\([^)]*\)/g, "");
  if (disabledForbidden && element.disabled) return false;
  if (tabIndexForbidden && String(element.tabIndex) === "-1") return false;
  if (base === "[href]") return element.hasAttribute("href");
  if (base === "[tabindex]") return element.hasAttribute("tabindex");
  if (base.startsWith("#")) return element.id === base.slice(1);
  const attribute = base.match(/^\[([^=\]]+)(?:=["']?([^"'\]]+)["']?)?\]$/);
  if (attribute) {
    if (!element.hasAttribute(attribute[1])) return false;
    return attribute[2] === undefined || element.getAttribute(attribute[1]) === attribute[2];
  }
  return element.tagName === base.toUpperCase();
}

class TestElement extends TestNode {
  constructor(tagName, ownerDocument, namespaceURI = "http://www.w3.org/1999/xhtml") {
    super(1, ownerDocument);
    this.tagName = tagName.toUpperCase();
    this.nodeName = this.tagName;
    this.localName = tagName.toLowerCase();
    this.namespaceURI = namespaceURI;
    this.attributes = new Map();
    this.style = {
      setProperty(name, value) {
        this[name] = String(value);
      },
      removeProperty(name) {
        delete this[name];
      },
    };
    this.disabled = false;
    this.value = "";
    this.checked = false;
    this.tabIndex = 0;
  }

  setAttribute(name, value) {
    const normalized = String(value);
    this.attributes.set(name, normalized);
    if (name === "id") this.id = normalized;
    if (name === "class") this.className = normalized;
    if (name === "tabindex") this.tabIndex = Number(normalized);
    if (name === "disabled") this.disabled = true;
  }

  setAttributeNS(_namespace, name, value) {
    this.setAttribute(name, value);
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
    if (name === "disabled") this.disabled = false;
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  blur() {
    if (this.ownerDocument.activeElement === this) {
      this.ownerDocument.activeElement = this.ownerDocument.body;
    }
  }

  click() {
    this.dispatchEvent(new TestEvent("click", { button: 0 }));
  }

  querySelectorAll(selector) {
    const selectors = selector.split(",");
    return descendants(this).filter((element) =>
      selectors.some((candidate) => matchesSelector(element, candidate)),
    );
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  matches(selector) {
    return selector.split(",").some((candidate) => matchesSelector(this, candidate));
  }

  getBoundingClientRect() {
    return { x: 0, y: 0, width: 100, height: 40, top: 0, left: 0, right: 100, bottom: 40 };
  }
}

class TestDocument extends TestNode {
  constructor() {
    super(9, null);
    this.ownerDocument = this;
    this.nodeName = "#document";
    this.documentElement = new TestElement("html", this);
    this.body = new TestElement("body", this);
    this.appendChild(this.documentElement);
    this.documentElement.appendChild(this.body);
    this.activeElement = this.body;
  }

  createElement(tagName) {
    return new TestElement(tagName, this);
  }

  createElementNS(namespace, tagName) {
    return new TestElement(tagName, this, namespace);
  }

  createTextNode(value) {
    return new TestText(String(value), this);
  }

  createComment(value) {
    return new TestText(String(value), this, 8);
  }

  getElementById(id) {
    return descendants(this).find((element) => element.id === id) ?? null;
  }

  querySelectorAll(selector) {
    return this.documentElement.querySelectorAll(selector);
  }

  querySelector(selector) {
    return this.documentElement.querySelector(selector);
  }
}

function descendants(root) {
  const result = [];
  const visit = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 1) result.push(child);
      visit(child);
    }
  };
  visit(root);
  return result;
}

function installDom() {
  const document = new TestDocument();
  const windowListeners = new Map();
  let nextFrameId = 0;
  const frames = new Map();
  const window = {
    document,
    Node: TestNode,
    Element: TestElement,
    HTMLElement: TestElement,
    HTMLIFrameElement: class HTMLIFrameElement extends TestElement {},
    Event: TestEvent,
    KeyboardEvent: TestEvent,
    MouseEvent: TestEvent,
    getComputedStyle: () => ({ display: "block", visibility: "visible" }),
    requestAnimationFrame(callback) {
      const id = ++nextFrameId;
      const timer = setTimeout(() => {
        frames.delete(id);
        callback(Date.now());
      }, 0);
      frames.set(id, timer);
      return id;
    },
    cancelAnimationFrame(id) {
      const timer = frames.get(id);
      if (timer) clearTimeout(timer);
      frames.delete(id);
    },
    addEventListener(type, listener) {
      const entries = windowListeners.get(type) ?? new Set();
      entries.add(listener);
      windowListeners.set(type, entries);
    },
    removeEventListener(type, listener) {
      windowListeners.get(type)?.delete(listener);
    },
    dispatchEvent(event) {
      for (const listener of windowListeners.get(event.type) ?? []) listener(event);
    },
  };
  document.defaultView = window;
  globalThis.window = window;
  globalThis.document = document;
  globalThis.Node = TestNode;
  globalThis.Element = TestElement;
  globalThis.HTMLElement = TestElement;
  globalThis.HTMLIFrameElement = window.HTMLIFrameElement;
  globalThis.Event = TestEvent;
  globalThis.KeyboardEvent = TestEvent;
  globalThis.MouseEvent = TestEvent;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { userAgent: "node-dom-contract-test" },
  });
  globalThis.getComputedStyle = window.getComputedStyle;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return { document, window };
}

const dom = installDom();

function compileTsx(relativePath, mocks) {
  const source = readFileSync(new URL(`../../${relativePath}`, import.meta.url), "utf8");
  const { outputText, diagnostics } = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: relativePath,
    reportDiagnostics: true,
  });
  assert.equal(diagnostics?.length ?? 0, 0, `TypeScript transpile failed for ${relativePath}`);
  const compiledModule = { exports: {} };
  const localRequire = (specifier) => {
    if (specifier in mocks) return mocks[specifier];
    return require(specifier);
  };
  new Function("require", "module", "exports", outputText)(
    localRequire,
    compiledModule,
    compiledModule.exports,
  );
  return compiledModule.exports;
}

function mockIcon(props) {
  return React.createElement("span", { ...props, className: props.className });
}

function createAuthController(initialUserId, { pending = false } = {}) {
  let authCallback;
  let unsubscribeCount = 0;
  let resolveSession;
  let currentUserId = initialUserId;
  const sessionPromise = pending
    ? new Promise((resolve) => {
        resolveSession = resolve;
      })
    : undefined;
  return {
    client: {
      auth: {
        getSession: () =>
          sessionPromise ??
          Promise.resolve({
            data: { session: currentUserId ? { user: { id: currentUserId } } : null },
          }),
        onAuthStateChange(callback) {
          authCallback = callback;
          return {
            data: {
              subscription: {
                unsubscribe() {
                  unsubscribeCount += 1;
                },
              },
            },
          };
        },
      },
    },
    emit(userId) {
      currentUserId = userId;
      authCallback?.(
        userId ? "SIGNED_IN" : "SIGNED_OUT",
        userId ? { user: { id: userId } } : null,
      );
    },
    resolve(userId) {
      currentUserId = userId;
      resolveSession?.({ data: { session: userId ? { user: { id: userId } } : null } });
    },
    get unsubscribeCount() {
      return unsubscribeCount;
    },
  };
}

let activeAuthController;
let refreshCount = 0;
const routerMock = { refresh: () => (refreshCount += 1) };

const pageContentModule = compileTsx(
  "components/hall-of-fame/HallOfFamePageContent.tsx",
  {
    "next/link": {
      __esModule: true,
      default: ({ href, children, ...props }) => React.createElement("a", { href, ...props }, children),
    },
    "next/navigation": { useRouter: () => routerMock },
    "lucide-react": new Proxy({}, { get: () => mockIcon }),
    "@/components/hall-of-fame/HallOfFameDisputeDialog": {
      HallOfFameDisputeDialog: ({ target }) =>
        React.createElement("div", { "data-testid": "dispute-dialog" }, target.title),
    },
    "@/components/hall-of-fame/HallOfFameRequestDetailDialog": {
      HallOfFameRequestDetailDialog: ({ request }) =>
        React.createElement("div", { "data-testid": "request-dialog" }, request.statement),
    },
    "@/components/hall-of-fame/HallOfFamePublicExplorer": {
      HallOfFamePublicExplorer: () =>
        React.createElement("section", { "data-testid": "public-explorer" }),
    },
    "@/components/ui/Container": {
      Container: ({ children, ...props }) => React.createElement("div", props, children),
    },
    "@/components/ui/SoftBadge": {
      SoftBadge: ({ children, ...props }) => React.createElement("span", props, children),
    },
    "@/lib/hall-of-fame/hallOfFameMemberUi": memberUi,
    "@/lib/supabase/client": { createClient: () => activeAuthController.client },
    "@/lib/utils": { cn: (...values) => values.filter(Boolean).join(" ") },
  },
);

const dialogModule = compileTsx("components/hall-of-fame/HallOfFameDialog.tsx", {
  "@/components/ui/InfoModal": { useBodyScrollLock() {} },
});

let loadedDispute;
const detailModule = compileTsx(
  "components/hall-of-fame/HallOfFameRequestDetailDialog.tsx",
  {
    "@/app/hall-of-fame/actions": {
      withdrawHallOfFameDisputeAction: async () => ({ ok: false, message: "not used" }),
    },
    "@/components/hall-of-fame/HallOfFameDialog": dialogModule,
    "@/lib/supabase/client": { createClient: () => ({}) },
    "@/lib/hall-of-fame/hallOfFameMemberUi": {
      ...memberUi,
      getMyHallOfFameDispute: async () => loadedDispute,
    },
  },
);

const { HallOfFamePageContent } = pageContentModule;
const { HallOfFameRequestDetailDialog } = detailModule;

function application(label) {
  return {
    applicationRecordId: `${label}-application-id`,
    applicationType: "direct_application",
    batchStatus: "rejected",
    recordStatus: "rejected",
    recordTypeCode: "hole_in_one",
    recordTypeName: `${label} application`,
    playedOn: "2026-08-18",
    courseName: `${label} course`,
    courseRegion: "TEST",
    courseEnvironment: "outdoor",
    courseSegment: "A",
    holeNumber: 1,
    holePar: 3,
    strokes: 1,
    createdAt: timestamp,
    submittedAt: timestamp,
    finalizedAt: timestamp,
    isSubmitter: true,
    isSubject: true,
    allowedDisputeTypes: ["decision_appeal"],
    canSubmitDispute: true,
  };
}

function record(label) {
  return {
    canonicalRecordId: `${label}-record-id`,
    recordTypeCode: "hole_in_one",
    recordTypeName: `${label} record`,
    validityStatus: "corrected",
    publicationStatus: "suppressed",
    playedOn: "2026-08-18",
    courseName: `${label} course`,
    courseRegion: "TEST",
    courseEnvironment: "outdoor",
    courseSegment: "A",
    holeNumber: 1,
    holePar: 3,
    strokes: 1,
    approvedAt: timestamp,
    isSubmitter: true,
    isSubject: true,
    badges: [],
    allowedDisputeTypes: ["correction_request"],
    canSubmitDispute: true,
  };
}

function dispute(label, status = "open") {
  return {
    disputeId: `${label}-dispute-id`,
    disputeType: "decision_appeal",
    category: "decision_error",
    targetKind: "application_record",
    statement: `${label} request`,
    status,
    version: status === "resolved" ? 2 : 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    resolutionOutcome: status === "resolved" ? "no_change" : undefined,
    resolutionMessage: status === "resolved" ? `${label} resolved` : undefined,
    resolvedAt: status === "resolved" ? timestamp : undefined,
  };
}

function pageProps(label, userId) {
  return {
    publicRecords: [],
    publicLoadFailed: false,
    authenticatedUserId: userId,
    applications: [application(label)],
    applicationsLoadFailed: false,
    records: [record(label)],
    recordsLoadFailed: false,
    disputes: [dispute(label)],
    disputesLoadFailed: false,
  };
}

function textIncludes(root, text) {
  return root.textContent.includes(text);
}

function elementById(root, id) {
  return descendants(root).find((element) => element.id === id);
}

function buttonByText(root, text) {
  return descendants(root).find(
    (element) => element.tagName === "BUTTON" && element.textContent.includes(text),
  );
}

function buttonByAriaLabel(root, label) {
  return descendants(root).find(
    (element) => element.tagName === "BUTTON" && element.getAttribute("aria-label") === label,
  );
}

function reactProps(element) {
  const key = Object.keys(element).find((candidate) => candidate.startsWith("__reactProps$"));
  assert.ok(key, "React props were not attached to the rendered element");
  return element[key];
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
}

async function activate(element) {
  assert.ok(element, "Expected an actionable element");
  await act(async () => {
    reactProps(element).onClick?.({
      target: element,
      currentTarget: element,
      preventDefault() {},
      stopPropagation() {},
    });
  });
  await flush();
}

async function renderPage(controller, props) {
  activeAuthController = controller;
  refreshCount = 0;
  const container = dom.document.createElement("div");
  dom.document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(HallOfFamePageContent, props)));
  return { container, root };
}

async function unmount(root) {
  await act(async () => root.unmount());
}

test("identity DOM shows only the matching member and hides private props while auth is loading", async () => {
  const sameUser = createAuthController(USER_A);
  const same = await renderPage(sameUser, pageProps("A", USER_A));
  await flush();
  assert.equal(textIncludes(same.container, "A record"), true);
  await activate(elementById(same.container, "my-hall-of-fame-tab-applications"));
  assert.equal(textIncludes(same.container, "A application"), true);
  await activate(elementById(same.container, "my-hall-of-fame-tab-requests"));
  assert.equal(textIncludes(same.container, "A request"), true);
  await unmount(same.root);

  const loadingUser = createAuthController(USER_A, { pending: true });
  const loading = await renderPage(loadingUser, pageProps("A", USER_A));
  await flush();
  assert.equal(textIncludes(loading.container, "A application"), false);
  assert.equal(textIncludes(loading.container, "A record"), false);
  assert.equal(textIncludes(loading.container, "A request"), false);
  await unmount(loading.root);
});

test("identity DOM removes stale data and dialogs on logout and unsubscribes on unmount", async () => {
  const controller = createAuthController(USER_A);
  const rendered = await renderPage(controller, pageProps("A", USER_A));
  await flush();
  await activate(elementById(rendered.container, "my-hall-of-fame-tab-requests"));
  const detailButton = descendants(rendered.container).find(
    (element) => element.tagName === "BUTTON" && element.getAttribute("role") !== "tab",
  );
  await activate(detailButton);
  assert.equal(textIncludes(rendered.container, "A request"), true);
  assert.ok(rendered.container.querySelector('[data-testid="request-dialog"]'));

  await act(async () => controller.emit(null));
  await flush();
  assert.equal(refreshCount, 1);
  assert.equal(Boolean(elementById(rendered.container, "my-hall-of-fame-tab-records")), false);
  assert.equal(Boolean(rendered.container.querySelector('[data-testid="request-dialog"]')), false);
  assert.equal(textIncludes(rendered.container, "A application"), false);
  assert.equal(textIncludes(rendered.container, "A record"), false);
  assert.equal(textIncludes(rendered.container, "A request"), false);

  await unmount(rendered.root);
  assert.equal(controller.unsubscribeCount, 1);
});

test("identity DOM removes account A immediately, refreshes once, and shows B only after rerender", async () => {
  const controller = createAuthController(USER_A);
  const rendered = await renderPage(controller, pageProps("A", USER_A));
  await flush();
  assert.equal(textIncludes(rendered.container, "A record"), true);

  await act(async () => controller.emit(USER_B));
  await flush();
  assert.equal(refreshCount, 1);
  assert.equal(Boolean(elementById(rendered.container, "my-hall-of-fame-tab-records")), false);
  assert.equal(textIncludes(rendered.container, "A application"), false);
  assert.equal(textIncludes(rendered.container, "A record"), false);
  assert.equal(textIncludes(rendered.container, "A request"), false);
  assert.equal(textIncludes(rendered.container, "B record"), false);

  await act(async () => controller.emit(USER_B));
  await flush();
  assert.equal(refreshCount, 1);

  await act(async () =>
    rendered.root.render(React.createElement(HallOfFamePageContent, pageProps("B", USER_B))),
  );
  await flush();
  assert.equal(textIncludes(rendered.container, "B record"), true);
  assert.equal(textIncludes(rendered.container, "B application"), false);
  assert.equal(textIncludes(rendered.container, "B request"), false);
  assert.equal(textIncludes(rendered.container, "A application"), false);
  assert.equal(textIncludes(rendered.container, "A record"), false);
  assert.equal(textIncludes(rendered.container, "A request"), false);

  await activate(elementById(rendered.container, "my-hall-of-fame-tab-applications"));
  assert.equal(textIncludes(rendered.container, "B application"), true);
  assert.equal(textIncludes(rendered.container, "A application"), false);
  assert.equal(textIncludes(rendered.container, "A record"), false);
  assert.equal(textIncludes(rendered.container, "A request"), false);

  await activate(elementById(rendered.container, "my-hall-of-fame-tab-requests"));
  assert.equal(textIncludes(rendered.container, "B request"), true);
  assert.equal(textIncludes(rendered.container, "A application"), false);
  assert.equal(textIncludes(rendered.container, "A record"), false);
  assert.equal(textIncludes(rendered.container, "A request"), false);
  assert.equal(refreshCount, 1);
  await unmount(rendered.root);
});

function DetailHarness({ request, returnFocus }) {
  const [open, setOpen] = useState(true);
  return open
    ? React.createElement(HallOfFameRequestDetailDialog, {
        request,
        returnFocus,
        onClose: () => setOpen(false),
        onSuccess: () => setOpen(false),
      })
    : null;
}

async function renderDetail(detail) {
  loadedDispute = detail;
  const externalTrigger = dom.document.createElement("button");
  externalTrigger.textContent = "external detail trigger";
  dom.document.body.appendChild(externalTrigger);
  externalTrigger.focus();
  const container = dom.document.createElement("div");
  dom.document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      React.createElement(DetailHarness, { request: detail, returnFocus: externalTrigger }),
    ),
  );
  await flush();
  return { container, externalTrigger, root };
}

test("withdrawal confirmation moves document.activeElement in and back to its trigger", async () => {
  const rendered = await renderDetail(dispute("focus", "under_review"));
  const withdrawalTrigger = buttonByText(rendered.container, "요청 취소");
  assert.ok(withdrawalTrigger);
  withdrawalTrigger.focus();
  assert.equal(dom.document.activeElement, withdrawalTrigger);

  await activate(withdrawalTrigger);
  const keepButton = buttonByText(rendered.container, "계속 유지");
  assert.ok(keepButton);
  assert.equal(dom.document.activeElement, keepButton);

  await activate(keepButton);
  const restoredTrigger = buttonByText(rendered.container, "요청 취소");
  assert.ok(restoredTrigger);
  assert.equal(dom.document.activeElement, restoredTrigger);
  await unmount(rendered.root);
});

test("request detail ESC restores external focus and resolved requests expose no withdrawal", async () => {
  const open = await renderDetail(dispute("escape", "open"));
  const dialog = open.container.querySelector('[role="dialog"]');
  const closeButton = buttonByAriaLabel(open.container, "창 닫기");
  assert.ok(dialog);
  assert.ok(closeButton);
  assert.equal(dom.document.activeElement, closeButton);
  assert.notEqual(dom.document.activeElement, open.externalTrigger);
  await act(async () => {
    dom.document.dispatchEvent(new TestEvent("keydown", { key: "Escape" }));
  });
  await flush();
  assert.equal(Boolean(open.container.querySelector('[role="dialog"]')), false);
  assert.equal(dom.document.activeElement, open.externalTrigger);
  await unmount(open.root);

  const resolved = await renderDetail(dispute("resolved", "resolved"));
  assert.equal(buttonByText(resolved.container, "요청 취소"), undefined);
  assert.equal(buttonByText(resolved.container, "계속 유지"), undefined);
  await unmount(resolved.root);
});
