/**
 * The static layer: the source-view splitter, the thirteen detectors, and the `audit` command.
 *
 * The known-negative half is the half that matters. Both defects this family has actually shipped
 * were false positives, and a detector that fires on a pattern someone merely NAMED teaches an
 * adopter to ignore the tool — which is worse than not shipping the tool.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtemp, cp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  splitSource,
  runAudit,
  readCorpus,
  runDetectors,
  DETECTORS,
  DETECTOR_RULES,
  LIMITATIONS,
} from "../scripts/uiux.mjs";
import { loadCatalog } from "../scripts/catalog.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (name) => path.join(ROOT, "test/fixtures", name);

async function scratch(name) {
  const dir = await mkdtemp(path.join(tmpdir(), "uiux-audit-"));
  await cp(fixture(name), dir, { recursive: true });
  return dir;
}

const rulesOf = (findings) => [...new Set(findings.map((f) => f.rule))].sort();

// --- The source-view splitter ---------------------------------------------------------------------

test("the three views are index-aligned with the source", () => {
  const text = `/* a */ .x { color: red; }\n// b\n.y {}\n`;
  const views = splitSource(text, ".scss");
  for (const view of [views.sourceOf, views.structureOf, views.commentsOf]) {
    assert.equal(view.length, text.length);
  }
});

test("CSS has no line comments, so a URL is not read as one", () => {
  const text = `.x {\n  background: url(https://example.org/a.png);\n  color: red;\n}\n`;
  const { structureOf } = splitSource(text, ".css");
  // If `//` were enabled for CSS the rest of the line — and `color: red` after it — would be blanked.
  assert.ok(structureOf.includes("color: red"));
});

test("a CSS block comment is removed from the structural view and kept in the comment view", () => {
  const text = `/* button:focus { outline: none; } */\n.x { color: red; }\n`;
  const views = splitSource(text, ".css");
  assert.ok(!views.structureOf.includes("outline"));
  assert.ok(views.commentsOf.includes("outline: none"));
});

test("an HTML comment is removed from the structural view", () => {
  const text = `<!-- <img src="a.png"> -->\n<p>text</p>\n`;
  const views = splitSource(text, ".html");
  assert.ok(!views.structureOf.includes("<img"));
  assert.ok(views.commentsOf.includes("<img"));
});

test("string contents are blanked in .js and kept in .jsx, because an attribute value is structure", () => {
  const js = splitSource(`const a = "<img src=x>";\n`, ".js");
  assert.ok(!js.structureOf.includes("<img"));
  assert.ok(js.sourceOf.includes("<img"));

  const jsx = splitSource(`<img src={x} alt="A chart" />\n`, ".jsx");
  assert.ok(jsx.structureOf.includes('alt="A chart"'));
});

test("a string containing a comment token does not open a comment", () => {
  const { structureOf } = splitSource(`const u = "https://x"; const kept = 1;\n`, ".js");
  assert.ok(structureOf.includes("kept"));
});

test("every documented limitation is a limitation of the shipped splitter, not a placeholder", () => {
  assert.ok(LIMITATIONS.length >= 5);
  // The .vue mis-split is claimed in LIMITATIONS; a claim nobody checks is a claim nobody keeps.
  const vue = splitSource(`<script>const s = "<!--";</script>\n<template><img></template>\n`, ".vue");
  assert.ok(!vue.structureOf.includes("<img"), "the documented .vue mis-split still occurs as recorded");
});

// --- Detector shape --------------------------------------------------------------------------------

test("there are thirteen detectors, each bound to exactly one frozen rule id", async () => {
  const catalog = await loadCatalog();
  assert.equal(DETECTORS.length, 13);
  assert.equal(new Set(DETECTOR_RULES).size, 13, "no rule id is claimed by two detectors");
  for (const rule of DETECTOR_RULES) {
    assert.ok(catalog.rules.has(rule), `${rule} is not a catalog identity`);
  }
});

test("the shipped detectors agree with the frozen catalog, name for name and binding for binding", async () => {
  const freeze = await readFile(path.join(ROOT, "artifacts/design/rule-catalog-v1.md"), "utf8");
  const frozen = new Map();
  for (const row of freeze.matchAll(/^\| `([a-z][\w.-]+)` \|(?:[^|]*\|){8} ([\w-]+) \|$/gm)) {
    if (row[2] !== "—") frozen.set(row[1], row[2]);
  }
  // Anti-vacuity: a parse that matched nothing would agree with anything.
  assert.equal(frozen.size, 13, "the freeze records thirteen detector bindings");

  const shipped = new Map(DETECTORS.map((d) => [d.rule, d.id]));
  assert.deepEqual(
    [...shipped].sort(),
    [...frozen].sort(),
    "identity was frozen before the evaluator existed, and the evaluator does not get to move it",
  );
});

