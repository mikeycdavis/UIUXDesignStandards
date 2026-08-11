/**
 * Falsifiers — proof that the suite defends what it claims to defend.
 *
 * Every other test in this repository asserts that the framework behaves correctly. None of them
 * establishes that the suite would NOTICE if it stopped. A test that passes against both the correct
 * implementation and the broken one is not evidence, and a suite made of those is a green build with
 * nothing behind it — the false green this framework exists to prevent, one level up.
 *
 * So this file breaks the architecture on purpose. For each entry below it copies the repository to a
 * temporary directory, applies one precise mutation, runs the suite that should object, and asserts
 * that suite FAILS. Then it restores and asserts green again, so a failure that was going to happen
 * anyway cannot be mistaken for the mutation's effect.
 *
 * The mutations are architectural rather than behavioural on purpose. A regressed alt-text regex
 * costs a finding. These cost the framework's meaning:
 *
 *   INDETERMINATE quietly becoming NOT_APPLICABLE          an unproven exemption
 *   class-unresolved quietly becoming not-applicable       an unproven exclusion
 *   a missing policy reporting COMPLIANT                   governance absent, reported as satisfied
 *   a browser rule passing with no browser                 the flagship anti-vacuity guard, gone
 *   an approval outranking a witnessed failure             assertion beating evidence
 *   partial coverage reading as established                a pass over unexamined surface
 *   a partial review reading as attested                   a reviewer choosing their own scope
 *   STALE reading as FRESH                                 changed material still establishing
 *   unavailable reading as stale                           two epistemic states collapsed
 *   a declaration resolving its own class                  the gate handing back its authority
 *   a satisfied process verdict rescuing an unresolved gate  one block answering another's question
 *
 * The last two entries delete a fixture drawer outright. If a suite still passes with its fixtures
 * gone, an anti-vacuity assumption is hiding somewhere in it.
 *
 * This file is slow — each entry spawns a test run — and that is the correct trade. It is the
 * evidence plan section 12 needs, and it is the only test here whose failure means "the tests are
 * wrong" rather than "the code is wrong".
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { spawnSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

import { FALSIFIERS } from "./falsifiers.mjs";

/** A copy of the repository the falsifiers can vandalise. Made once; each entry restores after itself. */
async function sandbox() {
  const dir = await mkdtemp(path.join(tmpdir(), "uiux-falsify-"));
  // Everything a suite might read. `.github` and the three root documents are here because
  // test/package.test.mjs and test/instructions.test.mjs assert against them — a sandbox missing a
  // file a suite checks makes that suite fail unmutated, which the baseline below catches by design.
  const contents = [
    "scripts", "rules", "schemas", "standards", "templates", "test", "artifacts", "docs", ".github",
    "package.json", "project-policy.yml", "README.md", "INSTRUCTIONS.md", "PROJECT.md",
    "VERSION", "CHANGELOG.md",
  ];
  for (const entry of contents) {
    await cp(path.join(ROOT, entry), path.join(dir, entry), { recursive: true });
  }
  return dir;
}

/**
 * Run one suite in the sandbox, as a genuinely independent process.
 *
 * The environment is scrubbed of `NODE_TEST_CONTEXT` first, and that detail is load-bearing rather
 * than defensive. A `node --test` child that inherits it from a `node --test` parent decides it is a
 * reporting subprocess of the outer run: it executes nothing, prints nothing, and EXITS 0. Every
 * falsifier below would then have been reported as uncaught — a harness built to detect false greens,
 * generating them. This was not hypothetical; it is what the first run of this file did.
 */
function runSuite(dir, suite) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ["--test", suite], { cwd: dir, encoding: "utf8", env });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  // A run that produced no output ran no tests, whatever it exited with.
  if (!/^ℹ tests \d+/m.test(output)) {
    throw new Error(`${suite} produced no test output in the sandbox; the harness is not running anything:\n${output.slice(0, 500)}`);
  }
  return { code: result.status, output };
}

test("every architectural falsifier is caught by the suite that claims to defend it", { timeout: 600_000 }, async () => {
  const dir = await sandbox();
  try {
    // Anti-vacuity for the harness itself, run before any mutation: a suite that was already failing
    // would make every entry below look successful.
    const suites = [...new Set(FALSIFIERS.map((f) => f.suite))];
    for (const suite of suites) {
      const baseline = runSuite(dir, suite);
      assert.equal(baseline.code, 0, `${suite} does not pass unmutated — every falsifier against it would be meaningless`);
    }

    for (const falsifier of FALSIFIERS) {
      const target = path.join(dir, falsifier.file);
      let original = null;

      if (falsifier.replace === null) {
        // Deleting a drawer. The restore is a fresh copy from the real repository.
        await rm(target, { recursive: true, force: true });
      } else {
        original = await readFile(target, "utf8");
        const occurrences = original.split(falsifier.find).length - 1;
        assert.equal(
          occurrences,
          1,
          `${falsifier.invariant}: its anchor appears ${occurrences} times in ${falsifier.file}. ` +
            `A falsifier that matches nothing tests nothing, and one that matches twice is not aimed at anything.`,
        );
        await writeFile(target, original.replace(falsifier.find, falsifier.replace));
      }

      const broken = runSuite(dir, falsifier.suite);
      assert.notEqual(
        broken.code,
        0,
        `${falsifier.invariant}: ${falsifier.suite} still passed with the invariant broken. ` +
          `Nothing in the suite defends it.`,
      );

      if (falsifier.replace === null) {
        await cp(path.join(ROOT, falsifier.file), target, { recursive: true });
      } else {
        await writeFile(target, original);
      }
    }

    // Restored, and green again. Without this the failures above could all have been the same
    // pre-existing breakage rather than the mutations.
    for (const suite of suites) {
      assert.equal(runSuite(dir, suite).code, 0, `${suite} did not return to green after restoration`);
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
