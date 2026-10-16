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
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  splitSource,
  runAudit,
  runValidate,
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

// --- ST-04: an @apply ring is the replacement focus indicator ---------------------------------------

async function focusRulesFor(css, file = "index.css") {
  const dir = await mkdtemp(path.join(tmpdir(), "uiux-st04-"));
  try {
    await writeFile(path.join(dir, file), css);
    return rulesOf((await runAudit(dir)).findings);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const FOCUS_RULE = "accessibility.no-removed-focus-indicators";

test("ST-04 criterion 1: an @apply ring-width utility in the block is a replacement indicator", async () => {
  for (const selector of [":focus-visible", ":focus", "button:focus-visible"]) {
    for (const ring of ["ring", "ring-1", "ring-2", "ring-4", "ring-8"]) {
      for (const outline of ["none", "0"]) {
        const css = `${selector} {
  outline: ${outline};\n  @apply ${ring};
}
`;
        assert.deepEqual(await focusRulesFor(css), [], css);
      }
    }
  }
});

test("ST-04 criterion 2: the demonstrated block produces no finding", async () => {
  const css = `:focus-visible {
  outline: none;\n  @apply ring-2 ring-indigo-500 ring-offset-2 ring-offset-white dark:ring-offset-slate-950;
}
`;
  assert.deepEqual(await focusRulesFor(css), []);
});

test("ST-04 criterion 3: @apply of utilities that supply no indicator still fires", async () => {
  for (const applied of [
    "ring-0",
    "ring-offset-2",
    "ring-indigo-500",
    "ring-offset-2 ring-indigo-500",
    "p-2 text-sm",
    "ring-inset",
    "dark:ring-2",
  ]) {
    const css = `:focus-visible {
  outline: none;\n  @apply ${applied};
}
`;
    assert.deepEqual(await focusRulesFor(css), [FOCUS_RULE], css);
  }
});

test("ST-04: the last ring-width utility wins, as Tailwind applies them in source order", async () => {
  const cases = [
    ["@apply ring-2 ring-0;", [FOCUS_RULE]],
    ["@apply ring-0 ring-2;", []],
    ["@apply ring-2;\n  @apply ring-0;", [FOCUS_RULE]],
    ["@apply ring-0;\n  @apply ring-2;", []],
    ["@apply ring-2 ring-offset-2 ring-0 ring-indigo-500;", [FOCUS_RULE]],
    ["@apply ring-2 !ring-0;", [FOCUS_RULE]],
    ["@apply ring-2 ring-0!;", [FOCUS_RULE]],
    ["@apply !ring-0 ring-2;", [FOCUS_RULE]],
    ["@apply !ring-2;", []],
    ["@apply !ring-2 ring-0;", []],
    ["@apply !ring-0 !ring-2;", []],
    ["@apply !ring-2 !ring-0;", [FOCUS_RULE]],
    ["@apply ring-2 dark:ring-0;", []],
  ];
  for (const [applies, expected] of cases) {
    const css = `:focus-visible {\n  outline: none;\n  ${applies}\n}\n`;
    assert.deepEqual(await focusRulesFor(css), expected, css);
  }
});

test("ST-04: a trailing !important makes the whole @apply declaration important and important wins", async () => {
  const cases = [
    ["@apply ring-0 !important;\n  @apply ring-2;", [FOCUS_RULE]],
    ["@apply ring-2 !important;\n  @apply ring-0;", []],
    ["@apply ring-2;\n  @apply ring-0 !important;", [FOCUS_RULE]],
    ["@apply ring-0;\n  @apply ring-2 !important;", []],
    ["@apply ring-2 ring-0 !important;", [FOCUS_RULE]],
    ["@apply ring-0 ring-2 !important;", []],
    ["@apply ring-0 !important;\n  @apply ring-2 !important;", []],
    ["@apply ring-2 !important;\n  @apply ring-0 !important;", [FOCUS_RULE]],
    ["@apply ring-0 !important;\n  @apply !ring-2;", []],
    ["@apply ring-2 !important;\n  @apply !ring-0;", [FOCUS_RULE]],
    ["@apply ring-offset-2 !important;", [FOCUS_RULE]],
    ["@apply ring-2 ring-offset-2 !important;", []],
    ["@apply ring-0! ring-2;", [FOCUS_RULE]],
  ];
  for (const [applies, expected] of cases) {
    const css = `:focus-visible {
  outline: none;
  ${applies}
}
`;
    assert.deepEqual(await focusRulesFor(css), expected, css);
  }
});

test("ST-04 criterion 4: existing focus behaviour is unchanged", async () => {
  assert.deepEqual(await focusRulesFor(":focus-visible { outline: none; }\n"), [FOCUS_RULE]);
  assert.deepEqual(
    await focusRulesFor(":focus-visible { outline: none; box-shadow: 0 0 0 3px blue; }\n"),
    [],
  );
  assert.deepEqual(await focusRulesFor(":focus:not(:focus-visible) { outline: none; }\n"), []);
});

// --- ST-07: a block containing SCSS interpolation is examined, not skipped --------------------------

test("ST-07 criteria 1 and 2: a focus block containing #{...} is examined with the interpolation masked", async () => {
  const cases = [
    // the reproduced block: an important zero-width ring wins over the later ring-2
    [":focus {\n  outline: none;\n  @apply ring-0 #{!important};\n  @apply ring-2;\n}\n", [FOCUS_RULE]],
    // an interpolation elsewhere in the block, no replacement indicator
    [":focus-visible {\n  outline: none;\n  margin: #{$gap};\n}\n", [FOCUS_RULE]],
    // an effective ring plus an interpolation elsewhere is a replacement indicator
    [":focus {\n  outline: none;\n  @apply ring-2;\n  margin: #{$gap};\n}\n", []],
    [":focus {\n  outline: none;\n  box-shadow: 0 0 0 #{$w} blue;\n}\n", []],
    // an important ring written through interpolation is not displaced by a later ring-0
    [":focus {\n  outline: none;\n  @apply ring-2 #{!important};\n  @apply ring-0;\n}\n", []],
    // nested braces inside an interpolation do not end the span early
    [":focus {\n  outline: none;\n  width: #{map-get((a: 1), a)};\n}\n", [FOCUS_RULE]],
  ];
  for (const [css, expected] of cases) {
    assert.deepEqual(await focusRulesFor(css, "focus.scss"), expected, css);
  }
});

test("ST-07: an interpolation in a selector head is unexaminable at the rule head's line, never read", async () => {
  // resolving a selector interpolation at the span's length pads it with spaces, which would read as
  // a combinator (:focus#{null}.danger is the one compound :focus.danger), so the closed list does not
  // read a selector head that holds one - not even a statically readable one
  const dir = await mkdtemp(path.join(tmpdir(), "uiux-st07-"));
  try {
    await writeFile(path.join(dir, "f.scss"), "/* h */\n\n.a { color: red; }\n\n.#{p}-x:focus {\n  outline: none;\n}\n");
    const r = await runAudit(dir);
    assert.deepEqual(r.findings.filter((f) => f.rule === FOCUS_RULE), []);
    const u = r.detectorsUnexaminable.filter((x) => x.rule === FOCUS_RULE);
    assert.equal(u.length, 1);
    assert.deepEqual(u[0].evidence, ["f.scss:5"]);
    assert.match(u[0].reason, /interpolation in the selector/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  for (const css of [
    ":focus#{null}.danger { outline: none; }\n",
    ".#{prefix}-button:focus-visible { outline: none; }\n",
    "#{':focus'} { outline: none; }\n",
    '#{"focus"} { outline: none; }\n',
    ".a { &:focus#{null}.danger { outline: none; } }\n",
    ".a#{null} { &:focus { outline: none; } }\n",
  ]) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [], css);
    assert.equal(r.examined, false, css);
    assert.equal(r.unexaminable.length >= 1, true, css);
  }
});

test("ST-07: masking an interpolation does not move the reported line", async () => {
  const lineOf = async (head) => {
    const dir = await mkdtemp(path.join(tmpdir(), "uiux-st07-"));
    try {
      await writeFile(path.join(dir, "f.scss"), `${head}\n.b {\n  outline: none;\n}\n:focus {\n  outline: none;\n}\n`);
      return (await runAudit(dir)).findings.filter((f) => f.rule === FOCUS_RULE).map((f) => f.evidence[0]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
  const plain = await lineOf(".a { margin: 1px\n  + 2px; }");
  const interpolated = await lineOf(".a { margin: #{1px\n  + 2px}; }");
  assert.equal(plain.length, 1);
  assert.deepEqual(interpolated, plain);
});

test("ST-07 criterion 3: blocks without #{ are unchanged", async () => {
  assert.deepEqual(await focusRulesFor(":focus { outline: none; @apply ring-0 !important; @apply ring-2; }\n", "a.scss"), [FOCUS_RULE]);
  assert.deepEqual(await focusRulesFor(":focus { outline: none; @apply ring-2; }\n", "a.scss"), []);
  assert.deepEqual(await focusRulesFor(":focus-visible { outline: none; }\n"), [FOCUS_RULE]);
  assert.deepEqual(await focusRulesFor(":focus:not(:focus-visible) { outline: none; }\n", "a.scss"), []);
});

// --- ST-07: an interpolation that cannot be read statically makes the block unexaminable -----------

async function focusAuditFor(css, file = "f.scss") {
  const dir = await mkdtemp(path.join(tmpdir(), "uiux-st07u-"));
  try {
    await writeFile(path.join(dir, file), css);
    const audit = await runAudit(dir);
    return {
      rules: rulesOf(audit.findings),
      examined: audit.detectorsExamined.includes(FOCUS_RULE),
      unexaminable: audit.detectorsUnexaminable.filter((u) => u.rule === FOCUS_RULE),
      withoutSubject: audit.detectorsWithoutSubject.filter((u) => u.rule === FOCUS_RULE),
    };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("ST-07: a statically readable interpolation is read, not masked", async () => {
  for (const css of [
    ":focus { outline: #{none}; }\n",
    ":focus { outline: #{0}; }\n",
    ':focus { outline: #{"none"}; }\n',
    ":focus { outline: #{ none }; }\n",
    ":focus { outline: no#{ne}; }\n",
    ":focus { outline: #{no}ne; }\n",
  ]) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules, [FOCUS_RULE], css);
    assert.equal(r.examined, true, css);
    assert.deepEqual(r.unexaminable, [], css);
  }
});

test("ST-07: every position an unknowable interpolation can take is unexaminable, never examined-clean", async () => {
  const positions = {
    "outline value": ":focus { outline: #{$none}; }\n",
    "outline shorthand width": ":focus { outline: #{$w} solid; }\n",
    "function call value": ":focus { outline: #{if($x, none, auto)}; }\n",
    "map value": ":focus { outline: #{map-get((a: none), a)}; }\n",
    "property name": ":focus { #{$prop}: none; }\n",
    "partial property name": ":focus { out#{$part}: none; }\n",
    "box-shadow value": ":focus { outline: none; box-shadow: #{$s}; }\n",
    "compensating property value": ":focus { outline: none; outline-color: #{$c}; }\n",
    "@apply list": ":focus { outline: none; @apply #{$ring}; }\n",
    "@apply variant token with colon": ":focus { outline: none; @apply focus:#{$r} sm:ring-0; }\n",
    "@apply mixed with static": ":focus { outline: none; @apply ring-0 #{$x}; }\n",
    "nested focus block": ".a { &:focus { outline: #{$o}; } }\n",
    "selector :not": ":focus:not(#{$fv}) { outline: none; }\n",
    "whole-selector interpolation": "#{$sel} { outline: none; }\n",
    "selector pseudo fragment": ".a:#{$state} { outline: none; }\n",
    "inside @media": "@media (min-width: 1px) { :focus { outline: #{$o}; } }\n",
    "unterminated span": ":focus { outline: #{$o;\n}\n",
  };
  for (const [name, css] of Object.entries(positions)) {
    const r = await focusAuditFor(css);
    assert.equal(r.examined, false, `${name}: the rule must not be evaluated`);
    assert.equal(r.unexaminable.length >= 1, true, `${name}: an unexaminable record is emitted`);
    assert.equal(r.withoutSubject.length, 1, `${name}: the rule is listed as not established`);
  }
});

test("ST-07: an unexaminable block makes the rule unevaluated even when another block is readable", async () => {
  const r = await focusAuditFor(":focus-visible { outline: 2px solid blue; }\n:focus { outline: #{$o}; }\n");
  assert.equal(r.examined, false);
  assert.equal(r.unexaminable.length, 1);
  assert.match(r.unexaminable[0].evidence[0], /^f\.scss:2$/);
});

test("ST-07: interpolations that cannot change the answer stay examined", async () => {
  const cases = [
    [":focus { outline: none; margin: #{$gap}; }\n", [FOCUS_RULE]],
    [":focus { outline: 2px solid; width: calc(#{$a} + 1px); }\n", []],
    [':focus { content: "#{$x}"; outline: none; }\n', [FOCUS_RULE]],
    ["// :focus { outline: #{$o}; }\n:focus { outline: none; }\n", [FOCUS_RULE]],
    ["/* :focus { outline: #{$o}; } */\n:focus { outline: none; }\n", [FOCUS_RULE]],
  ];
  for (const [css, rules] of cases) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules, rules, css);
    assert.equal(r.examined, true, css);
    assert.deepEqual(r.unexaminable, [], css);
  }
});

test("ST-07: a nested rule is examined under its COMPOSED selector", async () => {
  const cases = [
    // [css, expected rules, expected examined]
    [".a { &:focus { outline: none; } }\n", [FOCUS_RULE]],
    [":focus { &.danger { outline: none; } }\n", [FOCUS_RULE]],
    [":focus { .danger { outline: none; } }\n", []],
    [":focus { & > .x { outline: none; } }\n", []],
    [":focus { .a &, .b { outline: none; } }\n", [FOCUS_RULE]],
    [".a, :focus { outline: none; }\n", [FOCUS_RULE]],
    [".a, .b:focus { .c { outline: none; } }\n", []],
    [".a, .b { &:focus-visible { outline: none; } }\n", [FOCUS_RULE]],
    [".a { .b { &:focus { outline: none; } } }\n", [FOCUS_RULE]],
    [":focus-within { &.x { outline: none; } }\n", [FOCUS_RULE]],
    [":focus { &:hover { outline: none; } }\n", [FOCUS_RULE]],
    [".a { .b { outline: none; } }\n", []],
    [":focus { outline: none; &:hover { color: red; } }\n", [FOCUS_RULE]],
    [":focus { outline: none; &:hover { box-shadow: 0 0 0 2px blue; } }\n", [FOCUS_RULE]],
    [":focus:not(:focus-visible) { &.x { outline: none; } }\n", []],
    [":focus:not(:focus-visible), .a:focus { outline: none; }\n", [FOCUS_RULE]],
  ];
  for (const [css, rules] of cases) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules, rules, css);
    assert.deepEqual(r.unexaminable, [], css);
  }
});

test("ST-07: a focus pseudo inside a negation does not select focused elements", async () => {
  const none = [
    ":focus { :not(&) { outline: none; } }\n",
    ":not(:focus) { outline: none; }\n",
    ".a:not(:focus-visible) { outline: none; }\n",
    ":not(:focus-within) { outline: none; }\n",
    ".a { &:not(:focus) { outline: none; } }\n",
    ":not(:not(:not(:focus))) { outline: none; }\n",
  ];
  for (const css of none) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules, [], css);
    // the :focus parent of the first form is itself an examined focus rule
    if (!css.startsWith(":focus {")) assert.equal(r.examined, false, css);
  }
  // a double negation, or a negation other than :not(:focus-visible), is off the closed list: unexaminable
  for (const css of [
    ":not(:not(:focus)) { outline: none; }\n",
    ":focus:not(.disabled) { outline: none; }\n",
    ".a:not(.b):focus { outline: none; }\n",
  ]) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules, [], css);
    assert.equal(r.unexaminable.length >= 1, true, css);
  }
});

