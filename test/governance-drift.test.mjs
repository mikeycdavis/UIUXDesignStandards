/**
 * Governance drift detection.
 *
 * Offline, over the same contract and the same collector the live runs use. Expectations are derived
 * from `CONTROLS`, never from a hard-coded count.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { CONTROLS, CONTROL_RESULT, GOVERNANCE } from "../scripts/governance.mjs";
import { READ, report } from "../scripts/host-evidence.mjs";
import { DRIFT, compareGovernance, contractDigest, normalize } from "../scripts/governance-drift.mjs";

const REQUIRED = CONTROLS.filter((c) => c.required).map((c) => c.id);

function serving(map) {
  return (pathname) => {
    for (const [fragment, response] of Object.entries(map)) {
      if (pathname.includes(fragment)) return response;
    }
    return { read: READ.FAILED, detail: `no recorded response for ${pathname}` };
  };
}

const NOT_PROTECTED = { read: READ.NOT_FOUND, detail: "Branch not protected" };

/** The rulesets this repository actually has, as recorded shapes. */
function branchRuleset(overrides = {}) {
  return {
    id: 20914072,
    name: "main",
    target: "branch",
    enforcement: "active",
    conditions: { ref_name: { include: ["~DEFAULT_BRANCH"] } },
    bypass_actors: [],
    rules: [
      { type: "pull_request", parameters: { required_approving_review_count: 0 } },
      { type: "required_status_checks", parameters: { required_status_checks: [{ context: "standards" }] } },
      { type: "non_fast_forward" },
      { type: "deletion" },
    ],
    ...overrides,
  };
}

function tagRuleset(overrides = {}) {
  return {
    id: 20914075,
    name: "released-tags",
    target: "tag",
    enforcement: "active",
    conditions: { ref_name: { include: ["refs/tags/v*"] } },
    bypass_actors: [],
    rules: [{ type: "deletion" }, { type: "non_fast_forward" }, { type: "update" }],
    ...overrides,
  };
}

function hostServing(branch, tag) {
  return serving({
    "branches/main/protection": NOT_PROTECTED,
    "rulesets/20914072": { read: READ.OK, body: branch },
    "rulesets/20914075": { read: READ.OK, body: tag },
    rulesets: { read: READ.OK, body: [{ id: 20914072 }, { id: 20914075 }] },
  });
}

/** The governed baseline, as D1-E recorded it. */
function baseline() {
  const result = report(hostServing(branchRuleset(), tagRuleset()));
  assert.equal(result.state, GOVERNANCE.GOVERNED, "the fixture must reproduce the governed host");
  return normalize(result);
}

function currentFrom(request) {
  return normalize(report(request));
}

// --- Anti-vacuity ---

test("the baseline fixture reproduces a governed host, so drift has something to lose", () => {
  const recorded = baseline();
  assert.deepEqual(Object.keys(recorded.controls).sort(), [...REQUIRED].sort());
  for (const id of REQUIRED) assert.equal(recorded.controls[id], CONTROL_RESULT.SATISFIED);
});

// --- Known-positive ---

test("an unchanged host is NO_DRIFT", () => {
  const verdict = compareGovernance({ baseline: baseline(), current: currentFrom(hostServing(branchRuleset(), tagRuleset())) });
  assert.equal(verdict.state, DRIFT.NO_DRIFT);
  assert.deepEqual([verdict.drifted, verdict.unreadable], [[], []]);
});

test("ruleset id and name may change while the six controls remain satisfied", () => {
  // The durable claim is the control, not the identifier GitHub assigned it.
  const branch = branchRuleset({ id: 99999001, name: "main-protection-v2" });
  const tag = tagRuleset({ id: 99999002, name: "tags-v2" });
  const request = serving({
    "branches/main/protection": NOT_PROTECTED,
    "rulesets/99999001": { read: READ.OK, body: branch },
    "rulesets/99999002": { read: READ.OK, body: tag },
    rulesets: { read: READ.OK, body: [{ id: 99999001 }, { id: 99999002 }] },
  });

  const verdict = compareGovernance({ baseline: baseline(), current: currentFrom(request) });
  assert.equal(verdict.state, DRIFT.NO_DRIFT, "recreating an equivalent ruleset is not a regression");
});

// --- Known-negative ---

test("the required standards check being removed is DRIFTED, even though the workflow still exists", () => {
  // The flagship case. The workflow file is untouched, and a successful check run for `standards`
  // exists in this repository's history — neither is consulted, because neither is evidence that the
  // check is still REQUIRED. "It has run before" and "it must pass now" are different propositions.
  const branch = branchRuleset();
  branch.rules[1].parameters.required_status_checks = [];

  const verdict = compareGovernance({ baseline: baseline(), current: currentFrom(hostServing(branch, tagRuleset())) });
  assert.equal(verdict.state, DRIFT.DRIFTED);
  assert.deepEqual(verdict.drifted, ["main.standards_check_required"]);
});

