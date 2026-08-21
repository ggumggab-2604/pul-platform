import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const migrationDirectory = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url));
const migrationFiles = readdirSync(migrationDirectory)
  .filter((name) => /^\d{14}_.+\.sql$/.test(name))
  .sort();

function docker(args, input) {
  return spawnSync("docker", args, { encoding: "utf8", input, maxBuffer: 128 * 1024 * 1024 });
}

function sql(text, user = "supabase_admin") {
  return docker(["exec", "-i", container, "psql", "-U", user, "-d", database, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1"], text);
}

let container;
let database;
let baselineVersion;

before(() => {
  const containers = docker(["ps", "--filter", "name=supabase_db_", "--format", "{{.Names}}"] ).stdout.split(/\r?\n/).filter(Boolean);
  assert.equal(containers.length, 1, "one local Supabase database container is required");
  container = containers[0];
  database = `pul_club_full_forward_${process.pid}_${Date.now()}`;
  const clone = docker(["exec", container, "sh", "-lc", [
    `createdb -U supabase_admin -O postgres ${database}`,
    `pg_dump -U supabase_admin -d postgres --schema-only | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
    `pg_dump -U supabase_admin -d postgres --data-only --disable-triggers | psql -U supabase_admin -d ${database} -v ON_ERROR_STOP=1 -q`,
  ].join(" && ")]);
  assert.equal(clone.status, 0, clone.stdout + clone.stderr);

  const baseline = sql("select coalesce(max(version),'') from supabase_migrations.schema_migrations;");
  assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr);
  baselineVersion = baseline.stdout.trim();
  assert.match(baselineVersion, /^\d{14}$/);

  for (const filename of migrationFiles) {
    const version = filename.slice(0, 14);
    if (version <= baselineVersion) continue;
    const name = filename.slice(15, -4).replaceAll("'", "''");
    const migration = readFileSync(`${migrationDirectory}/${filename}`, "utf8");
    const applied = sql(`begin;\n${migration}\ninsert into supabase_migrations.schema_migrations(version,name) values ('${version}','${name}');\ncommit;`, "postgres");
    assert.equal(applied.status, 0, `${filename}\n${applied.stdout}\n${applied.stderr}`);
  }
});

after(() => {
  if (container && database) {
    assert.equal(docker(["exec", container, "dropdb", "--if-exists", "--force", "-U", "supabase_admin", database]).status, 0);
  }
});

test("all local migrations apply forward through the latest repository migration", () => {
  const history = sql("select count(*) || ':' || max(version) from supabase_migrations.schema_migrations;");
  assert.equal(history.status, 0, history.stdout + history.stderr);
  assert.equal(history.stdout.trim(), `${migrationFiles.length}:20260905000100`);
  assert.equal(baselineVersion <= "20260830000100", true);
});

test("effective catalog has the public columns, guarded RPCs, ACL, and no sample registration", () => {
  const catalog = sql(`select jsonb_build_object(
    'columns',(select count(*) from information_schema.columns where table_schema='public' and table_name='clubs' and column_name in ('region','district','summary')),
    'functions',(select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('list_public_clubs','get_public_club','register_club')),
    'anon_list',has_function_privilege('anon','public.list_public_clubs(text,text,text,text,integer,integer)','execute'),
    'anon_detail',has_function_privilege('anon','public.get_public_club(text)','execute'),
    'anon_register',has_function_privilege('anon','public.register_club(uuid,jsonb)','execute'),
    'auth_register',has_function_privilege('authenticated','public.register_club(uuid,jsonb)','execute'),
    'sample_rows',(select count(*) from public.clubs where legacy_key ~ '^[0-9a-f]{32}$'));
  `);
  const value = JSON.parse(catalog.stdout.trim());
  assert.deepEqual(value, { columns: 3, functions: 3, anon_list: true, anon_detail: true, anon_register: false, auth_register: true, sample_rows: 0 });
});
