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
    // an interpolated selector is still a focus selector
    [".#{prefix}-button:focus-visible {\n  outline: none;\n}\n", [FOCUS_RULE]],
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
    await writeFile(path.join(dir, "f.scss"), "/* h */\n\n.a { color: red; }\n\n.#{p}-x:focus {\n  outline: none;\n}\n");
    const found = (await runAudit(dir)).findings.filter((f) => f.rule === FOCUS_RULE);
    assert.equal(found.length, 1);
    assert.match(found[0].message, /^'\.#\{p\}-x:focus' removes the focus outline/);
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
    [".#{p}-btn:focus { outline: none; }\n", [FOCUS_RULE]],
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
  // a double negation selects focused elements again; a negation beside a focus pseudo does not hide it
  for (const css of [
    ":not(:not(:focus)) { outline: none; }\n",
    ":focus:not(.disabled) { outline: none; }\n",
    ".a:not(.b):focus { outline: none; }\n",
  ]) {
    assert.deepEqual((await focusAuditFor(css)).rules, [FOCUS_RULE], css);
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
    ".parent:has(:focus) { outline: none; }\n",
    ".parent:has(:focus-visible, .x) { outline: none; }\n",
    ".parent:has(:not(:focus)) { outline: none; }\n",
  ]) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), [], css);
  }
  // :is/:where are transparent: the subject is the focused element
  assert.deepEqual((await focusAuditFor(":is(:focus) { outline: none; }\n")).rules, [FOCUS_RULE]);
  assert.deepEqual((await focusAuditFor(".a:has(.b):focus { outline: none; }\n")).rules, [FOCUS_RULE]);
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
  assert.deepEqual((await focusAuditFor(":focus { @at-root (without: media) { .not-focus { outline: none; } } }\n")).rules.filter((x) => x === FOCUS_RULE), [FOCUS_RULE]); // without: media keeps the rule
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
    ":focus { @custom state { .x { outline: none; } } }\n",
  ]) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), [FOCUS_RULE], css);
  }
  // not under a focus rule: nothing to report
  assert.deepEqual((await focusAuditFor(".a { @custom state { outline: none; } }\n")).rules.filter((x) => x === FOCUS_RULE), []);
  // a keyframes/font-face between the rule and the generic at-rule still breaks the context
  assert.deepEqual((await focusAuditFor(":focus { @keyframes k { @custom s { from { outline: none; } } } }\n")).rules.filter((x) => x === FOCUS_RULE), []);
});

test("ST-07: Sass null interpolates to nothing; the string \"null\" does not", async () => {
  for (const css of [
    ":focus#{null} { outline: none; }\n",
    ":focus#{ null } { outline: none; }\n",
    ":focus { outline: none#{null}; }\n",
    ":focus#{null}#{null} { outline: none; }\n",
  ]) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [FOCUS_RULE], css);
  }
  // a readable safe sibling does not mask it
  assert.deepEqual(
    (await focusAuditFor(":focus-visible { outline: 2px solid; }\n:focus#{null} { outline: none; }\n")).rules.filter((x) => x === FOCUS_RULE),
    [FOCUS_RULE],
  );
  // the quoted string "null" is the text null: :focusnull is not a focus selector
  assert.deepEqual((await focusAuditFor(':focus#{"null"} { outline: none; }\n')).rules.filter((x) => x === FOCUS_RULE), []);
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
  for (const css of [":FOCUS { outline: none; }\n", ":Focus-Visible { outline: none; }\n", ":NOT(:NOT(:FOCUS)) { outline: none; }\n"]) {
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
  // in a later compound it cannot
  assert.deepEqual((await focusAuditFor(":focus .#{$p} { outline: none; }\n")).rules.filter((x) => x === FOCUS_RULE), [FOCUS_RULE]);
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

test("ST-07: a custom property is a declaration whatever token follows its colon", async () => {
  for (const css of [
    ":focus { --theme:foo { outline: none; }; }\n",
    ":focus { --theme:func({ outline: none; }); }\n",
    ":focus { --theme:foo bar { outline: none; }; }\n",
    ":focus { --Theme :x { outline: none; }; }\n",
  ]) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [], css);
  }
  // an ordinary pseudo-class selector is still a rule
  assert.deepEqual((await focusAuditFor(".a { a:hover { outline: none; } :focus { outline: none; } }\n")).rules, [FOCUS_RULE]);
});

test("ST-07: a same-element nested rule inherits the replacement indicators of the rules it is attached to", async () => {
  const cases = [
    // the parent's ring still applies to the focused .danger element
    [":focus { box-shadow: 0 0 0 2px blue; &.danger { outline: none; } }\n", []],
    [":focus { @apply ring-2; &.danger { outline: none; } }\n", []],
    [":focus { box-shadow: 0 0 0 2px blue; &:hover { outline: none; } }\n", []],
    [":focus { box-shadow: 0 0 0 2px blue; &[data-x] { &.y { outline: none; } } }\n", []],
    [":focus { box-shadow: 0 0 0 2px blue; @media (min-width: 1px) { &.a { outline: none; } } }\n", []],
    // a parent's ring does not reach a different element
    [":focus { box-shadow: 0 0 0 2px blue; .child { outline: none; } }\n", [FOCUS_RULE]],
    [":focus { box-shadow: 0 0 0 2px blue; & .child { outline: none; } }\n", [FOCUS_RULE]],
    [":focus { box-shadow: 0 0 0 2px blue; & > .child { outline: none; } }\n", [FOCUS_RULE]],
    [":focus { box-shadow: 0 0 0 2px blue; &::before { outline: none; } }\n", [FOCUS_RULE]],
    [":focus { box-shadow: 0 0 0 2px blue; &.a, .b { outline: none; } }\n", [FOCUS_RULE]],
    // a parent shadow that is present unfocused is not a focus indicator
    [".btn { box-shadow: 0 0 0 2px blue; &:focus { outline: none; } } ", [FOCUS_RULE]],
    [".btn { box-shadow: 0 0 0 2px blue; &:focus { &.x { outline: none; } } } ", [FOCUS_RULE]],
    [":focus, .b { box-shadow: 0 0 0 2px blue; &.x { outline: none; } } ", []],
    // a parent without a replacement gives the child nothing
    [":focus { color: red; &.danger { outline: none; } }\n", [FOCUS_RULE]],
    // @at-root with a query that drops rules detaches the subject
    [":focus { box-shadow: 0 0 0 2px blue; @at-root { &.a { outline: none; } } }\n", [FOCUS_RULE]],
  ];
  for (const [css, expected] of cases) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), expected, css);
  }
});