test("ST-07: adjacent static interpolations concatenate; one unknown makes the run unknown", async () => {
  for (const css of [
    ":focus { outline: #{n}#{one}; }\n",
    ":focus { outline: #{no}#{ne}; }\n",
    ":focus { outline: #{n}#{o}#{n}#{e}; }\n",
    ":focus { outline: #{no}ne; }\n",
    ":focus { outline: n#{o}#{ne}; }\n",
  ]) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules, [FOCUS_RULE], css);
    assert.equal(r.examined, true, css);
    assert.deepEqual(r.unexaminable, [], css);
  }
  for (const css of [":focus { outline: #{n}#{$one}; }\n", ":focus { outline: #{$n}#{one}; }\n"]) {
    const r = await focusAuditFor(css);
    assert.equal(r.examined, false, css);
    assert.equal(r.unexaminable.length, 1, css);
  }
});

test("ST-07: a focus pseudo inside :has(...) describes a related element, not the subject", async () => {
  for (const css of [
    ":focus { .parent:has(&) { outline: none; } }\n",
    ".parent:has(:focus) { outline: none; }\n",
    ".parent:has(:focus-visible, .x) { outline: none; }\n",
    ".parent:has(:not(:focus)) { outline: none; }\n",
  ]) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), [], css);
  }
  // :is/:where/:has are functional selectors outside the closed list: unexaminable, never decided
  for (const css of [":is(:focus) { outline: none; }\n", ".a:has(.b):focus { outline: none; }\n"]) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules, [], css);
    assert.equal(r.unexaminable.length >= 1, true, css);
  }
});

