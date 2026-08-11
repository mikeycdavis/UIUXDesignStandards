#!/usr/bin/env node
/**
 * Release readiness.
 *
 * This is the last gate before an immutable tag, and it is the easiest place in the whole framework
 * to re-create the exact failure the framework exists to prevent. A readiness checker that runs a
 * list of commands and concludes "ready" because they all exited 0 has manufactured a verdict out of
 * exit codes. So the discipline here is the same one every other surface obeys:
 *
 *   - It CONSUMES evidence. It aggregates gates, the snapshot, the invariant registry, and the
 *     falsifier harness. It does not invent a criterion's answer.
 *   - NOT_EVALUATED never satisfies a criterion. A criterion nobody could measure is a gap, and a
 *     gap must be recorded rather than skipped.
 *   - A missing historical proof does not become readiness. It becomes a RECORDED_GAP, which is
 *     visible in the verdict itself (`READY_WITH_RECORDED_GAPS`), not a footnote under `READY`.
 *
 * TWO KINDS OF GAP, because recording a gap accurately is not the same as being allowed to ship it.
 * A gap is an accepted release limitation only when the missing evidence cannot now be recovered
 * honestly — the Git chronology qualifies, because the only way to produce it would be to rearrange
 * history until it says what we want. A gap that names work somebody could still do is a blocker
 * however accurately it is written down. That difference is mechanical, not editorial: `GAP_POLICY`
 * below lists the criteria permitted to carry an accepted limitation, everything else defaults to
 * BLOCKING_GAP, and a BLOCKING_GAP produces NOT_READY. Without that default, RECORDED_GAP becomes a
 * general-purpose release waiver and absorbs exactly the failures it was invented to expose.
 *
 * THREE RELEASE STATES, kept distinct because collapsing them is how a checklist starts lying:
 *
 *   IMPLEMENTED   the artifact or code exists
 *   VERIFIED      the acceptance claim was demonstrated
 *   RELEASED      an immutable tag exists
 *
 * Before the tag the honest report reads `implementation: VERIFIED` / `release: NOT_RELEASED`, and
 * this checker still exits 0. Requiring the tag in order to say the tag may be created would be
 * circular, and the predictable result of a circular gate is that someone tags first and runs the
 * gate afterwards, which is no gate at all.
 *
 * THE SNAPSHOT IS AN ORACLE, so this file never regenerates it during a check. `--write-snapshot`
 * is a separate, one-time, refuses-to-overwrite operation. Regenerating the expected values during
 * validation would turn the oracle back into the subject — the comparison would then be the live
 * catalog against itself, which is true of every catalog there has ever been.
 *
 * Exit 0 ready (with any gaps recorded), 1 a criterion failed, 2 the assessment could not be made.
 */

import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { loadCatalog } from "./catalog.mjs";
import { resolveChronology } from "./chronology.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAPSHOT = "artifacts/release/catalog-v1.0.0.json";
const REPORT = "artifacts/release/release-readiness-v1.0.0.md";

/**
 * The frozen v1 facts. They come from `artifacts/design/rule-catalog-v1.md`, which is the design
 * authority, and they are written here as literals ON PURPOSE: a count compared against the
 * collection it was derived from is the vacuity this whole milestone is defending against.
 */
const FROZEN = { rules: 70, forbidden: 15, detectors: 13, ruleFiles: 15, standards: 40 };

/** A criterion outcome. Only SATISFIED counts towards readiness. */
const SATISFIED = "SATISFIED";
const FAILED = "FAILED";
const RECORDED_GAP = "RECORDED_GAP";
const BLOCKING_GAP = "BLOCKING_GAP";
const NOT_EVALUATED = "NOT_EVALUATED";
const NOT_APPLICABLE = "NOT_APPLICABLE";

/**
 * The criteria allowed to report NOT_APPLICABLE, and the condition under which the proposition
 * genuinely does not apply.
 *
 * Same shape and same reason as `GAP_POLICY`. NOT_APPLICABLE does not block a release, so an
 * unconstrained one is a waiver by another name — "this criterion does not apply to us" is the
 * oldest way to pass a check without meeting it. Membership is required, the condition is stated,
 * and a criterion not listed here that reports NOT_APPLICABLE gets NOT_EVALUATED instead, which
 * blocks. Fail-closed, as with gaps.
 */