test("ST-07: a static interpolation that begins a pseudo-class name is not read as split", async () => {
  // `:#{focus}-visible` is `:focus-visible`; fixed-length resolution cannot spell it, so it is
  // unknown - never read as whitespace-separated text - and a block that removes the outline is
  // unexaminable, so a sibling that is safe cannot let the rule pass.
  for (const head of [":#{focus}-visible", "a:#{focus}-within", ":#{focus}-#{visible}"]) {
    const r = await focusAuditFor(`${head} { outline: none; }\n:focus { outline: none; box-shadow: 0 0 0 2px blue; }\n`);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [], head);
    assert.equal(r.unexaminable.length >= 1, true, head);
    assert.equal(r.examined, false, head);
  }
  // a whole-name interpolation is readable and a real finding; so is one elsewhere
  assert.deepEqual((await focusAuditFor(":#{focus} { outline: none; }\n")).rules, [FOCUS_RULE]);
  assert.deepEqual((await focusAuditFor(".#{prefix}-btn:focus { outline: none; }\n")).rules, [FOCUS_RULE]);
  assert.deepEqual((await focusAuditFor(":focus { outline:#{none}; }\n")).rules, [FOCUS_RULE]);
});

test("ST-07: a partly interpolated at-rule name is the unknown name", async () => {
  for (const css of [
    ":focus { @-#{$vendor}-keyframes spin { from { outline: none; } } }\n",
    ":focus { @#{$name} spin { from { outline: none; } } }\n",
    ":focus { @med#{$x} { outline: none; } }\n",
  ]) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [], css);
  }
});

test("ST-07: a replacement declared inside a group at-rule covers a same-element rule inside it", async () => {
  const cases = [
    [":focus { @media (min-width: 1px) { box-shadow: 0 0 0 2px blue; &.x { outline: none; } } }\n", []],
    [":focus { @supports (display: grid) { @apply ring-2; &:hover { outline: none; } } }\n", []],
    // a sibling rule of the at-rule, or an unfocused enclosing rule, does not carry it
    [":focus { @media (min-width: 1px) { box-shadow: 0 0 0 2px blue; } &.x { outline: none; } }\n", [FOCUS_RULE]],
    [".btn { @media (min-width: 1px) { box-shadow: 0 0 0 2px blue; &:focus { outline: none; } } }\n", [FOCUS_RULE]],
  ];
  for (const [css, expected] of cases) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), expected, css);
  }
});

test("ST-07: a child's own ring utilities come after the ones it inherits", async () => {
  const cases = [
    [":focus { @apply ring-2; &.danger { outline: none; @apply ring-0; } }\n", [FOCUS_RULE]],
    [":focus { @apply ring-0; &.danger { outline: none; @apply ring-2; } }\n", []],
    [":focus { @apply ring-2; &.a { &.b { outline: none; @apply ring-0; } } }\n", [FOCUS_RULE]],
    [":focus { @apply ring-2 !important; &.danger { outline: none; @apply ring-0; } }\n", []],
  ];
  for (const [css, expected] of cases) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), expected, css);
  }
});

test("ST-07: a subject-preserving functional nesting carries the parent's replacement", async () => {
  const cases = [
    [":focus { box-shadow: 0 0 0 2px blue; :is(&) { outline: none; } }\n", []],
    [":focus { box-shadow: 0 0 0 2px blue; .x:where(&) { outline: none; } }\n", []],
    [":focus { box-shadow: 0 0 0 2px blue; :is(&.a, &:hover) { outline: none; } }\n", []],
    [":focus { box-shadow: 0 0 0 2px blue; & { outline: none; } }\n", []],
    // an alternative that is not the parent's subject, or any other wrapper, does not carry it

    [":focus { box-shadow: 0 0 0 2px blue; :is(& .c) { outline: none; } }\n", [FOCUS_RULE]],
    [":focus { box-shadow: 0 0 0 2px blue; :is(&)::before { outline: none; } }\n", [FOCUS_RULE]],
    [":focus { box-shadow: 0 0 0 2px blue; &.x::after { outline: none; } }\n", [FOCUS_RULE]],
  ];
  for (const [css, expected] of cases) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), expected, css);
  }
});

test("ST-07: an unreadable inherited replacement makes the same-element child unexaminable", async () => {
  for (const css of [
    ":focus { @apply #{$ring}; &.danger { outline: none; } }\n",
    ":focus { box-shadow: #{$s}; &.danger { outline: none; } }\n",
    ":focus { #{$p}: 0 0 0 2px blue; &:hover { outline: none; } }\n",
    ":focus { @apply #{$ring}; @media (min-width: 1px) { &.danger { outline: none; } } }\n",
  ]) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [], css);
    assert.equal(r.unexaminable.length >= 1, true, css);
  }
  // an unknown that cannot decide the answer is not inherited as one
  assert.deepEqual((await focusAuditFor(":focus { margin: #{$m}; &.danger { outline: none; } }\n")).rules, [FOCUS_RULE]);
});

