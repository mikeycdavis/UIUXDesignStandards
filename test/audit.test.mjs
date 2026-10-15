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
    // an interpolated selector is still a focus selector
    [".#{$prefix}-button:focus-visible {\n  outline: none;\n}\n", [FOCUS_RULE]],
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

test("ST-07: the finding names the real selector, not the masked text", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "uiux-st07-"));
  try {
    await writeFile(path.join(dir, "f.scss"), "/* h */\n\n.a { color: red; }\n\n.#{$p}-x:focus {\n  outline: none;\n}\n");
    const found = (await runAudit(dir)).findings.filter((f) => f.rule === FOCUS_RULE);
    assert.equal(found.length, 1);
    assert.match(found[0].message, /^'\.#\{\$p\}-x:focus' removes the focus outline/);
  } finally {
    await rm(dir, { recursive: true, force: true });
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
    [".#{$p}-btn:focus { outline: none; }\n", [FOCUS_RULE]],
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
    [":focus { .danger { outline: none; } }\n", [FOCUS_RULE]],
    [":focus { & > .x { outline: none; } }\n", [FOCUS_RULE]],
    [":focus { .a &, .b { outline: none; } }\n", [FOCUS_RULE]],
    [".a, :focus { outline: none; }\n", [FOCUS_RULE]],
    [".a, .b:focus { .c { outline: none; } }\n", [FOCUS_RULE]],
    [".a, .b { &:focus-visible { outline: none; } }\n", [FOCUS_RULE]],
    [".a { .b { &:focus { outline: none; } } }\n", [FOCUS_RULE]],
    [":focus-within { &.x { outline: none; } }\n", [FOCUS_RULE]],
    [":focus { &:hover { outline: none; } }\n", [FOCUS_RULE]],
    [".a { .b { outline: none; } }\n", []],
    [":focus { outline: none; &:hover { color: red; } }\n", [FOCUS_RULE]],
    [":focus { outline: none; &:hover { box-shadow: 0 0 0 2px blue; } }\n", [FOCUS_RULE]],
    [":focus { box-shadow: 0 0 0 2px blue; &.x { outline: none; box-shadow: 0 0 0 2px red; } }\n", []],
    [":focus:not(:focus-visible) { &.x { outline: none; } }\n", []],
    [":focus:not(:focus-visible), .a:focus { outline: none; }\n", [FOCUS_RULE]],
  ];
  for (const [css, rules] of cases) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules, rules, css);
    assert.deepEqual(r.unexaminable, [], css);
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
  assert.deepEqual((await focusAuditFor("@supports selector(:focus-visible) { :focus { outline: none; } }\n")).rules, [FOCUS_RULE]);
  assert.deepEqual((await focusAuditFor(":focus { @media (min-width: 1px) { outline: none; } }\n")).rules, [FOCUS_RULE]);
  assert.deepEqual((await focusAuditFor(":focus { @media (min-width: 1px) { &.x { outline: none; } } }\n")).rules, [FOCUS_RULE]);
  assert.deepEqual((await focusAuditFor("@media (min-width: 1px) { .a { &:focus { outline: none; } } }\n")).rules, [FOCUS_RULE]);
});

test("ST-07: @at-root replaces the ancestor selector, and at-rule names are case-insensitive", async () => {
  // @at-root children are not descendants of the enclosing rule
  assert.deepEqual((await focusAuditFor(":focus { @at-root { .not-focus { outline: none; } } }\n")).rules, []);
  assert.deepEqual((await focusAuditFor(":focus { @at-root (without: media) { .not-focus { outline: none; } } }\n")).rules, [FOCUS_RULE]); // without: media keeps the rule
  assert.deepEqual((await focusAuditFor(":focus { @at-root .not-focus { outline: none; } }\n")).rules, []);
  // ...but a literal & still names the enclosing rule, and @at-root .x:focus is a focus rule itself
  assert.deepEqual((await focusAuditFor(".a { @at-root { &:focus { outline: none; } } }\n")).rules, [FOCUS_RULE]);
  assert.deepEqual((await focusAuditFor(".a { @at-root .b:focus { outline: none; } }\n")).rules, [FOCUS_RULE]);
  // names are lower-cased before every at-rule comparison
  assert.deepEqual((await focusAuditFor(":focus { @MEDIA (min-width: 1px) { outline: none; } }\n")).rules, [FOCUS_RULE]);
  assert.deepEqual((await focusAuditFor(":focus { @Supports (display: grid) { &.x { outline: none; } } }\n")).rules, [FOCUS_RULE]);
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
    ["@supports (display: grid) { @layer base {", "} }"],
    ["@MEDIA print { @container c (min-width: 1px) {", "} }"],
  ];
  for (const [query, resets] of queries) {
    for (const [open, close] of wrappers) {
      // a rule inside: under :focus when the rule is preserved, a plain .not-focus when it is reset
      const rule = `:focus { @at-root ${query} { ${open} .not-focus { outline: none; } ${close} } }\n`;
      const r = await focusAuditFor(rule);
      assert.deepEqual(r.rules, resets ? [] : [FOCUS_RULE], rule);
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
  // before the pseudo-class, or in a later compound, it cannot supply the exemption
  assert.deepEqual((await focusAuditFor(".#{$p}:focus { outline: none; }\n")).rules, [FOCUS_RULE]);
  assert.deepEqual((await focusAuditFor(":focus .#{$p} { outline: none; }\n")).rules, [FOCUS_RULE]);
});

test("ST-07: an unknown span belongs to the block that owns it", async () => {
  // The child's unknown does not make the parent unexaminable; the parent's own declarations are known.
  const parent = await focusAuditFor(":focus { outline: none; &:hover { margin: #{$m}; } }\n");
  assert.deepEqual(parent.rules, [FOCUS_RULE]);
  assert.equal(parent.examined, true);
  assert.deepEqual(parent.unexaminable, []);
  // The child's unknown in a deciding position is the child's alone, and it still disqualifies the rule.
  const child = await focusAuditFor(":focus { outline: none; &:hover { outline: #{$o}; } }\n");
  assert.equal(child.examined, false);
  assert.equal(child.unexaminable.length, 1);
  assert.deepEqual(child.rules, [FOCUS_RULE]);
  // A parent's unknown is not attributed to a clean child.
  const own = await focusAuditFor(":focus { margin: #{$m}; &:hover { color: red; } }\n");
  assert.equal(own.examined, true);
  assert.deepEqual(own.unexaminable, []);
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