test("ST-07: an at-rule prelude is not a selector", async () => {
  // A prelude naming :focus-visible must not make the rule examined: no focus rule was inspected.
  for (const css of [
    "@supports selector(:focus-visible) { .button { color: red; } }\n",
    "@media (prefers-reduced-motion: reduce) { .a { color: red; } }\n",
    "@layer base { .a { outline: none; } }\n",
    "@container card (min-width: 1px) { .a { color: red; } }\n",
  ]) {
    const r = await focusAuditFor(css);
    assert.equal(r.examined, false, css);
    assert.deepEqual(r.rules, [], css);
  }
  // Children of an at-rule are examined under the ancestor selector, the at-rule excluded.
  assert.deepEqual((await focusAuditFor("@supports selector(:focus-visible) { :focus { outline: none; } }\n")).rules.filter((x) => x === FOCUS_RULE), [FOCUS_RULE]);
  assert.deepEqual((await focusAuditFor(":focus { @media (min-width: 1px) { outline: none; } }\n")).rules.filter((x) => x === FOCUS_RULE), [FOCUS_RULE]);
  assert.deepEqual((await focusAuditFor(":focus { @media (min-width: 1px) { &.x { outline: none; } } }\n")).rules.filter((x) => x === FOCUS_RULE), [FOCUS_RULE]);
  assert.deepEqual((await focusAuditFor("@media (min-width: 1px) { .a { &:focus { outline: none; } } }\n")).rules.filter((x) => x === FOCUS_RULE), [FOCUS_RULE]);
});

test("ST-07: @at-root replaces the ancestor selector, and at-rule names are case-insensitive", async () => {
  // @at-root children are not descendants of the enclosing rule
  assert.deepEqual((await focusAuditFor(":focus { @at-root { .not-focus { outline: none; } } }\n")).rules, []);
  assert.deepEqual((await focusAuditFor(":focus { @at-root (without: media) { .not-focus { outline: none; } } }\n")).rules.filter((x) => x === FOCUS_RULE), []); // without: media keeps the rule, but .not-focus is its descendant
  assert.deepEqual((await focusAuditFor(":focus { @at-root .not-focus { outline: none; } }\n")).rules, []);
  // ...but a literal & still names the enclosing rule, and @at-root .x:focus is a focus rule itself
  assert.deepEqual((await focusAuditFor(".a { @at-root { &:focus { outline: none; } } }\n")).rules.filter((x) => x === FOCUS_RULE), [FOCUS_RULE]);
  assert.deepEqual((await focusAuditFor(".a { @at-root .b:focus { outline: none; } }\n")).rules.filter((x) => x === FOCUS_RULE), [FOCUS_RULE]);
  // names are lower-cased before every at-rule comparison
  assert.deepEqual((await focusAuditFor(":focus { @MEDIA (min-width: 1px) { outline: none; } }\n")).rules.filter((x) => x === FOCUS_RULE), [FOCUS_RULE]);
  assert.deepEqual((await focusAuditFor(":focus { @Supports (display: grid) { &.x { outline: none; } } }\n")).rules.filter((x) => x === FOCUS_RULE), [FOCUS_RULE]);
  assert.deepEqual((await focusAuditFor(":focus { @AT-ROOT { .not-focus { outline: none; } } }\n")).rules, []);
  assert.equal((await focusAuditFor("@SUPPORTS selector(:focus-visible) { .b { color: red; } }\n")).examined, false);
});

