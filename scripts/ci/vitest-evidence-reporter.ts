/** Compact, allowlisted execution evidence. Never serializes logs, errors or env wholesale. */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import type { Reporter, TestModule, TestSpecification, Vitest } from "vitest/node";
import { assertExactPaths, buildCatalog, hash, writeJson } from "./test-catalog.mjs";

const require = createRequire(import.meta.url);
const relative = (root: string, file: string) => path.relative(root, file).split(path.sep).join("/");
type Entry = { path: string; project: string };
const key = (entry: Entry) => `${entry.project}:${entry.path}`;

export default class EvidenceReporter implements Reporter {
  private started = Date.now();
  private root = process.cwd();
  private directory = process.env.CI_EVIDENCE_DIR ?? "reports/ci-evidence";
  private catalog = buildCatalog(this.root);
  private discovered: Entry[] = [];
  private selected: Entry[] = [];
  private assigned = new Set<string>();
  private queued = new Set<string>();
  private shard: { index: number; total: number; maxParallel: number | null } = { index: 1, total: 1, maxParallel: null };
  private pool = "forks";
  private isolate = true;
  private maxWorkers = 0;

  async onInit(vitest: Vitest) {
    this.root = vitest.config.root;
    this.maxWorkers = vitest.config.maxWorkers;
    const configured = vitest.config.shard ?? { index: 1, count: 1 };
    const declared = process.env.CI_TEST_SHARD ?? `${configured.index}/${configured.count}`;
    if (declared !== `${configured.index}/${configured.count}`) throw new Error("CI_TEST_SHARD differs from actual Vitest shard");
    const maxParallel = process.env.CI_TEST_MAX_PARALLEL ? Number(process.env.CI_TEST_MAX_PARALLEL) : null;
    if (maxParallel !== null && (!Number.isSafeInteger(maxParallel) || maxParallel < 1 || maxParallel > configured.count)) throw new Error("Invalid CI_TEST_MAX_PARALLEL");
    this.shard = { index: configured.index, total: configured.count, maxParallel };
    writeJson(path.join(this.directory, "inventory.json"), this.catalog);

    // Since Vitest 5.1.1, onTestRunStart gets only this shard. Discover every
    // project independently of --shard with the public Vitest API.
    this.discovered = (await vitest.globTestSpecifications())
      .map(spec => this.entry(spec))
      .sort((a, b) => key(a).localeCompare(key(b)));
    const expected = this.catalog.entries.filter(entry => entry.lane === "vitest-normal").map(entry => entry.path);
    assertExactPaths(expected, this.discovered.map(item => item.path), "Vitest full discovery");
  }

  onTestRunStart(specifications: readonly TestSpecification[]) {
    for (const spec of specifications) {
      if (spec.project.config.pool !== "forks" || spec.project.config.isolate !== true) throw new Error("Execution evidence requires the reviewed forks/isolate contract");
      this.pool = spec.project.config.pool;
      this.isolate = spec.project.config.isolate;
    }
    this.selected = specifications.map(spec => this.entry(spec));
    this.assigned = new Set(this.selected.map(key));
    const discovered = new Set(this.discovered.map(key));
    if (this.selected.length === 0 || new Set(this.selected.map(item => item.path)).size !== this.selected.length) {
      throw new Error("Vitest shard assignment is empty or has duplicate paths");
    }
    for (const assigned of this.assigned) {
      if (!discovered.has(assigned)) throw new Error(`Unexpected assigned module: ${assigned}`);
    }
    this.queued.clear();
    // A killed process leaves explicit incomplete evidence, never a synthetic pass.
    this.save([], 0, "running");
  }

  private entry(spec: TestSpecification): Entry {
    const entry = { path: relative(this.root, spec.moduleId), project: spec.project.name };
    if (!["node", "jsdom"].includes(entry.project)) throw new Error(`Unexpected Vitest project: ${key(entry)}`);
    return entry;
  }

  onTestModuleQueued(module: TestModule) {
    const queued = key({ path: relative(this.root, module.moduleId), project: module.project.name });
    if (!this.assigned.has(queued) || this.queued.has(queued)) throw new Error(`Unexpected/duplicate queued module: ${queued}`);
    this.queued.add(queued);
  }

  onTestRunEnd(modules: readonly TestModule[], errors: readonly unknown[], reason: string) {
    const files = modules.map(module => {
      const cases = { total: 0, passed: 0, failed: 0, skipped: 0, pending: 0 };
      let retries = 0;
      let flaky = 0;
      for (const test of module.children.allTests()) {
        cases.total++;
        cases[test.result().state]++;
        retries += test.diagnostic()?.retryCount ?? 0;
        flaky += test.diagnostic()?.flaky ? 1 : 0;
      }
      const diagnostic = module.diagnostic();
      return {
        path: relative(this.root, module.moduleId), project: module.project.name,
        state: module.state(), cases, retries, flaky,
        durationMs: diagnostic.duration,
        phasesMs: {
          environment: diagnostic.environmentSetupDuration,
          prepare: diagnostic.prepareDuration,
          collect: diagnostic.collectDuration,
          setup: diagnostic.setupDuration,
        },
      };
    }).sort((a, b) => key(a).localeCompare(key(b)));
    this.save(files, errors.length, reason);
    // Vitest already fails assertions/imports. This additionally catches missing modules.
    assertExactPaths([...this.assigned], [...this.queued], "Vitest selected/queued");
    assertExactPaths([...this.assigned], files.map(key), "Vitest selected/executed");
  }

  private save(files: object[], unhandledErrors: number, status: string) {
    let bun: string | null = null;
    try { bun = execFileSync("bun", ["--version"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { /* local Node-only runs are explicit */ }
    writeJson(path.join(this.directory, `vitest-shard-${this.shard.index}-of-${this.shard.total}.json`), {
      schemaVersion: 1, sha: this.catalog.sha, treeDigest: this.catalog.treeDigest,
      shard: this.shard, discovered: this.discovered, selected: this.selected.slice().sort((a, b) => key(a).localeCompare(key(b))), files,
      status, unhandledErrors, wallTimeMs: Date.now() - this.started,
      cacheHit: process.env.CI_CACHE_HIT === "true" ? true : process.env.CI_CACHE_HIT === "false" ? false : null,
      run: { id: process.env.GITHUB_RUN_ID ?? null, attempt: process.env.GITHUB_RUN_ATTEMPT ?? null, event: process.env.GITHUB_EVENT_NAME ?? null },
      environment: {
        node: process.version, bun, vitest: require("vitest/package.json").version,
        platform: process.platform, arch: process.arch,
        runnerOS: process.env.RUNNER_OS ?? null, runnerArch: process.env.RUNNER_ARCH ?? null,
        imageOS: process.env.ImageOS ?? null, imageVersion: process.env.ImageVersion ?? null,
        lockDigest: hash(fs.readFileSync(path.join(this.root, "bun.lock"))),
        maxWorkers: this.maxWorkers, pool: this.pool, isolate: this.isolate,
      },
    });
  }
}
