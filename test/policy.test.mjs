/**
 * Policy validation: the shape layer, the semantic layer, and the governance layer.
 *
 * The claim being defended is that three kinds of failure stay distinct. Two of them share exit 2,
 * so the exit code alone cannot prove the separation — every test below asserts the *status* as
 * well, because a checker that collapsed "this is not a policy" into "this policy is incoherent"
 * would still pass an exit-code-only test.
 *
 * The fixture naming is load-bearing: `shape-*` must be invalid-shape, `semantic-*` must be
 * invalid-semantics, `finding-*` must be findings, `valid-*` must be ok. A sweep at the end asserts
 * every fixture lands in the category its name claims, so adding a fixture to the wrong drawer
 * fails rather than passing quietly.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { checkPolicy, semanticErrors } from "../scripts/policy.mjs";
import { loadCatalog } from "../scripts/catalog.mjs";
import { assertSchemaSupported } from "../scripts/jsonschema.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA = path.join(REPO, "schemas", "project-policy.schema.json");
const FIXTURES = path.join(REPO, "test", "fixtures", "policies");
const TODAY = "2026-08-10";

const catalog = await loadCatalog(path.join(REPO, "rules"));
const check = (file, today = TODAY) => checkPolicy(path.join(FIXTURES, file), SCHEMA, today, catalog);

/** Validate an inline policy body written at test time. */
async function checkBody(body, today = TODAY) {
  const dir = await mkdtemp(path.join(tmpdir(), "uiux-pol-"));
  try {
    const file = path.join(dir, "project-policy.yml");
    await writeFile(file, body);
    return await checkPolicy(file, SCHEMA, today, catalog);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const WEB_UI = `standardVersion: 1.0.0
ui:
  applicability: web-ui
  platforms:
    - web
  viewportClasses:
    - mobile
  accessibility:
    target: framework-baseline
`;

// --- Known-positive ------------------------------------------------------------------------------

test("this repository's own policy is valid and declares no-ui", async () => {
  const result = await checkPolicy(path.join(REPO, "project-policy.yml"), SCHEMA, TODAY, catalog);
  assert.equal(result.status, "ok", JSON.stringify(result.schemaErrors.concat(result.semanticErrors)));
  assert.equal(result.document.ui.applicability, "no-ui");
  assert.deepEqual(result.document.exceptions, [], "a standards repository does not except itself");
});

test("a valid no-ui declaration is not, by itself, a NOT_APPLICABLE classification", async () => {
  // The boundary the whole two-gate model rests on. This command validates a declaration; only the
  // applicability classifier, reading repository evidence, may classify. Nothing in this result may
  // be readable as a classification.
  const result = await check("valid-no-ui.yml");
  assert.equal(result.status, "ok");
  assert.equal(result.document.ui.applicability, "no-ui");
  assert.equal(result.classification, undefined, "policy validation must not produce a classification");
  assert.equal(result.applicability, undefined, "policy validation must not produce an applicability verdict");
  assert.ok(!("NOT_APPLICABLE" in result), "the classifier's vocabulary has no place in a policy result");
});

test("the adoption template validates as written", async () => {
  const result = await checkPolicy(path.join(REPO, "templates", "project-policy.yml"), SCHEMA, TODAY, catalog);
  assert.equal(result.status, "ok", JSON.stringify(result.schemaErrors.concat(result.semanticErrors)));
});

// --- The schema itself ---------------------------------------------------------------------------

test("the schema uses only keywords the vendored evaluator implements", () => {
  // A validator that silently skips a keyword it does not implement reports PASS for a document it
  // never fully checked. assertSchemaSupported is what makes that impossible rather than unlikely.
  assertSchemaSupported(JSON.parse(readFileSync(SCHEMA, "utf8")));
});

test("the schema's ruleId pattern is byte-identical to the catalog loader's", () => {
  // Two spellings of one identity grammar is a split identity by another route: a policy key would
  // validate against one and fail the other.
  const schema = JSON.parse(readFileSync(SCHEMA, "utf8"));
  const source = readFileSync(path.join(REPO, "scripts", "catalog.mjs"), "utf8");
  const loader = /const CANONICAL_ID = \/(.+?)\/;/.exec(source);
  assert.ok(loader, "CANONICAL_ID is not where this test expects it");
  assert.equal(schema.$defs.ruleId.pattern, loader[1]);
});

test("the schema cannot express `accessibility.target: none`", () => {
  // No semantic check exists for `none`, deliberately: the enum makes it unrepresentable, and a
  // second check for one concept is a second owner.
  const schema = JSON.parse(readFileSync(SCHEMA, "utf8"));
  assert.ok(!schema.$defs.accessibility.properties.target.enum.includes("none"));
});

// --- Shape failures: this is not a policy --------------------------------------------------------

test("an unknown top-level key is rejected as shape", async () => {
  const result = await check("shape-unknown-top-level-key.yml");
  assert.equal(result.status, "invalid-shape");
  assert.match(result.schemaErrors[0].message, /unknown property 'unknownKey'/);
  assert.deepEqual(result.semanticErrors, [], "a shape failure must not also report semantics");
});

test("an unknown ui subkey is rejected as shape", async () => {
  const result = await check("shape-unknown-ui-subkey.yml");
  assert.equal(result.status, "invalid-shape");
  assert.match(result.schemaErrors[0].message, /unknown property 'colours'/);
});

test("an applicability value outside the closed set is rejected as shape", async () => {
  const result = await check("shape-invalid-applicability-enum.yml");
  assert.equal(result.status, "invalid-shape");
});

test("a missing standardVersion is rejected as shape", async () => {
  const result = await check("shape-missing-standard-version.yml");
  assert.equal(result.status, "invalid-shape");
  assert.match(result.schemaErrors[0].message, /required but missing/);
});

// --- Semantic failures: this is a policy, and it is incoherent -----------------------------------

test("the accessibility-target mutation proves both halves of the fail-closed decision", async () => {
  // The named mutation. Each step matters: absence must not silently become framework-baseline,
  // the explicit minimum must actually work, and `none` must remain unwritable.
  const without = await checkBody(WEB_UI.replace(/  accessibility:\n    target: framework-baseline\n/, ""));
  assert.equal(without.status, "invalid-semantics", "absence silently defaulted");
  assert.match(without.semanticErrors[0].message, /There is no default/);

  const explicit = await checkBody(WEB_UI);
  assert.equal(explicit.status, "ok", "the explicit minimum does not validate");
  assert.equal(explicit.document.ui.accessibility.target, "framework-baseline");

  const none = await checkBody(WEB_UI.replace("target: framework-baseline", "target: none"));
  assert.equal(none.status, "invalid-shape", "`none` must be unrepresentable, not semantically checked");
});

test("a no-ui declaration alongside a description of an interface is rejected as semantics", async () => {
  const result = await check("semantic-no-ui-with-subkeys.yml");
  assert.equal(result.status, "invalid-semantics");
  assert.equal(result.semanticErrors[0].path, "ui.accessibility");
  assert.deepEqual(result.schemaErrors, [], "a semantic failure must not also report shape errors");
});

test("a no-ui policy is never asked for an accessibility target", async () => {
  // The conditional half of the fail-closed rule. Forcing a meaningless declaration on a project
  // that says it has no interface would make the target a formality rather than a decision.
  const result = await check("valid-no-ui.yml");
  assert.equal(result.status, "ok");
  assert.equal(
    semanticErrors({ ui: { applicability: "no-ui" } }).length,
    0,
    "a bare no-ui declaration should require nothing further",
  );
});

test("multi-platform with one platform is rejected as semantics", async () => {
  const result = await check("semantic-multi-platform-one-platform.yml");
  assert.equal(result.status, "invalid-semantics");
  assert.match(result.semanticErrors[0].message, /at least two platforms/);
});

test("a web-ui or mobile-ui policy with no viewport classes is rejected as semantics", async () => {
  const result = await check("semantic-web-ui-without-viewport-classes.yml");
  assert.equal(result.status, "invalid-semantics");
  assert.equal(result.semanticErrors[0].path, "ui.viewportClasses");
  assert.equal(semanticErrors({ ui: { applicability: "mobile-ui", platforms: ["ios"], accessibility: { target: "framework-baseline" } } }).length, 1);
});

test("a declared interface with no platforms is rejected as semantics", async () => {
  const result = await check("semantic-missing-platforms.yml");
  assert.equal(result.status, "invalid-semantics");
  assert.equal(result.semanticErrors[0].path, "ui.platforms");
});

test("required localization with no locales is rejected as semantics", async () => {
  const result = await check("semantic-localization-without-locales.yml");
  assert.equal(result.status, "invalid-semantics");
  assert.equal(result.semanticErrors[0].path, "ui.localization.locales");
});

test("a none-justified design system with no justification is rejected as semantics", async () => {
  const result = await check("semantic-none-justified-without-justification.yml");
  assert.equal(result.status, "invalid-semantics");
  assert.equal(result.semanticErrors[0].path, "ui.designSystem.justification");
});

test("a policy naming a rule the catalog does not define is rejected as semantics", async () => {
  // A policy selects among the catalog's identities. Letting it name a new one would make the
  // policy a second rule authority, one key at a time.
  const result = await check("semantic-unknown-rule-id.yml");
  assert.equal(result.status, "invalid-semantics");
  assert.match(result.semanticErrors[0].message, /may not add one/);
});

// --- Governance findings: a coherent policy declaring a problem -----------------------------------

test("an exception against a non-exemptible rule is a finding, not a semantic error", async () => {
  // The policy is coherent — it says something well-formed about a real rule. What it says is that
  // the project intends to waive a prohibition, which is a governance failure at exit 1.
  const result = await check("finding-exception-on-nonexemptible.yml");
  assert.equal(result.status, "findings");
  assert.equal(result.findings[0].id, "policy.non-exemptible-rule");
  assert.deepEqual(result.schemaErrors, []);
  assert.deepEqual(result.semanticErrors, []);
});

test("an expired exception is a finding", async () => {
  const result = await check("finding-expired-exception.yml");
  assert.equal(result.status, "findings");
  assert.equal(result.findings[0].id, "policy.expired-exception");
});

test("an exception that has not expired is not a finding", async () => {
  // The date comparison has to bite in one direction only, or every exception is permanently broken.
  const result = await check("finding-expired-exception.yml", "2025-05-01");
  assert.equal(result.status, "ok");
});

test("a rule both declared not-applicable and excepted is a finding", async () => {
  const result = await check("finding-conflicting-classification.yml");
  assert.equal(result.status, "findings");
  assert.equal(result.findings[0].id, "policy.conflicting-classification");
});

// --- Aliases resolve one way ----------------------------------------------------------------------

test("a legacy alias is normalized to the canonical rule before semantics are applied", async () => {
  // One-way resolution: the policy learns the catalog's identity. The catalog never learns the
  // policy's spelling, so an alias cannot become a second name for a rule downstream.
  //
  // v1.0.0 ships no aliases, so the mechanism is exercised against an injected catalog. That is the
  // point of testing it now: the first real alias will arrive in a MINOR release, long after anyone
  // remembers whether resolution happens before or after the non-exemptible check.
  const withAlias = {
    rules: catalog.rules,
    byCategory: catalog.byCategory,
    aliases: new Map([["accessibility.dark-patterns", "design-integrity.no-dark-patterns"]]),
  };
  const body = `standardVersion: 1.0.0
ui:
  applicability: no-ui
exceptions:
  - rule: accessibility.dark-patterns
    reason: Recorded under the old spelling.
    approvedBy: someone
    approvedAt: 2026-01-01
`;

  // Without the alias the id is simply unknown — proving the next assertion is the alias working
  // rather than the check being absent.
  const unaliased = await checkBody(body);
  assert.equal(unaliased.status, "invalid-semantics");

  const dir = await mkdtemp(path.join(tmpdir(), "uiux-pol-alias-"));
  try {
    const file = path.join(dir, "project-policy.yml");
    await writeFile(file, body);
    const result = await checkPolicy(file, SCHEMA, TODAY, withAlias);

    // The alias resolved, and the finding names the CANONICAL id rather than the policy's spelling.
    assert.equal(result.status, "findings");
    assert.equal(result.findings[0].id, "policy.non-exemptible-rule");
    assert.match(result.findings[0].message, /design-integrity\.no-dark-patterns/);
    assert.deepEqual(result.aliases, [
      { alias: "accessibility.dark-patterns", canonical: "design-integrity.no-dark-patterns" },
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }

  // And the catalog is unchanged by having been asked.
  assert.equal(catalog.rules.has("accessibility.dark-patterns"), false);
});

// --- Exit codes -----------------------------------------------------------------------------------

test("the three failure kinds map onto exit codes without collapsing into each other", async () => {
  // Two of the three share exit 2. The exit code is what CI reads, so it must be right; the status
  // is what a consumer reads, so it must stay distinct. Both are asserted, on the real CLI.
  const cases = [
    ["valid-web-ui.yml", 0, /a valid 'web-ui' declaration/],
    ["shape-unknown-top-level-key.yml", 2, /SHAPE/],
    ["semantic-missing-accessibility-target.yml", 2, /SEMANTICS/],
    ["finding-expired-exception.yml", 1, /compliance finding/],
  ];
  for (const [fixture, code, pattern] of cases) {
    const r = spawnSync(process.execPath, [path.join(REPO, "scripts", "policy.mjs"), path.join(FIXTURES, fixture)], {
      encoding: "utf8",
    });
    const out = `${r.stdout}${r.stderr}`;
    assert.equal(r.status, code, `${fixture} exited ${r.status}, expected ${code}\n${out}`);
    assert.match(out, pattern, fixture);
  }

  // The two exit-2 cases must not produce the same message, or the distinction exists only in code.
  const shape = spawnSync(process.execPath, [path.join(REPO, "scripts", "policy.mjs"), path.join(FIXTURES, "shape-unknown-top-level-key.yml")], { encoding: "utf8" });
  const semantic = spawnSync(process.execPath, [path.join(REPO, "scripts", "policy.mjs"), path.join(FIXTURES, "semantic-missing-accessibility-target.yml")], { encoding: "utf8" });
  assert.match(shape.stdout, /is not a policy/);
  assert.match(semantic.stdout, /it is incoherent/);
  assert.match(semantic.stdout, /configuration error, not a compliance failure/);
});

test("the JSON envelope names the declaration as a declaration", async () => {
  const r = spawnSync(
    process.execPath,
    [path.join(REPO, "scripts", "policy.mjs"), path.join(FIXTURES, "valid-no-ui.yml"), "--json"],
    { encoding: "utf8" },
  );
  assert.equal(r.status, 0, r.stderr);
  const envelope = JSON.parse(r.stdout);
  assert.equal(envelope.declaredUiApplicability, "no-ui");
  // The field is not called `applicability` or `classification`, and carries no classifier
  // vocabulary. A downstream adapter must not be able to mistake this for a Gate 1 result.
  assert.equal(envelope.applicability, undefined);
  assert.equal(envelope.classification, undefined);
  assert.ok(!r.stdout.includes("NOT_APPLICABLE"));
  assert.deepEqual(Object.keys(envelope).sort(), [
    "declaredUiApplicability",
    "findings",
    "legacyAliases",
    "policy",
    "schemaErrors",
    "schemaVersion",
    "semanticErrors",
    "status",
  ]);
});

// --- The fixture sweep ----------------------------------------------------------------------------

test("every fixture lands in the category its filename claims", async () => {
  const expected = { "valid-": "ok", "shape-": "invalid-shape", "semantic-": "invalid-semantics", "finding-": "findings" };
  const files = readdirSync(FIXTURES).filter((f) => f.endsWith(".yml"));
  assert.ok(files.length >= 18, `only ${files.length} fixtures — the sweep may be examining nothing`);

  const counts = {};
  for (const file of files) {
    const prefix = Object.keys(expected).find((p) => file.startsWith(p));
    assert.ok(prefix, `${file} has no category prefix`);
    const result = await check(file);
    assert.equal(result.status, expected[prefix], `${file} is ${result.status}, not ${expected[prefix]}`);
    counts[prefix] = (counts[prefix] ?? 0) + 1;
  }
  // Anti-vacuity per drawer: a sweep over four categories proves nothing if three are empty.
  for (const prefix of Object.keys(expected)) {
    assert.ok(counts[prefix] > 0, `no ${prefix}* fixtures exist — that category is untested`);
  }
});

test("every semantic invariant has a fixture", () => {
  // Six invariants plus the unknown-rule check. A fixture-driven suite silently stops covering an
  // invariant the moment someone adds one without a fixture, so the count is asserted.
  const source = readFileSync(path.join(REPO, "scripts", "policy.mjs"), "utf8");
  const semantic = source.slice(source.indexOf("export function semanticErrors"), source.indexOf("Compliance conditions"));
  const raised = (semantic.match(/\n\s+at\(/g) ?? []).length;
  const fixtures = readdirSync(FIXTURES).filter((f) => f.startsWith("semantic-"));
  assert.ok(
    fixtures.length >= raised,
    `semanticErrors raises ${raised} distinct errors but only ${fixtures.length} semantic-* fixtures exist`,
  );
});
