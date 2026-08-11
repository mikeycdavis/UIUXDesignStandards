/**
 * Chronology — was rule identity frozen BEFORE the detectors that bind to it existed?
 *
 * The architecture law says the evaluator does not define identity. The catalog freeze
 * (`artifacts/design/rule-catalog-v1.md`) is the artifact that makes that checkable, and the
 * original verification was a Git-history ordering claim: the freeze must enter history before
 * detector implementation does.
 *
 * The obvious phrasing of that check is wrong, and the wrongness is the reason this module exists.
 * `scripts/uiux.mjs` first appeared as a CLI router, before any detector was written, so
 *
 *     freeze added  <  scripts/uiux.mjs added
 *
 * is only a PROXY for the invariant. It can fail on a repository that did everything right, and —
 * worse — it can pass on one that did not, because the file's birth says nothing about when the
 * bindings inside it appeared. The invariant is about the bindings, so the check is about the
 * bindings:
 *
 *     freeze added  <  the first commit that introduced EVALUATED_RULES
 *
 * `EVALUATED_RULES` is the set naming every rule id a static detector claims to evaluate. It is the
 * exact point at which the evaluator starts asserting rule identities, so the commit that
 * introduces it is the commit where detector implementation began.
 *
 * FOUR STATES, and none of them is allowed to be silently satisfied:
 *
 *   NO_HISTORY      one or both anchors are not in history at all. Nothing to compare. The claim is
 *                   not false — it is unmeasured, and must be recorded as such.
 *   SAME_COMMIT     both anchors entered history in the same commit. This is what a single lump
 *                   "initial commit" of finished work produces, and it is the important case: Git
 *                   reports no ordering, so the chronology CANNOT be demonstrated. A check that
 *                   accepted `freezeTime <= detectorTime` would pass here on equal timestamps and
 *                   report a verified ordering that no evidence supports.
 *   ORDERED         distinct commits, freeze strictly first. The invariant is demonstrated.
 *   INVERTED        distinct commits, detectors first. The invariant is violated.
 *
 * Both the watchdog test and the release-readiness report read THIS function, so the release record
 * cannot state an ordering the test would not accept, or vice versa. One owner, as with
 * `content-identity.mjs`.
 */

import { spawnSync } from "node:child_process";

const FREEZE = "artifacts/design/rule-catalog-v1.md";
const DETECTOR_SUBJECT = "scripts/uiux.mjs";
const DETECTOR_ANCHOR = "EVALUATED_RULES";

function git(root, args) {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) return [];
  return result.stdout.trim().split("\n").filter(Boolean);
}

/** The commit that ADDED a path, as `{sha, at}` — or null if the path is not in history. */
function introducedPath(root, file) {
  const lines = git(root, ["log", "--diff-filter=A", "--format=%H %ct", "--", file]);
  if (lines.length === 0) return null;
  // `git log` is newest-first; the addition is the last line. A path added, deleted and re-added
  // has several — the earliest is the one that matters, which is still the last line.
  const [sha, at] = lines[lines.length - 1].split(" ");
  return { sha, at: Number(at) };
}

/**
 * The commit that introduced a string into a path, as `{sha, at}`.
 *
 * `git log -S` reports commits where the number of occurrences changed, so the earliest such commit
 * is the introduction. This deliberately does NOT use `--diff-filter=A` on the file: the file may
 * predate the anchor by many commits, which is the whole reason the file-birth proxy was rejected.
 */
function introducedString(root, file, needle) {
  const lines = git(root, ["log", `-S${needle}`, "--format=%H %ct", "--", file]);
  if (lines.length === 0) return null;
  const [sha, at] = lines[lines.length - 1].split(" ");
  return { sha, at: Number(at) };
}

export function resolveChronology(root) {
  const freeze = introducedPath(root, FREEZE);
  const detectors = introducedString(root, DETECTOR_SUBJECT, DETECTOR_ANCHOR);

  if (!freeze || !detectors) {
    return {
      state: "NO_HISTORY",
      freeze,
      detectors,
      reason:
        !freeze && !detectors
          ? `Neither ${FREEZE} nor ${DETECTOR_ANCHOR} in ${DETECTOR_SUBJECT} is in Git history, so the ordering has never been recorded.`
          : !freeze
            ? `${FREEZE} is not in Git history, so the freeze has no recorded introduction to compare against.`
            : `${DETECTOR_ANCHOR} is not in the recorded history of ${DETECTOR_SUBJECT}, so detector implementation has no recorded start.`,
    };
  }

  if (freeze.sha === detectors.sha) {
    return {
      state: "SAME_COMMIT",
      freeze,
      detectors,
      reason:
        `The freeze and the first detector bindings both entered history in ${freeze.sha.slice(0, 8)}. ` +
        `Git records no ordering between two changes in one commit, so the chronology cannot be demonstrated from history — ` +
        `regardless of the order in which the work was actually performed.`,
    };
  }

  if (freeze.at < detectors.at) {
    return {
      state: "ORDERED",
      freeze,
      detectors,
      reason:
        `${FREEZE} entered history in ${freeze.sha.slice(0, 8)}, and the first ${DETECTOR_ANCHOR} bindings ` +
        `in ${detectors.sha.slice(0, 8)} afterwards. Identity was frozen before the evaluator bound to it.`,
    };
  }

  return {
    state: "INVERTED",
    freeze,
    detectors,
    reason:
      `The first ${DETECTOR_ANCHOR} bindings entered history in ${detectors.sha.slice(0, 8)}, at or before ` +
      `${FREEZE} in ${freeze.sha.slice(0, 8)}. The evaluator existed before the identity it binds to was frozen.`,
  };
}

export const CHRONOLOGY_ANCHORS = { FREEZE, DETECTOR_SUBJECT, DETECTOR_ANCHOR };