test("ST-07: a static interpolation that names a functional pseudo-class is unknown, not padded", async () => {
  // `:#{not}(:focus)` is `:not(:focus)`: a selector that excludes focused elements, which padding would
  // have turned into `:not   (:focus)` and reported as a focus rule.
  for (const css of [
    ":#{not}(:focus) { outline: none; }\n",
    ":#{not}(:focus-visible) { outline: none; }\n",
    "a:#{not}(:focus) { outline: none; }\n",
  ]) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [], css);
  }
  // a readable spelling of the same selector is still read
  assert.deepEqual((await focusAuditFor(":not(:focus) { outline: none; }\n")).rules, []);
  assert.deepEqual((await focusAuditFor(":focus:not(.x) { outline: none; }\n")).rules, [FOCUS_RULE]);
});

test("ST-07: a same-element child that disables an inherited replacement removes it", async () => {
  const cases = [
    [":focus { border: 2px solid blue; &:focus { outline: none; border-style: none; } }\n", [FOCUS_RULE]],
    [":focus { border: 2px solid blue; &.x { outline: none; border-width: 0; } }\n", [FOCUS_RULE]],
    [":focus { border: 2px solid blue; &.x { outline: none; border-top-style: none; } }\n", []],
    [":focus { outline: none; border: 2px solid blue; border-style: none; border-style: solid; }\n", []],
    [":focus { outline: none; border: 2px solid blue; border-style: solid; border-style: none; }\n", [FOCUS_RULE]],
    [":focus { outline: none; border-bottom: 2px solid blue; border-top-style: none; }\n", []],
    [":focus { outline: none; border-bottom: 2px solid blue; border-bottom-style: none; }\n", [FOCUS_RULE]],
    [":focus { outline: none; border-bottom: 2px solid blue; border-width: 0; }\n", [FOCUS_RULE]],
    [":focus { outline: none; border: 0; border-style: solid; border-color: red; }\n", [FOCUS_RULE]],
    [":focus { outline: none; border-radius: 0; border: 2px solid blue; }\n", []],
    [":focus { outline: none; box-shadow: 0 0 0 2px blue; border-radius: 0; }\n", []],
    [":focus { outline: none; border: 2px solid blue; border-radius: 0; }\n", []],
    [":focus { outline: none; box-shadow: none; box-shadow: 0 0 0 2px blue; }\n", []],
    [":focus { outline: none; box-shadow: 0 0 0 2px blue; box-shadow: none; }\n", [FOCUS_RULE]],
    [":focus { box-shadow: 0 0 0 2px blue; &.a { box-shadow: none; &.b { outline: none; } } }\n", [FOCUS_RULE]],
    // a sibling's override does not reach, and a re-enabling inner declaration restores it
    [":focus { box-shadow: 0 0 0 2px blue; &.a { box-shadow: none; } &.b { outline: none; } }\n", []],
    // the style facet stays off: a colour does not bring the border back, a style does
    [":focus { border: 2px solid blue; &.x { border-style: none; &.y { outline: none; border-color: red; } } }\n", [FOCUS_RULE]],
    [":focus { border: 2px solid blue; &.x { border-style: none; &.y { outline: none; border-style: solid; } } }\n", []],
    [":focus { border: 2px solid blue; border-style: none; &.danger { outline: none; } }\n", [FOCUS_RULE]],
    [":focus { box-shadow: none; box-shadow: 0 0 0 2px blue; &.danger { outline: none; } }\n", []],
    [":focus { border: 2px solid blue; &.danger { outline: none; all: initial; } }\n", [FOCUS_RULE]],
    [":focus { box-shadow: 0 0 0 2px blue; &.danger { outline: none; all: unset; } }\n", [FOCUS_RULE]],
    [":focus { border: 2px solid blue; &.danger { outline: none; all: inherit; } }\n", []],
    [":focus { border: 2px solid blue !important; &.danger { outline: none; border-style: none; } }\n", []],
    [":focus { border: 2px solid blue !important; &.danger { outline: none; border-style: none !important; } }\n", [FOCUS_RULE]],
    [":focus { border: 2px solid blue; &.danger { outline: none; border-style: none !important; } }\n", [FOCUS_RULE]],
    // one to four values are top, right, bottom, left
    [":focus { border: 2px solid blue; &.x { outline: none; border-width: 0 0 0 0; } }\n", [FOCUS_RULE]],
    [":focus { border: 2px solid blue; &.x { outline: none; border-width: 0 0 2px 0; } }\n", []],
    [":focus { border: 2px solid blue; &.x { outline: none; border-style: none none; } }\n", [FOCUS_RULE]],
    [":focus { border: 2px solid blue; &.x { outline: none; border-style: none solid; } }\n", []],
    [":focus { border-bottom: 2px solid blue; &.x { outline: none; border-width: 0 0 0 0; } }\n", [FOCUS_RULE]],
    [":focus { border-bottom: 2px solid blue; &.x { outline: none; border-width: 0 0 2px; } }\n", []],
    [":focus { outline: none; background: red; background-image: none; }\n", []],
    [":focus { outline: none; background: red; background-color: transparent; }\n", [FOCUS_RULE]],
    [":focus { outline: none; background: red; background-color: transparent; background-image: none; }\n", [FOCUS_RULE]],
    [":focus { outline: none; background-image: none; background: red; }\n", []],
    [":focus { outline: none; background: none; }\n", [FOCUS_RULE]],
    [":focus { outline: none; background: url(bg.png); background-image: none; }\n", [FOCUS_RULE]],
    [":focus { outline: none; background: url(bg.png); }\n", []],
    [":focus { outline: none; background: url(bg.png) no-repeat center / cover red; background-image: none; }\n", []],
    [":focus { outline: none; background: no-repeat center; }\n", [FOCUS_RULE]],
    // an inherited indicator of another family is untouched
    [":focus { border: 2px solid blue; box-shadow: 0 0 0 2px blue; &.x { outline: none; border-style: none; } }\n", []],
  ];
  for (const [css, expected] of cases) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), expected, css);
  }
});