test("ST-07: @at-root queries x nesting depth (Sass query semantics, reset carried through group at-rules)", async () => {
  // [query, resets] - resets iff the query excludes style rules
  const queries = [
    ["", true],
    ["(without: rule)", true],
    ["(without: all)", true],
    ["(without: media rule)", true],
    ["(without: media)", false],
    ["(without: supports)", false],
    ["(with: rule)", false],
    ["(with: all)", false],
    ["(with: rule media)", false],
    ["(with: media)", true],
    ["(with: supports layer)", true],
    ["(WITHOUT: RULE)", true],
  ];
  // wrappers between the @at-root and the style rule
  const wrappers = [
    ["", ""],
    ["@media (width > 1px) {", "}"],
    ["@supports (display: grid) { @container c (min-width: 1px) {", "} }"],
    ["@MEDIA print { @container c (min-width: 1px) {", "} }"],
  ];
  for (const [query, resets] of queries) {
    for (const [open, close] of wrappers) {
      // a rule inside: under :focus when the rule is preserved, a plain .not-focus when it is reset
      const rule = `:focus { @at-root ${query} { ${open} .not-focus { outline: none; } ${close} } }\n`;
      const r = await focusAuditFor(rule);
      assert.deepEqual(r.rules, [], rule); // a descendant of :focus is not the focused element
      assert.deepEqual(r.unexaminable, [], rule);
      // a declaration directly inside belongs to the enclosing rule when it is preserved
      const direct = `:focus { @at-root ${query} { ${open} outline: none; ${close} } }\n`;
      const d = await focusAuditFor(direct);
      assert.deepEqual(d.rules, resets ? [] : [FOCUS_RULE], direct);
      // a literal & always names the enclosing rule
      const amp = `.a { @at-root ${query} { ${open} &:focus { outline: none; } ${close} } }\n`;
      assert.deepEqual((await focusAuditFor(amp)).rules, [FOCUS_RULE], amp);
    }
  }
  // a reset is not undone by a nested preserving query
  assert.deepEqual((await focusAuditFor(":focus { @at-root { @at-root (without: media) { .a { outline: none; } } } }\n")).rules, []);
  assert.deepEqual((await focusAuditFor(":focus { @at-root { @media print { @at-root (with: all) { .a { outline: none; } } } } }\n")).rules, []);
  // an unreadable query is not guessed at
  for (const q of ["(without: #{$x})", "(foo: rule)", "(without:)"]) {
    const r = await focusAuditFor(`:focus { @at-root ${q} { .a { outline: none; } } }\n`);
    assert.equal(r.examined, false, q);
    assert.equal(r.unexaminable.length >= 1, true, q);
  }
});

test("ST-07: an established violation is not suppressed by an unreadable sibling", async () => {
  const r = await focusAuditFor(":focus { outline: none; }\n:focus { outline: #{$value}; }\n");
  assert.deepEqual(r.rules, [FOCUS_RULE]);
  assert.equal(r.examined, true);
  assert.equal(r.unexaminable.length, 1);
  // and at validate level the observed violation is a failure, not not-evaluated
  const dir = await mkdtemp(path.join(tmpdir(), "uiux-st07v-"));
  try {
    await cp(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures", "compliant"), dir, { recursive: true });
    await writeFile(path.join(dir, "focus-st07.scss"), ":focus { outline: none; }\n:focus { outline: #{$value}; }\n");
    const result = await runValidate(dir, { allowUnreleasedFramework: true });
    const rule = result.envelope.uiCompliance.results.find((x) => x.ruleId === FOCUS_RULE);
    assert.equal(rule.status, "failed");
    // the same file with only the unreadable block is not a pass
    await writeFile(path.join(dir, "focus-st07.scss"), ":focus { outline: #{$value}; }\n");
    const unreadable = (await runValidate(dir, { allowUnreleasedFramework: true })).envelope.uiCompliance.results.find((x) => x.ruleId === FOCUS_RULE);
    assert.notEqual(unreadable.status, "passed");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("ST-07: at-rules emitted at the stylesheet root do not inherit the enclosing selector", async () => {
  for (const css of [
    ":focus { @keyframes pulse { from { outline: none; } to { outline: none; } } }\n",
    ":focus { @-webkit-keyframes pulse { 50% { outline: none; } } }\n",
    ":focus { @font-face { outline: none; } }\n",
    ":focus { @KEYFRAMES pulse { from { outline: none; } } }\n",
    ":focus { @media print { @keyframes k { from { outline: none; } } } }\n",
  ]) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [], css);
  }
  // inside the root-emitted at-rule a focus rule of its own is still examined
  assert.deepEqual((await focusAuditFor("@keyframes k { from { outline: none; } }\n:focus { outline: none; }\n")).rules.filter((x) => x === FOCUS_RULE), [FOCUS_RULE]);
  // an interpolated at-rule name cannot be classified
  const r = await focusAuditFor(":focus { @#{$name} { .a { outline: none; } } }\n");
  assert.equal(r.examined, false);
  assert.equal(r.unexaminable.length >= 1, true);
});

test("ST-07: generic CSS at-rules keep the enclosing rule around their declarations", async () => {
  // dart-sass wraps the contents of every at-rule except @keyframes and @font-face in the style rule
  for (const css of [
    ":focus { @custom state { outline: none; } }\n",
    ":focus { @page { outline: none; } }\n",
    ":focus { @property --x { outline: none; } }\n",
    ":focus { @-moz-document url-prefix() { outline: none; } }\n",
    ":focus { @CUSTOM state { outline: none; } }\n",
    ":focus { @custom a { @custom b { outline: none; } } }\n",
    ":focus { @custom state { &.x { outline: none; } } }\n",
  ]) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), [FOCUS_RULE], css);
  }
  // a descendant of the focused element is not the focused element
  assert.deepEqual((await focusAuditFor(":focus { @custom state { .x { outline: none; } } }\n")).rules.filter((x) => x === FOCUS_RULE), []);
  // not under a focus rule: nothing to report
  assert.deepEqual((await focusAuditFor(".a { @custom state { outline: none; } }\n")).rules.filter((x) => x === FOCUS_RULE), []);
  // a keyframes/font-face between the rule and the generic at-rule still breaks the context
  assert.deepEqual((await focusAuditFor(":focus { @keyframes k { @custom s { from { outline: none; } } } }\n")).rules.filter((x) => x === FOCUS_RULE), []);
});

test("ST-07: Sass null in a value interpolates to nothing; the string \"null\" does not", async () => {
  assert.deepEqual((await focusAuditFor(":focus { outline: none#{null}; }\n")).rules.filter((x) => x === FOCUS_RULE), [FOCUS_RULE]);
  assert.deepEqual((await focusAuditFor(":focus { outline: none#{ null }#{null}; }\n")).rules.filter((x) => x === FOCUS_RULE), [FOCUS_RULE]);
  // the quoted string "null" is the text null: outline: nonenull is not the removal
  assert.deepEqual((await focusAuditFor(':focus { outline: none#{"null"}; }\n')).rules.filter((x) => x === FOCUS_RULE), []);
});

test("ST-07: pseudo-class names are ASCII case-insensitive", async () => {
  for (const css of [
    ":focus { :NOT(&) { outline: none; } }\n",
    ":focus { .parent:HAS(&) { outline: none; } }\n",
    ":focus { .parent:Has(&) { outline: none; } }\n",
    ":NOT(:FOCUS) { outline: none; }\n",
    ":FOCUS:NOT(:FOCUS-VISIBLE) { outline: none; }\n",
    ":Focus:Not(:Focus-Visible) { outline: none; }\n",
  ]) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), [], css);
  }
  for (const css of [":FOCUS { outline: none; }\n", ":Focus-Visible { outline: none; }\n"]) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), [FOCUS_RULE], css);
  }
});

