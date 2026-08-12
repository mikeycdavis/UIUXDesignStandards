/**
 * Version identity — which framework actually produced this verdict?
 *
 * A policy declares `standardVersion: "1.0.0"`. Nothing about that declaration causes the 1.0.0 rule
 * set to be used: a run evaluates whatever catalog is on disk. While a framework is its own only
 * consumer those cannot disagree, so the gap is invisible. Distribution ends that. A pinned policy
 * and a checked-out workflow ref are independent sources of truth, and when they drift the envelope
 * carries `standardVersion: "1.0.0"` beside a verdict the 1.0.0 rule set never produced.
 *
 * That is not a compliance failure. The framework has not established that the project violated
 * anything — it has established that it cannot truthfully issue the verdict it was asked for. So the
 * outcome is a configuration/evaluation-identity failure at exit 2, never NON_COMPLIANT, and no
 * envelope is emitted, because an envelope carries a `status` and that status is precisely the claim
 * that must not be made.
 *
 * COMPARING VERSION STRINGS IS NOT ENOUGH, and this is the part inherited designs get wrong.
 * EngineeringStandards guards this by comparing `policy.standardVersion` against its own `VERSION`
 * file. Under this family's release convention (ADR 0015) `VERSION` names the LAST RELEASED version
 * and stays there while development continues — so this repository's own post-release `main` reports
 * `VERSION` `1.0.0` while being demonstrably not the `v1.0.0` artifact. A string comparison calls
 * that a match. A consumer pinning 1.0.0 would then be evaluated by unreleased changes and told it
 * was evaluated by 1.0.0.
 *
 * So identity is established against the ARTIFACT:
 *
 *   the declared version equals the executing VERSION      necessary, not sufficient
 *   AND the executing tree is exactly that release's tree   equality with the tag, ADR 0015
 *
 * FOUR OUTCOMES:
 *
 *   MATCH                            declared == executing, and the executing tree is that release.
 *   VERSION_MISMATCH                 the two versions name different releases.
 *   EXECUTED_TREE_IS_NOT_THE_RELEASE the versions agree and the tree does not — the case a string
 *                                    comparison cannot see, and the reason this module exists.
 *   UNVERIFIED                       the versions agree and which artifact is executing could not be
 *                                    established — no git, no tag, a vendored copy. NOT a match:
 *                                    "I could not check" never becomes "I checked".
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

export const PACK = "UIUXDesignStandards";

/**
 * Where a tree stands relative to the release its version names. See ADR 0015 — equality
 * establishes artifact identity, ancestry establishes historical continuity, and neither may
 * substitute for the other.
 *
 * This module owns the comparison. `release-readiness.mjs` imports it rather than keeping a second
 * copy, for the reason `content-identity.mjs` is the only owner of freshness: two implementations of
 * one question eventually answer it differently.
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
    return { release: "RELEASED", tree: "RELEASE_TREE", tag, at, head: now, ahead: 0, reason: `${tag} points at ${at.slice(0, 12)}, which is this tree` };
  }

  const descends = git(["merge-base", "--is-ancestor", `${tag}^{commit}`, "HEAD"]).status === 0;
  if (!descends) {
    return { release: "RELEASED", tree: "RELEASE_HISTORY_DIVERGED", tag, at, head: now, reason: `${tag} points at ${at.slice(0, 12)}, which is not an ancestor of HEAD — history was rewritten or the tag was moved` };
  }

  const ahead = Number(git(["rev-list", "--count", `${tag}^{commit}..HEAD`]).stdout.trim()) || 0;
  return {
    release: "RELEASED",
    tree: "POST_RELEASE_DEVELOPMENT",
    tag,
    at,
    head: now,
    ahead,
    reason: `${tag} points at ${at.slice(0, 12)}; HEAD is ${ahead} commit(s) ahead of it, so this tree is not the released one`,
  };
}

/** The version the framework at `frameworkRoot` says it is, or null if it does not say. */
export function frameworkVersion(frameworkRoot) {
  const file = path.join(frameworkRoot, "VERSION");
  if (!existsSync(file)) return null;
  const version = readFileSync(file, "utf8").trim();
  return /^\d+\.\d+\.\d+/.test(version) ? version : null;
}

