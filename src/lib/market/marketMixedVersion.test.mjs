import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";
import { OFFICIAL_SHA, redact, startMarketTestEnvironment } from "./marketTestEnvironment.mjs";
import { recoverMarketUpload } from "./marketUploadRecovery.ts";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../../../", import.meta.url));
const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU1sAAAAASUVORK5CYII=", "base64");
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const payload = {
  title: "TEST RA01 mixed version", category: "club", price: 1000, region: "서울",
  condition: "lightUse", trade_type: "direct", description: "TEST isolated mixed-version Storage regression.",
  public_contact_method: "external_url", public_contact_value: "https://example.invalid/ra01",
  public_contact_consent: true,
};

test("RA01: official app + official87 / corrected DB, and candidate app replay with real Storage", async (t) => {
  const legacySource = execFileSync("git", ["show", `${OFFICIAL_SHA}:src/lib/market/marketStorage.ts`], {
    cwd: root, encoding: "utf8", windowsHide: true,
  });
  const candidateSource = readFileSync(new URL("./marketStorage.ts", import.meta.url), "utf8");
  let officialContract;
  // A uses a separate pristine 87-only project. B/C fixtures are created only
  // after all 87 migrations and the candidate have been applied in a new project.
  for (const candidate of [false, true]) {
    const environment = await startMarketTestEnvironment({ port: 55441, candidate });
    const previousKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    let client, admin;
    const paths = [];
    const sql = (query) => {
      const result = environment.sql(query);
      assert.equal(result.status, 0, redact(result.stderr));
      return result.stdout.trim();
    };
    try {
      const config = await environment.config();
      process.env.SUPABASE_SERVICE_ROLE_KEY = config.SERVICE_ROLE_KEY;
      admin = createClient(config.API_URL, config.SERVICE_ROLE_KEY, options);
      client = createClient(config.API_URL, config.ANON_KEY, options);
      const anonymous = createClient(config.API_URL, config.ANON_KEY, options);
      const email = `ra01-${randomUUID()}@example.invalid`, password = randomUUID() + randomUUID();
      const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      assert.ok(!made.error, made.error?.message);
      const userId = made.data.user.id;
      sql(`update public.user_accounts set account_status='active' where id='${userId}'; notify pgrst,'reload schema';`);
      assert.ok(!(await client.auth.signInWithPassword({ email, password })).error);

      const contract = JSON.parse(sql(`select jsonb_build_object(
        'args',pg_get_function_arguments(p.oid),'result',pg_get_function_result(p.oid),
        'acl',p.proacl::text,'definer',p.prosecdef,'config',p.proconfig,'body',p.prosrc)
        from pg_proc p where p.oid='public.get_market_media_upload_context_server(uuid,uuid)'::regprocedure;`));
      contract.body = contract.body.replace(/\s+/g, " ").trim();
      if (candidate) assert.deepEqual(contract, officialContract);
      else officialContract = contract;

      const calls = { download: 0, remove: 0, rpc: [] };
      let rejectDownload = false, rejectState = false;
      const instrumented = {
        rpc: async (name, args) => {
          calls.rpc.push(name);
          if (rejectState && name === "get_market_media_state_server")
            return { data: null, error: { message: "injected transient state response failure" } };
          return admin.rpc(name, args);
        },
        storage: { from: (bucket) => {
          const real = admin.storage.from(bucket);
          return {
            createSignedUploadUrl: (...args) => real.createSignedUploadUrl(...args),
            download: async (...args) => {
              calls.download++;
              if (rejectDownload) return { data: null, error: { status: 503, message: "injected download 503" } };
              return real.download(...args);
            },
            remove: async (...args) => { calls.remove++; return real.remove(...args); },
          };
        } },
      };
      function load(source) {
        const exports = {};
        const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
        new Function("require", "exports", code)((name) => {
          if (name === "server-only") return {};
          if (name === "@supabase/supabase-js") return { createClient: () => instrumented };
          if (name === "@/lib/supabase/env") return { getSupabasePublicEnv: () => ({ url: config.API_URL }) };
          if (name === "@/lib/supabase/auth") return { getAuthenticatedSupabaseContext: async () => ({ userId, supabase: client }) };
          if (name === "@/lib/clubs/clubMediaValidation") return require("../clubs/clubMediaValidation.ts");
          throw Error("Unexpected server import");
        }, exports);
        return exports;
      }
      const oldApp = load(legacySource);
      const newApp = candidate ? load(candidateSource) : null;
      const listing = await client.rpc("mutate_market_listing", {
        p_operation: "create", p_listing_id: null, p_expected_version: null,
        p_payload: payload, p_request_id: randomUUID(),
      });
      assert.ok(!listing.error, listing.error?.message);
      const input = { listingId: listing.data.listing_id, declaredMimeType: "image/png", declaredByteSize: image.length, originalFilename: "synthetic.png" };
      const createIntent = async (app) => {
        const intent = await app.createMarketMediaUploadIntent(input);
        paths.push([intent.bucket, intent.path]);
        return intent;
      };
      const upload = async (intent) => {
        const result = await client.storage.from(intent.bucket).uploadToSignedUrl(intent.path, intent.token, image, { contentType: "image/png", cacheControl: "0" });
        assert.ok(!result.error, result.error?.message);
      };
      const exists = async (intent) => {
        const result = await admin.storage.from(intent.bucket).download(intent.path);
        assert.ok(!result.error, result.error?.message);
        assert.deepEqual(Buffer.from(await result.data.arrayBuffer()), image);
        assert.equal(sql(`select media_status from public.market_listing_media where id='${intent.mediaId}';`), "available");
      };
      const context = (mediaId) => admin.rpc("get_market_media_upload_context_server", { p_actor_user_id: userId, p_media_id: mediaId });
      const reset = () => { calls.download = 0; calls.remove = 0; calls.rpc.length = 0; };

      const intent = await createIntent(oldApp);
      const pending = await context(intent.mediaId);
      assert.ok(!pending.error, pending.error?.message);
      assert.equal(pending.data.length, 1);
      assert.deepEqual(Object.keys(pending.data[0]).sort(), ["media_id", "storage_bucket", "storage_path", "declared_mime_type", "declared_size_bytes", "media_version"].sort());
      await upload(intent);
      assert.equal((await oldApp.finalizeMarketMediaUpload(intent.mediaId)).status, "available");

      await t.test(`${candidate ? "B" : "A"}: old app + ${candidate ? "corrected candidate" : "official87"} rejects available context before download/remove`, async () => {
        assert.deepEqual((await context(intent.mediaId)).data, []);
        reset(); rejectDownload = true;
        await assert.rejects(oldApp.finalizeMarketMediaUpload(intent.mediaId), /MARKET_MEDIA_RESPONSE_INVALID/);
        assert.deepEqual(calls, { download: 0, remove: 0, rpc: ["get_market_media_upload_context_server"] });
        await exists(intent);
        console.log(`RA01 ${candidate ? "B" : "A"}: context denied; download=0 remove=0; real object preserved.`);
      });

      if (candidate) {
        await t.test("C: new app recovers available version without downloading, deleting or widening legacy context", async () => {
          reset();
          assert.deepEqual(await newApp.finalizeMarketMediaUpload(intent.mediaId), { mediaId: intent.mediaId, status: "available", version: 2 });
          assert.deepEqual(calls, { download: 0, remove: 0, rpc: ["get_market_media_state_server"] });
          const map = new Map([["same-file", { ...intent, attempted: true }]]);
          await recoverMarketUpload(map, "same-file", {
            state: newApp.getMarketMediaState,
            cleanup: async () => assert.fail("available cleanup"),
            create: async () => assert.fail("duplicate intent"),
            upload: async () => assert.fail("duplicate upload"),
            finalize: async () => assert.fail("already available"),
          });
          assert.equal(map.get("same-file").mediaId, intent.mediaId);
          assert.equal(calls.download, 0); assert.equal(calls.remove, 0);
          await exists(intent);
          console.log("RA01 C: available version recovered; download=0 remove=0; real object preserved.");
        });

        await t.test("candidate state ACL, ownership, account guards and ambiguity preserve available media", async () => {
          const args = { p_actor_user_id: userId, p_media_id: intent.mediaId };
          for (const rpc of ["get_market_media_state_server", "get_market_media_upload_context_server"])
            for (const denied of [anonymous, client]) assert.ok((await denied.rpc(rpc, args)).error);
          const acl = JSON.parse(sql(`select jsonb_build_object('anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service',has_function_privilege('service_role',p.oid,'EXECUTE'),'public',exists(select 1 from aclexplode(p.proacl) a where a.grantee=0 and a.privilege_type='EXECUTE'),'definer',p.prosecdef,'config',p.proconfig) from pg_proc p where p.oid='public.get_market_media_state_server(uuid,uuid)'::regprocedure;`));
          assert.deepEqual(acl, { anon: false, authenticated: false, service: true, public: false, definer: true, config: ['search_path=""'] });
          assert.deepEqual((await admin.rpc("get_market_media_state_server", { ...args, p_actor_user_id: randomUUID() })).data, []);
          assert.deepEqual((await admin.rpc("get_market_media_state_server", { ...args, p_media_id: randomUUID() })).data, []);
          for (const status of ["suspended", "withdrawn"]) {
            sql(`update public.user_accounts set account_status='${status}' where id='${userId}';`);
            assert.deepEqual((await admin.rpc("get_market_media_state_server", args)).data, []);
          }
          sql(`update public.user_accounts set account_status='active' where id='${userId}';`);
          rejectState = true; reset();
          await assert.rejects(newApp.finalizeMarketMediaUpload(intent.mediaId), /MARKET_MEDIA_STATE_UNAVAILABLE/);
          rejectState = false;
          assert.equal(calls.download, 0); assert.equal(calls.remove, 0);
          await exists(intent);
        });

        await t.test("new app pending upload finalizes; failed/removed stay terminal", async () => {
          rejectDownload = false; reset();
          const fresh = await createIntent(newApp);
          assert.equal((await context(fresh.mediaId)).data.length, 1);
          assert.equal(await newApp.getMarketMediaState(fresh.mediaId), "pending_upload");
          await upload(fresh);
          assert.equal((await newApp.finalizeMarketMediaUpload(fresh.mediaId)).status, "available");
          assert.equal(calls.download, 1); assert.equal(calls.remove, 0);
          assert.deepEqual((await context(fresh.mediaId)).data, []);
          await exists(fresh);
          for (const status of ["failed", "removed"]) {
            const terminal = await createIntent(newApp);
            sql(`update public.market_listing_media set media_status='${status}',removed_at=${status === "removed" ? "now()" : "null"},version=version+1 where id='${terminal.mediaId}';`);
            assert.equal(await newApp.getMarketMediaState(terminal.mediaId), status);
            reset();
            await assert.rejects(newApp.finalizeMarketMediaUpload(terminal.mediaId), /MARKET_MEDIA_UPLOAD_NOT_AUTHORIZED/);
            assert.equal(calls.download, 0);
            assert.equal(calls.rpc.includes("finalize_market_media_upload_server"), false);
          }
          await exists(intent); await exists(fresh);
        });
      }
    } finally {
      try {
        if (admin) for (const [bucket, path] of paths) {
          const removed = await admin.storage.from(bucket).remove([path]);
          assert.ok(!removed.error, removed.error?.message);
        }
        if (client) await client.auth.signOut();
      } finally {
        if (previousKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
        else process.env.SUPABASE_SERVICE_ROLE_KEY = previousKey;
        await environment.stop();
      }
    }
  }
});