test("ST-07: a block that belongs to a declaration is not a rule", async () => {
  // a custom property's value is data, however much it looks like a rule
  for (const css of [
    ":focus { --theme: { outline: none; }; }\n",
    ":focus { --theme: { .a { outline: none; } }; }\n",
    ":focus { --a: x { outline: none; }; }\n",
    ".a { --theme: { :focus { outline: none; } }; }\n",
  ]) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [], css);
    assert.deepEqual(r.unexaminable, [], css);
  }
  // the data block does not hide the enclosing rule's own declarations
  assert.deepEqual((await focusAuditFor(":focus { outline: none; --theme: { color: red; }; }\n")).rules, [FOCUS_RULE]);
  // Sass property nesting: outline: { style: none } is outline-style: none - not read, not passed
  for (const css of [
    ":focus { outline: { style: none; } }\n",
    ":focus { outline: none { width: 0; } }\n",
    ":focus { #{$prop}: { style: none; } }\n",
    ":focus { box-shadow: { x: 0; } }\n",
  ]) {
    const r = await focusAuditFor(css);
    assert.equal(r.unexaminable.length >= 1, true, css);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [], css);
  }
  // an unrelated nested property is harmless, and a selector with a pseudo is still a rule
  const margin = await focusAuditFor(":focus { margin: { top: 1px; } outline: none; }\n");
  assert.deepEqual(margin.rules, [FOCUS_RULE]);
  assert.deepEqual(margin.unexaminable, []);
  assert.deepEqual((await focusAuditFor(".a { &:hover { outline: none; } :focus { outline: none; } }\n")).rules, [FOCUS_RULE]);
});

test("ST-07: a directive whose selector semantics are not modelled makes its contents unexaminable", async () => {
  const cases = [
    "@include breakpoint(md) { :focus { outline: none; } }\n",
    ".a { @include on-focus { outline: none; } }\n",
    ".a { @each $c in red, blue { &:focus { outline: none; } } }\n",
    ".a:focus { @if $x { outline: none; } }\n",
    ".a:focus { @if $x { outline: 1px solid; } @else { outline: none; } }\n",
    "@for $i from 1 through 3 { .a:focus { outline: none; } }\n",
    "@while $i > 0 { .a:focus { outline: none; } }\n",
    "@mixin focus-reset { &:focus { outline: none; } }\n",
    "@function f() { @return 1; }\n.a { @include m { &:focus { outline: none; } } }\n",
    "@INCLUDE bp { :focus { outline: none; } }\n",
  ];
  for (const css of cases) {
    const r = await focusAuditFor(css);
    assert.equal(r.examined, false, css);
    assert.equal(r.unexaminable.length >= 1, true, css);
    assert.deepEqual(r.rules, [], css);
  }
  // an opaque region with nothing focus-relevant in it is not noise
  assert.deepEqual((await focusAuditFor(".a { @include m { color: red; } }\n")).unexaminable, []);
});

test("ST-07: an unknown span after the focus pseudo-class can supply the exemption", async () => {
  for (const css of [
    ":focus#{$exclusion} { outline: none; }\n",
    ":focus.#{$c} { outline: none; }\n",
    ".a:focus-visible#{$x}.b { outline: none; }\n",
    ".a { &:focus#{$x} { outline: none; } }\n",
    ":focus:not(#{$x}) { outline: none; }\n",
    ".a:not(#{$x}):focus { outline: none; }\n",
  ]) {
    const r = await focusAuditFor(css);
    assert.equal(r.examined, false, css);
    assert.equal(r.unexaminable.length, 1, css);
    assert.deepEqual(r.rules, [], css);
  }
  // an unknown BEFORE the pseudo-class in the same compound can supply it too
  for (const css of [
    "#{$exclusion}:focus { outline: none; }\n",
    ".#{$p}:focus { outline: none; }\n",
    ".#{$p}-btn:focus-visible { outline: none; }\n",
    ".a#{$x}.b:focus { outline: none; }\n",
  ]) {
    const r = await focusAuditFor(css);
    assert.equal(r.examined, false, css);
    assert.equal(r.unexaminable.length, 1, css);
  }
  // in a later compound it cannot change the answer, but the closed list does not read a selector
  // with an unknown span at all: it is unexaminable (the readable focus branch of a list still decides)
  const later = await focusAuditFor(":focus .#{$p} { outline: none; }\n");
  assert.deepEqual(later.rules.filter((x) => x === FOCUS_RULE), []);
  assert.equal(later.unexaminable.length, 1);
  assert.deepEqual(
    (await focusAuditFor(":focus, .#{$p} { outline: none; }\n")).rules.filter((x) => x === FOCUS_RULE),
    [FOCUS_RULE],
  );
});

test("ST-07: an unknown span belongs to the block that owns it", async () => {
  // The child's unknown does not make the parent unexaminable; the parent's own declarations are known.
  const parent = await focusAuditFor(":focus { outline: none; &:hover { margin: #{$m}; } }\n");
  assert.deepEqual(parent.rules, [FOCUS_RULE]);
  assert.equal(parent.examined, true);
  assert.deepEqual(parent.unexaminable, []);
  // The child's unknown in a deciding position is the child's alone, and it still disqualifies the rule.
  const child = await focusAuditFor(":focus { outline: none; &:hover { outline: #{$o}; } }\n");
  assert.equal(child.examined, true); // the parent's failure is established; the child's unknown only prevents a clean pass
  assert.equal(child.unexaminable.length, 1);
  assert.deepEqual(child.rules, [FOCUS_RULE]);
  // A parent's unknown is not attributed to a clean child.
  const own = await focusAuditFor(":focus { margin: #{$m}; &:hover { color: red; } }\n");
  assert.equal(own.examined, true);
  assert.deepEqual(own.unexaminable, []);
});

// --- The audit command ------------------------------------------------------------------------------

// --- ST-05 / #39 (owner decision, option A): the reported line is the line of the selector's first
// non-whitespace character, the rule head. A declaration line is not required.