/**
 * Resolve which framework is executing, and whether it is the one the policy asked for.
 *
 * The returned object is the evidence a governance layer consumes. It is deliberately shaped so that
 * every field is an observation rather than an assertion: `executedCommit` is null when it could not
 * be read, and `identity` is never MATCH on the strength of a version string alone.
 */
export function resolveVersionIdentity(declaredVersion, frameworkRoot, { target = null } = {}) {
  const executedVersion = frameworkVersion(frameworkRoot);
  const base = { pack: PACK, declaredVersion: declaredVersion ?? null, executedVersion, executedCommit: null, executedTree: null };

  /**
   * The framework evaluating its own tree, or something inside it.
   *
   * Established by comparing resolved paths, never by declaration — a consumer cannot claim this.
   * It is a distinct state rather than an exemption, because the risk being guarded against does not
   * exist here: that risk is a verdict produced by one framework and labelled with another's
   * version, and a project CONTAINED IN the executing framework's working tree is not a second
   * object that could disagree. Between releases this repository is legitimately `VERSION` 1.0.0
   * plus unreleased commits, and refusing on that basis would mean the framework could evaluate
   * itself, its fixtures, and its examples only on release day.
   *
   * Containment, not equality, and the direction matters. The reusable workflow checks the framework
   * out INTO the consumer (`<consumer>/.uiux-standards`), so the consumer is never inside the
   * framework and never reaches this branch. The reverse — a project placed inside a framework
   * checkout — is not a distribution arrangement; it is one working copy.
   */
  const contains = (outer, inner) => {
    const from = path.resolve(outer);
    const to = path.resolve(inner);
    return to === from || to.startsWith(from + path.sep);
  };
  const selfEvaluation = target !== null && contains(frameworkRoot, target);

  if (!executedVersion) {
    return { ...base, identity: "UNVERIFIED", blocking: false, reason: `the framework at ${frameworkRoot} declares no readable VERSION, so which version is executing could not be established` };
  }
  if (!declaredVersion) {
    return { ...base, identity: "UNVERIFIED", blocking: false, reason: "the policy declares no standardVersion, so there is nothing to compare the executing framework against" };
  }

  const release = resolveRelease(frameworkRoot, executedVersion);
  const commit = release.head ?? null;
  const observed = { ...base, executedCommit: commit, executedTree: release.tree };

  if (declaredVersion !== executedVersion) {
    return {
      ...observed,
      identity: "VERSION_MISMATCH",
      blocking: true,
      reason:
        `the policy declares standardVersion ${declaredVersion}, and the framework executing this run is ` +
        `${executedVersion}. No verdict was produced: a compliance status reported under a version that did ` +
        `not evaluate it would misstate its own provenance.`,
    };
  }

  if (release.tree === "RELEASE_TREE") {
    return { ...observed, identity: "MATCH", blocking: false, reason: `${release.tag} points at ${commit.slice(0, 12)}, which is the tree executing this run` };
  }

  if (selfEvaluation) {
    return {
      ...observed,
      identity: "SELF_EVALUATION",
      blocking: false,
      reason:
        `the evaluated project is the executing framework itself (${path.resolve(frameworkRoot)}), so there is no ` +
        `second framework whose version could be misreported. Tree state: ${release.tree}.`,
    };
  }

  if (release.tree === "POST_RELEASE_DEVELOPMENT" || release.tree === "RELEASE_HISTORY_DIVERGED") {
    return {
      ...observed,
      identity: "EXECUTED_TREE_IS_NOT_THE_RELEASE",
      blocking: true,
      reason:
        `the policy declares standardVersion ${declaredVersion} and the executing framework's VERSION agrees, but ` +
        `its tree is not the ${release.tag} release: ${release.reason} A verdict labelled ${declaredVersion} would ` +
        `have been produced by a framework that is not ${declaredVersion}.`,
    };
  }

  // UNRELEASED_CANDIDATE or UNKNOWN: the versions agree and the artifact could not be established.
  // Not a match, and not a mismatch either — reported as what it is so a governance layer can decide.
  return {
    ...observed,
    identity: "UNVERIFIED",
    blocking: false,
    reason:
      `the policy declares standardVersion ${declaredVersion} and the executing framework's VERSION agrees, but ` +
      `which artifact is executing could not be established: ${release.reason} The versions match; that they are ` +
      `the same released framework is unverified.`,
  };
}
