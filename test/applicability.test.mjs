/**
 * Gate 1 — the applicability classifier.
 *
 * The claim being defended is that `NOT_APPLICABLE` is unreachable except by the one route that
 * earns it. Every other outcome of the classifier is cheap; this one exempts the entire UI rule
 * surface, so most of what follows is an attempt to obtain it illegitimately and fail.
 *
 * The precedence table is tested through `decide()` directly, not only end-to-end. A fixture can
 * show that an outcome happened; only a pure call can show WHICH RULE produced it, and the ordering
 * is the part of this design most likely to be broken by a later edit that looks harmless.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { cp, mkdtemp, mkdir, rm, writeFile, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { classify, decide, detectSignals, scanRepository, readDeclaration } from "../scripts/applicability.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURES = path.join(REPO, "test", "fixtures");
const NO_UI = path.join(FIXTURES, "no-ui");
const WEB_UI = path.join(FIXTURES, "web-ui-signals");
const CLI = path.join(REPO, "scripts", "uiux.mjs");

const run = (args) => {
  const result = spawnSync(process.execPath, [CLI, "applicability", ...args], { encoding: "utf8", cwd: REPO });
  return { code: result.status, out: result.stdout + result.stderr, stdout: result.stdout };
};

/** Run a body against a throwaway copy of a fixture. */
async function withCopy(source, body) {
  const dir = await mkdtemp(path.join(tmpdir(), "uiux-app-"));
  const target = path.join(dir, "project");
  try {
    await cp(source, target, { recursive: true });
    return await body(target);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Build the `decide()` input without touching a filesystem. */
const signal = (id, detected, implies = []) => ({ id, detected, label: "INFERRED", evidence: detected ? ["x"] : [], implies });
const scanOf = (over = {}) => ({
  complete: true,
  filesExamined: 10,
  capHit: false,
  unreadable: [],
  excluded: [],
  manifestParsed: true,
  ...over,
});
const declaredAs = (klass) =>
  klass === null ? { present: false, class: null, reason: "no project-policy.yml at the target root" } : { present: true, class: klass, reason: null };

// --- The precedence table, rule by rule -----------------------------------------------------------

test("rule 1 — a no-ui declaration contradicted by evidence is a conflict, never an exemption", () => {
  const result = decide({ signals: [signal("html-documents", true, ["web-ui"])], scan: scanOf(), declaredPolicy: declaredAs("no-ui") });
  assert.equal(result.classification, "INDETERMINATE");
  assert.equal(result.agreement, "conflict");
  assert.match(result.reasons.join(" "), /contradiction is not an exemption/);
});

test("rule 2 — a witnessed signal survives an incomplete scan", () => {
  // The one ordering decision worth defending. Incompleteness threatens claims of absence; it does
  // not un-witness a signal already found. If this inverted, a repository could shed its UI
  // obligations by containing a directory the scanner cannot read.
  const result = decide({
    signals: [signal("html-documents", true, ["web-ui"])],
    scan: scanOf({ complete: false, capHit: true }),
    declaredPolicy: declaredAs(null),
  });
  assert.equal(result.classification, "APPLICABLE");
  assert.match(result.reasons.join(" "), /incompleteness threatens a claim of absence/);
});

test("rule 3 — the only route to NOT_APPLICABLE needs all three conditions", () => {
  const result = decide({ signals: [signal("html-documents", false)], scan: scanOf(), declaredPolicy: declaredAs("no-ui") });
  assert.equal(result.classification, "NOT_APPLICABLE");
  assert.equal(result.agreement, "match");
});

test("rule 4 — an incomplete scan blocks the exemption even with the declaration", () => {
  for (const broken of [{ complete: false, capHit: true }, { complete: false, unreadable: ["src/vendor"] }, { complete: false, manifestParsed: false }]) {
    const result = decide({ signals: [signal("html-documents", false)], scan: scanOf(broken), declaredPolicy: declaredAs("no-ui") });
    assert.equal(result.classification, "INDETERMINATE", JSON.stringify(broken));
    assert.equal(result.agreement, "indeterminate");
  }
});

test("rule 5 — a declared interface nobody corroborated is uncorroborated, not refuted", () => {
  const result = decide({ signals: [signal("html-documents", false)], scan: scanOf(), declaredPolicy: declaredAs("web-ui") });
  assert.equal(result.classification, "INDETERMINATE");
  assert.equal(result.agreement, "indeterminate");
  // Deliberately not `conflict`: failing to find a UI is not proof there is none, so calling this a
  // contradiction would claim more than the search can support.
  assert.match(result.reasons.join(" "), /absence of evidence is not evidence of absence/);
});

test("rule 6 — zero signals with no declaration is INDETERMINATE, never NOT_APPLICABLE", () => {
  const result = decide({ signals: [signal("html-documents", false)], scan: scanOf(), declaredPolicy: declaredAs(null) });
  assert.equal(result.classification, "INDETERMINATE");
  assert.equal(result.agreement, "undeclared");
  assert.match(result.reasons.join(" "), /additionally requires the project to declare/);
});

// --- Classification and agreement are separate axes ------------------------------------------------

test("strong positive evidence with no declaration is APPLICABLE, not INDETERMINATE", async () => {
  const result = await classify(WEB_UI);
  assert.equal(result.classification, "APPLICABLE");
  assert.equal(result.agreement, "undeclared");
  assert.equal(result.declaredPolicy.present, false);
});

test("a declared class the evidence resolves against is a conflict that leaves APPLICABLE standing", () => {
  const result = decide({
    signals: [signal("mobile-project", true, ["mobile-ui"])],
    scan: scanOf(),
    declaredPolicy: declaredAs("web-ui"),
  });
  assert.equal(result.classification, "APPLICABLE", "a class disagreement must not unestablish the interface");
  assert.equal(result.agreement, "conflict");
});

// --- Class resolution ------------------------------------------------------------------------------

test("evidence that proves a UI without proving a platform leaves the class unresolved", async () => {
  await withCopy(NO_UI, async (target) => {
    await unlink(path.join(target, "project-policy.yml"));
    await writeFile(path.join(target, "src", "Panel.tsx"), "export const Panel = () => <View><Text>hi</Text></View>;\n");
    const result = await classify(target);
    assert.equal(result.classification, "APPLICABLE");
    assert.deepEqual(result.applicabilityClasses, [], "a .tsx component must not be asserted to be web");
    assert.equal(result.classResolution, "unresolved");
  });
});

test("resolved classes are reported only where a signal proves them", async () => {
  const result = await classify(WEB_UI);
  assert.deepEqual(result.applicabilityClasses, ["web-ui"]);
  assert.equal(result.classResolution, "resolved");
  const generic = result.signals.find((s) => s.id === "storybook");
  assert.deepEqual(generic.implies, [], "Storybook hosts components for any renderer; it proves no platform");
});

// --- Signal integrity -------------------------------------------------------------------------------

test("every detected signal carries evidence, and heuristics are never OBSERVED", async () => {
  const scan = await scanRepository(WEB_UI);
  const { signals } = await detectSignals(WEB_UI, scan);
  const detected = signals.filter((s) => s.detected);
  assert.ok(detected.length >= 5, `anti-vacuity: only ${detected.length} signals fired`);
  for (const s of detected) assert.ok(s.evidence.length > 0, `${s.id} fired with no evidence`);
  for (const id of ["route-conventions", "style-system", "browser-build-target", "browser-test-configuration"]) {
    assert.equal(signals.find((s) => s.id === id).label, "INFERRED", `${id} is a pattern match, not an observation`);
  }
});

test("undetected signals stay in the envelope — empty is not absent", async () => {
  const result = await classify(NO_UI);
  assert.equal(result.signals.length, 10);
  assert.ok(result.signals.every((s) => s.detected === false));
  // A classifier that omitted its silent families would make "we looked and found nothing"
  // indistinguishable from "we never looked".
  assert.ok(result.signals.some((s) => s.id === "mobile-project"));
});

// --- The exemption is the hardest outcome to obtain --------------------------------------------------

test("the no-ui fixture reaches NOT_APPLICABLE, and each missing condition takes it away", async () => {
  const complete = await classify(NO_UI);
  assert.equal(complete.classification, "NOT_APPLICABLE");

  await withCopy(NO_UI, async (target) => {
    await unlink(path.join(target, "project-policy.yml"));
    assert.equal((await classify(target)).classification, "INDETERMINATE", "no declaration");
  });
  await withCopy(NO_UI, async (target) => {
    const capped = await classify(target, { maxFiles: 1 });
    assert.equal(capped.classification, "INDETERMINATE", "truncated search");
    assert.equal(capped.scan.capHit, true);
  });
  await withCopy(NO_UI, async (target) => {
    await writeFile(path.join(target, "package.json"), "{ not json");
    const corrupt = await classify(target);
    assert.equal(corrupt.classification, "INDETERMINATE", "unparseable manifest");
    assert.equal(corrupt.scan.manifestParsed, false);
  });
});

test("an exemption names what it did not search", async () => {
  const result = await classify(REPO);
  assert.equal(result.classification, "NOT_APPLICABLE");
  assert.ok(result.scan.excluded.includes("test/fixtures"), "this repository's fixtures contain UI markup");
  assert.match(result.reasons.join(" "), /excluded from the search:.*test\/fixtures/);
});

// --- Mutation: the Gate 1 transition ------------------------------------------------------------------

test("the Gate 1 transition sequence never passes through NOT_APPLICABLE illegitimately", async () => {
  await withCopy(NO_UI, async (target) => {
    const declared = await classify(target);
    assert.equal(declared.classification, "NOT_APPLICABLE");
    assert.equal(declared.agreement, "match");

    const policy = path.join(target, "project-policy.yml");
    const body = `standardVersion: 1.0.0\nui:\n  applicability: no-ui\nexceptions: []\n`;

    await unlink(policy);
    const undeclared = await classify(target);
    assert.equal(undeclared.classification, "INDETERMINATE");
    assert.equal(undeclared.agreement, "undeclared");

    await writeFile(path.join(target, "index.html"), "<!doctype html><html><body><main>hi</main></body></html>\n");
    const undeclaredWithUi = await classify(target);
    assert.equal(undeclaredWithUi.classification, "APPLICABLE");
    assert.equal(undeclaredWithUi.agreement, "undeclared");

    await writeFile(policy, body);
    const contradicted = await classify(target);
    assert.equal(contradicted.classification, "INDETERMINATE");
    assert.equal(contradicted.agreement, "conflict");

    // Restore, and assert the exemption returns — a mutation test that cannot come back proves the
    // fixture was broken rather than that the rule fired.
    await unlink(path.join(target, "index.html"));
    assert.equal((await classify(target)).classification, "NOT_APPLICABLE");
  });
});

// --- Uncertainty and non-execution have different envelopes, not just different exit codes -------------

test("INDETERMINATE is a produced classification: exit 0, full envelope, reasons retained", () => {
  // A directory of policy fixtures: no UI signal, and no `project-policy.yml` of its own to
  // declare anything. That is rule 6 — the case a careless classifier would call NOT_APPLICABLE.
  const result = spawnSync(process.execPath, [CLI, "applicability", path.join(FIXTURES, "policies"), "--json"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.classification, "INDETERMINATE");
  assert.ok(envelope.reasons.length > 0);
  assert.ok(envelope.scan.filesExamined > 0, "scan evidence is retained, not discarded");
  assert.ok(Array.isArray(envelope.signals));
});

test("non-execution emits an error envelope with no classification field at all", () => {
  const result = spawnSync(process.execPath, [CLI, "applicability", path.join(REPO, "definitely-not-a-path"), "--json"], {
    encoding: "utf8",
  });
  assert.equal(result.status, 2);
  const envelope = JSON.parse(result.stdout);
  assert.equal(envelope.error.code, "CLASSIFIER_DID_NOT_EXECUTE");
  assert.ok(!("classification" in envelope), "a consumer must not be able to read a verdict out of a failure");
  assert.ok(!("scan" in envelope));
});

test("a file that is not a directory is non-execution, not an empty scan", async () => {
  await assert.rejects(() => classify(path.join(REPO, "package.json")), /not a directory/);
});

// --- The envelope contract --------------------------------------------------------------------------

test("the envelope carries exactly the documented keys", async () => {
  const result = await classify(NO_UI);
  assert.deepEqual(Object.keys(result).sort(), [
    "agreement",
    "applicabilityClasses",
    "classResolution",
    "classification",
    "classifiedAt",
    "declaredPolicy",
    "reasons",
    "scan",
    "schemaVersion",
    "signals",
    "target",
    "tool",
  ]);
});

test("an unreadable declaration is undeclared, never exempt", async () => {
  await withCopy(NO_UI, async (target) => {
    await writeFile(path.join(target, "project-policy.yml"), "ui:\n  applicability: sort-of\n");
    const declaration = await readDeclaration(target);
    assert.equal(declaration.present, false);
    assert.match(declaration.reason, /no recognised 'ui.applicability' value \(found 'sort-of'\)/);
    // Validating the policy is Gate 0's job. A classifier that exited 2 here would collapse a
    // configuration error into a measurement failure.
    const result = await classify(target);
    assert.equal(result.classification, "INDETERMINATE");
    assert.equal(result.agreement, "undeclared");
  });
});

// --- The self-assertion -------------------------------------------------------------------------------

test("--self holds on this repository", () => {
  const result = run([".", "--self"]);
  assert.equal(result.code, 0, result.out);
  assert.match(result.out, /--self: NOT_APPLICABLE, agreement match, complete scan\./);
});

test("--self fails the moment a UI appears, and says the policy is what must change", async () => {
  await withCopy(NO_UI, async (target) => {
    assert.equal(run([target, "--self"]).code, 0);
    await writeFile(path.join(target, "index.html"), "<!doctype html><html><body></body></html>\n");
    const broken = run([target, "--self"]);
    assert.equal(broken.code, 1, "the tool worked and the project has a problem — not exit 2");
    assert.match(broken.out, /classification is INDETERMINATE/);
    assert.match(broken.out, /the policy\s+is what has to change/);
  });
});

// --- The commands that do not exist yet ----------------------------------------------------------------

// `audit` and `validate` left this list when section 06 implemented them; their exit contract is
// tested in test/validate.test.mjs. `init` remains, and remains honest about it.
test("an unknown command exits 2 and never 0", () => {
  // Every command named in the usage text is implemented now — `init` landed in plan section 09, and
  // its own suite is test/init.test.mjs. What this guards is the remaining case: a command the
  // dispatcher does not recognise must reach no verdict rather than falling through to one.
  const result = spawnSync(process.execPath, [CLI, "bogus", "."], { encoding: "utf8" });
  assert.equal(result.status, 2, "an unknown command must not report success");
  assert.match(result.stderr, /unknown command/);
  assert.equal(result.stdout, "");
});
