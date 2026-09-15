// Existing HOF minimal DOM, reused for application operator interaction tests.
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
    if (name === "value") this.value = normalized;
  }

  get options() {
    return this.querySelectorAll("option");
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



export { installDom };