test("no detector claims a rule whose evidence surface is not static", async () => {
  const catalog = await loadCatalog();
  for (const rule of DETECTOR_RULES) {
    const entry = catalog.rules.get(rule);
    assert.ok(
      !["browser-analysis", "visual-analysis", "manual-review"].includes(entry.validationType),
      `${rule} is ${entry.validationType} and cannot be established by a file scan`,
    );
  }
});

test("every detector declares the view it reads", async () => {
  const source = await readFile(path.join(ROOT, "scripts/uiux.mjs"), "utf8");
  for (const detector of DETECTORS) {
    assert.ok(detector.view, `${detector.id} declares no view`);
    const declaration = new RegExp(`VIEW:[\\s\\S]{0,900}?id: "${detector.id}"`);
    assert.ok(declaration.test(source), `${detector.id} has no VIEW: doc comment`);
  }
});

// --- Known positives -------------------------------------------------------------------------------

test("every detector fires on never-violations", async () => {
  const result = await runAudit(fixture("never-violations"));
  assert.ok(result.findings.length > 0);
  assert.deepEqual(rulesOf(result.findings), [...DETECTOR_RULES].sort());
  assert.equal(result.detectorsWithoutSubject.length, 0);
});

test("each finding carries evidence and maps to exactly one rule identity", async () => {
  const result = await runAudit(fixture("never-violations"));
  for (const finding of result.findings) {
    assert.equal(typeof finding.rule, "string");
    assert.ok(finding.evidence.length > 0, `${finding.id} carries no evidence`);
    assert.ok(["OBSERVED", "INFERRED"].includes(finding.label));
  }
});

test("a heuristic finding is never labelled OBSERVED", async () => {
  const result = await runAudit(fixture("never-violations"));
  for (const finding of result.findings) {
    if (["token-drift", "placeholder-content", "duplicate-component-signals"].includes(finding.id)) {
      assert.equal(finding.label, "INFERRED");
    }
  }
});

// --- Known negatives — the half that matters -------------------------------------------------------

test("never-clean names every prohibited pattern and produces no finding", async () => {
  const html = await readFile(path.join(fixture("never-clean"), "index.html"), "utf8");
  const css = await readFile(path.join(fixture("never-clean"), "styles.css"), "utf8");
  const jsx = await readFile(path.join(fixture("never-clean"), "src/App.jsx"), "utf8");
  // Anti-vacuity: a fixture that stopped mentioning the patterns would pass this test by saying
  // nothing at all.
  assert.ok(html.includes("user-scalable=no") && html.includes('tabindex="3"'));
  assert.ok(css.includes("outline: none") && css.includes("@keyframes"));
  assert.ok(/lorem ipsum/i.test(jsx));

  const result = await runAudit(fixture("never-clean"));
  assert.deepEqual(result.findings, []);
});

test("a correct interface leaves every detector silent, having examined all thirteen subjects", async () => {
  const result = await runAudit(fixture("compliant"));
  assert.deepEqual(result.findings, []);
  assert.deepEqual([...result.detectorsExamined].sort(), [...DETECTOR_RULES].sort());
});

test("the token-drift detector is conditional, and its absent subject is not-evaluated rather than clean", async () => {
  const withTokens = await runAudit(fixture("token-system"));
  assert.deepEqual(rulesOf(withTokens.findings), ["design-system.tokens-used"]);

  const without = await runAudit(fixture("no-token-system"));
  assert.deepEqual(without.findings, []);
  const skipped = without.detectorsWithoutSubject.find((d) => d.detector === "token-drift");
  assert.ok(skipped, "the detector must report that it had no subject");
  assert.ok(!without.detectorsExamined.includes("design-system.tokens-used"));
});

// --- Mutations -------------------------------------------------------------------------------------

async function mutate(name, file, transform) {
  const dir = await scratch(name);
  const target = path.join(dir, file);
  const original = await readFile(target, "utf8");
  await writeFile(target, transform(original));
  const mutated = await runAudit(dir);
  await writeFile(target, original);
  const restored = await runAudit(dir);
  await rm(dir, { recursive: true, force: true });
  return { mutated: rulesOf(mutated.findings), restored: rulesOf(restored.findings) };
}