test("ST-07: indicators and disablers are resolved by importance, specificity and source position", async () => {
  const cases = [
    // a parent declaration written AFTER an equally specific nested rule is later, so it wins
    [":focus { & { outline: none; box-shadow: 0 0 0 2px blue; } box-shadow: none; }\n", [FOCUS_RULE]],
    [":focus { box-shadow: none; & { outline: none; box-shadow: 0 0 0 2px blue; } }\n", []],
    // a more specific nested rule wins whatever the order
    [":focus { &.x { outline: none; box-shadow: 0 0 0 2px blue; } box-shadow: none; }\n", []],
    // :where(&) has zero specificity: the parent's more specific indicator survives it
    [":focus { border: 2px solid blue; :where(&) { outline: none; border-style: none; } }\n", []],
    [":focus { border: 2px solid blue; :is(&) { outline: none; border-style: none; } }\n", [FOCUS_RULE]],
    [":focus { border: 2px solid blue; &:hover { outline: none; border-style: none; } }\n", [FOCUS_RULE]],
    // equal specificity: the later declaration wins, in either direction
    [":focus { border-style: none; & { outline: none; border: 2px solid blue; } }\n", []],
    [":focus { border: 2px solid blue; & { outline: none; border-style: none; } }\n", [FOCUS_RULE]],
    // ring utilities take part in the same cascade
    [":focus { & { outline: none; @apply ring-2; } @apply ring-0; }\n", [FOCUS_RULE]],
    [":focus { @apply ring-0; & { outline: none; @apply ring-2; } }\n", []],
    [":focus { & { outline: none; @apply ring-2; } @apply ring-0 !important; &.x { margin: 0; } }\n", [FOCUS_RULE]],
  ];
  for (const [css, expected] of cases) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), expected, css);
  }
});

test("ST-07: a cascade the detector cannot decide is unexaminable, never a guess", async () => {
  // a selector list gives the nested rule two specificities; one of them ties with the parent
  for (const css of [
    ":focus { border: 2px solid blue; &, &.x { outline: none; border-style: none; } }\n",
    ":focus, .a:focus { border: 2px solid blue; & { outline: none; border-style: none; } }\n",
    ":focus, .a.b:focus { border: 2px solid blue; &.x { outline: none; border-style: none; } }\n",
  ]) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [], css);
    assert.equal(r.unexaminable.length >= 1, true, css);
  }
});

test("ST-07: a Sass placeholder is neither a finding nor a pass: an extension may be in another file", async () => {
  for (const css of [
    ":focus { %silent { outline: none; } }\n",
    "%silent:focus { outline: none; }\n",
    ".a { %x { :focus { outline: none; } } }\n",
  ]) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [], css);
    assert.equal(r.unexaminable.length >= 1, true, css);
  }
  // a placeholder that removes nothing is silent
  assert.deepEqual((await focusAuditFor("%x:focus { color: red; }\n")).unexaminable, []);
  // extended in the same file: what it becomes is not modelled either
  const extended = await focusAuditFor("%ring:focus { outline: none; }\n.btn { @extend %ring; }\n");
  assert.deepEqual(extended.rules.filter((x) => x === FOCUS_RULE), []);
  assert.equal(extended.unexaminable.length >= 1, true);
  // a percentage is not a placeholder
  assert.deepEqual((await focusAuditFor("@keyframes k { 50% { outline: none; } }\n:focus { outline: none; }\n")).rules.filter((x) => x === FOCUS_RULE), [FOCUS_RULE]);
});

test("ST-07: a selector list is carried branch by branch", async () => {
  const cases = [
    [":focus, .other { box-shadow: 0 0 0 2px blue; &.danger { outline: none; } }\n", []],
    [".other, :focus { box-shadow: 0 0 0 2px blue; &.danger { outline: none; } }\n", []],
    // the branch that comes from the unfocused parent selector has only an always-present shadow
    [":focus, .other { box-shadow: 0 0 0 2px blue; &:focus { outline: none; } }\n", [FOCUS_RULE]],
    [".other { box-shadow: 0 0 0 2px blue; &:focus { outline: none; } }\n", [FOCUS_RULE]],
  ];
  for (const [css, expected] of cases) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), expected, css);
  }
});

test("ST-07: an unknown branch beside a readable focus branch is unexaminable", async () => {
  for (const css of [
    ":focus:not(:focus-visible), #{$sel} { outline: none; }\n",
    ":focus { outline: none; box-shadow: 0 0 0 2px blue; }\n.a, #{$sel} { outline: none; }\n",
  ]) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [], css);
    assert.equal(r.unexaminable.length >= 1, true, css);
  }
});

test("ST-07: an established violation survives an unknown branch; a changed writing mode leaves logical borders undecided", async () => {
  const r = await focusAuditFor(":focus, #{$sel} { outline: none; }\n");
  assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [FOCUS_RULE]);
  assert.equal(r.unexaminable.length >= 1, true);
  const w = await focusAuditFor(":focus { writing-mode: vertical-rl; border-bottom: 2px solid blue; &.x { outline: none; border-block-width: 0 0; } }\n");
  assert.deepEqual(w.rules.filter((x) => x === FOCUS_RULE), []);
  assert.equal(w.unexaminable.length >= 1, true);
});