const APPLICABILITY_POLICY = {
  "release.the-tag-agrees-with-this-tree":
    "the proposition is about the released artifact. It applies when the release tag exists and this " +
    "tree could be it; once development has advanced past the tag, HEAD is not claiming to be the " +
    "released tree and the question is answered by release.current-line-descends-from-latest-release " +
    "instead. Ancestry is never accepted as agreement — that would pass a tree with every file rewritten.",
};

/**
 * The criteria allowed to settle for an accepted release limitation, and the reason each qualifies.
 *
 * Membership is the whole mechanism. A criterion not listed here that reports a gap gets
 * BLOCKING_GAP, so adding a criterion cannot accidentally grant it a waiver, and granting one
 * requires editing this table — which is a decision somebody has to write down rather than a state a
 * checker drifted into.
 */
const GAP_POLICY = {
  "chronology.identity-was-frozen-first":
    "the ordering is a claim about history; the work was done in that order but was not committed in " +
    "stages, and the only way to produce the evidence now would be to rearrange history until it " +
    "agrees. `scripts/rule-identity.mjs` enforces by content the property the history would have " +
    "shown, so the invariant is defended even though its historical proof is not recoverable.",
};

const read = (root, file) => readFileSync(path.join(root, file), "utf8");
const has = (root, file) => existsSync(path.join(root, file));

/**
 * Where this tree stands relative to the release its `VERSION` names.
 *
 * TWO PROPOSITIONS, TWO GIT RELATIONS, AND THEY MAY NOT SUBSTITUTE FOR EACH OTHER.
 *
 *   "is this the release tree?"           equality    HEAD == tag^{commit}
 *   "does this line descend from it?"     ancestry    merge-base --is-ancestor tag HEAD
 *
 * The first version of this function knew only equality, which was correct for verifying the v1.0.0
 * artifact and wrong for every commit afterwards: `VERSION` in this family names the LAST RELEASED
 * version and stays there while development continues, so an ordinary post-release commit would have
 * reported a failure forever. The tempting repair — accept an ancestor tag as agreement — was
 * rejected, because ancestry proves only that the release is somewhere behind us. It would pass a
 * tree that had rewritten every file since the tag. Equality establishes artifact identity; ancestry
 * establishes historical continuity; neither answers the other's question. ADR 0015.
 *
 * So the tag is resolved into two independent facts:
 *
 *   release   RELEASED | NOT_RELEASED | UNKNOWN
 *             a property of the VERSION, not of this checkout. v1.0.0 is released no matter which
 *             commit happens to be checked out.
 *
 *   tree      RELEASE_TREE              HEAD is exactly the released commit
 *             POST_RELEASE_DEVELOPMENT  the release is an ancestor; ordinary work continues
 *             RELEASE_HISTORY_DIVERGED  the tag exists and is NOT behind us — history was rewritten,
 *                                       or the tag was moved. Always a failure.
 *             UNRELEASED_CANDIDATE      no tag yet. Not a failure: demanding the tag in order to
 *                                       permit the tag is the circular gate this file refuses.
 *             UNKNOWN                   git could not answer, which is never "no tag".
 */
