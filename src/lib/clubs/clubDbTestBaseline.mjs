import assert from "node:assert/strict";
import { readdirSync } from "node:fs";

// Regression suites clone the current local schema, not a historical snapshot.
// Never replay an old CREATE/ALTER migration over later effective definitions.
export function assertCurrentClubTestBaseline(sql) {
  const versions = readdirSync(new URL("../../../supabase/migrations/", import.meta.url))
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .map((name) => name.slice(0, 14))
    .sort();
  assert.equal(new Set(versions).size, versions.length, "duplicate migration artifacts");
  const result = sql("select coalesce(jsonb_agg(version order by version),'[]') from supabase_migrations.schema_migrations;");
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout.trim()), versions, "local migration history must match every current artifact");
  const column = sql("select count(*) from information_schema.columns where table_schema='public' and table_name='clubs' and column_name='directory_is_public' and data_type='boolean' and is_nullable='NO';");
  assert.equal(column.status, 0, column.stderr);
  assert.equal(column.stdout.trim(), "1", "current public eligibility schema is required");
}
