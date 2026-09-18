// Local integration support: never attaches to/reset/dumps an existing project.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const OFFICIAL_SHA = "73b895f1ebaee1d39bef53f7766af76e222b0f94";
const root = fileURLToPath(new URL("../../../", import.meta.url));
export const redact = (value) =>
  String(value)
    .replace(/eyJ[A-Za-z0-9_.-]+/g, "[LOCAL_TOKEN]")
    .replace(/(?:sb_secret_|sb_publishable_)[A-Za-z0-9_-]+/g, "[LOCAL_KEY]")
    .replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[LOCAL_DB_URL]");
const run = (cmd, args, input) =>
  spawnSync(cmd, args, {
    cwd: root,
    input,
    encoding: "utf8",
    timeout: 45000,
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
const checked = (r) => {
  assert.equal(r.status, 0, redact(r.error?.code || r.stderr));
  return r.stdout.trim();
};
const docker = (args, input) => run("docker", args, input);

export async function startMarketTestEnvironment({
  port = Number(process.env.PUL_MARKET_TEST_PORT ?? 55421),
  candidate = true,
} = {}) {
  assert.ok(Number.isInteger(port) && port >= 1025 && port <= 65530);
  assert.equal(typeof candidate, "boolean");
  checked(docker(["version", "--format", "{{.Server.Version}}"])); // Failure is NOT RUN, never skip/pass.
  const project = `pul-market-test-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const network = project + "-local";
  const workdir = mkdtempSync(join(tmpdir(), "pul-market-test-"));
  const configDir = join(workdir, "supabase");
  mkdirSync(join(configDir, "migrations"), { recursive: true });
  const files = checked(
    run("git", [
      "ls-tree",
      "-r",
      "--name-only",
      OFFICIAL_SHA,
      "--",
      "supabase/migrations",
    ]),
  )
    .split(/\r?\n/)
    .filter((f) => f.endsWith(".sql"));
  assert.equal(files.length, 87);
  assert.match(files.at(-1), /20261002000100_/);
  for (const file of files) {
    assert.match(file, /^supabase\/migrations\/\d{14}_[a-z0-9_]+\.sql$/);
    const migration = run("git", ["show", `${OFFICIAL_SHA}:${file}`]);
    checked(migration);
    writeFileSync(join(workdir, file), migration.stdout);
  }
  writeFileSync(
    join(configDir, "config.toml"),
    `project_id = "${project}"
[api]
enabled = true
port = ${port}
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
[db]
port = ${port + 1}
shadow_port = ${port - 1}
major_version = 17
[db.migrations]
enabled = true
[db.seed]
enabled = false
[studio]
enabled = false
[local_smtp]
enabled = true
port = ${port + 3}
[auth]
enabled = true
site_url = "http://localhost:3300"
additional_redirect_urls = ["http://localhost:3300/**"]
[auth.email]
enable_signup = true
enable_confirmations = false
[analytics]
enabled = false
[edge_runtime]
enabled = false
[storage]
enabled = true
file_size_limit = "8MiB"
`,
  );
  const cli = async (args) => {
    const command = `npx --offline --yes --package supabase@2.117.0 supabase ${args} --workdir .`;
    return await new Promise((resolve, reject) => {
      const childEnv = { ...process.env };
      delete childEnv.NODE_TEST_CONTEXT;
      const p = spawn(
        process.env.ComSpec || "cmd.exe",
        ["/d", "/s", "/c", command],
        {
          cwd: workdir,
          env: childEnv,
          windowsHide: true,
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      let out = "",
        err = "";
      p.stdout.on("data", (b) => (out += b));
      p.stderr.on("data", (b) => (err += b));
      const tick = setInterval(
        () =>
          console.log(
            "Disposable official87 environment: operation in progress.",
          ),
        30000,
      );
      const timer = setTimeout(() => {
        spawnSync("taskkill", ["/PID", String(p.pid), "/T", "/F"], {
          windowsHide: true,
          stdio: "ignore",
        });
      }, 600000);
      p.on("error", (e) => {
        clearInterval(tick);
        clearTimeout(timer);
        reject(Error(e.code));
      });
      p.on("close", (code) => {
        clearInterval(tick);
        clearTimeout(timer);
        if (code === 0) resolve(out);
        else
          reject(
            Error(`Local CLI exit ${code}: ` + redact(err || out).slice(-5000)),
          );
      });
    });
  };
  const container = "supabase_db_" + project;
  const sql = (text, user = "postgres") =>
    docker(
      [
        "exec",
        "-i",
        container,
        "psql",
        "-U",
        user,
        "-d",
        "postgres",
        "-X",
        "-q",
        "-t",
        "-A",
        "-v",
        "ON_ERROR_STOP=1",
      ],
      text,
    );
  const stop = async () => {
    assert.match(project, /^pul-market-test-\d+-[0-9a-f]{8}$/);
    assert.equal(
      JSON.parse(
        JSON.stringify(readFileSync(join(configDir, "config.toml"), "utf8")),
      ).includes(`project_id = "${project}"`),
      true,
    );
    const existing = checked(docker(["ps", "-a", "--format", "{{.Names}}"]))
      .split(/\r?\n/)
      .filter((n) => n.endsWith("_" + project));
    if (existing.length) await cli(`stop --project-id ${project} --no-backup`);
    const members = docker([
      "network",
      "inspect",
      network,
      "--format",
      "{{len .Containers}}",
    ]);
    if (members.status === 0) {
      assert.equal(members.stdout.trim(), "0");
      checked(docker(["network", "rm", network]));
    }
    const containers = checked(docker(["ps", "-a", "--format", "{{.Names}}"]))
      .split(/\r?\n/)
      .filter((n) => n.endsWith("_" + project));
    const volumes = checked(docker(["volume", "ls", "--format", "{{.Name}}"]))
      .split(/\r?\n/)
      .filter((n) => n.endsWith("_" + project));
    assert.equal(containers.length, 0);
    assert.equal(volumes.length, 0);
    console.log("Exact disposable resources cleaned: " + project);
  };
  checked(
    docker([
      "network",
      "create",
      "--label",
      "pul.test=market-remediation",
      "-o",
      "com.docker.network.bridge.host_binding_ipv4=127.0.0.1",
      network,
    ]),
  );
  console.log("Created exact disposable project: " + project);
  try {
    await cli(
      `start --network-id ${network} --exclude studio,postgres-meta,edge-runtime,logflare,vector,supavisor,realtime,imgproxy`,
    );
    assert.equal(
      checked(
        sql("select count(*) from supabase_migrations.schema_migrations;"),
      ),
      "87",
    );
    assert.equal(
      checked(
        sql("select max(version) from supabase_migrations.schema_migrations;"),
      ),
      "20261002000100",
    );
    assert.equal(
      checked(sql("select count(*) from public.user_accounts;")),
      "0",
    );
    assert.ok(
      Number(
        checked(sql("select count(*) from public.platform_role_permissions;")),
      ) > 0,
    );
    assert.equal(checked(sql("select count(*) from public.platform_role_permissions where platform_role='platform_admin' and permission_code='market.repair_shop_inquiries.manage';")), "1");
    if (candidate) checked(
      sql(
        readFileSync(
          resolve(
            root,
            "supabase/migrations/20261003000100_pul_market_beta_phase_one.sql",
          ),
          "utf8",
        ),
      ),
    );
    console.log(
      candidate
        ? "Fresh official 87 + corrected candidate applied; migration INSERT seeds preserved."
        : "Fresh official 87 only; candidate intentionally absent for legacy compatibility control.",
    );
    return {
      project,
      container,
      workdir,
      sql,
      stop,
      async config() {
        const env = JSON.parse(await cli("status -o json"));
        const url = new URL(env.API_URL);
        assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
        assert.equal(url.port, String(port));
        return env; // Credentials remain in memory; never log or persist this object.
      },
    };
  } catch (error) {
    await stop().catch(() =>
      console.error("Disposable cleanup needs attention: " + project),
    );
    throw error;
  }
}
