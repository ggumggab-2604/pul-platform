import { createRequire } from "node:module";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";
import * as applicant from "./hallOfFameApplicant.ts";
import * as evidenceValidation from "./hallOfFameEvidenceValidation.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { validateApplicantInput, directApplicationContext, applicantError, APPLICANT_RECORD_TYPES } from "./hallOfFameApplicant.ts";

const input = { played_on: "2026-09-01", course_name: "테스트 구장", course_region: "서울", course_environment: "outdoor", round_type: "casual", record_type_code: "hole_in_one", course_segment: "A", hole_number: 1, hole_par: 3, strokes: 1 };
test("only supported types and qualifying scores pass", () => {
  assert.deepEqual(Object.keys(APPLICANT_RECORD_TYPES), ["hole_in_one", "albatross", "condor"]);
  for (const [type, par] of [["hole_in_one", 3], ["albatross", 4], ["condor", 5]]) assert.equal(validateApplicantInput({ ...input, record_type_code: type, hole_par: par }).record_type_code, type);
  for (const patch of [{ record_type_code: "best_score" }, { strokes: 2 }, { record_type_code: "condor", hole_par: 4 }, { record_type_code: "albatross", hole_par: null }]) assert.throws(() => validateApplicantInput({ ...input, ...patch }));
});
test("required fields, date, bounds, and numbers are checked", () => {
  for (const patch of [{ course_name: " " }, { course_region: "" }, { played_on: "2026-02-30" }, { played_on: "" }, { hole_number: 0 }, { hole_number: 37 }, { strokes: "1" }, { course_environment: "fake" }, { round_type: "fake" }, { course_segment: "" }, { hole_par: 10 }]) assert.throws(() => validateApplicantInput({ ...input, ...patch }));
});
test("client identity fields never enter normalized record input", () => {
  const result = validateApplicantInput({ ...input, target_user_id: "other", applicantId: "other", target_membership_id: "other" });
  assert.deepEqual(result, input);
});
test("eligibility chooses only DB supplied direct or vacancy contexts", () => {
  assert.equal(directApplicationContext({ eligibility_code: "direct_application_allowed", can_create_direct_application: true, vacant_context_clubs: [] }, "spoof").clubId, null);
  const vacancy = { eligibility_code: "direct_application_allowed_due_to_admin_vacancy", can_create_direct_application: true, vacant_context_clubs: [{ club_id: "club", membership_id: "own", club_name: "test" }] };
  assert.equal(directApplicationContext(vacancy, "club").membershipId, "own");
  assert.throws(() => directApplicationContext(vacancy, "other"));
  assert.throws(() => directApplicationContext({ ...vacancy, can_create_direct_application: false }, "club"));
  assert.throws(() => directApplicationContext({ ...vacancy, eligibility_code: "club_nomination_required" }, "club"));
});
test("errors distinguish login, eligibility, duplicates, validation and unknown failures without raw errors", () => {
  const messages = ["HOF_AUTHENTICATION_REQUIRED", "HOF_NOT_ELIGIBLE", "HOF_DUPLICATE_RECORD", "HOF_INVALID_RECORD", "SQL table secret credential"].map(message => applicantError(new Error(message)));
  assert.equal(new Set(messages).size, 5);
  assert.doesNotMatch(messages.join(" "), /HOF_|SQL|secret|credential/);
});
test("entry, login return, own status and existing admin queue are wired", () => {
  const source = path => readFileSync(new URL(path, import.meta.url), "utf8");
  assert.match(source("../../components/hall-of-fame/HallOfFamePageContent.tsx"), /href="\/hall-of-fame\/apply"/);
  assert.match(source("../../app/hall-of-fame/apply/page.tsx"), /redirect\(`\/login\?next=/);
  const form = source("../../components/hall-of-fame/HallOfFameApplicationForm.tsx");
  assert.match(form, /\/hall-of-fame\?tab=applications#my-hall-of-fame/);
  assert.match(form, /scorecardReady/); assert.match(form, /confirmationReady/);
  assert.match(form, /identity\.current/); assert.match(form, /pul-auth-signed-out/);
  assert.match(source("../../components/hall-of-fame/manage/HallOfFameApplicationQueue.tsx"), /list_hall_of_fame_review_queue/);
});

// Minimal DOM follows the existing HOF React DOM test harness; no new dependency.
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
    if (name === "type") this.type = normalized;
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
const require = createRequire(import.meta.url);
const USER = "00000000-0000-4000-8000-000000000001";
const BATCH_A = "00000000-0000-4000-8000-000000000002";
const BATCH_B = "00000000-0000-4000-8000-000000000003";
const CONFIRM_A = "a1234567-0000-4000-8000-00000000000a";
const CONFIRM_B = "a1234567-0000-4000-8000-00000000000b";
let environment;

const formSource = readFileSync(new URL("../../components/hall-of-fame/HallOfFameApplicationForm.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(formSource, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const compiledModule = { exports: {} };
new Function("require", "module", "exports", compiled)(name => {
  if (name === "next/link") return { __esModule: true, default: ({ children, ...props }) => React.createElement("a", props, children) };
  if (name === "next/navigation") return { useRouter: () => environment.router };
  if (name === "@/lib/supabase/client") return { createClient: () => environment.client };
  if (name.endsWith("/apply/actions")) return { performApplicantAction: command => environment.action(command) };
  if (name.endsWith("/hallOfFameApplicant")) return applicant;
  if (name.endsWith("/hallOfFameEvidenceValidation")) return evidenceValidation;
  return require(name);
}, compiledModule, compiledModule.exports);
const { HallOfFameApplicationForm } = compiledModule.exports;

function batchFixture(id, confirmationId) {
  return {
    id, version: 7, status: "draft", application_type: "direct_application", context_club_id: null,
    round: { ...input },
    records: [{
      id: id.replace("4000", "4001"), version: 1, status: "draft", ...input,
      processing_consent: true, review_consent: true, publication_consent: true,
      evidence: [], confirmations: confirmationId ? [{ id: confirmationId, status: "pending", active: true }] : [],
    }],
  };
}
function incomingFixture(id) {
  return { id, batch_version: 7, status: "pending", expires_at: "2026-10-01T00:00:00Z", ...input };
}
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
async function settle() {
  await act(async () => { await new Promise(resolve => setImmediate(resolve)); });
}
async function mountForm(t) {
  const env = {
    calls: [], uploads: [], refreshes: 0,
    router: { refresh: () => { env.refreshes++; }, push: () => {} },
    client: { auth: {
      getSession: async () => ({ data: { session: { user: { id: env.props.userId } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    } },
    handler: async command => command.operation === "upload" ? {
      ok: true, message: "업로드 준비",
      upload: { signedUrl: "https://upload.invalid/scorecard", mimeType: command.mimeType, batchVersion: 8, evidenceId: "evidence" },
    } : { ok: true, message: "B 처리 완료" },
    fetchHandler: async () => ({ ok: true }),
    async action(command) { env.calls.push(command); return env.handler(command); },
    props: {
      userId: USER, selectedBatchId: BATCH_A, offset: 0,
      eligibility: { can_create_direct_application: true, eligibility_code: "direct_application_allowed", vacant_context_clubs: [] },
      workspace: { record_types: [{ code: "hole_in_one", name: "홀인원" }], applications: [batchFixture(BATCH_A), batchFixture(BATCH_B)], incoming_confirmations: [] },
    },
  };
  environment = env;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => { env.uploads.push({ url, ...options }); return env.fetchHandler(); };
  const container = dom.document.createElement("div");
  dom.document.body.appendChild(container);
  const root = createRoot(container);
  env.container = container;
  env.render = async patch => {
    env.props = { ...env.props, ...patch };
    await act(async () => { root.render(React.createElement(HallOfFameApplicationForm, env.props)); });
    await settle();
  };
  t.after(async () => {
    await act(async () => { root.unmount(); });
    container.parentNode.removeChild(container);
    globalThis.fetch = oldFetch;
  });
  await env.render({});
  return env;
}
function uploadButton(env) {
  return env.container.querySelectorAll("button").find(node => node.textContent === "스코어카드 첨부");
}
function fileInput(env) {
  return env.container.querySelectorAll("input").find(node => node.type === "file");
}
async function chooseFile(env, file) {
  const node = fileInput(env);
  node.files = [file];
  node.value = "C:\\fakepath\\" + file.name;
  await act(async () => { node.dispatchEvent(new TestEvent("change")); });
}
async function click(node) {
  assert.ok(node);
  await act(async () => { node.click(); });
  await settle();
}

test("component isolates file state and DOM on A to B, and uploads only newly selected file B", async t => {
  const env = await mountForm(t);
  const fileA = new File(["file-A"], "A.png", { type: "image/png" });
  const fileB = new File(["file-B-new"], "B.png", { type: "image/png" });
  await chooseFile(env, fileA);
  const oldInput = fileInput(env);
  assert.equal(uploadButton(env).disabled, false);
  env.handler = async () => ({ ok: false, message: "A 파일 오류" });
  await click(uploadButton(env));
  assert.match(env.container.textContent, /A 파일 오류/);
  env.calls.length = 0;
  await env.render({ selectedBatchId: BATCH_B });
  assert.notEqual(fileInput(env), oldInput);
  assert.equal(fileInput(env).value, "");
  assert.equal(uploadButton(env).disabled, true);
  assert.doesNotMatch(env.container.textContent, /A 파일 오류/);
  await click(uploadButton(env));
  assert.equal(env.calls.length, 0);
  env.handler = async command => command.operation === "upload"
    ? { ok: true, message: "준비", upload: { signedUrl: "https://upload.invalid/B", mimeType: command.mimeType, batchVersion: 8, evidenceId: "B-evidence" } }
    : { ok: true, message: "B 완료" };
  await chooseFile(env, fileB);
  await click(uploadButton(env));
  assert.deepEqual(env.calls.map(c => [c.operation, c.batchId]), [["upload", BATCH_B], ["finalize", BATCH_B]]);
  assert.equal(env.calls[0].byteSize, fileB.size);
  assert.equal(env.uploads.length, 1);
  assert.equal(env.uploads[0].body, fileB);
  assert.notEqual(env.uploads[0].body, fileA);
});

test("component resets files through the list and when the same batch gets a different record", async t => {
  const env = await mountForm(t);
  await chooseFile(env, new File(["A"], "A.png", { type: "image/png" }));
  await env.render({ selectedBatchId: null });
  assert.equal(fileInput(env), undefined);
  await env.render({ selectedBatchId: BATCH_A });
  assert.equal(fileInput(env).value, "");
  assert.equal(uploadButton(env).disabled, true);
  await chooseFile(env, new File(["again"], "again.png", { type: "image/png" }));
  const workspace = structuredClone(env.props.workspace);
  workspace.applications[0].records[0].id = "00000000-0000-4000-8000-000000000099";
  await env.render({ workspace });
  assert.equal(fileInput(env).value, "");
  assert.equal(uploadButton(env).disabled, true);
  assert.equal(env.calls.length, 0);
});

for (const stage of ["intent", "bytes", "finalize"]) {
  test("component ignores A's late " + stage + " response after switching to B", async t => {
    const env = await mountForm(t);
    const late = deferred();
    const intent = { ok: true, message: "A late result", upload: { signedUrl: "https://upload.invalid/A", mimeType: "image/png", batchVersion: 8, evidenceId: "A-evidence" } };
    env.handler = async command => {
      if (command.operation === "upload") return stage === "intent" ? late.promise : intent;
      return late.promise;
    };
    if (stage === "bytes") env.fetchHandler = () => late.promise;
    await chooseFile(env, new File(["A"], "A.png", { type: "image/png" }));
    await click(uploadButton(env));
    assert.equal(env.calls.length, stage === "finalize" ? 2 : 1);
    const oldCalls = env.calls.length;
    const oldUploads = env.uploads.length;
    await env.render({ selectedBatchId: BATCH_B });
    assert.equal(uploadButton(env).disabled, true);
    assert.equal(fileInput(env).value, "");
    const refreshes = env.refreshes;
    await act(async () => {
      late.resolve(stage === "intent" ? intent : { ok: true, message: "A late result" });
      await new Promise(resolve => setImmediate(resolve));
    });
    await settle();
    assert.equal(env.calls.length, oldCalls, "old context must not start the next Action");
    assert.equal(env.uploads.length, oldUploads, "old intent must not start a file upload");
    assert.equal(env.refreshes, refreshes, "old result must not refresh the new page");
    assert.doesNotMatch(env.container.textContent, /A late result/);
    assert.equal(uploadButton(env).disabled, true);
    assert.equal(env.container.querySelector("[aria-busy]").getAttribute("aria-busy"), "false");
    await chooseFile(env, new File(["B"], "B.png", { type: "image/png" }));
    assert.equal(uploadButton(env).disabled, false);
  });
}

test("component displays full matching request IDs on both sides and responds to the chosen identical-round card", async t => {
  const env = await mountForm(t);
  const workspace = { ...env.props.workspace, applications: [batchFixture(BATCH_A, CONFIRM_A), batchFixture(BATCH_B, CONFIRM_B)] };
  await env.render({ workspace });
  assert.match(env.container.textContent, new RegExp(CONFIRM_A));
  assert.match(env.container.textContent, /동반 회원에게 아래 확인 요청 번호를 함께 전달/);
  await env.render({ selectedBatchId: BATCH_B });
  assert.match(env.container.textContent, new RegExp(CONFIRM_B));
  const incoming = [incomingFixture(CONFIRM_A), incomingFixture(CONFIRM_B)];
  await env.render({
    userId: "00000000-0000-4000-8000-000000000004", selectedBatchId: null,
    workspace: { ...workspace, applications: [], incoming_confirmations: incoming },
  });
  const cards = incoming.map(c => {
    const id = env.container.querySelectorAll("span").find(node => node.textContent === c.id);
    assert.ok(id, "the full request ID must be visible");
    assert.match(id.className, /break-all/);
    return id.parentNode.parentNode;
  });
  assert.notEqual(cards[0], cards[1]);
  for (const card of cards) assert.match(card.textContent, /테스트 구장/);
  await click(cards[1].querySelectorAll("button").find(node => node.textContent === "확인 거절"));
  await click(cards[0].querySelectorAll("button").find(node => node.textContent === "함께 경기한 기록 확인"));
  assert.deepEqual(env.calls.map(c => [c.confirmationId, c.response]), [[CONFIRM_B, "decline"], [CONFIRM_A, "confirm"]]);
});