test("ST-07: a logical border declaration is never mapped on an assumed writing mode", async () => {
  for (const css of [
    ":focus { border-bottom: 2px solid blue; &.x { outline: none; border-block-width: 0 0; } }\n",
    ":focus { border-bottom: 2px solid blue; &.x { outline: none; border-inline-width: 0; } }\n",
    ":focus { outline: none; border-block-start: 2px solid blue; }\n",
  ]) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [], css);
    assert.equal(r.unexaminable.length >= 1, true, css);
  }
});

test("ST-07: only colour functions enable a background shorthand's colour; nth-child 'of' counts in specificity", async () => {
  const cases = [
    [":focus { outline: none; background: url(bg.png) center / calc(100% - 10px) auto; background-image: none; }\n", [FOCUS_RULE]],
    [":focus { outline: none; background: rgb(0 0 0 / 50%) url(bg.png); background-image: none; }\n", []],
    [".p:focus { border: 2px solid blue; :where(&):nth-child(2 of .bar) { outline: none; border-style: none; } }\n", [FOCUS_RULE]],
    [".p:focus { border: 2px solid blue; :where(&):nth-child(2) { outline: none; border-style: none; } }\n", []],
  ];
  for (const [css, expected] of cases) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), expected, css);
  }
});

test("ST-07: revert-layer resets like the other CSS-wide values; ancestor constraints keep the subject", async () => {
  const cases = [
    [":focus { box-shadow: 0 0 0 2px blue; &.danger { all: revert-layer; outline: none; } }\n", [FOCUS_RULE]],
    [":focus { box-shadow: 0 0 0 2px blue; &.danger { outline: none; box-shadow: revert-layer; } }\n", [FOCUS_RULE]],
    [":focus { outline: none; box-shadow: 0 0 0 2px blue; box-shadow: revert-layer; }\n", [FOCUS_RULE]],
    [":focus { box-shadow: 0 0 0 2px blue; .wrapper & { outline: none; } }\n", []],
    [":focus { box-shadow: 0 0 0 2px blue; .a > .b & { outline: none; } }\n", []],
    [":focus { box-shadow: 0 0 0 2px blue; & .wrapper { outline: none; } }\n", [FOCUS_RULE]],
    [":focus { box-shadow: 0 0 0 2px blue; .wrapper & .x { outline: none; } }\n", [FOCUS_RULE]],
  ];
  for (const [css, expected] of cases) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), expected, css);
  }
});

test("ST-07: a selector list is judged branch by branch: unknown and placeholder branches do not hide a readable violation", async () => {
  for (const css of [
    ":focus, :focus#{$state} { outline: none; }\n",
    ":focus, #{$sel}:focus { outline: none; }\n",
    ":focus, %silent { outline: none; }\n",
    "%silent, :focus-visible { outline: none; }\n",
  ]) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [FOCUS_RULE], css);
    assert.equal(r.unexaminable.length >= 1, true, css);
  }
  // the readable branch is exempt: nothing is established, and the unknown one keeps it undecided
  for (const css of [
    ":focus:not(:focus-visible), :focus#{$state} { outline: none; }\n",
    ":focus:not(:focus-visible), %silent { outline: none; }\n",
  ]) {
    const r = await focusAuditFor(css);
    assert.deepEqual(r.rules.filter((x) => x === FOCUS_RULE), [], css);
    assert.equal(r.unexaminable.length >= 1, true, css);
    assert.equal(r.examined, false, css);
  }
});

test("ST-07: a negation filter keeps the subject; a placeholder inside a compound is a placeholder", async () => {
  const cases = [
    [":focus { box-shadow: 0 0 0 2px blue; &:not(.disabled) { outline: none; } }\n", []],
    [":focus { box-shadow: 0 0 0 2px blue; .a &:not(.disabled):hover { outline: none; } }\n", []],
    [":focus { box-shadow: 0 0 0 2px blue; :not(.x) { outline: none; } }\n", [FOCUS_RULE]],
    [":focus { box-shadow: 0 0 0 2px blue; &:not(&.x) { outline: none; } }\n", []],
    ["button%silent:focus { outline: none; }\n", []],
    [".a%x:focus, .b:focus { outline: none; }\n", [FOCUS_RULE]],
    ["@keyframes k { 50% { outline: none; } }\n:focus { outline: none; }\n", [FOCUS_RULE]],
  ];
  for (const [css, expected] of cases) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), expected, css);
  }
  assert.equal((await focusAuditFor("button%silent:focus { outline: none; }\n")).unexaminable.length >= 1, true);
});

test("ST-07: cascade layers are not resolved; background: inherit may be visible", async () => {
  const layered = await focusAuditFor(":focus { box-shadow: 0 0 0 2px blue; @layer foo { outline: none; box-shadow: none; } }\n");
  assert.deepEqual(layered.rules.filter((x) => x === FOCUS_RULE), []);
  assert.equal(layered.unexaminable.length >= 1, true);
  assert.deepEqual((await focusAuditFor(":focus { outline: none; background: inherit; }\n")).rules.filter((x) => x === FOCUS_RULE), []);
  assert.deepEqual((await focusAuditFor(":focus { outline: none; background: initial; }\n")).rules.filter((x) => x === FOCUS_RULE), [FOCUS_RULE]);
});

test("ST-07: declarations that share a cascade layer are resolved; a negation list may mix the parent and filters", async () => {
  const cases = [
    [":focus { @layer foo { outline: none; box-shadow: 0 0 0 2px blue; box-shadow: none; } }\n", [FOCUS_RULE]],
    [":focus { @layer foo { outline: none; box-shadow: none; box-shadow: 0 0 0 2px blue; } }\n", []],
    [":focus { box-shadow: 0 0 0 2px blue; :not(:not(&), .disabled) { outline: none; } }\n", []],
    [":focus { box-shadow: 0 0 0 2px blue; :not(.a, .b) { outline: none; } }\n", [FOCUS_RULE]],
    [":focus { box-shadow: 0 0 0 2px blue; :not(&, .disabled) { outline: none; } }\n", []],
  ];
  for (const [css, expected] of cases) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), expected, css);
  }
});

