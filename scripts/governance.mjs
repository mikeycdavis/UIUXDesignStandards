/**
 * Host-enforcement governance: the required-control contract, and the state machine over it.
 *
 * This module is pure and offline. It reads nothing, calls nothing, and knows no API. It answers one
 * question — given a set of control observations, is this repository GOVERNED, UNGOVERNED, or
 * INDETERMINATE — and it answers it the same way every other verdict in this framework is reached:
 * the aggregate is DERIVED from control-level results, never asserted alongside them.
 *
 * The collector that produces those observations (D1-B) is a separate module for the reason the
 * container gate exists: a function that decides governance must be testable without a network, a
 * token, or a particular repository's settings. Everything here runs inside the CI container, which
 * has none of those.
 *
 * The prohibition that shapes the whole module, inherited from the source enforcement architecture:
 *
 *     API call failed → assume required → GOVERNED     ← manufactures evidence
 *     API call failed → assume missing  → UNGOVERNED   ← also manufactures evidence
 *
 * Both are forbidden. An unestablished governance condition is INDETERMINATE. That is why
 * `UNREADABLE` is a first-class control result rather than an error thrown away at the edge, and why
 * a control the collector never mentioned cannot be silently dropped from the conjunction.
 *
 * The contract this implements is docs/host-enforcement.md.
 */

/** How a single control came out. A closed set. */
export const CONTROL_RESULT = {
  /** The evidence was read, and the control is in place. */
  SATISFIED: "SATISFIED",
  /** The evidence was read, and the control is not in place. This is a fact, not a failure to look. */
  ABSENT: "ABSENT",
  /** The evidence could not be established. Never a synonym for ABSENT. */
  UNREADABLE: "UNREADABLE",
};

/** The repository-level governance state. Derived, never reported directly by a collector. */
export const GOVERNANCE = {
  GOVERNED: "GOVERNED",
  UNGOVERNED: "UNGOVERNED",
  INDETERMINATE: "INDETERMINATE",
};

/**
 * The seven required controls.
 *
 * `required: false` marks a control that is modelled and collected but does not participate in the
 * conjunction — it is reported, and its absence does not make the repository UNGOVERNED. Deferring a
 * control is a recorded policy decision with a reason, never a silent omission: a control that is not
 * required is still read, still reported, and still visible.
 */
export const CONTROLS = [
  {
    id: "main.pr_required",
    title: "Changes to main arrive by pull request",
    required: true,
    source: "branch-protection-or-ruleset",
    why: "Direct pushes bypass every other control on this list at once.",
  },
  {
    id: "main.standards_check_required",
    title: "The hosted `standards` check is required, on the commit being merged",
    required: true,
    source: "branch-protection-or-ruleset",
    why: "A workflow that runs is not a workflow that must pass. Required-and-stale is also not required: the check must correspond to the head being merged, not to some earlier commit.",
  },
  {
    id: "main.force_push_prohibited",
    title: "Force pushes to main are prohibited",
    required: true,
    source: "branch-protection-or-ruleset",
    why: "A force push rewrites the history that every merge verdict was recorded against.",
  },
  {
    id: "main.deletion_prohibited",
    title: "Deletion of main is prohibited",
    required: true,
    source: "branch-protection-or-ruleset",
    why: "Deleting and recreating a branch discards its protection along with its history.",
  },
  {
    id: "tags.v_star_immutable",
    title: "Published `v*` tags cannot be updated or deleted",
    required: true,
    source: "tag-ruleset",
    why: "The release contract is that a pinned tag names one immutable tree. Consumers pin shas because tags are mutable by default — this control is what would make the tag itself trustworthy.",
  },
  {
    id: "bypass.policy",
    title: "No routine bypass; any emergency bypass is observable",
    required: true,
    source: "ruleset-bypass-actors",
    why: "A control every merge bypasses is not a control. Bypass that cannot be observed is worse than no bypass, because the record then claims an enforcement that did not occur.",
  },
  {
    id: "main.review_required",
    title: "At least one approving review before merge",
    // OPEN — see docs/host-enforcement.md §5. Modelled and collected; not yet in the conjunction,
    // because on a single-maintainer repository GitHub forbids self-approval, so requiring it would
    // make every pull request mergeable only by admin bypass — which contradicts `bypass.policy` and
    // would turn the bypass signal into noise. Recorded as an open owner decision, not as satisfied.
    required: false,
    deferredReason:
      "Single-maintainer repository. GitHub does not permit self-approval, so requiring one approval would force " +
      "routine admin bypass. Revisit when a second active maintainer exists who can perform independent review.",
    revisitWhen: "A second maintainer with merge/review responsibility is added.",
    source: "branch-protection-or-ruleset",
    why: "Separating author from merger is proportionate for a repository whose output other projects trust.",
  },
];

