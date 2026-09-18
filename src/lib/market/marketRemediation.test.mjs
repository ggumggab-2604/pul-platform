import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";
import { recoverMarketUpload } from "./marketUploadRecovery.ts";

for (const kind of ["listing", "startup"]) {
  test(`${kind}: response loss + temporary finalize failure preserves one intent/object`, async () => {
    const intents = new Map();
    let creates = 0,
      uploads = 0,
      finalizes = 0,
      cleanups = 0,
      state = "pending_upload";
    const actions = {
      state: async () => state,
      cleanup: async () => {
        cleanups++;
        return true;
      },
      create: async () => {
        creates++;
        return {
          mediaId: "same",
          path: "same/path",
          bucket: kind,
          token: "test",
          mimeType: "image/png",
        };
      },
      upload: async () => {
        uploads++;
        throw Error("accepted bytes, lost response");
      },
      finalize: async () => {
        finalizes++;
        if (finalizes === 1) throw Error("temporary server unavailable");
        state = "available";
      },
    };
    await assert.rejects(recoverMarketUpload(intents, "file", actions));
    assert.equal(state, "pending_upload");
    assert.equal(intents.get("file").mediaId, "same");
    await recoverMarketUpload(intents, "file", actions);
    assert.deepEqual(
      { creates, uploads, finalizes, cleanups, state },
      { creates: 1, uploads: 1, finalizes: 2, cleanups: 0, state: "available" },
    );
  });
  test(`${kind}: terminal intent is replaced only after confirmed cleanup`, async () => {
    const intents = new Map([["file", { mediaId: "old", attempted: true }]]);
    let creates = 0,
      clean = false;
    const actions = {
      state: async () => "failed",
      cleanup: async () => clean,
      create: async () => {
        creates++;
        return { mediaId: "new" };
      },
      upload: async () => {},
      finalize: async () => {},
    };
    await assert.rejects(recoverMarketUpload(intents, "file", actions));
    assert.equal(creates, 0);
    assert.equal(intents.get("file").mediaId, "old");
    clean = true;
    await recoverMarketUpload(intents, "file", actions);
    assert.equal(creates, 1);
  });
}

const source = readFileSync(
  new URL("../../components/market/MarketPageContent.tsx", import.meta.url),
  "utf8",
);
const ast = ts.createSourceFile(
  "MarketPageContent.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
function expression(name) {
  let found;
  function walk(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name)
      found = node.initializer.getText(ast);
    ts.forEachChild(node, walk);
  }
  walk(ast);
  assert.ok(found);
  return (
    ts.transpileModule(`const action=${found}`, {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.CommonJS,
      },
    }).outputText + "\nreturn action;"
  );
}
test("actual confirmation opener creates one request ID per new confirmation/cancel cycle", () => {
  let current;
  const open = new Function(
    "updateConfirmation",
    expression("setConfirmation"),
  )((value) => (current = value));
  open({ kind: "buy", item: { id: "a" }, operation: "delete" });
  const first = current.requestId;
  assert.ok(first);
  open();
  assert.equal(current, undefined);
  open({ kind: "buy", item: { id: "a" }, operation: "close" });
  assert.notEqual(current.requestId, first);
});
for (const kind of ["listing", "buy", "startup"])
  test(`actual ${kind} confirm retries the same committed request and recovers success`, async () => {
    const requests = [];
    let applied = false,
      cleared = 0;
    const mutation = async (args) => {
      requests.push(args.requestId);
      if (!applied) {
        applied = true;
        throw Error("response lost");
      }
      return { replayed: true, cleanupPending: false };
    };
    const names = [
      "confirmation",
      "mutationBusy",
      "setBusy",
      "setError",
      "identity",
      "mutateMarketListingAction",
      "mutateBuyRequestV2Action",
      "mutateStartupV2Action",
      "setConfirmation",
      "clearDetails",
      "refresh",
      "setMessage",
      "restore",
      "safeError",
    ];
    const confirmation = {
      kind,
      item: { id: "item", postKey: "a".repeat(24), version: 1 },
      operation: kind === "startup" ? "remove" : "delete",
      requestId: crypto.randomUUID(),
    };
    const fn = new Function(...names, expression("confirm"))(
      confirmation,
      { current: false },
      () => {},
      () => {},
      { current: "owner" },
      mutation,
      mutation,
      mutation,
      () => cleared++,
      () => {},
      async () => true,
      () => {},
      () => {},
      String,
    );
    await fn();
    assert.equal(cleared, 0);
    await fn();
    assert.equal(cleared, 1);
    assert.deepEqual(requests, [
      confirmation.requestId,
      confirmation.requestId,
    ]);
  });

test("startup client DTO uses guarded same-origin media route, never a public Storage URL", () => {
  const adapter = readFileSync(
    new URL("./marketPhaseOne.ts", import.meta.url),
    "utf8",
  );
  assert.ok(adapter.includes("/market/startup-media/"));
  assert.ok(!adapter.includes("getPublicUrl"));
  const page = readFileSync(
    new URL("../../app/market/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    page,
    /sale \|\| buy \|\| startup\s*\? loadActivePromotionsForSlots/,
  );
  assert.doesNotMatch(
    page,
    /home \|\| sale \|\| buy \|\| startup\s*\? loadActivePromotionsForSlots/,
  );
});