test("ST-05 criterion 1: the reported line is the selector's first non-whitespace character", async () => {
  const lineFor = async (css, file = "focus.css") => {
    const dir = await mkdtemp(path.join(tmpdir(), "uiux-st05-"));
    try {
      await writeFile(path.join(dir, file), css);
      return (await runAudit(dir)).findings.filter((f) => f.rule === FOCUS_RULE).map((f) => f.evidence[0]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
  // the issue's reproduction: main reported line 3 (the closing line of the preceding rule)
  assert.deepEqual(
    await lineFor("/* header */\n\n.a { color: red; }\n\n/* note */\n\n:focus-visible {\n  outline: none;\n}\n"),
    ["focus.css:7"],
  );
  // `{` and the declaration on a later line than the selector's own line; other declarations first
  assert.deepEqual(
    await lineFor("/* header */\n\n.a { color: red; }\n\n/* note */\n\n:focus-visible\n{\n  color: red;\n  outline: none;\n}\n"),
    ["focus.css:7"],
  );
  // indented selector, and a multi-line selector list: the line of the first character of the rule head
  assert.deepEqual(await lineFor("@media print {\n\n    .x,\n    .y:focus {\n      outline: 0;\n    }\n}\n"), ["focus.css:3"]);
  // a one-line rule: both anchors coincide
  assert.deepEqual(await lineFor(".btn:focus { outline: none; }\n"), ["focus.css:1"]);
  // the same anchor in SCSS, with an interpolated selector, and for a nested rule
  assert.deepEqual(await lineFor("// h\n\n.a { margin: 1px; }\n\n.a-x:focus {\n  outline: none;\n}\n", "f.scss"), ["f.scss:5"]);
  assert.deepEqual(await lineFor(".a {\n\n  &:focus {\n    outline: none;\n  }\n}\n", "f.scss"), ["f.scss:3"]);
});


// --- the closed list of decided focus forms (docs/integration-contract.md) --------------------------
// The detector DECIDES a small closed set of forms and routes everything else to detectorsUnexaminable
// with a named reason: an unknown is never an exemption and never a pass.

const REASON = {
  selector: /functional or unlisted pseudo-class selector/,
  placeholder: /Sass placeholder selector/,
  interpolation: /interpolation in the selector/,
  outline: /outline is not removed by exactly one plain/,
  replacement: /replacement indicator is not a plain literal/,
  nested: /nested rule inherits declarations/,
  propertyName: /interpolation in a property name/,
};

const DECIDED_FORMS = [
  // [css, finding?, examined?]
  [":focus { outline: none; }\n", true],
  [":focus { outline: 0; }\n", true],
  ["a:focus-visible, button:focus { outline: none; }\n", true],
  [".card:focus-within > .x:hover:focus { outline: none; }\n", true],
  [".btn[data-x=\"a:b\"]:focus { outline: none; }\n", true],
  [":focus { outline: none; box-shadow: 0 0 0 2px blue; }\n", false],
  [":focus { outline: none; box-shadow: 0 0 2px red, 0 0 4px blue; }\n", false],
  [":focus { outline: none; border: 2px solid blue; }\n", false],
  [":focus { outline: none; background-color: yellow; }\n", false],
  [":focus { outline: none; text-decoration: underline; }\n", false],
  [":focus { outline: none; outline-offset: 2px; }\n", false],
  [":focus { outline: none; @apply ring-2; }\n", false],
  [":focus { outline: none; @apply ring-0 !important; @apply ring-2; }\n", true],
  [":focus { outline: none; @apply ring-0; }\n", true],
  [":focus:not(:focus-visible) { outline: none; }\n", false],
  [":focus { outline: 2px solid var(--c); }\n", false],
  [":focus { outline: 3px dashed red; margin: 0; }\n", false],
  [":focus { margin: 0; }\n", false],
  [":focus { outline: #{none}; }\n", true],
  [".a { &:focus { outline: none; } }\n", true],
  [".a { &:focus { outline: none; box-shadow: 0 0 0 2px blue; } }\n", false],
  [".a { margin: 0; &:focus { outline: none; } }\n", true],
];

test("closed list: a focus pseudo-class on an ancestor compound is not a focus rule", async () => {
  for (const css of [".a:focus::before { outline: none; }\n", ":focus { &::after { outline: none; } }\n", ":focus:before { outline: none; }\n", ".button:focus .icon { outline: none; }\n", ".button:focus { .icon { outline: none; } }\n", ":focus-within > .x { outline: none; }\n"]) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [], css);
    assert.deepEqual(r.unexaminable, [], css);
  }
});

test("closed list: every decided form is decided correctly", async () => {
  for (const [css, finding] of DECIDED_FORMS) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), finding ? [FOCUS_RULE] : [], css);
    assert.deepEqual(r.unexaminable, [], css);
    assert.equal(r.examined, true, css);
  }
});

const OFF_LIST_FORMS = [
  // [css, reason] - selectors
  [":is(:focus) { outline: none; }\n", REASON.selector],
  [":where(:focus) { outline: none; }\n", REASON.selector],
  [":not(:focus) { outline: none; }\n", REASON.selector],
  [":focus:not(.disabled) { outline: none; }\n", REASON.selector],
  [":focus:not(:focus-visible, .disabled) { outline: none; }\n", REASON.selector],
  [".p:has(:focus) { outline: none; }\n", REASON.selector],
  [":host(:focus) { outline: none; }\n", REASON.selector],
  [":host-context(.t):focus { outline: none; }\n", REASON.selector],
  [":nth-child(2 of :focus) { outline: none; }\n", REASON.selector],
  [":focus:nth-child(2) { outline: none; }\n", REASON.selector],
  [":focus:custom-state { outline: none; }\n", REASON.selector],
  [":focus:where(*) { outline: none; }\n", REASON.selector],
  [":focus { :is(&, .x) { outline: none; } }\n", REASON.selector],
  [":focus { &:not(&.x) { outline: none; } }\n", REASON.selector],
  ["%silent:focus { outline: none; }\n", REASON.placeholder],
  ["button%silent:focus { outline: none; }\n", REASON.placeholder],
  [".#{$p}:focus { outline: none; }\n", REASON.interpolation],
  [":focus#{$s} { outline: none; }\n", REASON.interpolation],
  ["@include m { :focus { outline: none; } }\n", /@include \/ control directive/],
  // [css, reason] - the outline form
  [":focus { outline: none; outline: 2px solid red; }\n", REASON.outline],
  [":focus { outline: 2px solid red; outline: none; }\n", REASON.outline],
  [":focus { outline-style: none; }\n", REASON.outline],
  [":focus { outline-width: 0; }\n", REASON.outline],
  [":focus { outline: none; outline-style: solid; }\n", REASON.outline],
  [":focus { outline: none; all: initial; }\n", REASON.outline],
  [":focus { outline: none; all: revert; }\n", REASON.outline],
  [":focus { all: unset; }\n", REASON.outline],
  [":focus { outline: none !important; }\n", REASON.outline],
  [":focus { outline: none $imp; }\n", REASON.outline],
  [":focus { outline: var(--o); }\n", REASON.outline],
  [":focus { outline: $o; }\n", REASON.outline],
  [":focus { outline: #{$o}; }\n", REASON.outline],
  [":focus { outline: calc(0px) solid red; }\n", REASON.outline],
  [":focus { outline: medium; }\n", REASON.outline],
  [":focus { outline: 2px solid red blue; }\n", REASON.outline],
  [":focus { outline: solid; }\n", REASON.outline],
  [":focus { outline: 2px red; }\n", REASON.outline],
  [":focus { outline: initial; }\n", REASON.outline],
  [":focus { outline: inherit; }\n", REASON.outline],
  [":focus { outline: none; outline: var(--o); }\n", REASON.outline],
  // [css, reason] - the replacement form
  [":focus { outline: none; box-shadow: var(--ring); }\n", REASON.replacement],
  [":focus { outline: none; box-shadow: $ring; }\n", REASON.replacement],
  [":focus { outline: none; box-shadow: #{$ring}; }\n", REASON.replacement],
  [":focus { outline: none; box-shadow: none; }\n", REASON.replacement],
  [":focus { outline: none; background-image: none, none; }\n", REASON.replacement],
  [":focus { outline: none; background: red, blue; }\n", REASON.replacement],
  [":focus { outline: none; box-shadow: none, none; }\n", REASON.replacement],
  [":focus { outline: none; box-shadow: 0 0 2px red, none; }\n", REASON.replacement],
  [":focus { outline: none; box-shadow: 0 0 0 2px blue !important; }\n", REASON.replacement],
  [":focus { outline: none; box-shadow: 0 0 0 2px blue; box-shadow: none; }\n", REASON.replacement],
  [":focus { outline: none; border: 0; }\n", REASON.replacement],
  [":focus { outline: none; border: calc(1px + 1px) solid red; }\n", REASON.replacement],
  [":focus { outline: none; border: 0 solid red; }\n", REASON.replacement],
  [":focus { outline: none; border-top: 2px red; }\n", REASON.replacement],
  [":focus { outline: none; border: 2px; }\n", REASON.replacement],
  [":focus { outline: none; border-block-end: solid; }\n", REASON.replacement],
  [":focus { outline: none; border: 2px solid auto; }\n", REASON.replacement],
  [":focus { outline: none; border: 2px solid transparent; }\n", REASON.replacement],
  [":focus { outline: none; text-decoration: none; }\n", REASON.replacement],
  [":focus { outline: none; outline-offset: 0; }\n", REASON.replacement],
  [":focus { outline: none; border: 2px solid red; border-style: none; }\n", REASON.replacement],
  [":focus { outline: none; background: red var(--missing); }\n", REASON.replacement],
  [":focus { outline: none; background: inherit; }\n", REASON.replacement],
  [":focus { outline: none; text-decoration: var(--td); }\n", REASON.replacement],
  [":focus { outline: none; @apply #{$ring}; }\n", REASON.replacement],
  [":focus { outline: none; @apply $ring; }\n", REASON.replacement],
  [":focus { outline: none; border-bottom: 2px solid env(x); }\n", REASON.replacement],
  // [css, reason] - nesting and layers
  [":focus { box-shadow: 0 0 0 2px blue; &.x { outline: none; } }\n", REASON.nested],
  [".a { outline: none; &:focus { outline: none; } }\n", REASON.nested],
  [":focus { @media (min-width: 1px) { box-shadow: 0 0 0 2px blue; &.x { outline: none; } } }\n", REASON.nested],
  ["@layer base { :focus { outline: none; } }\n", REASON.nested],
  [":focus { @layer base { outline: none; } }\n", REASON.nested],
  // [css, reason] - property names
  [":focus { #{$p}: none; }\n", REASON.propertyName],
];

