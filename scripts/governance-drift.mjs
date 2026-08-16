/**
 * Governance drift: has what was established stopped being established?
 *
 * Not a second governance evaluator. It consumes the same `CONTROLS` contract and the same collector
 * output that D1-C and D1-E used, and asks one question — do the required controls still hold. There
 * is deliberately no second table of expected ruleset ids, names, or JSON shapes here: the durable
 * claim is that six controls remain satisfied, not that a ruleset keeps the identifier GitHub happened
 * to assign it. A detector that pinned `20914072` would report drift the day someone recreated an
 * identical ruleset, and would report nothing the day its rules were emptied.
 *
 * Host facts are unlike every other fact this framework verifies: they change with no commit, no
 * author, and no diff. That is the entire reason this file exists.
 */

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

import { CONTROLS, CONTROL_RESULT } from "./governance.mjs";
import { report } from "./host-evidence.mjs";

export const DRIFT = {
  /** Every required control remains SATISFIED. */
  NO_DRIFT: "NO_DRIFT",
  /** Evidence was readable, and at least one required control that was satisfied no longer is. */
  DRIFTED: "DRIFTED",
  /** Current host evidence cannot establish the controls. Nothing is claimed either way. */
  INDETERMINATE: "INDETERMINATE",
  /** The required-control set itself changed. The policy moved; the host may not have. */
  CONTRACT_CHANGED: "CONTRACT_CHANGED",
};

/**
 * DIGEST-SCOPE: the required-control id set, for separating a policy change from a host regression.
 * This is NOT a content identity: it hashes an in-memory list of identifiers from this module's own
 * contract — no file, no tree, no revision, no working copy — and says nothing about freshness, which
 * it can neither establish nor stale. Freshness keeps exactly one owner, scripts/content-identity.mjs.
 */

/**
 * Identity of the *contract*, not of the host: the sorted required-control ids and nothing else.
 *
 * Deliberately excludes results, ruleset shapes, timestamps, and prose. Adding a required control, or
 * moving one in or out of the conjunction, changes this digest — which is what separates "the policy
 * grew" from "the host regressed". Comparing a seven-control contract against a six-control baseline
 * and calling the difference drift would blame GitHub for a decision made in this repository.
 */
export function contractDigest(controls = CONTROLS) {
  const required = controls
    .filter((c) => c.required)
    .map((c) => c.id)
    .sort();
  return createHash("sha256").update(required.join("\n")).digest("hex").slice(0, 32);
}

/**
 * Normalize a collector result into the semantic baseline that drift is measured against.
 *
 * Stores control results, not the GitHub response that produced them. Keeping raw API bodies here
 * would let an irrelevant field — a renamed node id, a reordered array, a new property GitHub adds
 * next quarter — manufacture drift that no control experienced. The raw evidence is still recorded
 * separately for audit; it is simply not the comparison surface.
 */
export function normalize(result, { repository = null } = {}) {
  const controls = {};
  for (const control of result.controls.filter((c) => c.required)) {
    controls[control.id] = control.result;
  }
  const deferred = {};
  for (const control of result.controls.filter((c) => !c.required)) {
    deferred[control.id] = control.result;
  }
  return {
    contractDigest: contractDigest(),
    observedAt: result.readAt,
    repository,
    state: result.state,
    controls,
    deferred,
  };
}

/**
 * Compare a recorded baseline against a current reading. Pure.
 *
 * Order of precedence, and the third step is the one that needed deciding:
 *
 *   1. Contract digests differ → CONTRACT_CHANGED. Comparing results across two different
 *      required-control sets answers no useful question, so nothing else is evaluated.
 *   2. A control satisfied at baseline is now ABSENT → DRIFTED.
 *   3. Otherwise, a control satisfied at baseline is now UNREADABLE → INDETERMINATE.
 *   4. Otherwise → NO_DRIFT.
 *
 * Steps 2 and 3 are in this order on purpose, and it is the reverse of the precedence in
 * `deriveGovernance`, where unreadability outranks absence. The two questions are not the same one.
 * There, UNGOVERNED is a claim about the complete set of what is missing, so a partial read cannot
 * support it. Here, a control observed to have regressed is established evidence that drift occurred,
 * and one unreadable neighbour does not unestablish it. Reporting INDETERMINATE would file a
 * confirmed regression under "could not tell" — converting a known bad into an unknown, which is the
 * same false-negative family this project exists to prevent, wearing the opposite coat.
 *
 * Both lists are always returned, so the reading is never reduced to its headline.
 */
