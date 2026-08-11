/**
 * Release readiness.
 *
 * The checker's job is to be the last thing between finished work and an immutable tag, which makes
 * it the last place a false green can hide — and the most tempting one, because by the time anyone
 * runs it they want the answer to be yes. So these tests do not check that it says yes. They check
 * that it says no, specifically, for each of the shortcuts a release is actually taken by:
 *
 *   the snapshot no longer describes the catalog          identity changed and nobody noticed
 *   the changelog and VERSION disagree                    the release names two different things
 *   a carried obligation is still BLOCKED                 shipped over a gap the plan recorded
 *   a registered invariant lost its defending test        the register claims a defence that is gone
 *   a criterion could not be measured                     NOT_EVALUATED quietly satisfying
 *   a recorded gap stopped being recorded                 a gap becoming an omission
 *
 * `assess()` is a function of its root and takes an injectable suite runner, so these run against a
 * throwaway copy rather than the live repository. The injection is not only for speed: the real
 * runner spawns the whole suite, and a test in that suite calling the real runner would spawn itself.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { assess, projectCatalog, digestOf } from "../scripts/release-readiness.mjs";
import { loadCatalog } from "../scripts/catalog.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** A suite runner that reports a healthy suite without running one. */
const greenSuite = () => ({ code: 0, ran: 348, failed: 0, falsifiers: 1 });

async function sandbox() {
  const dir = await mkdtemp(path.join(tmpdir(), "uiux-release-"));
  for (const entry of [
    "scripts", "rules", "schemas", "standards", "templates", "test", "artifacts", "docs",
    "package.json", "project-policy.yml", "VERSION", "CHANGELOG.md",
  ]) {
    await cp(path.join(ROOT, entry), path.join(dir, entry), { recursive: true });
  }
  // An empty repository, not a bare directory. The release state is read from git, and a copy that
  // is not a repository would answer "no tag exists" when the truth is "nothing could be looked up"
  // — the collapse this whole file exists to prevent, reintroduced in the fixture rather than the
  // code. `git init` with no commits is the honest sandbox: a real repository, genuinely untagged.
  spawnSync("git", ["init", "--quiet"], { cwd: dir });
  return dir;
}