export const CONTROL_IDS = CONTROLS.map((c) => c.id);
const REQUIRED_IDS = CONTROLS.filter((c) => c.required).map((c) => c.id);

/**
 * Derive the repository governance state from control observations.
 *
 * @param {Array<{id: string, result: string, evidenceRead?: boolean, source?: string}>} observations
 * @returns {{state: string, controls: Array, missing: string[], unreadable: string[], absent: string[], reason: string}}
 *
 * The rules, in the order they are applied:
 *
 *   1. An observation claiming SATISFIED or ABSENT while reporting `evidenceRead: false` is not
 *      believed. It becomes UNREADABLE. A conclusion drawn from a source that was not read is the
 *      fabrication this framework exists to prevent, and it is cheaper to refuse it here than to
 *      trust every future collector to be honest.
 *   2. A required control with no observation at all is INDETERMINATE, not skipped. Silence is the
 *      easiest way for a conjunction to be quietly weakened — a collector that learns to omit what
 *      it cannot read would otherwise turn every failure into a pass.
 *   3. Any required control UNREADABLE (including by rules 1 and 2) → INDETERMINATE.
 *   4. Otherwise, any required control ABSENT → UNGOVERNED.
 *   5. Otherwise → GOVERNED.
 *
 * Note the asymmetry in rules 3 and 4: unreadability outranks absence. If one control is missing and
 * another could not be read, the answer is INDETERMINATE, because a state that reported UNGOVERNED
 * would be claiming to know the full set of what is missing, and it does not.
 */
export function deriveGovernance(observations = []) {
  const seen = new Map();
  for (const raw of observations) {
    if (!raw || typeof raw.id !== "string") continue;
    const known = CONTROLS.find((c) => c.id === raw.id);
    if (!known) continue; // a control the contract does not define cannot satisfy it

    let result = raw.result;
    if (!Object.values(CONTROL_RESULT).includes(result)) result = CONTROL_RESULT.UNREADABLE;
    // Rule 1: a verdict without a read source is not a verdict.
    if (raw.evidenceRead === false) result = CONTROL_RESULT.UNREADABLE;

    seen.set(raw.id, {
      id: raw.id,
      title: known.title,
      required: known.required,
      result,
      evidenceRead: raw.evidenceRead === true,
      source: raw.source ?? known.source,
    });
  }

  // Rule 2: unobserved required controls are unreadable, not absent from the conjunction.
  const missing = [];
  for (const id of REQUIRED_IDS) {
    if (seen.has(id)) continue;
    missing.push(id);
    const known = CONTROLS.find((c) => c.id === id);
    seen.set(id, {
      id,
      title: known.title,
      required: true,
      result: CONTROL_RESULT.UNREADABLE,
      evidenceRead: false,
      source: known.source,
      note: "no observation was reported for this control",
    });
  }

  const controls = CONTROL_IDS.map((id) => seen.get(id)).filter(Boolean);
  const required = controls.filter((c) => c.required);
  const unreadable = required.filter((c) => c.result === CONTROL_RESULT.UNREADABLE).map((c) => c.id);
  const absent = required.filter((c) => c.result === CONTROL_RESULT.ABSENT).map((c) => c.id);

  let state;
  let reason;
  if (unreadable.length > 0) {
    // Rule 3 — before rule 4, deliberately.
    state = GOVERNANCE.INDETERMINATE;
    reason = `host state could not be established for ${unreadable.length} required control(s): ${unreadable.join(", ")}`;
  } else if (absent.length > 0) {
    state = GOVERNANCE.UNGOVERNED;
    reason = `every required control was read, and ${absent.length} is/are absent: ${absent.join(", ")}`;
  } else {
    state = GOVERNANCE.GOVERNED;
    reason = `all ${required.length} required controls were read and established`;
  }

  return { state, controls, missing, unreadable, absent, reason };
}