export function compareGovernance({ baseline, current }) {
  if (!baseline || typeof baseline !== "object") {
    return { state: DRIFT.INDETERMINATE, reason: "no baseline was recorded, so nothing can be compared", drifted: [], unreadable: [], deferredChanges: [] };
  }

  const currentDigest = contractDigest();
  if (baseline.contractDigest !== currentDigest) {
    return {
      state: DRIFT.CONTRACT_CHANGED,
      reason:
        `the required-control set changed since the baseline was recorded ` +
        `(${baseline.contractDigest} → ${currentDigest}). Re-record the baseline deliberately; ` +
        `this is a policy change, and the host may not have moved at all.`,
      drifted: [],
      unreadable: [],
      deferredChanges: [],
    };
  }

  const drifted = [];
  const unreadable = [];
  for (const [id, was] of Object.entries(baseline.controls ?? {})) {
    if (was !== CONTROL_RESULT.SATISFIED) continue; // never established, so it cannot have regressed
    const now = current.controls[id];
    if (now === CONTROL_RESULT.ABSENT) drifted.push(id);
    else if (now !== CONTROL_RESULT.SATISFIED) unreadable.push(id);
  }

  // Reported, never load-bearing: a deferred control is outside the conjunction by decision, so a
  // change in it is news rather than a regression.
  const deferredChanges = [];
  for (const [id, was] of Object.entries(baseline.deferred ?? {})) {
    const now = current.deferred?.[id];
    if (now !== was) deferredChanges.push({ id, was, now: now ?? "unobserved" });
  }

  if (drifted.length > 0) {
    return {
      state: DRIFT.DRIFTED,
      reason: `${drifted.length} required control(s) no longer established: ${drifted.join(", ")}`,
      drifted,
      unreadable,
      deferredChanges,
    };
  }
  if (unreadable.length > 0) {
    return {
      state: DRIFT.INDETERMINATE,
      reason: `${unreadable.length} required control(s) could not be established now: ${unreadable.join(", ")}`,
      drifted,
      unreadable,
      deferredChanges,
    };
  }
  return {
    state: DRIFT.NO_DRIFT,
    reason: `all ${Object.keys(baseline.controls ?? {}).length} required control(s) remain established`,
    drifted,
    unreadable,
    deferredChanges,
  };
}

export const BASELINE = "artifacts/governance/baseline.json";

function readBaseline(file) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("governance-drift.mjs");
if (invokedDirectly) {
  const record = process.argv.includes("--record");
  let current;
  try {
    current = normalize(report(), { repository: "mikeycdavis/UIUXDesignStandards" });
  } catch (error) {
    process.stderr.write(`governance-drift: could not read host state: ${error.message}\n`);
    process.exit(2);
  }

  if (record) {
    writeFileSync(BASELINE, `${JSON.stringify(current, null, 2)}\n`);
    process.stdout.write(`baseline recorded at ${BASELINE} (${current.state}, contract ${current.contractDigest})\n`);
    process.exit(0);
  }

  const verdict = compareGovernance({ baseline: readBaseline(BASELINE), current });
  process.stdout.write(`\n  ${verdict.state}\n  ${verdict.reason}\n`);
  for (const change of verdict.deferredChanges) {
    process.stdout.write(`  deferred ${change.id}: ${change.was} → ${change.now} (reported, not drift)\n`);
  }
  process.stdout.write("\n");

  // A gate, unlike the collector. The collector reports state and exits 0 for all three, because
  // reporting is its job. This command is asked whether governance REMAINS established, so it answers
  // with the exit triple: 0 established, 1 it ran and governance regressed, 2 no verdict reached.
  if (verdict.state === DRIFT.NO_DRIFT) process.exit(0);
  if (verdict.state === DRIFT.DRIFTED) process.exit(1);
  process.exit(2);
}