test("closed list: every off-list form is unexaminable with its named reason, never a pass or a finding", async () => {
  for (const [css, reason] of OFF_LIST_FORMS) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [], css);
    assert.equal(r.examined, false, css);
    assert.equal(r.unexaminable.length >= 1, true, css);
    assert.match(r.unexaminable[0].reason, reason, css);
  }
});

test("closed list: deny by default - a generated off-list selector or body is never decided", async () => {
  const selectors = [];
  for (const wrap of [":is(", ":where(", ":not(", ":has(", ":host(", ":nth-child(2 of ", ":matches("]) {
    for (const inner of [":focus", ":focus-visible", ".a:focus", ":focus, .b"]) {
      if (wrap === ":not(" && inner === ":focus-visible") continue; // the decided exemption form
      selectors.push(wrap + inner + ")");
    }
  }
  for (const pseudo of [":custom", ":-webkit-any-link", ":local(.a)", ":focus-ring", ":user-invalid-x", "(.a)", ":hover(.a)"]) selectors.push(":focus" + pseudo);
  for (const dyn of ["%x:focus", ".#{$a}:focus", ":focus.#{$a}", "#{$a}"]) selectors.push(dyn);
  for (const selector of selectors) {
    const css = selector + " { outline: none; }" + "\n";
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [], css);
    assert.equal(r.examined, false, css);
    assert.equal(r.unexaminable.length >= 1, true, css);
  }
  const bodies = [];
  for (const prop of ["box-shadow", "border", "border-color", "background", "background-color", "text-decoration", "outline-offset", "outline-color"]) {
    for (const value of ["var(--x)", "env(x)", "$x", "#{$x}", "calc(1px + 1px)", "min(1px, 2px)", "max(1px, 2px)", "clamp(1px, 2px, 3px)", "none", "0", "initial", "unset", "revert", "inherit", "red !important", "none, none"]) {
      bodies.push("outline: none; " + prop + ": " + value + ";");
    }
  }
  for (const extra of ["all: initial;", "all: revert;", "all: unset;", "all: inherit;", "outline-style: none;", "outline-width: 0;", "outline: none;"]) {
    bodies.push("outline: none; " + extra);
  }
  for (const body of bodies) {
    const css = ":focus { " + body + " }" + "\n";
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [], css);
    assert.equal(r.examined, false, css);
    assert.equal(r.unexaminable.length >= 1, true, css);
  }
});

test("closed list: the repo's fixtures decide as before; only the anchor line moved", async () => {
  // differential against main: the compliant fixture's focus rules are examined and clean, and the
  // never-violations focus finding differs from main only in the line (3 -> 5, the rule head)
  const compliant = await runAudit(fixture("compliant"));
  assert.equal(compliant.detectorsExamined.includes(FOCUS_RULE), true);
  assert.deepEqual(compliant.detectorsUnexaminable.filter((u) => u.rule === FOCUS_RULE), []);
  assert.deepEqual(compliant.findings.filter((f) => f.rule === FOCUS_RULE), []);
  const violations = await runAudit(fixture("never-violations"));
  assert.deepEqual(violations.findings.filter((f) => f.rule === FOCUS_RULE).map((f) => f.evidence[0]), ["styles.css:5"]);
});

test("closed list: properties that cannot be an indicator do not matter", async () => {
  for (const css of [":focus { outline: none; border-radius: var(--r); }\n", ":focus { outline: none; background-position: calc(1px + 1px) 0; }\n", ":focus { outline: none; filter: var(--f); }\n", ":focus { outline: none; --tw-ring-width: $w; }\n", ":focus { outline: none; border-collapse: collapse; border-spacing: 0; }\n"]) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [FOCUS_RULE], css);
    assert.deepEqual(r.unexaminable, [], css);
  }
});

test("closed list: every accepted indicator property compensates; a resetting @at-root inherits nothing; escapes are off the list", async () => {
  for (const css of [
    ":focus { outline: none; border-top: 2px solid red; }\n",
    ":focus { outline: none; border-block-end: 2px solid red; }\n",
    ":focus { outline: none; background-image: url(x.png); }\n",
    ":focus { outline: none; text-decoration-line: underline; }\n",
  ]) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [], css);
    assert.deepEqual(r.unexaminable, [], css);
    assert.equal(r.examined, true, css);
  }
  // a bare @at-root emits the rule at the root: the enclosing rule's shadow is not inherited
  const root = await focusAuditFor(".a { box-shadow: 0 0 2px red; @at-root { :focus { outline: none; } } }\n");
  assert.deepEqual(root.rules.filter((x) => x === FOCUS_RULE), [FOCUS_RULE]);
  assert.deepEqual(root.unexaminable, []);
  const kept = await focusAuditFor(".a:focus { box-shadow: 0 0 2px red; @at-root (without: media) { &.b { outline: none; } } }\n");
  assert.deepEqual(kept.rules.filter((x) => x === FOCUS_RULE), []);
  assert.equal(kept.unexaminable.length >= 1, true);
  // a CSS escape can spell the pseudo-class
  for (const css of [":foc\\75 s { outline: none; }\n", ".a:\\66ocus { outline: none; }\n"]) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [], css);
    assert.equal(r.unexaminable.length >= 1, true, css);
    assert.match(r.unexaminable[0].reason, /CSS escape in the selector/, css);
  }
});