test("ST-07: an unknown value matters only if it can survive the cascade", async () => {
  const cases = [
    // overridden afterwards: the unknown cannot be the winner
    [":focus { outline: none; box-shadow: #{$maybe}; box-shadow: none !important; }\n", [FOCUS_RULE]],
    [":focus { outline: none; @apply #{$ring}; @apply ring-0 !important; }\n", [FOCUS_RULE]],
    // not overridden: undecided
    [":focus { outline: none; box-shadow: none; box-shadow: #{$maybe}; }\n", "unexaminable"],
    [":focus { outline: none; @apply #{$ring}; }\n", "unexaminable"],
    [":focus { outline: none; border: #{$b}; }\n", "unexaminable"],
    // an unknown that cannot be an indicator never mattered
    [":focus { outline: none; margin: #{$m}; }\n", [FOCUS_RULE]],
  ];
  for (const [css, expected] of cases) {
    const r = await focusAuditFor(css);
    const found = r.rules.filter((x) => x === FOCUS_RULE);
    if (expected === "unexaminable") {
      assert.deepEqual(found, [], css);
      assert.equal(r.unexaminable.length >= 1, true, css);
    } else assert.deepEqual(found, expected, css);
  }
  // a filter that is itself parent-qualified may sit beside the doubled reference
  for (const css of [
    ":focus { box-shadow: 0 0 0 2px blue; :not(:not(&), &.disabled) { outline: none; } }\n",
    ":focus { box-shadow: 0 0 0 2px blue; :not(&.a, :not(&)) { outline: none; } }\n",
  ]) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), [], css);
  }
});

test("ST-07: an interpolated background shorthand is unknown; :is() lists may mix the parent with other elements", async () => {
  const unknown = await focusAuditFor(":focus { outline: none; background: #{$maybe}; }\n");
  assert.deepEqual(unknown.rules.filter((x) => x === FOCUS_RULE), []);
  assert.equal(unknown.unexaminable.length >= 1, true);
  const cases = [
    [":focus { box-shadow: 0 0 0 2px blue; :is(&, .special) { outline: none; } }\n", []],
    [":focus { box-shadow: 0 0 0 2px blue; :is(&.a, .special .b) { outline: none; } }\n", []],
    // another focus selector is a different rule; a second reference that is not the parent is not allowed
    [".btn:focus { box-shadow: 0 0 0 2px blue; :is(&, .a:focus) { outline: none; } }\n", [FOCUS_RULE]],
    [":focus { box-shadow: 0 0 0 2px blue; :is(&, & .x) { outline: none; } }\n", [FOCUS_RULE]],
    [":focus { box-shadow: 0 0 0 2px blue; :is(.a, .b) { outline: none; } }\n", [FOCUS_RULE]],
  ];
  for (const [css, expected] of cases) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), expected, css);
  }
});

test("ST-07: a constrained parent does not carry its indicator to other elements of an :is() list; interpolated importance is unknown", async () => {
  const cases = [
    [".btn:focus { box-shadow: 0 0 0 2px blue; :is(&, .special) { outline: none; } }\n", [FOCUS_RULE]],
    [".btn:focus { box-shadow: 0 0 0 2px blue; :is(&.a, &.b) { outline: none; } }\n", []],

    ["*:focus { box-shadow: 0 0 0 2px blue; :is(&, .special) { outline: none; } }\n", []],
  ];
  for (const [css, expected] of cases) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), expected, css);
  }
  const important = await focusAuditFor(":focus { outline: none; background: red !important; background: #{$maybe}; }\n");
  assert.deepEqual(important.rules.filter((x) => x === FOCUS_RULE), []);
  assert.equal(important.unexaminable.length >= 1, true);
});

test("ST-07: a negated parent reference may narrow an anchored subject; :host() arguments count in specificity", async () => {
  const cases = [
    [":focus { box-shadow: 0 0 0 2px blue; &:not(&.disabled) { outline: none; } }\n", []],
    [":focus { box-shadow: 0 0 0 2px blue; :not(&.disabled) { outline: none; } }\n", []],
    [":host(.x):focus { box-shadow: 0 0 0 2px blue; :where(&).a.a { outline: none; box-shadow: none; } }\n", []],
    [":host-context(.t):focus { box-shadow: 0 0 0 2px blue; :where(&).a.a { outline: none; box-shadow: none; } }\n", []],
    [".x:focus { box-shadow: 0 0 0 2px blue; :where(&).a.a { outline: none; box-shadow: none; } }\n", [FOCUS_RULE]],
    [":host:focus { box-shadow: 0 0 0 2px blue; :where(&).a.a.a { outline: none; box-shadow: none; } }\n", [FOCUS_RULE]],
  ];
  for (const [css, expected] of cases) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), expected, css);
  }
});

