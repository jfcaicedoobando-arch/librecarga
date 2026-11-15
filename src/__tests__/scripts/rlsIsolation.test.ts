import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { validateRlsIsolation } from "../../../scripts/ci/validate-rls-isolation.mjs";

const roots: string[] = [];
function fixture(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rls-isolation-"));
  roots.push(root);
  for (const [file, sql] of Object.entries(files)) fs.writeFileSync(path.join(root, file), sql);
  return path.join(root, "suite.sql");
}
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
describe("RLS include-wrapper isolation", () => {
  it("validates a complete wrapper with independent rollback targets", () => {
    expect(() => validateRlsIsolation(fixture({ "suite.sql": "-- wrapper\n/* note */\n\\ir first.sql\n\\ir second.sql\n", "first.sql": "BEGIN;\nSELECT 1;\nROLLBACK;", "second.sql": "BEGIN;\nSELECT 2;\nROLLBACK;" }))).not.toThrow();
  });
  it.each(["BEGIN;\nCOMMIT;", "SELECT 1;", "BEGIN;"])("rejects an unsafe included target: %s", target => {
    expect(() => validateRlsIsolation(fixture({ "suite.sql": "\\ir target.sql", "target.sql": target }))).toThrow(/BEGIN\/ROLLBACK/);
  });
  it("rejects a missing target", () => {
    expect(() => validateRlsIsolation(fixture({ "suite.sql": "\\ir missing.sql" }))).toThrow();
  });
  it("rejects include cycles", () => {
    expect(() => validateRlsIsolation(fixture({ "suite.sql": "\\ir other.sql", "other.sql": "\\ir suite.sql" }))).toThrow(/Cyclic/);
  });
  it.each(["SELECT 1;", "BEGIN;", "\\i other.sql", "\\! echo unsafe"])("rejects commands outside the wrapper: %s", command => {
    expect(() => validateRlsIsolation(fixture({ "suite.sql": `\\ir target.sql\n${command}`, "target.sql": "BEGIN;\nROLLBACK;" }))).toThrow(/outside RLS wrapper/);
  });
  it("validates every real discovered suite, including the eight-target wrapper", () => {
    const dir = "supabase/tests/rls";
    const files = fs.readdirSync(dir).filter(file => /^test_rls_.*\.sql$/.test(file));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) expect(() => validateRlsIsolation(path.join(dir, file)), file).not.toThrow();
  });
});