test("closed list: a selector-form @at-root is an inheritance boundary", async () => {
  const r = await focusAuditFor(".a { box-shadow: 0 0 2px red; @at-root :focus { outline: none; } }\n");
  assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [FOCUS_RULE]);
  assert.deepEqual(r.unexaminable, []);
  const q = await focusAuditFor(".a:focus { box-shadow: 0 0 2px red; @at-root (with: rule) { outline: none; } }\n");
  assert.equal(q.unexaminable.length >= 1, true);
});

test("closed list: a rule that encloses a directive is not decided; a non-focus subject is not noise", async () => {
  for (const css of [
    ":focus { outline: none; box-shadow: 0 0 0 2px blue; @if true { box-shadow: none; } }\n",
    ":focus { outline: none; box-shadow: 0 0 0 2px blue; @include reset; }\n",
    ".a { :focus { outline: none; @each $c in x { box-shadow: none; } } }\n",
  ]) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [], css);
    assert.equal(r.examined, false, css);
    assert.equal(r.unexaminable.length >= 1, true, css);
    assert.match(r.unexaminable[0].reason, /control directive or @include inside the rule/, css);
  }
  // a rule whose subject is not focused leaves no record, however its declarations look
  for (const css of [
    ".button:focus .icon { outline: var(--o); }\n",
    ".button:focus .icon { outline: none; outline: 2px solid red; }\n",
    ".button:focus .icon { all: initial; outline-style: none; }\n",
  ]) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [], css);
    assert.deepEqual(r.unexaminable, [], css);
  }
  // so another, clean focus rule in the same file is still examined
  const mixed = await focusAuditFor(".button:focus .icon { outline: var(--o); }\na:focus { outline: none; box-shadow: 0 0 0 2px blue; }\n");
  assert.equal(mixed.examined, true);
  assert.deepEqual(mixed.unexaminable, []);
});

test("closed list: an outline shorthand is a finding or unexaminable unless it positively restores one", async () => {
  // every ordered combination of one to three tokens from a pool that includes the zero/none/auto traps
  const pool = ["0", "0px", "0.0em", ".0rem", "calc(0px)", "thin", "medium", "2px", "none", "auto", "solid", "hidden", "red", "#fff", "var(--c)"];
  const forms = [];
  const walk = (prefix) => {
    if (prefix.length > 0) forms.push(prefix);
    if (prefix.length === 3) return;
    for (const token of pool) if (!prefix.includes(token)) walk([...prefix, token]);
  };
  walk([]);
  // an independent oracle: only a non-zero literal width, a drawn style and at most one colour restore it
  const restores = (tokens) => {
    const width = tokens.filter((x) => /^(\d+\.?\d*|\.\d+)(px|em|rem)$/.test(x) && parseFloat(x) > 0);
    const style = tokens.filter((x) => ["solid", "auto"].includes(x));
    const colour = tokens.filter((x) => ["red", "#fff", "var(--c)"].includes(x));
    return width.length === 1 && style.length === 1 && colour.length <= 1 && width.length + style.length + colour.length === tokens.length;
  };
  const dir = await mkdtemp(path.join(tmpdir(), "uiux-outline-"));
  try {
    await writeFile(path.join(dir, "f.css"), forms.map((tokens) => "a:focus { outline: " + tokens.join(" ") + "; }").join("\n") + "\n");
    const result = await runAudit(dir);
    const lineOf = (evidence) => Number(evidence[0].split(":").pop());
    const found = new Set(result.findings.filter((f) => f.rule === FOCUS_RULE).map((f) => lineOf(f.evidence)));
    const unknown = new Set(result.detectorsUnexaminable.filter((u) => u.rule === FOCUS_RULE).map((u) => lineOf(u.evidence)));
    let restoring = 0;
    forms.forEach((tokens, index) => {
      const line = index + 1;
      const spelled = tokens.join(" ");
      if (restores(tokens)) {
        restoring++;
        assert.equal(found.has(line) || unknown.has(line), false, "restoring form must be silent: " + spelled);
      } else {
        assert.equal(found.has(line) || unknown.has(line), true, "must be a finding or unexaminable, never a pass: " + spelled);
      }
    });
    assert.equal(restoring > 0, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("closed list: perf guards - work is bounded on small hostile inputs (selector cross product, unclosed blocks, deep nesting)", async () => {
  const cases = [
    // 8 nested rules of 8-selector lists: the full cross product is 16M selectors
    ["cross product", Array.from({ length: 8 }, () => ".a1,.a2,.a3,.a4,.a5,.a6,.a7,.a8 {").join("") + ":focus{outline:none;}" + "}".repeat(8), /decided bound/],
    // 60,000 unclosed blocks (120 KB, under the read cap), and 20,000 closed ones
    ["unclosed blocks", "a{".repeat(60000), null],
    ["deep closed nesting", "a{".repeat(20000) + "}".repeat(20000), null],
    // nesting past the bound is not composed
    ["deep nesting", "a{".repeat(40) + ":focus{outline:none;}" + "}".repeat(40), /decided bound/],
  ];
  for (const [name, css, reason] of cases) {
    const dir = await mkdtemp(path.join(tmpdir(), "uiux-perf-"));
    try {
      await writeFile(path.join(dir, "f.scss"), css);
      const started = Date.now();
      // a small heap: an unbounded implementation aborts out of memory instead of finishing
      const run = spawnSync(process.execPath, ["--max-old-space-size=256", path.join(ROOT, "scripts/uiux.mjs"), "audit", dir, "--json"], {
        encoding: "utf8",
        maxBuffer: 1 << 28,
      });
      const elapsed = Date.now() - started;
      assert.equal(run.status, 0, name + " exit " + run.status + " " + String(run.stderr).slice(0, 120));
      assert.equal(elapsed < 8000, true, name + " took " + elapsed + " ms");
      const result = JSON.parse(run.stdout);
      assert.deepEqual(result.findings.filter((f) => f.rule === FOCUS_RULE), [], name);
      if (reason !== null) {
        const u = result.detectorsUnexaminable.filter((x) => x.rule === FOCUS_RULE);
        assert.equal(u.length >= 1, true, name);
        assert.match(u[0].reason, reason, name);
      }
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
});

test("closed list: a comment inside a selector head is off the list; one before it is not", async () => {
  for (const css of [
    ":focus/**/.danger { outline: none; }\n",
    ".a:focus /* c */ .b { outline: none; }\n",
    ":focus,/* c */.a { outline: none; }\n",
    ".x { &:focus/**/.danger { outline: none; } }\n",
  ]) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [], css);
    assert.equal(r.unexaminable.length >= 1, true, css);
    assert.match(r.unexaminable[0].reason, /comment inside the selector/, css);
  }
  // a comment before the head, or after the block, is not inside it
  for (const css of ["/* header */\n:focus { outline: none; }\n", "// note\n:focus { outline: none; } /* tail */\n"]) {
    const r = await focusAuditFor(css, "f.scss");
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [FOCUS_RULE], css);
    assert.deepEqual(r.unexaminable, [], css);
  }
});

test("closed list: a decided branch is not hidden by an off-list branch beside it", async () => {
  for (const css of [
    ":focus, :is(:focus) { outline: none; }\n",
    ":focus, .#{$p} { outline: none; }\n",
    ":focus, %silent { outline: none; }\n",
  ]) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [FOCUS_RULE], css);
    assert.equal(r.unexaminable.length >= 1, true, css);
  }
});

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