test("ST-07: border shorthands are read as width, style and colour; unmodelled unknowns are resolved by later declarations", async () => {
  const cases = [
    [":focus { border: 2px solid blue; &.x { outline: none; border: 0 solid red; } }\n", [FOCUS_RULE]],
    [":focus { border: 2px solid blue; &.x { outline: none; border: 2px dotted red; } }\n", []],
    [":focus { outline: none; border: 2px blue; }\n", [FOCUS_RULE]],
    [":focus { outline: none; border: solid; }\n", []],
    [":focus { outline: none; border-bottom: 3px double; }\n", []],
    [":focus { outline: none; border: 0; }\n", [FOCUS_RULE]],
    [":focus { outline: none; border: none; border: 1px solid red; }\n", []],
    [":focus { filter: #{$maybe}; filter: none !important; outline: none; }\n", [FOCUS_RULE]],
    [":focus { filter: none !important; filter: #{$maybe}; outline: none; }\n", "unexaminable"],
    [":focus { outline: none; filter: #{$maybe}; }\n", "unexaminable"],
  ];
  for (const [css, expected] of cases) {
    const r = await focusAuditFor(css);
    const found = r.rules.filter((x) => x === FOCUS_RULE);
    if (expected === "unexaminable") {
      assert.deepEqual(found, [], css);
      assert.equal(r.unexaminable.length >= 1, true, css);
    } else assert.deepEqual(found, expected, css);
  }
});

test("ST-07: variable border shorthands are not defaulted; paint() is a background image", async () => {
  const cases = [
    [":focus { --focus-border: 2px solid blue; outline: none; border: var(--focus-border); }\n", []],
    [":focus { outline: none; border: 2px var(--s) blue; }\n", []],
    [":focus { outline: none; background: paint(focus-ring); }\n", []],
    [":focus { outline: none; background: element(#ring); }\n", []],
    [":focus { outline: none; border: 0 solid var(--color); }\n", [FOCUS_RULE]],
    [":focus { outline: none; border: 2px solid var(--color); }\n", []],
    [":focus { outline: none; border: 2px var(--style) red; }\n", []],
    [":focus { outline: none; border: none var(--w); }\n", [FOCUS_RULE]],
    [":focus { outline: none; border: 0 solid #{$c}; }\n", [FOCUS_RULE]],
    [":focus { outline: none; background: paint(focus-ring); background-image: none; }\n", [FOCUS_RULE]],
  ];
  for (const [css, expected] of cases) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), expected, css);
  }
});

test("ST-07: var()/env() are unresolved; every zero length is zero; unknown importance varies per declaration", async () => {
  const cases = [
    [":focus { --focus-border: none; outline: none; border: var(--focus-border); }\n", "unexaminable"],
    [":focus { outline: none; box-shadow: var(--ring); }\n", "unexaminable"],
    [":focus { outline: none; box-shadow: var(--ring); box-shadow: none; }\n", [FOCUS_RULE]],
    [":focus { outline: none; border: 0.00px solid red; }\n", [FOCUS_RULE]],
    [":focus { outline: none; border: 0em solid red; }\n", [FOCUS_RULE]],
    [":focus { outline: none; border: .0rem solid red; }\n", [FOCUS_RULE]],
    [":focus { outline: none; border: 0.5px solid red; }\n", []],
    [":focus { outline: none; border: 2px solid red #{$a}; border: 0 solid red #{$b}; }\n", "unexaminable"],
  ];
  for (const [css, expected] of cases) {
    const r = await focusAuditFor(css);
    const found = r.rules.filter((x) => x === FOCUS_RULE);
    if (expected === "unexaminable") {
      assert.deepEqual(found, [], css);
      assert.equal(r.unexaminable.length >= 1, true, css);
    } else assert.deepEqual(found, expected, css);
  }
});

test("ST-07: an unresolved all reset takes part in the cascade; a doubled negation list is an :is() list", async () => {
  const cases = [
    [":focus { outline: none; box-shadow: 0 0 0 2px blue; all: var(--missing, initial); }\n", "unexaminable"],
    [":focus { outline: none; box-shadow: 0 0 0 2px blue; all: #{$reset}; }\n", "unexaminable"],
    [":focus { outline: none; all: var(--r); box-shadow: 0 0 0 2px blue; }\n", []],
    [":focus { outline: none; box-shadow: 0 0 0 2px blue; all: inherit; }\n", []],
    [":focus { box-shadow: 0 0 0 2px blue; :not(:not(&, .x)) { outline: none; } }\n", []],
    [".btn:focus { box-shadow: 0 0 0 2px blue; :not(:not(&, .x)) { outline: none; } }\n", [FOCUS_RULE]],
    [".btn:focus { box-shadow: 0 0 0 2px blue; :not(:not(&.a, &.b)) { outline: none; } }\n", []],
  ];
  for (const [css, expected] of cases) {
    const r = await focusAuditFor(css);
    const found = r.rules.filter((x) => x === FOCUS_RULE);
    if (expected === "unexaminable") {
      assert.deepEqual(found, [], css);
      assert.equal(r.unexaminable.length >= 1, true, css);
    } else assert.deepEqual(found, expected, css);
  }
});

test("ST-07: :nth-child(... of &) keeps the subject; a focus-visible negation with filters is still the exemption", async () => {
  const cases = [
    [":focus { box-shadow: 0 0 0 2px blue; :nth-child(2 of &) { outline: none; } }\n", []],
    [".btn:focus { box-shadow: 0 0 0 2px blue; :nth-last-child(odd of &.x) { outline: none; } }\n", []],
    [".btn:focus { box-shadow: 0 0 0 2px blue; :nth-child(2 of &, .y) { outline: none; } }\n", [FOCUS_RULE]],
    [".btn:focus { box-shadow: 0 0 0 2px blue; &:nth-child(2) { outline: none; } }\n", []],
    [":focus { &:not(:focus-visible, .disabled) { outline: none; } }\n", []],
    [":focus { &:not(.disabled, :focus-visible) { outline: none; } }\n", []],
    [":focus:not(.a, :focus-visible, .b) { outline: none; }\n", []],
    [":focus:not(.a, .b) { outline: none; }\n", [FOCUS_RULE]],
  ];
  for (const [css, expected] of cases) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), expected, css);
  }
});

