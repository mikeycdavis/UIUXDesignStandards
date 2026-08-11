/**
 * The validate pipeline: gate order, the three-block envelope, class scoping, and the exit contract.
 *
 * The property under test throughout is compositional rather than functional. Each part of this
 * pipeline is defensible alone; the ways it goes wrong are a UI result escaping a gate that should
 * have stopped it, a passing process block rescuing an unresolved UI gate, and a class-specific rule
 * quietly passing on a class nobody established.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtemp, cp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  runValidate,
  exitCodeFor,
  scopeOfRule,
  declaredClasses,
  runCli,
  ValidationError,
  assertSurfacesDeclared,
  SURFACE_KEYS,
  SURFACE_CONTRACT_CLAUSES,
} from "../scripts/uiux.mjs";
import { loadCatalog } from "../scripts/catalog.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (name) => path.join(ROOT, "test/fixtures", name);

async function scratch(name) {
  const dir = await mkdtemp(path.join(tmpdir(), "uiux-validate-"));
  if (name) await cp(fixture(name), dir, { recursive: true });
  return dir;
}

const collect = () => {
  const out = { stdout: "", stderr: "" };
  return {
    out,
    io: { write: (s) => (out.stdout += s), fail: (s) => (out.stderr += s) },
  };
};

// --- The envelope -----------------------------------------------------------------------------------

test("the envelope carries three independent blocks on every run", async () => {
  const result = await runValidate(fixture("compliant"));
  const env = result.envelope;
  assert.ok(env.applicability);
  assert.ok(env.uiCompliance);
  assert.ok(env.frameworkCompliance);
  assert.ok(env.evidenceSurface);
  assert.equal(env.schemaVersion, "1.0");
});

test("uiCompliance is null in exactly the non-APPLICABLE cases", async () => {
  const applicable = await runValidate(fixture("compliant"));
  assert.equal(applicable.envelope.applicability.classification, "APPLICABLE");
  assert.notEqual(applicable.envelope.uiCompliance, null);

  const exempt = await runValidate(ROOT);
  assert.equal(exempt.envelope.applicability.classification, "NOT_APPLICABLE");
  assert.equal(exempt.envelope.uiCompliance, null);
  assert.notEqual(exempt.envelope.frameworkCompliance, null);
});

test("the two blocks are computed over disjoint, exhaustive rule sets", async () => {
  const catalog = await loadCatalog();
  const result = await runValidate(fixture("compliant"));
  const ui = new Set(result.envelope.uiCompliance.results.map((r) => r.ruleId));
  const framework = new Set(result.envelope.frameworkCompliance.results.map((r) => r.ruleId));

  for (const rule of catalog.rules.values()) {
    const inUi = ui.has(rule.id);
    const inFramework = framework.has(rule.id);
    assert.ok(!(inUi && inFramework), `${rule.id} appears in both blocks`);
    if (rule.appliesTo.includes("process")) assert.ok(inFramework, `${rule.id} is missing from frameworkCompliance`);
    else assert.ok(inUi, `${rule.id} is missing from uiCompliance`);
  }
});

test("no UI rule acquires a result when Gate 1 did not admit the UI surface", async () => {
  const result = await runValidate(ROOT);
  assert.equal(result.envelope.uiCompliance, null);
  assert.equal(result.statics.findings.length, 0, "the detectors did not run at all");
  assert.deepEqual(result.statics.examined, []);
});

// --- Gate order -------------------------------------------------------------------------------------

test("an incoherent policy stops the run at Gate 0, and produces no compliance blocks at all", async () => {
  const dir = await scratch("compliant");
  const policy = await readFile(path.join(dir, "project-policy.yml"), "utf8");
  await writeFile(
    path.join(dir, "project-policy.yml"),
    policy.replace("  accessibility:\n    target: framework-baseline\n", ""),
  );
  await assert.rejects(() => runValidate(dir), ValidationError);

  const { out, io } = collect();
  const code = await runCli(["validate", dir], io);
  assert.equal(code, 2);
  assert.equal(out.stdout, "", "a run that reached no verdict emits no envelope to read one out of");
  assert.match(out.stderr, /no verdict was reached/);
  await rm(dir, { recursive: true, force: true });
});

test("an absent policy is an absent configuration, not a broken one", async () => {
  const dir = await scratch("compliant");
  await rm(path.join(dir, "project-policy.yml"));
  const result = await runValidate(dir);
  assert.equal(result.policyStatus, "absent");
  assert.equal(result.envelope.uiCompliance.status, "NOT_EVALUATED");
  assert.equal(exitCodeFor(result.envelope, result.policyFindings), 1);
  await rm(dir, { recursive: true, force: true });
});

// --- Gate 1 dominates the exit code ------------------------------------------------------------------

test("INDETERMINATE exits 1 even when frameworkCompliance is COMPLIANT", async () => {
  const dir = await scratch(null);
  // A policy declaring an interface, over a repository showing no sign of one: precedence rule 5.
  await writeFile(
    path.join(dir, "project-policy.yml"),
    [
      "standardVersion: 1.0.0",
      "project: fixture-declared-but-unwitnessed",
      "ui:",
      "  applicability: web-ui",
      "  platforms:",
      "    - web",
      "  viewportClasses:",
      "    - desktop",
      "  accessibility:",
      "    target: framework-baseline",
      "exceptions: []",
      "",
    ].join("\n"),
  );
  await writeFile(path.join(dir, "README.md"), "A service with no interface in this repository.\n");

  const result = await runValidate(dir);
  assert.equal(result.envelope.applicability.classification, "INDETERMINATE");
  assert.equal(result.envelope.uiCompliance, null);
  assert.equal(result.envelope.frameworkCompliance.status, "COMPLIANT");
  // The point of the test: a satisfied process block does not rescue an unresolved UI gate. The
  // top-level exit is not the framework-process verdict.
  assert.equal(exitCodeFor(result.envelope, result.policyFindings), 1);
  await rm(dir, { recursive: true, force: true });
});

test("a NOT_APPLICABLE project with satisfied process rules exits 0", async () => {
  const result = await runValidate(ROOT);
  assert.equal(result.envelope.frameworkCompliance.status, "COMPLIANT");
  assert.equal(exitCodeFor(result.envelope, result.policyFindings), 0);
});

// --- Class scoping ------------------------------------------------------------------------------------

const gateWith = (over) => ({
  applicabilityClasses: [],
  classResolution: "unresolved",
  agreement: "undeclared",
  declaredClasses: [],
  ...over,
});

test("scopeOfRule: an any-ui rule is always in scope", () => {
  const scope = scopeOfRule({ appliesTo: ["any-ui"] }, gateWith({}));
  assert.equal(scope.scope, "in");
});

test("scopeOfRule: a proven class scopes its rules in", () => {
  const gate = gateWith({ applicabilityClasses: ["web-ui"], classResolution: "resolved", agreement: "match" });
  assert.equal(scopeOfRule({ appliesTo: ["web-ui"] }, gate).scope, "in");
});

test("scopeOfRule: a DECLARED class does not scope a rule in — only evidence does", () => {
  const gate = gateWith({ agreement: "match", declaredClasses: ["web-ui"] });
  const scope = scopeOfRule({ appliesTo: ["web-ui"] }, gate);
  assert.equal(scope.scope, "unresolved");
  assert.match(scope.reason, /evidence of the class, not a declaration of it/);
});

test("scopeOfRule: exclusion needs a declaration the evidence corroborates", () => {
  const corroborated = gateWith({
    applicabilityClasses: ["web-ui"],
    classResolution: "resolved",
    agreement: "match",
    declaredClasses: ["web-ui"],
  });
  assert.equal(scopeOfRule({ appliesTo: ["mobile-ui"] }, corroborated).scope, "out");

  // The same rule, with the declaration uncorroborated, is unresolved rather than excluded.
  const uncorroborated = gateWith({ agreement: "match", declaredClasses: ["web-ui"] });
  assert.equal(scopeOfRule({ appliesTo: ["mobile-ui"] }, uncorroborated).scope, "unresolved");
});

test("declaredClasses reads multi-platform through the platforms it declares", () => {
  assert.deepEqual(declaredClasses({ ui: { applicability: "web-ui" } }), ["web-ui"]);
  assert.deepEqual(
    declaredClasses({ ui: { applicability: "multi-platform", platforms: ["web", "ios", "android"] } }),
    ["web-ui", "mobile-ui"],
  );
  assert.deepEqual(declaredClasses({ ui: { applicability: "no-ui" } }), []);
  assert.deepEqual(declaredClasses(null), []);
});

test("an unresolved class leaves a forbidden web-ui rule unestablished rather than passed", async () => {
  const dir = await scratch("compliant");
  // index.html is what proves `web-ui`. Without it the components still establish an interface.
  await rm(path.join(dir, "index.html"));
  const result = await runValidate(dir);
  const env = result.envelope;

  assert.equal(env.applicability.classification, "APPLICABLE");
  assert.equal(env.applicability.classResolution, "unresolved");

  const forbidden = env.uiCompliance.results.find((r) => r.ruleId === "accessibility.not-deliberately-disabled");
  assert.equal(forbidden.disposition, "class-unresolved");
  assert.notEqual(forbidden.status, "passed");
  assert.ok(env.uiCompliance.unestablishedProhibitions.includes("accessibility.not-deliberately-disabled"));
  await rm(dir, { recursive: true, force: true });
});

test("class-unresolved is not folded into not-applicable: it stays in the applicable denominator", async () => {
  const dir = await scratch("compliant");
  await rm(path.join(dir, "index.html"));
  const ui = (await runValidate(dir)).envelope.uiCompliance;
  const unresolved = ui.results.filter((r) => r.disposition === "class-unresolved");
  assert.ok(unresolved.length > 0);
  assert.equal(ui.denominator.applicable, ui.results.length);
  // The assurance buckets must still account for every applicable rule.
  const sum = Object.values(ui.assurance).reduce((a, b) => a + b, 0);
  assert.equal(sum, ui.denominator.applicable);
  await rm(dir, { recursive: true, force: true });
});

// --- The M6 mutation sequence -------------------------------------------------------------------------

test("the boundary between UI existence, UI class, and rule applicability holds under mutation", async () => {
  const dir = await scratch("compliant");
  const step = async () => {
    const result = await runValidate(dir);
    const ui = result.envelope.uiCompliance;
    return {
      classification: result.envelope.applicability.classification,
      resolution: result.envelope.applicability.classResolution,
      ui: ui === null ? null : ui.status,
      passed: ui?.summary.passed ?? 0,
      unresolved: ui?.results.filter((r) => r.disposition === "class-unresolved").length ?? 0,
      exit: exitCodeFor(result.envelope, result.policyFindings),
    };
  };

  // 1. The full fixture: an interface, a resolved class, a populated UI block.
  const full = await step();
  assert.equal(full.classification, "APPLICABLE");
  assert.equal(full.resolution, "resolved");
  assert.ok(full.passed > 0);
  assert.equal(full.unresolved, 0);

  // 2. Remove the class-specific evidence, keep the generic interface evidence.
  await rm(path.join(dir, "index.html"));
  const generic = await step();
  assert.equal(generic.classification, "APPLICABLE", "removing class evidence does not remove the interface");
  assert.equal(generic.resolution, "unresolved");
  assert.ok(generic.passed > 0, "any-ui rules still evaluate");
  assert.ok(generic.unresolved > 0, "web-ui-only rules are visibly unresolved, not silently passed");
  assert.ok(generic.passed < full.passed, "and none of them passed");

  // 3. Remove every UI signal and the declaration with it.
  await rm(path.join(dir, "src"), { recursive: true });
  await rm(path.join(dir, "styles.css"));
  await rm(path.join(dir, "project-policy.yml"));
  const none = await step();
  assert.equal(none.classification, "INDETERMINATE");
  assert.equal(none.ui, null);
  assert.equal(none.exit, 1);

  await rm(dir, { recursive: true, force: true });
});

// --- The framework's own process rule --------------------------------------------------------------------

test("evidence.surfaces-declared is evaluated on every run, including exempt ones", async () => {
  const result = await runValidate(ROOT);
  const declared = result.envelope.frameworkCompliance.results.find(
    (r) => r.ruleId === "evidence.surfaces-declared",
  );
  assert.equal(declared.status, "passed");
  assert.equal(declared.disposition, "evaluated");
});

test("the structural assertion is bound to Standard 35 R8's text, not merely to the rule id", async () => {
  const standard = await readFile(path.join(ROOT, "standards/35-evidence-assurance-and-compliance-output.md"), "utf8");
  const r8 = /### R8 —[^\n]*\n+```text\n([\s\S]*?)```/.exec(standard);
  assert.ok(r8, "R8 must state its subject as an enumerated block");

  const clauses = r8[1]
    .split(/\n|\s{2,}/)
    .map((line) => line.trim())
    .filter(Boolean);
  assert.ok(clauses.length >= 8, "anti-vacuity: a parse matching nothing would agree with anything");

  // The requirement's subject is the FRAMEWORK'S OUTPUT — what a run reports about itself — and not
  // a declaration the project makes. Every clause of it must be a key this assertion checks;
  // otherwise `structural`/`full` would be claimed over a subject only partly examined.
  for (const clause of clauses) {
    assert.ok(
      SURFACE_CONTRACT_CLAUSES.includes(clause),
      `R8 enumerates '${clause}', and the structural assertion does not check it`,
    );
  }
});

test("stripping any R8 clause from the evidence surface fails the rule that requires it", async () => {
  const complete = (await runValidate(ROOT)).envelope.evidenceSurface;
  assert.deepEqual(assertSurfacesDeclared(complete), []);

  for (const key of SURFACE_KEYS) {
    const damaged = structuredClone(complete);
    const parts = key.split(".");
    const parent = parts.slice(0, -1).reduce((value, part) => value[part], damaged);
    delete parent[parts.at(-1)];

    const findings = assertSurfacesDeclared(damaged);
    assert.equal(findings.length, 1, `removing ${key} must fail the rule`);
    assert.equal(findings[0].rule, "evidence.surfaces-declared");
    assert.ok(findings[0].evidence.includes(key));
  }
});

// --- The CLI --------------------------------------------------------------------------------------------

test("an unknown command exits 2 and never 0", async () => {
  const { out, io } = collect();
  const code = await runCli(["bogus", ROOT], io);
  assert.equal(code, 2, "an unknown command must not report a verdict it did not reach");
  assert.equal(out.stdout, "");
});

test("the not-implemented-yet mechanism is still in place for the next command that needs it", async () => {
  // `init` used to be the entry in this table and is now implemented, so the table is empty. The
  // mechanism is what matters: no command in this framework has ever reported success for want of an
  // implementation, and deleting the machinery would leave the next one to reinvent that decision —
  // or not.
  const source = await readFile(path.join(ROOT, "scripts/uiux.mjs"), "utf8");
  assert.match(source, /const PENDING = \{/);
  assert.match(source, /This is not a pass\./);
  assert.match(source, /return EXIT_INVOCATION;/);
});

test("--evidence belongs to validate: audit rejects it rather than implying it weighed it", async () => {
  const { out, io } = collect();
  const code = await runCli(["audit", ROOT, "--evidence=run.json"], io);
  assert.equal(code, 2);
  assert.equal(out.stdout, "");
  // Ingestion itself is exercised in test/evidence.test.mjs, against real git objects.
});

test("audit does not fail on findings unless asked, and validate always does", async () => {
  const plain = collect();
  assert.equal(await runCli(["audit", fixture("never-violations")], plain.io), 0);

  const strict = collect();
  assert.equal(await runCli(["audit", fixture("never-violations"), "--strict"], strict.io), 1);

  const validated = collect();
  assert.equal(await runCli(["validate", fixture("never-violations")], validated.io), 1);
});

test("a missing target directory exits 2", async () => {
  const { io } = collect();
  assert.equal(await runCli(["validate", path.join(ROOT, "definitely-not-a-path")], io), 2);
  assert.equal(await runCli(["audit", path.join(ROOT, "definitely-not-a-path")], io), 2);
});

test("the human output names every unestablished prohibition individually", async () => {
  const { out, io } = collect();
  await runCli(["validate", fixture("compliant")], io);
  const env = (await runValidate(fixture("compliant"))).envelope;
  for (const ruleId of env.uiCompliance.unestablishedProhibitions) {
    assert.ok(out.stdout.includes(ruleId), `${ruleId} is not named in the human output`);
  }
  assert.ok(out.stdout.includes("What this run could not see"));
});