test("removing an alt attribute fires the detector, and restoring it clears the finding", async () => {
  const { mutated, restored } = await mutate("compliant", "index.html", (text) =>
    text.replace(' alt="Your profile photograph"', ""),
  );
  assert.deepEqual(mutated, ["accessibility.img-alt-text"]);
  assert.deepEqual(restored, []);
});

test("removing a label association fires the detector", async () => {
  const { mutated, restored } = await mutate("compliant", "index.html", (text) =>
    text.replace('<label for="email">Email address</label>', "<span>Email address</span>"),
  );
  assert.deepEqual(mutated, ["forms.control-label"]);
  assert.deepEqual(restored, []);
});

test("removing the focus outline fires the detector", async () => {
  const { mutated, restored } = await mutate("compliant", "styles.css", (text) =>
    text.replace("outline: 2px solid var(--color-focus);\n  outline-offset: 2px;", "outline: none;"),
  );
  assert.deepEqual(mutated, ["accessibility.no-removed-focus-indicators"]);
  assert.deepEqual(restored, []);
});

test("replacing tokens with literal values fires the drift detector", async () => {
  const { mutated, restored } = await mutate("compliant", "styles.css", (text) =>
    text
      .replace("var(--color-surface)", "#ffffff")
      .replace("var(--color-text)", "#1a1a1a")
      .replace("var(--color-focus)", "#0b5fff"),
  );
  assert.deepEqual(mutated, ["design-system.tokens-used"]);
  assert.deepEqual(restored, []);
});

test("removing the reduced-motion query fires the guard", async () => {
  const { mutated, restored } = await mutate("compliant", "styles.css", (text) =>
    text.replace(/@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}\n/, ""),
  );
  assert.deepEqual(mutated, ["motion.reduced-motion-support"]);
  assert.deepEqual(restored, []);
});

test("a compensating focus style keeps the detector silent — the whitelist is real", async () => {
  const { mutated } = await mutate("compliant", "styles.css", (text) =>
    text.replace(
      "outline: 2px solid var(--color-focus);\n  outline-offset: 2px;",
      "outline: none;\n  box-shadow: 0 0 0 3px var(--color-focus);",
    ),
  );
  assert.deepEqual(mutated, []);
});

// --- The audit command ------------------------------------------------------------------------------

test("audit reaches no verdict: no status, no score, and no policy is consulted", async () => {
  const result = await runAudit(fixture("never-violations"));
  assert.ok(!("status" in result));
  assert.ok(!("score" in result));
  assert.ok(!("uiCompliance" in result));
});

test("audit always declares its evidence surface, with not-attempted defaults", async () => {
  const result = await runAudit(fixture("compliant"));
  const surface = result.evidenceSurface;
  assert.equal(surface.browserRun.status, "not-attempted");
  assert.deepEqual(surface.browserRun.viewportsTested, []);
  assert.equal(surface.storybook, "not-detected");
  assert.ok(surface.sourceRead.files > 0);
});

test("a file too large to read is recorded as unread, never as clean", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "uiux-big-"));
  await writeFile(path.join(dir, "huge.css"), `/* ${"x".repeat(500_000)} */\n`);
  const corpus = await readCorpus(dir);
  assert.equal(corpus.files.length, 0);
  assert.equal(corpus.unread.length, 1);
  await rm(dir, { recursive: true, force: true });
});

test("this repository's own audit is clean, and names the files it excluded from itself", async () => {
  const result = await runAudit(ROOT);
  assert.deepEqual(result.findings, []);
  // The detector file and its own known-positive suite must quote the patterns they hunt. That is a
  // real exclusion, so it is reported rather than assumed.
  assert.deepEqual(result.evidenceSurface.sourceRead.selfExcluded, ["scripts/uiux.mjs", "test/audit.test.mjs"]);
  assert.ok(result.evidenceSurface.sourceRead.excluded.includes("test/fixtures"));
});

test("the audit-only detector is absent from a validate-shaped run", async () => {
  const corpus = await readCorpus(fixture("never-violations"));
  const context = { tokenSystem: { detected: true, evidence: [] }, policy: null };
  const gated = runDetectors(corpus.files, context);
  const audited = runDetectors(corpus.files, context, { auditOnly: true });
  assert.ok(!gated.examined.includes("interaction.duplicate-component-signals"));
  assert.ok(audited.examined.includes("interaction.duplicate-component-signals"));
});
