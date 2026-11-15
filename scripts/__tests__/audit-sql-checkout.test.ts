// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { scanSecurityDefinerWithPreservedAcl } from "../lib/audit-acl-preservation";

const reviewed = [
  "20261009174000_cxp_centavo_sin_cobertura.sql",
  "20261011180000_proforma_cancelada_acciones_terminales.sql",
  "20261013141500_factura_eliminada_guard_hijos.sql",
  "20261013151000_padres_activos_recalculo_tc.sql",
  "20261015170857_seed_r3_stopped_admission.sql",
];

describe("exact SQL review inputs on Windows checkouts", () => {
  it("preserves all five reviewed ACL guards and replay literal bytes with autocrlf enabled", () => {
    const directory = mkdtempSync(join(tmpdir(), "librecarga-sql-checkout-"));
    const git = (...args: string[]) => execFileSync("git", args, {
      cwd: directory, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    });
    try {
      git("init", "--quiet");
      git("config", "core.autocrlf", "true");
      git("config", "core.safecrlf", "false");
      writeFileSync(join(directory, ".gitattributes"), readFileSync(resolve(".gitattributes")));
      const sources = new Map<string, Buffer>(reviewed.map((file) => [
        `supabase/migrations/${file}`, readFileSync(resolve("supabase/migrations", file)),
      ]));
      // This guard hashes its embedded ci_payload literally; its checkout is
      // part of the same immutable-byte contract as the migration under test.
      const payloadGuard = "supabase/tests/rls/test_rls_cxp_contador_migration.sql";
      sources.set(payloadGuard, readFileSync(resolve(payloadGuard)));
      // Newlines inside SQL dollar-quoted values must not be rewritten by Git.
      const sql = Buffer.from("SELECT $query$first\nsecond$query$;\n");
      for (const path of [
        "drizzle/migrations/9999_checkout_fixture.sql",
        "scripts/ci/drizzle-history/9999_checkout_fixture.sql",
        "scripts/ci/drizzle-history/archive/example/fixture.sql",
        "supabase/schema/baseline.sql",
        "supabase/schema/facturacion/fixture.sql",
        "supabase/tests/checkout_fixture.sql",
        "supabase/tests/rls/nested/checkout_fixture.sql",
      ]) sources.set(path, sql);
      sources.set("scripts/ci/drizzle-history/archive/example/meta/_journal.json",
        Buffer.from('{\n  "entries": []\n}\n'));
      sources.set("scripts/db/verify-fixture.sh", Buffer.from("#!/usr/bin/env bash\nset -euo pipefail\n"));
      sources.set("supabase/schema/squash/cutoff.env", Buffer.from("CUTOFF=20261001000000\n"));
      sources.set("supabase/schema/squash/included.txt", Buffer.from("first.sql\nsecond.sql\n"));
      for (const [path, body] of sources) {
        expect(body.includes(Buffer.from("\r\n")), path).toBe(false);
        mkdirSync(dirname(join(directory, path)), { recursive: true });
        writeFileSync(join(directory, path), body);
      }
      git("add", "--all");
      for (const path of sources.keys()) unlinkSync(join(directory, path));
      git("checkout-index", "--all", "--force");
      for (const [path, body] of sources) {
        expect(readFileSync(join(directory, path)), path).toEqual(body);
      }
      for (const file of reviewed) {
        const body = readFileSync(join(directory, "supabase/migrations", file), "utf8");
        expect(scanSecurityDefinerWithPreservedAcl(file, body, true), file).toEqual([]);
        // The hash remains exact: do not admit even an otherwise equivalent CRLF body.
        expect(scanSecurityDefinerWithPreservedAcl(file, body.replaceAll("\n", "\r\n"), true).length)
          .toBeGreaterThan(0);
      }
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }, 30_000);
});
