/**
 * The invariant registry — a bijection between what this framework promises and what defends it.
 *
 * A standards repository accumulates two things that drift apart silently: normative statements, and
 * tests. Prose gets a new MUST and nothing checks it. A test gets deleted in a refactor and the
 * promise it defended survives in a standard nobody re-reads. Neither shows up as a failure, and both
 * end with a document claiming enforcement that does not exist — which is the family's oldest failure
 * mode, recorded in plan section 08's own opening quote.
 *
 * So each entry below states three things and the test asserts all three:
 *
 *   record      the invariant is ON RECORD — a quote that must appear in a normative or plan file.
 *               An invariant only this file believes in is not an invariant.
 *   tests       named tests that defend it, which must exist in the suite.
 *   falsifier   how it was deliberately broken, and whether that break is executed by
 *               test/falsifiers.test.mjs. Where it is, the two files are cross-checked in both
 *               directions: a falsifier for an unregistered invariant, or a registered invariant
 *               naming a falsifier that does not run, both fail here.
 *
 * This is not the whole suite — 300-odd tests defend plenty that is not release-critical. It is the
 * set plan section 12 has to be able to ask about mechanically, and the answer it gets is "this
 * invariant is written down here, defended by these tests, and was broken in this way and caught".
 *
 * The second half of the file is anti-vacuity. Every collection this suite iterates over has an
 * expected size, drawn from the freeze rather than from itself, because an assertion over an empty
 * collection passes and says nothing.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCatalog } from "../scripts/catalog.mjs";
import { DETECTORS, DETECTOR_RULES } from "../scripts/uiux.mjs";
import { FALSIFIERS } from "./falsifiers.mjs";
import { INVARIANTS } from "./invariants.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// --- The registry itself ------------------------------------------------------------------------

test("every registered invariant is on the record, in a normative or plan file", async () => {
  assert.ok(INVARIANTS.length >= 20, "too few invariants registered for this to be a registry");
  for (const invariant of INVARIANTS) {
    const body = await readFile(path.join(ROOT, invariant.record.file), "utf8");
    assert.ok(
      body.replace(/\r\n/g, "\n").includes(invariant.record.quote),
      `${invariant.id}: ${invariant.record.file} does not contain "${invariant.record.quote}". ` +
        `An invariant only the test suite believes in is not an invariant.`,
    );
  }
});

test("every registered invariant is defended by tests that exist", async () => {
  const files = (await readdir(path.join(ROOT, "test"))).filter((f) => f.endsWith(".test.mjs"));
  assert.ok(files.length > 5, "too few test files found — the scan is broken");

  const names = new Set();
  for (const file of files) {
    const body = await readFile(path.join(ROOT, "test", file), "utf8");
    for (const [, name] of body.matchAll(/\btest\(\s*"((?:[^"\\]|\\.)*)"/g)) names.add(name);
  }
  assert.ok(names.size > 250, `only ${names.size} test names parsed — the scan is broken`);

  for (const invariant of INVARIANTS) {
    assert.ok(invariant.tests.length > 0, `${invariant.id} registers no defending test`);
    for (const name of invariant.tests) {
      assert.ok(names.has(name), `${invariant.id} names a defending test that does not exist: "${name}"`);
    }
  }
});

test("the registry and the falsifier harness agree in both directions", () => {
  const registered = new Set(INVARIANTS.map((i) => i.falsifier).filter(Boolean));
  const executed = new Set(FALSIFIERS.map((f) => f.invariant));
  assert.ok(executed.size >= 10, "the falsifier harness runs too little to be checked against");

  for (const id of registered) {
    assert.ok(executed.has(id), `the registry claims falsifier '${id}', which test/falsifiers.test.mjs does not run`);
  }
  for (const id of executed) {
    assert.ok(registered.has(id), `test/falsifiers.test.mjs breaks '${id}', which no registered invariant claims`);
  }
});

test("invariant ids are unique, and each carries a statement", () => {
  const seen = new Set();
  for (const invariant of INVARIANTS) {
    assert.equal(seen.has(invariant.id), false, `duplicate invariant id ${invariant.id}`);
    seen.add(invariant.id);
    assert.match(invariant.id, /^[a-z][a-z0-9]*(\.[a-z0-9-]+)+$/, `${invariant.id} is not a dotted lower-case id`);
    assert.ok(invariant.statement.length > 20, `${invariant.id} has no statement worth reading`);
  }
});

// --- Deferrals that must not quietly become satisfied --------------------------------------------

/**
 * The freeze's original verification was a git-history check: rule identity must be frozen before
 * the detectors that bind to it exist, and history is where that ordering would be visible.
 *
 * The comparison itself lives in `scripts/chronology.mjs`, for two reasons. It is subtler than it
 * looks — the file-birth form of the check is a proxy that can be both false-negative and
 * false-positive, so the anchor is the introduction of `EVALUATED_RULES` rather than the birth of
 * the file containing it — and the release-readiness report must reach the same conclusion this
 * test does, which it can only guarantee by asking the same function.
 *
 * This test is the watchdog on the two states that are not a demonstration. Neither may be silently
 * accepted: while the ordering is unmeasurable, the deferral must still be written down; and if the
 * work is committed as one lump, Git records no ordering at all and the release record must say the
 * chronology was not established rather than claiming it was. A deferral nobody re-examines is
 * indistinguishable from a check nobody wrote.
 */