/** Run `assess` over a sandbox after applying one mutation, and index the criteria by id. */
async function assessWith(mutate, options = {}) {
  const dir = await sandbox();
  try {
    if (mutate) await mutate(dir);
    const assessment = await assess(dir, { runSuite: greenSuite, ...options });
    const byId = new Map(assessment.criteria.map((c) => [c.id, c]));
    return { ...assessment, byId };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const edit = async (dir, file, change) => {
  const body = await readFile(path.join(dir, file), "utf8");
  await writeFile(path.join(dir, file), change(body));
};

// --- The unmutated baseline ----------------------------------------------------------------------

test("an untouched repository is ready, with its gaps recorded rather than hidden", async () => {
  const assessment = await assessWith(null);

  // Anti-vacuity first. Every mutation below asserts that some criterion turned FAILED; if the
  // assessment produced two criteria, all of them would still "pass" and mean nothing.
  assert.ok(assessment.criteria.length >= 10, `only ${assessment.criteria.length} criteria were assessed`);
  assert.equal(new Set(assessment.criteria.map((c) => c.id)).size, assessment.criteria.length, "two criteria share an id");

  const failed = assessment.criteria.filter((c) => c.state === "FAILED" || c.state === "NOT_EVALUATED");
  assert.deepEqual(failed.map((c) => `${c.id}: ${c.detail}`), [], "the baseline is not clean, so every mutation below would be meaningless");
  assert.equal(assessment.verdict, "READY_WITH_RECORDED_GAPS");
  assert.equal(assessment.release, "NOT_RELEASED", "the checker must never report a tag that does not exist");
});

test("the chronology gap is reported as a gap, not as a pass and not as a failure", async () => {
  const assessment = await assessWith(null);
  const chronology = assessment.byId.get("chronology.identity-was-frozen-first");
  assert.equal(chronology.state, "RECORDED_GAP");
  assert.equal(assessment.chronology.state, "NO_HISTORY", "the sandbox has no history, so the state must say so");
});

// --- The shortcuts a release is actually taken by --------------------------------------------------

test("a snapshot that no longer describes the catalog fails the release", async () => {
  const assessment = await assessWith(async (dir) => {
    await edit(dir, "artifacts/release/catalog-v1.0.0.json", (body) => {
      const snapshot = JSON.parse(body);
      snapshot.rules = snapshot.rules.slice(0, -1); // one identity silently gone
      return JSON.stringify(snapshot, null, 2);
    });
  });
  assert.equal(assessment.byId.get("snapshot.matches-the-live-catalog").state, "FAILED");
  assert.equal(assessment.verdict, "NOT_READY");
});

test("a snapshot edited without being regenerated fails, because it no longer agrees with itself", async () => {
  const assessment = await assessWith(async (dir) => {
    await edit(dir, "artifacts/release/catalog-v1.0.0.json", (body) => {
      const snapshot = JSON.parse(body);
      snapshot.rules[0] = { ...snapshot.rules[0], level: "optional", severity: "info" };
      return JSON.stringify(snapshot, null, 2); // digest deliberately left stale
    });
  });
  const criterion = assessment.byId.get("snapshot.matches-the-live-catalog");
  assert.equal(criterion.state, "FAILED");
  assert.match(criterion.detail, /own digest does not cover its own rules/);
  assert.equal(assessment.verdict, "NOT_READY");
});

test("an internally consistent snapshot that describes a different catalog still fails", async () => {
  // The sharpest of the three, and the only one the live-versus-recorded comparison alone can catch:
  // the rule count is unchanged and the snapshot agrees with itself perfectly. It simply describes a
  // catalog this repository does not have. Without this, deleting the live comparison would leave
  // every other snapshot test still passing.
  const assessment = await assessWith(async (dir) => {
    await edit(dir, "artifacts/release/catalog-v1.0.0.json", (body) => {
      const snapshot = JSON.parse(body);
      snapshot.rules[0] = { ...snapshot.rules[0], level: "optional", severity: "info" };
      snapshot.digest = digestOf(snapshot.rules);
      return JSON.stringify(snapshot, null, 2);
    });
  });
  const criterion = assessment.byId.get("snapshot.matches-the-live-catalog");
  assert.equal(criterion.state, "FAILED");
  assert.match(criterion.detail, /recorded,.*live/, "only the recorded-versus-live comparison could have caught this");
  assert.equal(assessment.verdict, "NOT_READY");
});

test("the snapshot is an oracle: the checker never rewrites it to make itself agree", async () => {
  const dir = await sandbox();
  try {
    const before = await readFile(path.join(dir, "artifacts/release/catalog-v1.0.0.json"), "utf8");
    await edit(dir, "artifacts/release/catalog-v1.0.0.json", (body) =>
      JSON.stringify({ ...JSON.parse(body), digest: "0".repeat(64) }, null, 2),
    );
    const mutated = await readFile(path.join(dir, "artifacts/release/catalog-v1.0.0.json"), "utf8");
    await assess(dir, { runSuite: greenSuite });
    const after = await readFile(path.join(dir, "artifacts/release/catalog-v1.0.0.json"), "utf8");
    assert.equal(after, mutated, "assess() rewrote the snapshot — the oracle is now the subject");
    assert.notEqual(after, before);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a changelog naming a different version from VERSION fails the release", async () => {
  const assessment = await assessWith(async (dir) => {
    await writeFile(path.join(dir, "VERSION"), "1.0.1\n");
  });
  assert.equal(assessment.byId.get("version.the-three-versions-agree").state, "FAILED");
  assert.match(assessment.byId.get("version.the-three-versions-agree").detail, /1\.0\.1/);
  assert.equal(assessment.verdict, "NOT_READY");
});

test("a carried obligation still recorded BLOCKED fails the release", async () => {
  const assessment = await assessWith(async (dir) => {
    await edit(dir, "artifacts/project-plan-breakdown/11-ci-and-docs.md", (body) =>
      body.replace("**Status:** `COMPLETE`", "**Status:** `BLOCKED`"),
    );
  });
  const obligations = assessment.byId.get("obligations.nothing-is-still-blocked");
  assert.equal(obligations.state, "FAILED");
  assert.match(obligations.detail, /11-ci-and-docs\.md/);
  assert.equal(assessment.verdict, "NOT_READY");
});

test("a registered invariant that lost its defending test fails the release", async () => {
  const assessment = await assessWith(async (dir) => {
    await edit(dir, "test/invariants.mjs", (body) => body.replace(/tests: \[[\s\S]*?\],/, "tests: [],"));
  });
  const invariants = assessment.byId.get("invariants.every-registration-is-defended");
  assert.equal(invariants.state, "FAILED");
  assert.match(invariants.detail, /names no defending test/);
  assert.equal(assessment.verdict, "NOT_READY");
});

test("a criterion nobody could measure is NOT_EVALUATED, and NOT_EVALUATED never satisfies", async () => {
  const assessment = await assessWith(null, {
    runSuite: () => ({ ran: null, detail: "the suite produced no test summary" }),
  });
  const suite = assessment.byId.get("tests.suite-is-green-and-non-empty");
  assert.equal(suite.state, "NOT_EVALUATED");
  assert.equal(assessment.verdict, "NOT_READY", "an unmeasured criterion produced a ready verdict");
});

test("a suite that ran but reported nothing is not a green suite", async () => {
  const assessment = await assessWith(null, { runSuite: () => ({ code: 0, ran: 0, failed: 0, falsifiers: 0 }) });
  assert.equal(assessment.byId.get("tests.suite-is-green-and-non-empty").state, "FAILED");
});

test("a gap that stops being recorded becomes a failure, not a silence", async () => {
  const assessment = await assessWith(async (dir) => {
    await edit(dir, "artifacts/release/release-readiness-v1.0.0.md", (body) =>
      body.replace(/NOT_ESTABLISHED/g, "fine"),
    );
  });
  const chronology = assessment.byId.get("chronology.identity-was-frozen-first");
  assert.equal(chronology.state, "FAILED");
  assert.match(chronology.detail, /the gap is unrecorded/);
  assert.equal(assessment.verdict, "NOT_READY");
});

// --- The two kinds of gap -------------------------------------------------------------------------
//
// Recording a gap accurately is not the same as being allowed to ship it. These three tests are the
// mechanical form of that distinction: which criteria may carry an accepted limitation is a table,
// not an adjective, and everything not in the table blocks however well it is written down.

test("a forbidden rule claiming a built validation type with no detector blocks the release", async () => {
  // The defect ADR 0014 resolved, reintroduced. `no-fake-progress` is re-typed back to the surface
  // it cannot be established on, with no detector to honour the claim.
  const assessment = await assessWith(async (dir) => {
    await edit(dir, "rules/design-integrity.json", (body) =>
      body.replace(
        /"id": "design-integrity\.no-fake-progress",([\s\S]*?)"validationType": "manual-review",\n(\s*)"assurance": "none",/,
        '"id": "design-integrity.no-fake-progress",$1"validationType": "code-analysis",\n$2"assurance": "partial",',
      ),
    );
  });
  const forbidden = assessment.byId.get("forbidden.every-rule-is-accounted-for");
  assert.equal(forbidden.state, "BLOCKING_GAP", forbidden.detail);
  assert.match(forbidden.detail, /design-integrity\.no-fake-progress/);
  assert.equal(assessment.verdict, "NOT_READY");
});

test("naming that gap in the release report does not make it shippable", async () => {
  // The failure mode this defends: writing the gap down is how a resolvable defect gets waved
  // through. The report already names the rules; the criterion is not in GAP_POLICY, so it blocks.
  const assessment = await assessWith(async (dir) => {
    await edit(dir, "rules/design-integrity.json", (body) =>
      body.replace('"validationType": "manual-review",\n      "assurance": "none",\n      "nonExemptible": true,\n      "introducedIn": "1.0.0",\n      "description": "A determinate', '"validationType": "code-analysis",\n      "assurance": "partial",\n      "nonExemptible": true,\n      "introducedIn": "1.0.0",\n      "description": "A determinate'),
    );
    await edit(dir, "artifacts/release/release-readiness-v1.0.0.md", (body) =>
      `${body}\n\nKnown gap: design-integrity.no-fake-progress claims code-analysis and has no detector.\n`,
    );
  });
  const forbidden = assessment.byId.get("forbidden.every-rule-is-accounted-for");
  assert.equal(forbidden.state, "BLOCKING_GAP");
  assert.match(forbidden.detail, /blocks the release rather than being carried into it/);
  assert.equal(assessment.verdict, "NOT_READY");
});

test("the chronology gap is the only one permitted to be an accepted limitation, and it says why", async () => {
  const assessment = await assessWith(null);
  const accepted = assessment.criteria.filter((c) => c.state === "RECORDED_GAP");
  assert.deepEqual(accepted.map((c) => c.id), ["chronology.identity-was-frozen-first"]);
  // A waiver with no stated reason is a waiver nobody has to defend.
  assert.match(accepted[0].accepted, /rearrange history/);
  assert.match(accepted[0].accepted, /rule-identity\.mjs/, "an accepted gap must name what still defends the property");
});

// --- The chronology check must have a subject -------------------------------------------------------

test("the chronology anchor is a string that actually exists in the file it searches", async () => {
  // The direct guard, and the one that was missing. `resolveChronology` searched history for
  // `EVALUATED_RULES`, which the plan named and the evaluator never adopted — so it found nothing,
  // reported NO_HISTORY, and would have gone on reporting it on a correctly staged repository
  // forever. An anchor that matches nothing is a check that cannot fail.
  const { CHRONOLOGY_ANCHORS } = await import("../scripts/chronology.mjs");
  const source = await readFile(path.join(ROOT, CHRONOLOGY_ANCHORS.DETECTOR_SUBJECT), "utf8");
  const hits = source.split(CHRONOLOGY_ANCHORS.DETECTOR_ANCHOR).length - 1;
  assert.equal(hits, 1, `the anchor "${CHRONOLOGY_ANCHORS.DETECTOR_ANCHOR}" appears ${hits} times; it must name exactly one site`);
});

test("a chronology check with no subject fails; it is never an accepted limitation", async () => {
  const assessment = await assessWith(async (dir) => {
    // Reformatted, not renamed. The module still exports `DETECTORS` and everything importing it
    // still works — only the anchor's spelling is gone, which is precisely the silent case: nothing
    // breaks, and the chronology check quietly stops having a subject.
    await edit(dir, "scripts/uiux.mjs", (body) => body.replace("export const DETECTORS = [", "export const\n  DETECTORS = ["));
  });
  const chronology = assessment.byId.get("chronology.identity-was-frozen-first");
  assert.equal(chronology.state, "FAILED", "a broken check was recorded as an unprovable claim");
  assert.match(chronology.detail, /has no subject to look for in history/);
  assert.equal(assessment.verdict, "NOT_READY");
});

// --- The third release state, read rather than assumed ----------------------------------------------

/** Commit everything in a sandbox, so it has a HEAD a tag can point at. */
function commitAll(dir, message = "release candidate") {
  const git = (...args) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "test");
  git("add", "-A");
  git("commit", "--quiet", "-m", message);
  return git("rev-parse", "HEAD").stdout.trim();
}

/** Assess a sandbox after committing, tagging, and optionally moving on. */
async function atRelease(build) {
  const dir = await sandbox();
  try {
    await build(dir, commitAll);
    const assessment = await assess(dir, { runSuite: greenSuite });
    return { ...assessment, byId: new Map(assessment.criteria.map((c) => [c.id, c])) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const IDENTITY = "release.the-tag-agrees-with-this-tree";
const CONTINUITY = "release.current-line-descends-from-latest-release";

test("the tag is looked up, not assumed: a tag on this commit is the release tree", async () => {
  const assessment = await atRelease(async (dir, commit) => {
    commit(dir);
    spawnSync("git", ["tag", "-a", "v1.0.0", "-m", "v1.0.0"], { cwd: dir });
  });
  assert.equal(assessment.release, "RELEASED");
  assert.equal(assessment.tree, "RELEASE_TREE");
  assert.equal(assessment.byId.get(IDENTITY).state, "SATISFIED");
  assert.equal(assessment.byId.get(CONTINUITY).state, "SATISFIED");
  // Tagging changes no standards semantics: the verdict is what it was before the tag existed.
  assert.equal(assessment.verdict, "READY_WITH_RECORDED_GAPS");
});

test("an ordinary post-release commit is development, not a failure and not the release tree", async () => {
  // The state the family convention actually produces: VERSION stays at the last released version
  // while HEAD advances. A sibling repository is fourteen commits into this state.
  const assessment = await atRelease(async (dir, commit) => {
    commit(dir, "release");
    spawnSync("git", ["tag", "-a", "v1.0.0", "-m", "v1.0.0"], { cwd: dir });
    await writeFile(path.join(dir, "docs", "post-release.md"), "bookkeeping\n");
    commit(dir, "after");
  });
  assert.equal(assessment.release, "RELEASED", "the version is released regardless of what is checked out");
  assert.equal(assessment.tree, "POST_RELEASE_DEVELOPMENT");
  // Not SATISFIED. The tree is not the artifact, and saying so is the point of the split.
  assert.equal(assessment.byId.get(IDENTITY).state, "NOT_APPLICABLE");
  assert.match(assessment.byId.get(IDENTITY).inapplicable, /Ancestry is never accepted as agreement/);
  assert.equal(assessment.byId.get(CONTINUITY).state, "SATISFIED");
  assert.notEqual(assessment.verdict, "NOT_READY", "ordinary development after a release must not be permanently red");
});

test("a release that is no longer in this line's history fails, however far ahead HEAD is", async () => {
  const assessment = await atRelease(async (dir, commit) => {
    commit(dir, "release");
    spawnSync("git", ["tag", "-a", "v1.0.0", "-m", "v1.0.0"], { cwd: dir });
    // The tag stays; the branch is rebuilt without it. Ancestry is broken, so continuity is false.
    spawnSync("git", ["checkout", "--quiet", "--orphan", "rewritten"], { cwd: dir });
    await writeFile(path.join(dir, "docs", "rewritten.md"), "a different history\n");
    commit(dir, "rewritten");
  });
  assert.equal(assessment.tree, "RELEASE_HISTORY_DIVERGED");
  assert.equal(assessment.byId.get(IDENTITY).state, "FAILED");
  assert.equal(assessment.byId.get(CONTINUITY).state, "FAILED");
  assert.equal(assessment.verdict, "NOT_READY");
});

test("an absent tag satisfies both criteria — the gate is never circular", async () => {
  const assessment = await assessWith(null);
  assert.equal(assessment.release, "NOT_RELEASED");
  assert.equal(assessment.tree, "UNRELEASED_CANDIDATE");
  assert.equal(assessment.byId.get(IDENTITY).state, "SATISFIED");
  assert.equal(assessment.byId.get(CONTINUITY).state, "SATISFIED");
  assert.notEqual(assessment.verdict, "NOT_READY", "requiring the tag in order to permit the tag is the circular gate");
});

test("NOT_APPLICABLE is not available to a criterion with no recorded applicability condition", async () => {
  // The same fail-closed guard GAP_POLICY has, for the same reason: "this does not apply to us" is
  // the oldest way to pass a check without meeting it, so it must be a listed decision rather than a
  // state a criterion can reach on its own. Emptying the table must make the post-release state
  // BLOCK, not silently keep passing.
  const dir = await sandbox();
  try {
    // The emptied table has to be in place before the module under test is loaded from this root.
    const source = await readFile(path.join(dir, "scripts/release-readiness.mjs"), "utf8");
    await writeFile(
      path.join(dir, "scripts/release-readiness.mjs"),
      source.replace(/const APPLICABILITY_POLICY = \{[\s\S]*?\n\};/, "const APPLICABILITY_POLICY = {};"),
    );
    commitAll(dir, "release");
    spawnSync("git", ["tag", "-a", "v1.0.0", "-m", "v1.0.0"], { cwd: dir });
    await writeFile(path.join(dir, "docs", "post-release.md"), "bookkeeping\n");
    commitAll(dir, "after");

    const { assess: ungoverned } = await import(pathToFileURL(path.join(dir, "scripts/release-readiness.mjs")).href);
    const assessment = await ungoverned(dir, { runSuite: greenSuite });
    const identity = assessment.criteria.find((c) => c.id === IDENTITY);
    assert.equal(identity.state, "NOT_EVALUATED", "an ungoverned NOT_APPLICABLE was granted");
    assert.match(identity.detail, /No applicability condition is on record/);
    assert.equal(assessment.verdict, "NOT_READY", "NOT_EVALUATED must never satisfy");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

// --- The snapshot projection itself -----------------------------------------------------------------

test("the snapshot digest changes when any identity-bearing field does", async () => {
  const catalog = await loadCatalog(path.join(ROOT, "rules"));
  const live = projectCatalog(catalog);
  assert.ok(live.length > 0, "the projection is empty, so the digest would be constant");
  const baseline = digestOf(live);

  for (const field of ["id", "level", "validationType", "assurance", "nonExemptible", "appliesTo"]) {
    const mutated = live.map((rule, index) => (index === 0 ? { ...rule, [field]: "changed" } : rule));
    assert.notEqual(digestOf(mutated), baseline, `changing ${field} left the snapshot digest unchanged`);
  }
});

test("the released snapshot is the one this catalog produces", async () => {
  const snapshot = JSON.parse(await readFile(path.join(ROOT, "artifacts/release/catalog-v1.0.0.json"), "utf8"));
  const live = projectCatalog(await loadCatalog(path.join(ROOT, "rules")));
  assert.equal(snapshot.digest, digestOf(live));
  assert.equal(snapshot.rules.length, 70);
  assert.equal(snapshot.counts.forbidden, 15);
});
