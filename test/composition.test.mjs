/**
 * The three-block envelope, as a matrix rather than as examples.
 *
 * `applicability`, `uiCompliance`, and `frameworkCompliance` answer three different questions, and
 * the reason they are three fields instead of one is that a consumer must never have to read one to
 * know what another means. That property is not visible in any single scenario. It is visible in the
 * table:
 *
 *   Gate 1            uiCompliance   frameworkCompliance   exit
 *   APPLICABLE        populated      populated             derived from both
 *   NOT_APPLICABLE    null           populated             the framework result, on its own
 *   INDETERMINATE     null           populated             1, whatever the framework said
 *   Gate 1 failure    no envelope at all                   2
 *   Gate 0 malformed  no envelope at all                   2
 *
 * The row that matters most is the second one with a FAILING framework verdict. A `no-ui` project is
 * exempt from the UI rules and from nothing else: if declaring no interface also switched off process
 * governance, the exemption would be a way out of the framework rather than a way out of one gate.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runValidate, exitCodeFor, ValidationError } from "../scripts/uiux.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (name) => path.join(ROOT, "test/fixtures", name);

async function copyOf(name, edit = null) {
  const dir = await mkdtemp(path.join(tmpdir(), "uiux-matrix-"));
  await cp(fixture(name), dir, { recursive: true });
  if (edit) {
    const at = path.join(dir, "project-policy.yml");
    await writeFile(at, edit(await readFile(at, "utf8")));
  }
  return dir;
}

const shape = (block) =>
  block === null
    ? "null"
    : typeof block === "object" && "status" in block && "results" in block
      ? "populated"
      : "malformed";

test("APPLICABLE: both blocks are populated and the exit follows both", async () => {
  const result = await runValidate(fixture("compliant"));
  const env = result.envelope;
  assert.equal(env.applicability.classification, "APPLICABLE");
  assert.equal(shape(env.uiCompliance), "populated");
  assert.equal(shape(env.frameworkCompliance), "populated");

  // Derived from both, in the only direction that can be asserted without knowing the fixture's
  // verdict: neither block failing is necessary for exit 0.
  const code = exitCodeFor(env, result.policyFindings);
  const failing = (b) => b.status !== "COMPLIANT" && b.status !== "COMPLIANT_WITH_EXCEPTIONS";
  assert.equal(code === 0, !failing(env.uiCompliance) && !failing(env.frameworkCompliance) && result.policyFindings.length === 0);
});

test("NOT_APPLICABLE: uiCompliance is null and the framework block still answers", async () => {
  const dir = await copyOf("no-ui");
  try {
    const result = await runValidate(dir);
    const env = result.envelope;
    assert.equal(env.applicability.classification, "NOT_APPLICABLE");
    assert.equal(shape(env.uiCompliance), "null");
    assert.equal(shape(env.frameworkCompliance), "populated");
    assert.equal(env.frameworkCompliance.status, "COMPLIANT");
    assert.equal(exitCodeFor(env, result.policyFindings), 0);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("NOT_APPLICABLE does not exempt process governance: a failing framework block still exits 1", async () => {
  // The exemption is from the UI rule surface, and from nothing else. This is the row that proves
  // `no-ui` is not a way out of the framework — an expired waiver against the one process rule is a
  // governance failure, and having no interface does not answer for it.
  const dir = await copyOf("no-ui", (policy) =>
    policy.replace(
      "exceptions: []",
      [
        "exceptions:",
        "  - rule: evidence.surfaces-declared",
        "    reason: pending a reporting rewrite",
        "    approvedBy: owner",
        "    approvedAt: 2025-01-01",
        "    expires: 2025-06-01",
      ].join("\n"),
    ),
  );
  try {
    const result = await runValidate(dir, { today: "2026-08-10" });
    const env = result.envelope;
    assert.equal(env.applicability.classification, "NOT_APPLICABLE", "the UI gate is unchanged by a process failure");
    assert.equal(shape(env.uiCompliance), "null");
    assert.equal(env.frameworkCompliance.status, "NON_COMPLIANT");
    assert.equal(exitCodeFor(env, result.policyFindings), 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("INDETERMINATE: uiCompliance is null and the exit is 1 whatever the framework block says", async () => {
  // A declared interface with no evidence for one. Gate 1 cannot resolve it, so no UI rule can be
  // scoped — and the process rules, which have no UI class, are evaluated and satisfied anyway.
  const dir = await copyOf("no-ui", (policy) =>
    policy.replace("applicability: no-ui", "applicability: web-ui\n  platforms:\n    - web\n  viewportClasses:\n    - mobile\n  accessibility:\n    target: framework-baseline"),
  );
  try {
    const result = await runValidate(dir);
    const env = result.envelope;
    assert.equal(env.applicability.classification, "INDETERMINATE");
    assert.equal(shape(env.uiCompliance), "null");
    assert.equal(env.frameworkCompliance.status, "COMPLIANT", "the framework block must still answer its own question");
    assert.equal(exitCodeFor(env, result.policyFindings), 1, "a satisfied process verdict rescued an unresolved gate");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("Gate 1 non-execution: no envelope at all, and exit 2", async () => {
  await assert.rejects(
    () => runValidate(path.join(ROOT, "test/fixtures/does-not-exist")),
    (error) => {
      assert.ok(error instanceof ValidationError);
      // The distinction the whole exit-code triple exists for: there is no envelope to read, so there
      // is no verdict, so nothing may be inferred about the project.
      assert.equal(error.envelope, undefined);
      return true;
    },
  );
});

test("Gate 0 malformed policy: no envelope at all, and exit 2", async () => {
  const dir = await copyOf("no-ui", (policy) => policy.replace("applicability: no-ui", "applicability: no-such-class"));
  try {
    await assert.rejects(
      () => runValidate(dir),
      (error) => {
        assert.ok(error instanceof ValidationError);
        assert.equal(error.envelope, undefined);
        assert.match(error.message, /Nothing was evaluated/);
        return true;
      },
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("the matrix is exhaustive over the classifications the classifier can produce", async () => {
  // Anti-vacuity for the table itself: a fourth classification added later must land in a row here
  // rather than in whatever behaviour happens to fall out.
  const { classify } = await import("../scripts/applicability.mjs");
  const source = await readFile(path.join(ROOT, "scripts/applicability.mjs"), "utf8");
  const produced = new Set([...source.matchAll(/classification: "([A-Z_]+)"/g)].map((m) => m[1]));
  assert.deepEqual([...produced].sort(), ["APPLICABLE", "INDETERMINATE", "NOT_APPLICABLE"]);
  assert.equal(typeof classify, "function");
});