test("the git-history ordering check is deferred while it is unmeasurable, and runs once it is not", async () => {
  const { resolveChronology } = await import("../scripts/chronology.mjs");
  const chronology = resolveChronology(ROOT);

  if (chronology.state === "NO_HISTORY") {
    const record = await readFile(path.join(ROOT, "artifacts/project-plan-breakdown/03-rule-catalog.md"), "utf8");
    assert.match(
      record,
      /git-history check, and it is not currently runnable/,
      "the git-order check is unmeasurable and section 03 no longer records it as deferred",
    );
    return;
  }

  if (chronology.state === "SAME_COMMIT") {
    // History exists but cannot demonstrate the ordering. The only honest outcome is a release
    // record that says so — never a pass inferred from two equal timestamps.
    const report = await readFile(path.join(ROOT, "artifacts/release/release-readiness-v1.0.0.md"), "utf8");
    assert.match(
      report,
      /chronology[\s\S]{0,400}NOT_ESTABLISHED/i,
      "the freeze and the first detector bindings share one commit, so the ordering is not demonstrable — " +
        "the release record must state that the chronology was NOT_ESTABLISHED in Git",
    );
    assert.doesNotMatch(
      report,
      /chronology[^\n]{0,200}\bVERIFIED\b/i,
      "the release record claims the chronology is VERIFIED, but both anchors entered history in one commit",
    );
    return;
  }

  assert.equal(
    chronology.state,
    "ORDERED",
    `identity must be frozen before the evaluator binds to it. ${chronology.reason}`,
  );
});

// --- Anti-vacuity: the collections this suite iterates over -------------------------------------

/**
 * Every collection whose emptiness would silently satisfy an assertion somewhere in this suite.
 *
 * The expected sizes come from the freeze and from the plan, NOT from the collection itself — a
 * length compared against its own length is the vacuity this table exists to prevent, restated.
 */
const COLLECTIONS = [
  { name: "frozen rules", expect: 70, load: async () => [...(await loadCatalog()).rules.keys()] },
  { name: "forbidden rules", expect: 15, load: async () => [...(await loadCatalog()).rules.values()].filter((r) => r.level === "forbidden") },
  { name: "detector bindings", expect: 13, load: async () => DETECTOR_RULES },
  { name: "detectors", expect: 13, load: async () => DETECTORS },
  { name: "rule files", expect: 15, load: async () => (await readdir(path.join(ROOT, "rules"))).filter((f) => f.endsWith(".json")) },
  { name: "standards", expect: 40, load: async () => (await readdir(path.join(ROOT, "standards"))).filter((f) => f.endsWith(".md")) },
  {
    name: "manual-review rules",
    // 21 since 2026-08-11: `design-integrity.no-fake-progress` was re-typed from `code-analysis`
    // before v1.0.0 under ADR 0014, because no static evidence can establish whether a number is a
    // measurement. Pre-release the freeze may be amended; post-release this figure moving is the
    // MAJOR event the message below describes.
    expect: 21,
    load: async () => [...(await loadCatalog()).rules.values()].filter((r) => r.validationType === "manual-review"),
  },
  {
    name: "browser and visual rules",
    atLeast: 10,
    load: async () =>
      [...(await loadCatalog()).rules.values()].filter((r) => ["browser-analysis", "visual-analysis"].includes(r.validationType)),
  },
  {
    name: "attestable rules",
    atLeast: 15,
    load: async () => [...(await loadCatalog()).rules.values()].filter((r) => r.attestable),
  },
  {
    name: "provenance mappings",
    atLeast: 30,
    load: async () => JSON.parse(await readFile(path.join(ROOT, "artifacts/external-standards-provenance.json"), "utf8")).mappings,
  },
  {
    name: "implementation-table references",
    atLeast: 40,
    load: async () => {
      const files = (await readdir(path.join(ROOT, "standards"))).filter((f) => f.endsWith(".md"));
      const refs = [];
      for (const file of files) {
        const body = (await readFile(path.join(ROOT, "standards", file), "utf8")).split("## Implementation")[1] ?? "";
        for (const [, id] of body.matchAll(/`([a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+)`/g)) refs.push(`${file}:${id}`);
      }
      return refs;
    },
  },
  {
    name: "fixture drawers",
    atLeast: 8,
    load: async () => (await readdir(path.join(ROOT, "test/fixtures"), { withFileTypes: true })).filter((e) => e.isDirectory()),
  },
  {
    name: "evidence fixtures",
    atLeast: 8,
    load: async () => (await readdir(path.join(ROOT, "test/fixtures/evidence"))).filter((f) => f.endsWith(".json")),
  },
  {
    name: "policy fixtures",
    atLeast: 15,
    load: async () => (await readdir(path.join(ROOT, "test/fixtures/policies"))).filter((f) => f.endsWith(".yml")),
  },
  { name: "registered invariants", atLeast: 20, load: async () => INVARIANTS },
  { name: "falsifiers", atLeast: 10, load: async () => FALSIFIERS },
];

test("every collection this suite iterates over is non-empty and the size it is supposed to be", async () => {
  assert.ok(COLLECTIONS.length >= 15, "the anti-vacuity table itself is too small to be checking much");
  for (const collection of COLLECTIONS) {
    const items = await collection.load();
    assert.ok(Array.isArray(items), `${collection.name} did not load as a list`);
    if (collection.expect !== undefined) {
      assert.equal(
        items.length,
        collection.expect,
        `${collection.name}: ${items.length}, expected ${collection.expect} from the freeze. ` +
          `Either the freeze moved — which is a MAJOR version event — or something is missing.`,
      );
    } else {
      assert.ok(
        items.length >= collection.atLeast,
        `${collection.name}: ${items.length}, expected at least ${collection.atLeast}. ` +
          `An assertion over a collection this small is close to asserting nothing.`,
      );
    }
  }
});