export function resolveRelease(root, version) {
  const tag = `v${version}`;
  const git = (args) => spawnSync("git", args, { cwd: root, encoding: "utf8" });
  const unknown = (reason) => ({ release: "UNKNOWN", tree: "UNKNOWN", tag, reason });

  // "Not a repository" and "no such tag" both make `rev-parse` exit non-zero, and collapsing them
  // would turn "I could not look" into "I looked and there was nothing".
  const repo = git(["rev-parse", "--git-dir"]);
  if (repo.error) return unknown(`git is unavailable: ${repo.error.message}`);
  if (repo.status !== 0) return unknown("not a git repository, so no tag could be looked for");

  const exists = git(["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`]);
  if (exists.status !== 0) {
    return { release: "NOT_RELEASED", tree: "UNRELEASED_CANDIDATE", tag, reason: `no tag ${tag} exists yet` };
  }

  const head = git(["rev-parse", "HEAD^{commit}"]);
  const tagged = git(["rev-parse", `${tag}^{commit}`]);
  if (head.status !== 0 || tagged.status !== 0) return unknown(`${tag} exists but could not be resolved to a commit`);

  const at = tagged.stdout.trim();
  const now = head.stdout.trim();
  if (at === now) {
    return { release: "RELEASED", tree: "RELEASE_TREE", tag, at, ahead: 0, reason: `${tag} points at ${at.slice(0, 12)}, which is this tree` };
  }

  const descends = git(["merge-base", "--is-ancestor", `${tag}^{commit}`, "HEAD"]).status === 0;
  if (!descends) {
    return { release: "RELEASED", tree: "RELEASE_HISTORY_DIVERGED", tag, at, reason: `${tag} points at ${at.slice(0, 12)}, which is not an ancestor of HEAD — history was rewritten or the tag was moved` };
  }

  const ahead = Number(git(["rev-list", "--count", `${tag}^{commit}..HEAD`]).stdout.trim()) || 0;
  return {
    release: "RELEASED",
    tree: "POST_RELEASE_DEVELOPMENT",
    tag,
    at,
    ahead,
    reason: `${tag} points at ${at.slice(0, 12)}; HEAD is ${ahead} commit(s) ahead of it, so this tree is not the released one`,
  };
}

function run(root, args, { env = {} } = {}) {
  // NODE_TEST_CONTEXT is deleted for the same reason `test/falsifiers.test.mjs` deletes it: a
  // `node --test` child that inherits it from a `node --test` parent runs nothing and exits 0.
  const childEnv = { ...process.env, ...env };
  delete childEnv.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, args, { cwd: root, encoding: "utf8", env: childEnv });
  return { code: result.status, out: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

// --- The snapshot projection ---------------------------------------------------------------------

/**
 * The identity-bearing projection of the catalog, canonically ordered.
 *
 * Shared by the writer and the comparer, which is not the same thing as regenerating the expected
 * value: the EXPECTED bytes live in the committed snapshot file, and only the LIVE side is
 * recomputed. One projection means a snapshot cannot mismatch because the two sides serialised the
 * same catalog differently.
 */
export function projectCatalog(catalog) {
  return [...catalog.rules.values()]
    .map((rule) => ({
      id: rule.id,
      standard: rule.standard,
      level: rule.level,
      severity: rule.severity,
      validationType: rule.validationType,
      assurance: rule.assurance,
      nonExemptible: rule.nonExemptible,
      appliesTo: [...rule.appliesTo].sort(),
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
}

/**
 * DIGEST-SCOPE: the resolved rule catalog's identity projection, for the release snapshot only.
 *
 * This is NOT a content identity and establishes no freshness. It never touches a file's bytes, a
 * revision, or a reviewed path; it hashes an in-memory projection of rule identities so a released
 * snapshot and a live catalog can be compared for equality. `content-identity.mjs` remains the only
 * owner of any claim about whether material has changed since it was reviewed or evidenced — a
 * second answer to that question is the defect the one-owner guard exists to prevent, and this
 * function must never grow into one.
 */
export const digestOf = (projection) =>
  createHash("sha256").update(JSON.stringify(projection)).digest("hex");

// --- Criteria -------------------------------------------------------------------------------------

/**
 * Every criterion returns `{id, claim, state, detail}`. `claim` is what a reader would have to
 * believe if the criterion were satisfied, phrased so that a FAILED row is readable on its own.
 */
export async function assess(root = ROOT, { runSuite = defaultSuiteRunner } = {}) {
  const criteria = [];
  const add = (id, claim, state, detail) => {
    // A criterion asks for RECORDED_GAP; only this table can grant it. Anything else asking becomes a
    // BLOCKING_GAP — accurately recorded and still not releasable.
    const grantedGap = state !== RECORDED_GAP || id in GAP_POLICY;
    const grantedNa = state !== NOT_APPLICABLE || id in APPLICABILITY_POLICY;
    const resolved = !grantedGap ? BLOCKING_GAP : !grantedNa ? NOT_EVALUATED : state;
    criteria.push({
      id,
      claim,
      state: resolved,
      detail: !grantedGap
        ? `${detail} This gap is resolvable, so it blocks the release rather than being carried into it.`
        : !grantedNa
          ? `${detail} No applicability condition is on record for this criterion, so "does not apply" is not available to it.`
          : detail,
      ...(state === RECORDED_GAP && grantedGap ? { accepted: GAP_POLICY[id] } : {}),
      ...(state === NOT_APPLICABLE && grantedNa ? { inapplicable: APPLICABILITY_POLICY[id] } : {}),
    });
  };

  // 1 — The catalog loads, and it is the frozen catalog.
  let catalog = null;
  try {
    catalog = await loadCatalog(path.join(root, "rules"));
    const forbidden = [...catalog.rules.values()].filter((r) => r.level === "forbidden").length;
    const ruleFiles = readdirSync(path.join(root, "rules")).filter((f) => f.endsWith(".json")).length;
    const wrong = [];
    if (catalog.rules.size !== FROZEN.rules) wrong.push(`${catalog.rules.size} rules, freeze says ${FROZEN.rules}`);
    if (forbidden !== FROZEN.forbidden) wrong.push(`${forbidden} forbidden, freeze says ${FROZEN.forbidden}`);
    if (ruleFiles !== FROZEN.ruleFiles) wrong.push(`${ruleFiles} rule files, freeze says ${FROZEN.ruleFiles}`);
    add(
      "catalog.matches-the-freeze",
      "The catalog loads and holds exactly the identities the freeze authorises.",
      wrong.length === 0 ? SATISFIED : FAILED,
      wrong.length === 0 ? `${catalog.rules.size} rules, ${forbidden} forbidden, ${ruleFiles} files` : wrong.join("; "),
    );
  } catch (error) {
    add("catalog.matches-the-freeze", "The catalog loads and holds exactly the identities the freeze authorises.", FAILED, error.message);
  }

  // 2 — The live catalog matches the frozen release snapshot.
  if (!catalog) {
    add("snapshot.matches-the-live-catalog", "The released catalog snapshot still describes the catalog.", NOT_EVALUATED, "the catalog did not load, so there was nothing to compare");
  } else if (!has(root, SNAPSHOT)) {
    add("snapshot.matches-the-live-catalog", "The released catalog snapshot still describes the catalog.", FAILED, `${SNAPSHOT} does not exist — run \`node scripts/release-readiness.mjs --write-snapshot\` once`);
  } else {
    try {
      const snapshot = JSON.parse(read(root, SNAPSHOT));
      const live = projectCatalog(catalog);
      const liveDigest = digestOf(live);
      const problems = [];
      if (snapshot.digest !== liveDigest) problems.push(`digest ${snapshot.digest?.slice(0, 12)} recorded, ${liveDigest.slice(0, 12)} live`);
      // The snapshot must also agree with ITSELF. Comparing only the recorded digest against the
      // live one leaves the recorded rules unchecked, so a snapshot whose rule list was edited
      // without its digest being recomputed would compare clean while describing a catalog that
      // never existed. An oracle that can be internally inconsistent is not an oracle.
      if (Array.isArray(snapshot.rules) && digestOf(snapshot.rules) !== snapshot.digest) {
        problems.push(`the snapshot's own digest does not cover its own rules — ${SNAPSHOT} has been edited without being regenerated`);
      }
      if (snapshot.rules?.length !== live.length) problems.push(`${snapshot.rules?.length} rules recorded, ${live.length} live`);
      for (const [key, value] of Object.entries(FROZEN)) {
        if (snapshot.counts?.[key] !== value) problems.push(`snapshot records ${key} = ${snapshot.counts?.[key]}, the freeze says ${value}`);
      }
      add(
        "snapshot.matches-the-live-catalog",
        "The released catalog snapshot still describes the catalog.",
        problems.length === 0 ? SATISFIED : FAILED,
        problems.length === 0 ? `digest ${liveDigest.slice(0, 12)}… over ${live.length} rules` : problems.join("; "),
      );
    } catch (error) {
      add("snapshot.matches-the-live-catalog", "The released catalog snapshot still describes the catalog.", FAILED, `${SNAPSHOT} is unreadable: ${error.message}`);
    }
  }

  // 3 — Every forbidden rule is either detector-backed with a fixture pair, or typed as a surface
  //     this version cannot evaluate. Present, never missing.
  if (!catalog) {
    add("forbidden.every-rule-is-accounted-for", "Every forbidden rule is either fixture-proved or visibly typed to an unbuilt surface.", NOT_EVALUATED, "the catalog did not load");
  } else {
    const { DETECTOR_RULES } = await import(pathToFileURL(path.join(root, "scripts/uiux.mjs")));
    const detectorBound = new Set(DETECTOR_RULES);
    const missing = [];
    const overclaimed = [];
    for (const rule of [...catalog.rules.values()].filter((r) => r.level === "forbidden")) {
      if (detectorBound.has(rule.id)) {
        for (const drawer of ["never-violations", "never-clean"]) {
          if (!has(root, path.join("test", "fixtures", drawer))) missing.push(`${rule.id} is detector-backed but test/fixtures/${drawer} is missing`);
        }
      } else if (!["browser-analysis", "visual-analysis", "manual-review"].includes(rule.validationType)) {
        // A forbidden rule typed to a surface this version DOES build, with nothing built for it.
        // It is not a false pass — it reports not-evaluated and caps the verdict, which is the safe
        // behaviour — but the catalog is claiming a machine-checkable type it does not honour, and a
        // reader comparing types to detectors would be misled. That is a contract defect, and a
        // contract defect is fixable: build the detector, or re-type the rule to the surface that can
        // establish it and record the reasoning. `forbidden.every-rule-is-accounted-for` is
        // deliberately absent from GAP_POLICY, so writing this down does not make it shippable.
        overclaimed.push(rule.id);
      }
    }
    const named = has(root, REPORT) ? read(root, REPORT) : "";
    const unrecorded = overclaimed.filter((id) => !named.includes(id));
    add(
      "forbidden.every-rule-is-accounted-for",
      "Every forbidden rule is either fixture-proved, visibly typed to an unbuilt surface, or a recorded gap.",
      missing.length > 0 || unrecorded.length > 0 ? FAILED : overclaimed.length > 0 ? RECORDED_GAP : SATISFIED,
      missing.length > 0
        ? missing.join("; ")
        : unrecorded.length > 0
          ? `${unrecorded.join(", ")} claim a validation type with no detector, and ${REPORT} does not name them`
          : overclaimed.length > 0
            ? `${FROZEN.forbidden} forbidden rules; ${overclaimed.length} claim a built validation type with no detector: ${overclaimed.join(", ")}`
            : `${FROZEN.forbidden} forbidden rules, all accounted for`,
    );
  }

  // 4 — Gate 0: this repository's own policy is valid configuration.
  const policy = run(root, ["scripts/policy.mjs"]);
  add("self.policy-is-valid", "This repository's own policy is valid configuration.", policy.code === 0 ? SATISFIED : FAILED, `scripts/policy.mjs exited ${policy.code}`);

  // 5 — Gate 1: the classifier's self-assertion. The tool makes the claim, not this checker.
  const self = run(root, ["scripts/uiux.mjs", "applicability", ".", "--self"]);
  add("self.classifier-agrees-with-the-policy", "Gate 1 classifies this repository NOT_APPLICABLE from evidence, matching its declaration.", self.code === 0 ? SATISFIED : FAILED, `applicability --self exited ${self.code}`);

  // 6 — Gate 2: the whole pipeline over itself.
  const validate = run(root, ["scripts/uiux.mjs", "validate", ".", "--json"]);
  try {
    const envelope = JSON.parse(validate.out);
    const wrong = [];
    if (validate.code !== 0) wrong.push(`validate exited ${validate.code}`);
    if (envelope.applicability?.classification !== "NOT_APPLICABLE") wrong.push(`applicability is ${envelope.applicability?.classification}`);
    if (envelope.uiCompliance !== null) wrong.push("uiCompliance is populated on a NOT_APPLICABLE repository");
    if (envelope.frameworkCompliance?.status !== "COMPLIANT") wrong.push(`frameworkCompliance is ${envelope.frameworkCompliance?.status}`);
    add("self.validate-is-clean", "The framework's own process rules pass under its own evaluator.", wrong.length === 0 ? SATISFIED : FAILED, wrong.length === 0 ? "NOT_APPLICABLE / uiCompliance null / frameworkCompliance COMPLIANT" : wrong.join("; "));
  } catch {
    add("self.validate-is-clean", "The framework's own process rules pass under its own evaluator.", FAILED, `validate --json emitted no parseable envelope (exit ${validate.code})`);
  }

  // 7 — The suite is green, non-empty, and includes the falsifiers. An uncaught falsifier fails the
  //     harness, so this criterion carries that requirement without re-implementing it.
  const suite = runSuite(root);
  if (suite.ran === null) {
    add("tests.suite-is-green-and-non-empty", "The full suite, falsifiers included, runs and passes.", NOT_EVALUATED, suite.detail ?? "the suite was not run");
  } else {
    const wrong = [];
    if (suite.code !== 0) wrong.push(`the suite exited ${suite.code} with ${suite.failed} failure(s)`);
    if (suite.ran < 100) wrong.push(`only ${suite.ran} tests ran`);
    if (suite.falsifiers === 0) wrong.push("no falsifier ran, so nothing established that the suite can fail");
    add("tests.suite-is-green-and-non-empty", "The full suite, falsifiers included, runs and passes.", wrong.length === 0 ? SATISFIED : FAILED, wrong.length === 0 ? `${suite.ran} tests, 0 failures` : wrong.join("; "));
  }

  // 8 — Every registered invariant still names a defending test and a breaking mutation. This is the
  //     shortcut the release falsifier attacks: deleting a registered test must fail readiness.
  try {
    const { INVARIANTS } = await import(pathToFileURL(path.join(root, "test/invariants.mjs")));
    const { FALSIFIERS } = await import(pathToFileURL(path.join(root, "test/falsifiers.mjs")));
    // Every invariant must name a record and a defending test. A falsifier is NOT required of each
    // one — some invariants are defended by tests that cannot be expressed as a single source
    // mutation — but the registry as a whole must carry falsifiers, and each one it names must be a
    // mutation that actually runs. An invariant whose falsifier is fictional is worse than one with
    // none, because the register reads as stronger than the suite is.
    const runs = new Set(FALSIFIERS.map((f) => f.invariant));
    const thin = INVARIANTS.filter((i) => !i.tests?.length || !i.record?.quote);
    const falsified = INVARIANTS.filter((i) => runs.has(i.id)).length;
    const problems = thin.map((i) => `${i.id} names no ${!i.tests?.length ? "defending test" : "record"}`);
    if (INVARIANTS.length === 0) problems.push("the registry is empty, so it satisfies itself");
    if (falsified === 0) problems.push("no registered invariant has ever been broken on purpose");
    add(
      "invariants.every-registration-is-defended",
      "Every registered invariant names a record and a defending test, and the registry's falsifiers are real.",
      problems.length === 0 ? SATISFIED : FAILED,
      problems.length === 0 ? `${INVARIANTS.length} registered, ${falsified} of them falsified by ${FALSIFIERS.length} running mutations` : problems.join("; "),
    );
  } catch (error) {
    add("invariants.every-registration-is-defended", "Every registered invariant names both the test that defends it and the mutation that breaks it.", FAILED, `the invariant registry could not be read: ${error.message}`);
  }

  // 9 — The three versions agree, and the changelog's top entry is the version being released.
  try {
    const version = read(root, "VERSION").trim();
    const pkg = JSON.parse(read(root, "package.json")).version;
    const changelog = read(root, "CHANGELOG.md");
    const top = changelog.match(/^##\s+(\d+\.\d+\.\d+)\b/m)?.[1] ?? null;
    const wrong = [];
    if (!/^\d+\.\d+\.\d+$/.test(version)) wrong.push(`VERSION reads "${version}"`);
    if (pkg !== version) wrong.push(`package.json is ${pkg}, VERSION is ${version}`);
    if (top !== version) wrong.push(`the changelog's top entry is ${top ?? "absent"}, VERSION is ${version}`);
    add("version.the-three-versions-agree", "VERSION, package.json, and the changelog's top entry name one version.", wrong.length === 0 ? SATISFIED : FAILED, wrong.length === 0 ? version : wrong.join("; "));
  } catch (error) {
    add("version.the-three-versions-agree", "VERSION, package.json, and the changelog's top entry name one version.", FAILED, error.message);
  }

  // 10 — No carried obligation is still open. A BLOCKED plan item is a gap by the plan's own record.
  try {
    const dir = path.join(root, "artifacts", "project-plan-breakdown");
    const blocked = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
      const body = readFileSync(path.join(dir, file), "utf8");
      // The status marker, not the word: `**Status:** \`BLOCKED\`` is a status, and a sentence
      // about something having been recorded BLOCKED is a mention. Third time this distinction has
      // mattered, so it is written down rather than rediscovered.
      if (/\*\*Status:\*\*\s*`BLOCKED`/.test(body)) blocked.push(file);
    }
    add("obligations.nothing-is-still-blocked", "No plan item is still recorded BLOCKED.", blocked.length === 0 ? SATISFIED : FAILED, blocked.length === 0 ? "no BLOCKED status in the plan breakdown" : `still BLOCKED: ${blocked.join(", ")}`);
  } catch (error) {
    add("obligations.nothing-is-still-blocked", "No plan item is still recorded BLOCKED.", FAILED, error.message);
  }

  // 11 — Chronology. The one criterion that can legitimately be a recorded gap rather than a pass,
  //      because it is a claim about history and history is not something this run can create.
  const chronology = resolveChronology(root);
  const reportNames = has(root, REPORT) && /NOT_ESTABLISHED/.test(read(root, REPORT));
  if (chronology.state === "ORDERED") {
    add("chronology.identity-was-frozen-first", "Git history shows rule identity frozen before the detectors that bind to it.", SATISFIED, chronology.reason);
  } else if (chronology.state === "ANCHOR_MISSING") {
    // Deliberately NOT routed through the gap path. An unprovable claim and a check with no subject
    // are opposite failures, and the accepted limitation granted to the first would silently absorb
    // the second — which is how this defect survived until the day of the tag.
    add("chronology.identity-was-frozen-first", "Git history shows rule identity frozen before the detectors that bind to it.", FAILED, chronology.reason);
  } else if (chronology.state === "INVERTED") {
    add("chronology.identity-was-frozen-first", "Git history shows rule identity frozen before the detectors that bind to it.", FAILED, chronology.reason);
  } else {
    add(
      "chronology.identity-was-frozen-first",
      "Git history shows rule identity frozen before the detectors that bind to it.",
      reportNames ? RECORDED_GAP : FAILED,
      reportNames ? chronology.reason : `${chronology.reason} And ${REPORT} does not record it as NOT_ESTABLISHED, so the gap is unrecorded.`,
    );
  }

  // 12 and 13 — the tag, resolved into the two propositions it can actually support.
  //
  // These were one criterion until the first real release lifecycle showed it was answering two
  // questions with one git relation. Neither may borrow the other's evidence: equality establishes
  // that this tree IS the released artifact, ancestry establishes only that the release is behind us.
  let release = { release: "UNKNOWN", tree: "UNKNOWN", reason: "the version could not be read" };
  try {
    release = resolveRelease(root, read(root, "VERSION").trim());
  } catch (error) {
    release = { release: "UNKNOWN", tree: "UNKNOWN", reason: error.message };
  }

  // 12 — Artifact identity. EQUALITY, never ancestry.
  //
  // Never requires the tag: an absent tag is the ordinary pre-release state, because demanding the
  // tag in order to permit the tag is the circular gate this file opens by refusing. Once HEAD has
  // moved past the release, the tree is no longer claiming to be the artifact and the proposition
  // stops applying — which is NOT the same as being met, and is why it reports NOT_APPLICABLE under
  // a recorded condition rather than SATISFIED.
  add(
    "release.the-tag-agrees-with-this-tree",
    "This tree is the released artifact: HEAD is exactly the commit the release tag names.",
    { RELEASE_TREE: SATISFIED, UNRELEASED_CANDIDATE: SATISFIED, POST_RELEASE_DEVELOPMENT: NOT_APPLICABLE, RELEASE_HISTORY_DIVERGED: FAILED, UNKNOWN: FAILED }[release.tree] ?? FAILED,
    release.reason,
  );

  // 13 — Historical continuity. ANCESTRY, and only ancestry.
  //
  // The proposition the previous criterion cannot answer, and the one that catches a rewritten or
  // moved tag. A release that is no longer in the history of the line claiming to continue it means
  // the immutable artifact and the development line have come apart.
  add(
    "release.current-line-descends-from-latest-release",
    "This development line still contains the latest release: the tag is an ancestor of HEAD, or is HEAD.",
    { RELEASE_TREE: SATISFIED, POST_RELEASE_DEVELOPMENT: SATISFIED, UNRELEASED_CANDIDATE: SATISFIED, RELEASE_HISTORY_DIVERGED: FAILED, UNKNOWN: FAILED }[release.tree] ?? FAILED,
    release.tree === "UNRELEASED_CANDIDATE" ? "no release exists yet for this line to descend from" : release.reason,
  );

  const failed = criteria.filter((c) => [FAILED, NOT_EVALUATED, BLOCKING_GAP].includes(c.state));
  const gaps = criteria.filter((c) => c.state === RECORDED_GAP);
  const verdict = failed.length > 0 ? "NOT_READY" : gaps.length > 0 ? "READY_WITH_RECORDED_GAPS" : "READY";
  return { verdict, criteria, chronology, release: release.release, tree: release.tree, releaseDetail: release };
}

/** Runs the real suite. Injectable so tests can exercise `assess` without recursing into it. */
function defaultSuiteRunner(root) {
  const result = run(root, ["--test", "test/*.test.mjs"]);
  const ran = Number(result.out.match(/^ℹ tests (\d+)/m)?.[1] ?? NaN);
  const failed = Number(result.out.match(/^ℹ fail (\d+)/m)?.[1] ?? NaN);
  if (!Number.isFinite(ran)) {
    return { ran: null, detail: "the suite produced no test summary, so nothing was measured" };
  }
  const falsifiers = (result.out.match(/every architectural falsifier is caught/g) ?? []).length;
  return { code: result.code, ran, failed, falsifiers };
}

// --- CLI ------------------------------------------------------------------------------------------

function writeSnapshot(root) {
  const target = path.join(root, SNAPSHOT);
  if (existsSync(target)) {
    process.stderr.write(`release-readiness: ${SNAPSHOT} already exists. The snapshot is an oracle and is written once;\n`);
    process.stderr.write("  overwriting it during a release would compare the catalog against itself. Delete it deliberately if the\n");
    process.stderr.write("  freeze genuinely changed, and record that change as an ordinary catalog change with lifecycle metadata.\n");
    process.exit(2);
  }
  return loadCatalog(path.join(root, "rules")).then((catalog) => {
    const rules = projectCatalog(catalog);
    const forbidden = rules.filter((r) => r.level === "forbidden").length;
    const snapshot = {
      $comment:
        "Frozen resolved catalog for v1.0.0. Written once by `node scripts/release-readiness.mjs --write-snapshot` " +
        "and never regenerated during validation: this file is the oracle the live catalog is compared against, and a " +
        "regenerated oracle only ever proves the catalog equals itself.",
      version: "1.0.0",
      counts: { ...FROZEN, forbidden },
      digest: digestOf(rules),
      rules,
    };
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(snapshot, null, 2)}\n`);
    process.stdout.write(`release-readiness: wrote ${SNAPSHOT} — ${rules.length} rules, digest ${snapshot.digest.slice(0, 12)}…\n`);
    process.exit(0);
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--write-snapshot")) {
    await writeSnapshot(ROOT);
  } else {
    const assessment = await assess(ROOT);
    const mark = { [SATISFIED]: "✔", [FAILED]: "✘", [RECORDED_GAP]: "◐", [BLOCKING_GAP]: "✘", [NOT_EVALUATED]: "?", [NOT_APPLICABLE]: "–" };
    process.stdout.write("Release readiness — v1.0.0\n\n");
    for (const criterion of assessment.criteria) {
      process.stdout.write(`  ${mark[criterion.state]} ${criterion.state.padEnd(13)} ${criterion.id}\n`);
      process.stdout.write(`      ${criterion.detail}\n`);
    }
    const gaps = assessment.criteria.filter((c) => c.state === RECORDED_GAP);
    process.stdout.write(`\n  implementation: ${assessment.verdict === "NOT_READY" ? "NOT_VERIFIED" : "VERIFIED"}\n`);
    process.stdout.write(`  release:        ${assessment.release} — ${assessment.releaseDetail.reason}\n`);
    process.stdout.write(`  this tree:      ${assessment.tree}\n`);
    process.stdout.write(`  verdict:        ${assessment.verdict}\n`);
    if (gaps.length > 0) {
      process.stdout.write(`\n  ${gaps.length} accepted release limitation(s). Recorded, not satisfied:\n`);
      for (const gap of gaps) process.stdout.write(`    - ${gap.id}\n`);
    }
    const blocking = assessment.criteria.filter((c) => c.state === BLOCKING_GAP);
    if (blocking.length > 0) {
      process.stdout.write(`\n  ${blocking.length} blocking gap(s). Accurately recorded and still not releasable:\n`);
      for (const gap of blocking) process.stdout.write(`    - ${gap.id}\n`);
    }
    process.exit(assessment.verdict === "NOT_READY" ? 1 : 0);
  }
}
