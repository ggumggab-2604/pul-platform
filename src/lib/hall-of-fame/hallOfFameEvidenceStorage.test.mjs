import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const storageSource = readFileSync(
  fileURLToPath(new URL("./hallOfFameEvidenceStorage.ts", import.meta.url)),
  "utf8",
);
const validationSource = readFileSync(
  fileURLToPath(new URL("./hallOfFameEvidenceValidation.ts", import.meta.url)),
  "utf8",
);
const compiledValidation = ts.transpileModule(validationSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const validationModule = await import(
  "data:text/javascript;base64," +
    Buffer.from(compiledValidation).toString("base64"),
);
const {
  HALL_OF_FAME_EVIDENCE_MAX_BYTES,
  normalizeHallOfFameEvidenceContentType,
  validateHallOfFameEvidenceBytes,
} = validationModule;

const actionsSource = readFileSync(
  fileURLToPath(
    new URL("../../app/hall-of-fame/evidence/actions.ts", import.meta.url),
  ),
  "utf8",
);

test("Storage service boundary is server-only and never uses a public service credential", () => {
  assert.match(storageSource, /^import "server-only";/);
  assert.match(storageSource, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(storageSource, /NEXT_PUBLIC_SUPABASE_SERVICE_ROLE/);
  assert.doesNotMatch(storageSource, /console\.(?:log|error|warn)/);
  assert.match(storageSource, /persistSession: false/);
  assert.match(storageSource, /createSignedUploadUrl\(upload\.path, \{ upsert: false \}\)/);
  assert.match(storageSource, /createSignedUrl\(path, SIGNED_READ_SECONDS\)/);
});

test("actual bytes are checked before service-only finalize", () => {
  const validationIndex = storageSource.indexOf("validateHallOfFameEvidenceBytes(");
  const hashIndex = storageSource.indexOf('createHash("sha256").update(bytes)');
  const finalizeIndex = storageSource.indexOf('"finalize_hall_of_fame_evidence_server"');
  assert.ok(validationIndex > 0);
  assert.ok(hashIndex > validationIndex);
  assert.ok(finalizeIndex > hashIndex);
  assert.match(validationSource, /0xff, 0xd8, 0xff/);
  assert.match(validationSource, /0x89, 0x50, 0x4e, 0x47/);
  assert.match(validationSource, /0x52, 0x49, 0x46, 0x46/);
  assert.match(validationSource, /0x25, 0x50, 0x44, 0x46, 0x2d/);
  assert.match(validationSource, /10 \* 1024 \* 1024/);
});

test("Storage Content-Type, declared MIME, and magic bytes must agree", () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
  const png = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);

  assert.equal(
    normalizeHallOfFameEvidenceContentType(" IMAGE/JPEG ; charset=binary"),
    "image/jpeg",
  );
  assert.equal(
    validateHallOfFameEvidenceBytes(
      jpeg,
      "image/jpeg",
      jpeg.byteLength,
      "IMAGE/JPEG; charset=binary",
    ),
    "image/jpeg",
  );
  assert.equal(
    validateHallOfFameEvidenceBytes(
      png,
      "image/png",
      png.byteLength,
      "image/png",
    ),
    "image/png",
  );
  assert.throws(
    () =>
      validateHallOfFameEvidenceBytes(
        jpeg,
        "image/jpeg",
        jpeg.byteLength,
        "image/png",
      ),
    /HOF_EVIDENCE_CONTENT_TYPE_MISMATCH/,
  );
  assert.throws(
    () =>
      validateHallOfFameEvidenceBytes(
        png,
        "image/jpeg",
        png.byteLength,
        "image/jpeg",
      ),
    /HOF_EVIDENCE_MIME_MISMATCH/,
  );
});

test("missing metadata, missing bytes, and oversized objects are rejected", () => {
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]);
  assert.throws(
    () =>
      validateHallOfFameEvidenceBytes(
        jpeg,
        "image/jpeg",
        jpeg.byteLength,
        null,
      ),
    /HOF_EVIDENCE_CONTENT_TYPE_INVALID/,
  );
  assert.throws(
    () =>
      validateHallOfFameEvidenceBytes(
        jpeg,
        "image/jpeg",
        jpeg.byteLength,
        "text/plain",
      ),
    /HOF_EVIDENCE_CONTENT_TYPE_INVALID/,
  );
  assert.throws(
    () =>
      validateHallOfFameEvidenceBytes(
        new Uint8Array(),
        "image/png",
        0,
        "image/png",
      ),
    /HOF_EVIDENCE_SIZE_INVALID/,
  );
  assert.throws(
    () =>
      validateHallOfFameEvidenceBytes(
        new Uint8Array(HALL_OF_FAME_EVIDENCE_MAX_BYTES + 1),
        "image/png",
        HALL_OF_FAME_EVIDENCE_MAX_BYTES + 1,
        "image/png",
      ),
    /HOF_EVIDENCE_SIZE_INVALID/,
  );
  assert.match(
    storageSource,
    /validateHallOfFameEvidenceBytes\([\s\S]*?data\.type/,
  );
});

test("replacement and withdrawal cleanup never accept caller-controlled paths", () => {
  assert.match(storageSource, /list_hall_of_fame_evidence_cleanup_candidates_server/);
  assert.match(storageSource, /\.remove\(\[candidate\.storage_path\]\)/);
  assert.doesNotMatch(storageSource, /storagePath:\s*input\./);
  assert.match(storageSource, /replacedEvidenceId/);
  assert.match(storageSource, /cleanupHallOfFameEvidenceObjects\(500, input\.evidenceId\)/);
});

test("server actions remain thin wrappers", () => {
  assert.match(actionsSource, /^"use server";/);
  assert.match(actionsSource, /createHallOfFameEvidenceUploadIntent\(input\)/);
  assert.match(actionsSource, /finalizeHallOfFameEvidence\(input\)/);
  assert.doesNotMatch(actionsSource, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(actionsSource, /\.storage\./);
});