test("ST-07: the focus-visible exemption parses its list; a bare :focus carries across focused alternatives", async () => {
  const cases = [
    [":focus:not(:focus-visible, :is(.disabled)) { outline: none; }\n", []],
    [":focus:not(.a:is(.b, .c), :focus-visible) { outline: none; }\n", []],
    [":focus:not(:is(:focus-visible)) { outline: none; }\n", []],
    [":focus { box-shadow: 0 0 0 2px blue; :is(&, :focus.x) { outline: none; } }\n", []],
    [":focus { box-shadow: 0 0 0 2px blue; :is(&, :focus-visible.x) { outline: none; } }\n", []],
    [":focus { box-shadow: 0 0 0 2px blue; :is(&, .a:focus-within) { outline: none; } }\n", [FOCUS_RULE]],
    [".btn:focus { box-shadow: 0 0 0 2px blue; :is(&, :focus.x) { outline: none; } }\n", [FOCUS_RULE]],
    [":focus-visible { box-shadow: 0 0 0 2px blue; :is(&, .special) { outline: none; } }\n", [FOCUS_RULE]],
  ];
  for (const [css, expected] of cases) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), expected, css);
  }
});

test("ST-07: a filter list on an anchored subject narrows it", async () => {
  const cases = [
    [":focus { box-shadow: 0 0 0 2px blue; &:is(.foo, .bar) { outline: none; } }\n", []],
    [":focus { box-shadow: 0 0 0 2px blue; &:where(.foo) { outline: none; } }\n", []],
    [".btn:focus { box-shadow: 0 0 0 2px blue; &:is(.a, :focus.b) { outline: none; } }\n", []],
    // a filter list alone anchors nothing
    [":focus { box-shadow: 0 0 0 2px blue; :is(.foo, .bar) { outline: none; } }\n", [FOCUS_RULE]],
    [":focus { box-shadow: 0 0 0 2px blue; :where(.foo) { outline: none; } }\n", [FOCUS_RULE]],
  ];
  for (const [css, expected] of cases) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), expected, css);
  }
});

test("ST-07: a wrapped bare :focus is bare; the exemption is read on the subject only", async () => {
  const cases = [
    [":where(:focus) { box-shadow: 0 0 0 2px blue; :is(&, .special) { outline: none; } }\n", []],
    [":is(:where(:focus)) { box-shadow: 0 0 0 2px blue; :is(&, .special) { outline: none; } }\n", []],
    [":where(.btn:focus) { box-shadow: 0 0 0 2px blue; :is(&, .special) { outline: none; } }\n", [FOCUS_RULE]],
    ["div:has(:focus:not(.x)) :focus:not(:focus-visible) { outline: none; }\n", []],
    ["div:has(:focus:not(:focus-visible)) :focus { outline: none; }\n", [FOCUS_RULE]],
    [":focus:not(.x) { outline: none; }\n", [FOCUS_RULE]],
  ];
  for (const [css, expected] of cases) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), expected, css);
  }
});

test("ST-07: a qualifier may sit between :focus and its focus-visible negation", async () => {
  const cases = [
    [":focus.foo:not(:focus-visible) { outline: none; }\n", []],
    ["button:focus[data-x]:not(.a, :focus-visible) { outline: none; }\n", []],
    [".foo:not(:focus-visible):focus { outline: none; }\n", []],
    [":focus.foo:not(.a) { outline: none; }\n", [FOCUS_RULE]],
    [":focus-visible.foo:not(:focus-visible) { outline: none; }\n", [FOCUS_RULE]],
    ["a:has(:focus-visible) .foo:not(:focus-visible) { outline: none; }\n", []],
  ];
  for (const [css, expected] of cases) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), expected, css);
  }
});

test("ST-07: a wrapped focus subject is the exemption; a repeated parent reference is context", async () => {
  const cases = [
    [":is(:focus):not(:focus-visible) { outline: none; }\n", []],
    [":where(:is(:focus)):not(:focus-visible) { outline: none; }\n", []],
    [":is(:focus, .a):not(:focus-visible) { outline: none; }\n", [FOCUS_RULE]],
    [":focus { box-shadow: 0 0 0 2px blue; & + & { outline: none; } }\n", []],
    [":focus { box-shadow: 0 0 0 2px blue; & > .a & { outline: none; } }\n", []],
    [":focus { box-shadow: 0 0 0 2px blue; & + & .x { outline: none; } }\n", [FOCUS_RULE]],
  ];
  for (const [css, expected] of cases) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), expected, css);
  }
});

test("ST-07: a doubly negated reference to the parent keeps the subject", async () => {
  const cases = [
    [":focus { box-shadow: 0 0 0 2px blue; :not(:not(&)) { outline: none; } }\n", []],
    [":focus { box-shadow: 0 0 0 2px blue; :not(:not(&.x)) { outline: none; } }\n", []],
    [":focus { box-shadow: 0 0 0 2px blue; :not(&) { outline: none; } }\n", []],
    [":focus { box-shadow: 0 0 0 2px blue; :not(:not(& .x)) { outline: none; } }\n", [FOCUS_RULE]],
    [":focus { box-shadow: 0 0 0 2px blue; :not(:not(:not(&))) { outline: none; } }\n", []],
  ];
  for (const [css, expected] of cases) {
    assert.deepEqual((await focusAuditFor(css)).rules.filter((x) => x === FOCUS_RULE), expected, css);
  }
});

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
  assert.deepEqual(await lineFor("// h\n\n.a { margin: 1px; }\n\n.#{p}-x:focus {\n  outline: none;\n}\n", "f.scss"), ["f.scss:5"]);
  assert.deepEqual(await lineFor(".a {\n\n  &:focus {\n    outline: none;\n  }\n}\n", "f.scss"), ["f.scss:3"]);
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
