import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import ts from "typescript";
import { createClient } from "@supabase/supabase-js";
import { recoverMarketUpload } from "./marketUploadRecovery.ts";
import { redact } from "./marketTestEnvironment.mjs";
const require = createRequire(import.meta.url);
const image = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aU1sAAAAASUVORK5CYII=",
  "base64",
);
const options = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
};

export function registerMarketRemediationTests(h) {
  const {
    sql,
    ok,
    json,
    actor,
    anon,
    service,
    literal,
    owner,
    other,
    inactive,
    admin,
    withdrawn,
    startupPayload,
    buyPayload,
  } = h;
  const make = (payload = startupPayload) =>
    json(
      actor(
        owner,
        `select public.mutate_market_startup_post_v2('create',null,null,${literal(payload)},'${randomUUID()}');`,
      ),
    ).post_key;
  const intent = (key) =>
    json(
      actor(
        owner,
        `select public.create_market_startup_media_upload_intent('${key}','image/png',64);`,
      ),
    ).media_id;
  const final = (id) =>
    service(
      `select public.finalize_market_startup_media_upload_server('${owner}','${id}','image/png',64);`,
    );
  const alternate = {
    ...startupPayload,
    category: "screenStartup",
    consultation_type: "startupInquiry",
    resale_details: null,
    public_contact_method: null,
    public_contact_value: null,
    public_contact_consent: false,
  };
  test("R02: CHECK + shared media guard prevent legacy/v2 category bypass; plain five categories survive", () => {
    for (const state of ["pending_upload", "available"]) {
      const key = make(),
        media = intent(key);
      if (state === "available") ok(final(media));
      for (const versioned of [false, true])
        assert.notEqual(
          actor(
            owner,
            `select public.mutate_market_startup_post${versioned ? "_v2" : ""}('update','${key}',1,${literal(alternate)}${versioned ? ",'" + randomUUID() + "'" : ""});`,
          ).status,
          0,
        );
      assert.equal(
        json(
          actor(owner, `select public.get_market_startup_post_v2('${key}');`),
        ).post.category,
        "screenResale",
      );
    }
    const extrasOnly = make();
    assert.notEqual(
      actor(
        owner,
        `select public.mutate_market_startup_post('update','${extrasOnly}',1,${literal(alternate)});`,
      ).status,
      0,
    );
    const plain = make({
      ...startupPayload,
      consultation_type: "resaleInquiry",
      resale_details: null,
      public_contact_method: null,
      public_contact_value: null,
      public_contact_consent: false,
    });
    ok(
      actor(
        owner,
        `select public.mutate_market_startup_post('update','${plain}',1,${literal(alternate)});`,
      ),
    );
    // Category/consultation pairs are read from the official contract, not invented.
    for (const [category, consultation] of [
      ["screenStartup", "startupInquiry"],
      ["screenResale", "resaleInquiry"],
      ["fieldCourseDevelopment", "courseDevelopment"],
      ["idleLandUse", "idleLandUse"],
      ["constructionFacility", "facilityConsulting"],
    ]) {
      const result = actor(
        owner,
        `select public.mutate_market_startup_post('create',null,null,${literal({ ...alternate, category, consultation_type: consultation })});`,
      );
      const created = json(result);
      assert.equal(created.version, 1);
      assert.equal(
        json(
          actor(
            owner,
            `select public.mutate_market_startup_post('update','${created.post_key}',1,${literal({ ...alternate, category, consultation_type: consultation, title: "TEST legacy category edit" })});`,
          ),
        ).version,
        2,
      );
    }
  });

  function connection(input, onData) {
    return new Promise((resolve, reject) => {
      const child = spawn(
        "docker",
        [
          "exec",
          "-i",
          h.environment().container,
          "psql",
          "-U",
          "postgres",
          "-d",
          "postgres",
          "-X",
          "-q",
          "-t",
          "-A",
          "-v",
          "ON_ERROR_STOP=1",
          "-v",
          "VERBOSITY=verbose",
        ],
        { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] },
      );
      let stdout = "",
        stderr = "";
      const timer = setTimeout(() => child.kill(), 15000);
      child.stdout.on("data", (b) => {
        stdout += b;
        onData?.(stdout);
      });
      child.stderr.on("data", (b) => (stderr += b));
      child.on("error", reject);
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code, stdout, stderr });
      });
      child.stdin.end(input);
    });
  }
  test("R03: two PostgreSQL connections, both remove/finalize timings repeated, zero 40P01", async () => {
    for (const firstOperation of ["remove", "finalize"])
      for (let iteration = 0; iteration < 5; iteration++) {
        const key = make(),
          media = intent(key),
          remove = `set request.jwt.claim.sub='${owner}';set role authenticated;select public.mutate_market_startup_post_v2('remove','${key}',1,'{}','${randomUUID()}');`;
        const finalize = `set role service_role;select public.finalize_market_startup_media_upload_server('${owner}','${media}','image/png',64);`;
        let second;
        const begin =
          "set statement_timeout='8s';set deadlock_timeout='100ms';begin;";
        const first =
          firstOperation === "remove"
            ? `select id from public.user_accounts where id='${owner}' for share;select id from public.market_startup_posts where post_key='${key}' for update;select 'LOCKED';select pg_sleep(0.25);${remove}`
            : `${finalize}select 'LOCKED';select pg_sleep(0.25);`;
        const a = await connection(begin + first + "commit;", (out) => {
          if (!second && out.includes("LOCKED"))
            second = connection(
              begin +
                (firstOperation === "remove" ? finalize : remove) +
                "commit;",
            );
        });
        assert.ok(second);
        const b = await second;
        assert.ok(!/40P01|deadlock detected/.test(a.stderr + b.stderr));
        assert.equal(a.code, 0, redact(a.stderr));
        if (firstOperation === "finalize")
          assert.equal(b.code, 0, redact(b.stderr));
        else assert.match(b.stderr, /권한|상태/);
      }
  });

  test("R05: sale/buy/startup delete response-loss replay uses original paths and request result", () => {
    const salePayload = {
      title: "TEST retry sale",
      category: "club",
      price: 1000,
      region: "서울",
      condition: "lightUse",
      trade_type: "direct",
      description: "TEST confirmation response loss.",
      public_contact_method: "external_url",
      public_contact_value: "https://example.invalid/local-contact",
      public_contact_consent: true,
    };
    const sale = json(
      actor(
        owner,
        `select public.mutate_market_listing('create',null,null,${literal(salePayload)},'${randomUUID()}');`,
      ),
    ).listing_id;
    const buy = json(
      actor(
        owner,
        `select public.mutate_market_buy_request_v2('create',null,null,${literal(buyPayload)},'${randomUUID()}');`,
      ),
    ).buy_request_id;
    const key = make();
    intent(key);
    for (const [fn, op, id] of [
      ["mutate_market_listing", "delete", sale],
      ["mutate_market_buy_request_v2", "delete", buy],
      ["mutate_market_startup_post_v2", "remove", key],
    ]) {
      const request = randomUUID(),
        call = `select public.${fn}('${op}','${id}',1,'{}','${request}');`;
      const first = json(actor(owner, call)),
        retry = json(actor(owner, call));
      assert.equal(retry.replayed, true);
      assert.deepEqual(
        { ...retry, replayed: false },
        { ...first, replayed: false },
      );
    }
  });

  test("Security regression: sale/buy/startup IDOR, contact anon/inactive/withdrawn, seeded admin permission", () => {
    const key = make(),
      buy = json(
        actor(
          owner,
          `select public.mutate_market_buy_request_v2('create',null,null,${literal(buyPayload)},'${randomUUID()}');`,
        ),
      ).buy_request_id;
    const salePayload = {
      title: "TEST permission sale",
      category: "club",
      price: 1000,
      region: "서울",
      condition: "lightUse",
      trade_type: "direct",
      description: "TEST IDOR and contact visibility.",
      public_contact_method: "external_url",
      public_contact_value: "https://example.invalid/local-contact",
      public_contact_consent: true,
    };
    const sale = json(
      actor(
        owner,
        `select public.mutate_market_listing('create',null,null,${literal(salePayload)},'${randomUUID()}');`,
      ),
    ).listing_id;
    for (const [fn, ops, id, payload] of [
      [
        "mutate_market_listing",
        ["update", "reserve", "sell", "delete"],
        sale,
        salePayload,
      ],
      [
        "mutate_market_buy_request_v2",
        ["update", "close", "delete"],
        buy,
        buyPayload,
      ],
      [
        "mutate_market_startup_post_v2",
        ["update", "close", "remove"],
        key,
        startupPayload,
      ],
    ]) {
      for (const op of ops)
        assert.notEqual(
          actor(
            other,
            `select public.${fn}('${op}','${id}',1,${literal(payload)},'${randomUUID()}');`,
          ).status,
          0,
        );
    }
    for (const [fn, id] of [
      ["get_market_listing", sale],
      ["get_market_buy_request_v2", buy],
      ["get_market_startup_post_v2", key],
    ]) {
      const call = `select public.${fn}('${id}');`;
      for (const value of [
        anon(call),
        actor(inactive, call),
        actor(withdrawn, call),
      ])
        assert.equal(json(value).public_contact_value, null);
      assert.equal(
        json(actor(other, call)).public_contact_method,
        "external_url",
      );
    }
    assert.notEqual(
      actor(
        other,
        `select public.create_market_media_upload_intent('${sale}','image/png',64);`,
      ).status,
      0,
    );
    assert.notEqual(
      actor(
        other,
        `select public.create_market_startup_media_upload_intent('${key}','image/png',64);`,
      ).status,
      0,
    );
    const media = intent(key);
    ok(final(media));
    assert.equal(
      ok(
        service(
          `select public.get_market_startup_media_cleanup_path_server('${owner}','${media}');`,
        ),
      ),
      "",
    );
    assert.notEqual(
      service(
        `select public.get_market_startup_media_cleanup_path_server('${other}','${media}');`,
      ).status,
      0,
    );
    assert.notEqual(
      actor(owner, `select public.reconcile_market_startup_media_server(20);`)
        .status,
      0,
    );
    for (const who of [owner, inactive, withdrawn])
      assert.notEqual(
        actor(
          who,
          "select public.list_market_repair_shop_inquiries_for_management(null,24,0);",
        ).status,
        0,
      );
    ok(
      actor(
        admin,
        "select public.list_market_repair_shop_inquiries_for_management(null,24,0);",
      ),
    );
    ok(
      actor(
        admin,
        "select public.list_market_listing_reports_for_management('all',24,0);",
      ),
    );
    assert.equal(
      ok(
        sql(
          "select count(*) from private.market_audit_log where before_data::text like '%example.invalid/local-contact%' or after_data::text like '%example.invalid/local-contact%';",
        ),
      ),
      "0",
    );
    assert.equal(
      ok(
        sql(
          "select count(*) from private.market_mutation_requests where result_data::text like '%example.invalid/local-contact%';",
        ),
      ),
      "0",
    );
  });

  test("R01/R04 actual Storage: private visibility, byte validation, stale token cleanup, same-intent recovery and TTL", async () => {
    const config = await h.environment().config();
    const previous = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = config.SERVICE_ROLE_KEY;
    const adminClient = createClient(
      config.API_URL,
      config.SERVICE_ROLE_KEY,
      options,
    );
    const anonymous = createClient(config.API_URL, config.ANON_KEY, options);
    const email = `local-remediation-${randomUUID()}@example.invalid`,
      password = randomUUID() + randomUUID();
    const made = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    assert.ok(!made.error);
    const userId = made.data.user.id;
    ok(
      sql(
        `update public.user_accounts set account_status='active' where id='${userId}'; notify pgrst,'reload schema';`,
      ),
    );
    const client = createClient(config.API_URL, config.ANON_KEY, options);
    assert.ok(
      !(await client.auth.signInWithPassword({ email, password })).error,
    );
    function load(startup) {
      const exports = {};
      const code = ts.transpileModule(
        readFileSync(
          new URL(
            startup ? "./marketStartupStorage.ts" : "./marketStorage.ts",
            import.meta.url,
          ),
          "utf8",
        ),
        {
          compilerOptions: {
            module: ts.ModuleKind.CommonJS,
            target: ts.ScriptTarget.ES2022,
          },
        },
      ).outputText;
      new Function("require", "exports", code)((name) => {
        if (name === "server-only") return {};
        if (name === "@supabase/supabase-js") return { createClient };
        if (name === "@/lib/supabase/env")
          return { getSupabasePublicEnv: () => ({ url: config.API_URL }) };
        if (name === "@/lib/supabase/auth")
          return {
            getAuthenticatedSupabaseContext: async () => ({
              userId,
              supabase: client,
            }),
          };
        if (name === "@/lib/clubs/clubMediaValidation")
          return require("../clubs/clubMediaValidation.ts");
        throw Error("Unexpected import");
      }, exports);
      return exports;
    }
    const server = load(true),
      saleServer = load(false),
      paths = [];
    async function post() {
      const result = await client.rpc("mutate_market_startup_post_v2", {
        p_operation: "create",
        p_post_key: null,
        p_expected_version: null,
        p_payload: startupPayload,
        p_request_id: randomUUID(),
      });
      assert.ok(!result.error, result.error?.message);
      return result.data.post_key;
    }
    const args = (key) => ({
      postKey: key,
      declaredMimeType: "image/png",
      declaredByteSize: image.length,
      originalFilename: "local.png",
    });
    async function upload(intent, bytes = image) {
      paths.push([intent.bucket, intent.path]);
      const result = await client.storage
        .from(intent.bucket)
        .uploadToSignedUrl(intent.path, intent.token, bytes, {
          contentType: "image/png",
          cacheControl: "0",
        });
      assert.ok(!result.error, result.error?.message);
    }
    async function status(url) {
      const result = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      await result.arrayBuffer();
      return result.status;
    }
    const publicStatus = (intent) =>
      status(
        anonymous.storage.from(intent.bucket).getPublicUrl(intent.path).data
          .publicUrl,
      );
    const exists = async (intent) =>
      !(await adminClient.storage.from(intent.bucket).download(intent.path))
        .error;
    async function remove(key, request = randomUUID()) {
      const result = await client.rpc("mutate_market_startup_post_v2", {
        p_operation: "remove",
        p_post_key: key,
        p_expected_version: 1,
        p_payload: {},
        p_request_id: request,
      });
      assert.ok(!result.error, result.error?.message);
      assert.equal(
        await server.removeStartupStoragePaths(
          result.data.removed_storage_paths,
        ),
        true,
      );
      return result.data;
    }
    try {
      assert.equal(
        ok(
          sql(
            "select public from storage.buckets where id='market-startup-media';",
          ),
        ),
        "f",
      );
      const key = await post(),
        pending = await server.createStartupMediaUploadIntent(args(key));
      await upload(pending);
      assert.notEqual(await publicStatus(pending), 200);
      assert.equal(
        await server.createStartupMediaReadUrl(key, pending.mediaId),
        null,
      );
      assert.ok(
        (await client.storage.from(pending.bucket).download(pending.path))
          .error,
      );
      await server.finalizeStartupMediaUpload(pending.mediaId);
      const signed = await server.createStartupMediaReadUrl(
        key,
        pending.mediaId,
      );
      assert.ok(signed);
      assert.equal(await status(signed), 200);
      const issuedAt = Date.now();
      const hidden = await post(),
        hiddenIntent = await server.createStartupMediaUploadIntent(
          args(hidden),
        );
      await upload(hiddenIntent);
      await server.finalizeStartupMediaUpload(hiddenIntent.mediaId);
      ok(
        sql(
          `update public.market_startup_posts set publication_status='hidden' where post_key='${hidden}';`,
        ),
      );
      assert.equal(
        await server.getStartupMediaState(hiddenIntent.mediaId),
        "removed",
      );
      assert.equal(
        await server.createStartupMediaReadUrl(hidden, hiddenIntent.mediaId),
        null,
      );
      assert.equal(
        (await server.reconcileStartupMedia(100)).cleanupPending,
        false,
      );
      assert.equal(await exists(hiddenIntent), false);
      const removed = await post(),
        late = await server.createStartupMediaUploadIntent(args(removed));
      await remove(removed);
      await upload(late);
      assert.notEqual(await publicStatus(late), 200);
      await assert.rejects(server.finalizeStartupMediaUpload(late.mediaId));
      assert.equal(await exists(late), false);
      assert.equal(
        await server.createStartupMediaReadUrl(removed, late.mediaId),
        null,
      );
      // Token can recreate the object again: the repeatable reconciler removes it.
      await upload(late);
      assert.equal(await exists(late), true);
      await server.reconcileStartupMedia(100);
      assert.equal(await exists(late), false);
      const invalidKey = await post(),
        invalid = await server.createStartupMediaUploadIntent(args(invalidKey));
      await upload(invalid, Buffer.alloc(image.length));
      await assert.rejects(server.finalizeStartupMediaUpload(invalid.mediaId));
      assert.equal(
        await server.getStartupMediaState(invalid.mediaId),
        "failed",
      );
      assert.equal(await exists(invalid), false);
      const absentKey = await post(),
        absent = await server.createStartupMediaUploadIntent(args(absentKey));
      await assert.rejects(server.finalizeStartupMediaUpload(absent.mediaId));
      assert.equal(await server.getStartupMediaState(absent.mediaId), "failed");
      assert.equal(await server.cleanupStartupMediaUpload(absent.mediaId), true);
      const expiredKey = await post(),
        expired = await server.createStartupMediaUploadIntent(args(expiredKey));
      await upload(expired);
      ok(
        sql(
          `update public.market_startup_media set created_at=now()-interval '3 hours' where id='${expired.mediaId}';`,
        ),
      );
      await server.reconcileStartupMedia(100);
      assert.equal(
        await server.getStartupMediaState(expired.mediaId),
        "failed",
      );
      assert.equal(await exists(expired), false);
      for (const startup of [false, true]) {
        let entity;
        if (startup) entity = await post();
        else {
          const result = await client.rpc("mutate_market_listing", {
            p_operation: "create",
            p_listing_id: null,
            p_expected_version: null,
            p_payload: {
              title: "TEST real upload recovery",
              category: "club",
              price: 1000,
              region: "서울",
              condition: "lightUse",
              trade_type: "direct",
              description: "TEST same-intent Storage recovery.",
              public_contact_method: "external_url",
              public_contact_value: "https://example.invalid/local-contact",
              public_contact_consent: true,
            },
            p_request_id: randomUUID(),
          });
          assert.ok(!result.error, result.error?.message);
          entity = result.data.listing_id;
        }
        const api = startup ? server : saleServer,
          name = startup ? "Startup" : "Market";
        let creates = 0,
          uploads = 0,
          finalizes = 0;
        const map = new Map();
        const actions = {
          state: (id) => api[`get${name}MediaState`](id),
          cleanup: (id) => api[`cleanup${name}MediaUpload`](id),
          create: async () => {
            creates++;
            return api[`create${name}MediaUploadIntent`]({
              ...args(entity),
              [startup ? "postKey" : "listingId"]: entity,
            });
          },
          upload: async (intent) => {
            uploads++;
            await upload(intent);
            throw Error(
              "simulated response loss after real Storage accepted bytes",
            );
          },
          finalize: async (id) => {
            if (++finalizes === 1)
              throw Error("temporary finalize service failure");
            return api[`finalize${name}MediaUpload`](id);
          },
        };
        await assert.rejects(recoverMarketUpload(map, "same-file", actions));
        const firstId = map.get("same-file").mediaId;
        await recoverMarketUpload(map, "same-file", actions);
        assert.equal(map.get("same-file").mediaId, firstId);
        assert.deepEqual([creates, uploads, finalizes], [1, 1, 2]);
        assert.equal(await api[`get${name}MediaState`](firstId), "available");
        const table = startup ? "market_startup_media" : "market_listing_media",
          foreign = startup ? "post_id" : "listing_id";
        const entitySQL = startup
          ? `(select id from public.market_startup_posts where post_key='${entity}')`
          : `'${entity}'::uuid`;
        assert.equal(
          ok(
            sql(
              `select count(*) from public.${table} where ${foreign}=${entitySQL};`,
            ),
          ),
          "1",
        );
        assert.equal(
          ok(
            sql(
              `select count(*) from storage.objects where bucket_id='${map.get("same-file").bucket}' and name='${map.get("same-file").path}';`,
            ),
          ),
          "1",
        );
      }
      const remaining =
        server.STARTUP_MEDIA_READ_TTL_SECONDS * 1000 +
        2000 -
        (Date.now() - issuedAt);
      if (remaining > 0) {
        console.log(
          "Real signed-read expiry check: waiting within the 60-second TTL.",
        );
        await new Promise((resolve) => setTimeout(resolve, remaining));
      }
      assert.notEqual(await status(signed), 200);
      const deleteRequest = randomUUID();
      const deleted = await remove(key, deleteRequest);
      const replay = await remove(key, deleteRequest);
      assert.equal(replay.replayed, true);
      assert.deepEqual(replay.removed_storage_paths, deleted.removed_storage_paths);
      assert.equal(await exists(pending), false);
      assert.equal(
        await server.createStartupMediaReadUrl(key, pending.mediaId),
        null,
      );
    } finally {
      for (const [bucket, path] of paths)
        await adminClient.storage.from(bucket).remove([path]);
      await client.auth.signOut();
      if (previous === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
      else process.env.SUPABASE_SERVICE_ROLE_KEY = previous;
    }
  });
}