test("a satisfied control becoming absent is DRIFTED", () => {
  const branch = branchRuleset();
  branch.rules.splice(0, 1); // pull_request removed

  const verdict = compareGovernance({ baseline: baseline(), current: currentFrom(hostServing(branch, tagRuleset())) });
  assert.equal(verdict.state, DRIFT.DRIFTED);
  assert.deepEqual(verdict.drifted, ["main.pr_required"]);
});

test("a bypass actor appearing is DRIFTED", () => {
  const branch = branchRuleset({ bypass_actors: [{ actor_type: "RepositoryRole", bypass_mode: "always" }] });
  const verdict = compareGovernance({ baseline: baseline(), current: currentFrom(hostServing(branch, tagRuleset())) });
  assert.equal(verdict.state, DRIFT.DRIFTED);
  assert.deepEqual(verdict.drifted, ["bypass.policy"]);
});

test("a satisfied control becoming unreadable is INDETERMINATE, not DRIFTED", () => {
  const request = serving({
    "branches/main/protection": NOT_PROTECTED,
    rulesets: { read: READ.FAILED, detail: "HTTP 403" },
  });

  const verdict = compareGovernance({ baseline: baseline(), current: currentFrom(request) });
  assert.equal(verdict.state, DRIFT.INDETERMINATE, "a failed read is not evidence that anything changed");
  assert.deepEqual(verdict.drifted, []);
  assert.ok(verdict.unreadable.length > 0);
});

test("a confirmed regression is not filed under 'could not tell' by an unreadable neighbour", () => {
  // Deliberately the reverse precedence to deriveGovernance, and the reasoning is recorded in the
  // module: there, UNGOVERNED claims to know the complete set of what is missing. Here, an observed
  // regression is established, and reporting INDETERMINATE would convert a known bad into an unknown.
  const baselineRecord = baseline();
  const current = {
    contractDigest: baselineRecord.contractDigest,
    controls: {
      ...Object.fromEntries(REQUIRED.map((id) => [id, CONTROL_RESULT.SATISFIED])),
      "main.pr_required": CONTROL_RESULT.ABSENT,
      "tags.v_star_immutable": CONTROL_RESULT.UNREADABLE,
    },
    deferred: {},
  };

  const verdict = compareGovernance({ baseline: baselineRecord, current });
  assert.equal(verdict.state, DRIFT.DRIFTED);
  assert.deepEqual(verdict.drifted, ["main.pr_required"]);
  assert.deepEqual(verdict.unreadable, ["tags.v_star_immutable"], "and the uncertainty is still reported, not hidden");
});

// --- The deferred control is news, never drift ---

test("a change in the deferred review control is reported and does not cause drift", () => {
  const baselineRecord = baseline();
  const current = {
    contractDigest: baselineRecord.contractDigest,
    controls: Object.fromEntries(REQUIRED.map((id) => [id, CONTROL_RESULT.SATISFIED])),
    deferred: { "main.review_required": CONTROL_RESULT.SATISFIED },
  };

  const verdict = compareGovernance({ baseline: baselineRecord, current });
  assert.equal(verdict.state, DRIFT.NO_DRIFT, "a control outside the conjunction cannot make the conjunction fail");
  assert.deepEqual(verdict.deferredChanges, [
    { id: "main.review_required", was: CONTROL_RESULT.ABSENT, now: CONTROL_RESULT.SATISFIED },
  ]);
});

// --- The policy moving is not the host moving ---

test("a changed required-control set is CONTRACT_CHANGED, never drift", () => {
  const stale = { ...baseline(), contractDigest: "0000000000000000000000000000abcd" };
  const verdict = compareGovernance({ baseline: stale, current: currentFrom(hostServing(branchRuleset(), tagRuleset())) });

  assert.equal(verdict.state, DRIFT.CONTRACT_CHANGED);
  assert.deepEqual(verdict.drifted, [], "blaming the host for a decision made in this repository is the failure mode");
  assert.match(verdict.reason, /policy change/);
});

test("the contract digest covers the required set and ignores everything else", () => {
  const before = contractDigest();
  assert.equal(before, contractDigest(CONTROLS.map((c) => ({ ...c, title: "renamed", why: "reworded" }))), "prose is not identity");

  const deferredNowRequired = CONTROLS.map((c) => (c.required ? c : { ...c, required: true }));
  assert.notEqual(before, contractDigest(deferredNowRequired), "promoting a deferred control changes the contract");
});

test("no baseline at all is INDETERMINATE, never NO_DRIFT", () => {
  const verdict = compareGovernance({ baseline: null, current: currentFrom(hostServing(branchRuleset(), tagRuleset())) });
  assert.equal(verdict.state, DRIFT.INDETERMINATE, "nothing to compare against is not the same as nothing changed");
});

test("a control never established at baseline cannot be reported as having regressed", () => {
  const baselineRecord = baseline();
  baselineRecord.controls["bypass.policy"] = CONTROL_RESULT.ABSENT;

  const current = {
    contractDigest: baselineRecord.contractDigest,
    controls: { ...baselineRecord.controls },
    deferred: {},
  };
  const verdict = compareGovernance({ baseline: baselineRecord, current });
  assert.equal(verdict.state, DRIFT.NO_DRIFT);
  assert.deepEqual(verdict.drifted, [], "it was never satisfied, so it did not become unsatisfied");
});
