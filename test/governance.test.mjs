/**
 * The host-enforcement state machine.
 *
 * Every way the derivation must refuse to say GOVERNED, plus the positive control — without which
 * "never says GOVERNED" would satisfy all of them. The contract is docs/host-enforcement.md.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { CONTROLS, CONTROL_IDS, CONTROL_RESULT, GOVERNANCE, deriveGovernance } from "../scripts/governance.mjs";

const REQUIRED = CONTROLS.filter((c) => c.required).map((c) => c.id);

/** Every required control read and satisfied. The baseline the negative cases perturb. */
function allSatisfied() {
  return REQUIRED.map((id) => ({ id, result: CONTROL_RESULT.SATISFIED, evidenceRead: true }));
}

// --- Anti-vacuity ---

test("the contract defines controls, and some of them are required", () => {
  assert.ok(CONTROLS.length >= 7, `the contract must define the seven controls, found ${CONTROLS.length}`);
  assert.ok(REQUIRED.length > 0, "a conjunction over zero required controls would be satisfied by anything");
  assert.equal(new Set(CONTROL_IDS).size, CONTROL_IDS.length, "control ids are unique");
});

// --- Known-positive ---

test("all required controls read and satisfied is GOVERNED", () => {
  const { state, absent, unreadable, missing } = deriveGovernance(allSatisfied());
  assert.equal(state, GOVERNANCE.GOVERNED);
  assert.deepEqual([absent, unreadable, missing], [[], [], []]);
});

test("a deferred control's absence does not make the repository UNGOVERNED, and is still reported", () => {
  const observations = [
    ...allSatisfied(),
    { id: "main.review_required", result: CONTROL_RESULT.ABSENT, evidenceRead: true },
  ];
  const { state, controls } = deriveGovernance(observations);
  assert.equal(state, GOVERNANCE.GOVERNED, "a control outside the conjunction cannot make it fail");

  const review = controls.find((c) => c.id === "main.review_required");
  assert.ok(review, "a deferred control is still reported — deferring is not omitting");
  assert.equal(review.result, CONTROL_RESULT.ABSENT, "and it is reported honestly");
  assert.equal(review.required, false);
});

// --- Known-negative ---

test("every required control read, one absent, is UNGOVERNED", () => {
  const observations = allSatisfied();
  observations[0] = { id: REQUIRED[0], result: CONTROL_RESULT.ABSENT, evidenceRead: true };

  const { state, absent, reason } = deriveGovernance(observations);
  assert.equal(state, GOVERNANCE.UNGOVERNED);
  assert.deepEqual(absent, [REQUIRED[0]]);
  assert.match(reason, /every required control was read/, "UNGOVERNED is a claim about what was read");
});

test("an unreadable required control is INDETERMINATE, never UNGOVERNED", () => {
  const observations = allSatisfied();
  observations[0] = { id: REQUIRED[0], result: CONTROL_RESULT.UNREADABLE, evidenceRead: false };

  const { state, unreadable } = deriveGovernance(observations);
  assert.equal(state, GOVERNANCE.INDETERMINATE, "could not look is not the same as looked and found nothing");
  assert.deepEqual(unreadable, [REQUIRED[0]]);
});

test("unreadability outranks absence: one missing and one unreadable is INDETERMINATE", () => {
  const observations = allSatisfied();
  observations[0] = { id: REQUIRED[0], result: CONTROL_RESULT.ABSENT, evidenceRead: true };
  observations[1] = { id: REQUIRED[1], result: CONTROL_RESULT.UNREADABLE, evidenceRead: false };

  const { state } = deriveGovernance(observations);
  assert.equal(
    state,
    GOVERNANCE.INDETERMINATE,
    "reporting UNGOVERNED here would claim to know the full set of what is missing, which it does not",
  );
});

test("a required control nobody reported is INDETERMINATE, not silently dropped", () => {
  const observations = allSatisfied().filter((o) => o.id !== REQUIRED[2]);

  const { state, missing, unreadable } = deriveGovernance(observations);
  assert.equal(state, GOVERNANCE.INDETERMINATE, "silence must not shrink the conjunction");
  assert.deepEqual(missing, [REQUIRED[2]]);
  assert.ok(unreadable.includes(REQUIRED[2]), "and it is named, not merely counted");
});

test("reporting no observations at all is INDETERMINATE, not GOVERNED", () => {
  const { state, missing } = deriveGovernance([]);
  assert.equal(state, GOVERNANCE.INDETERMINATE);
  assert.deepEqual(missing.sort(), [...REQUIRED].sort(), "every required control is named as unestablished");
});

test("SATISFIED claimed over a source that was not read is not believed", () => {
  const observations = allSatisfied();
  observations[0] = { id: REQUIRED[0], result: CONTROL_RESULT.SATISFIED, evidenceRead: false };

  const { state, controls } = deriveGovernance(observations);
  assert.equal(state, GOVERNANCE.INDETERMINATE, "a conclusion drawn from an unread source is not a conclusion");
  assert.equal(controls.find((c) => c.id === REQUIRED[0]).result, CONTROL_RESULT.UNREADABLE);
});

test("a control the contract does not define cannot satisfy the contract", () => {
  const observations = [
    ...allSatisfied().slice(1),
    { id: "main.something_invented", result: CONTROL_RESULT.SATISFIED, evidenceRead: true },
  ];

  const { state, missing } = deriveGovernance(observations);
  assert.equal(state, GOVERNANCE.INDETERMINATE, "an unknown id must not stand in for the one that is missing");
  assert.deepEqual(missing, [REQUIRED[0]]);
});

test("an unrecognised result value is treated as unreadable, not as satisfied", () => {
  const observations = allSatisfied();
  observations[0] = { id: REQUIRED[0], result: "PROBABLY_FINE", evidenceRead: true };

  const { state } = deriveGovernance(observations);
  assert.equal(state, GOVERNANCE.INDETERMINATE);
});

// --- The aggregate is derived, not asserted ---

test("a caller cannot hand in its own aggregate state", () => {
  const observations = allSatisfied();
  observations[0] = { id: REQUIRED[0], result: CONTROL_RESULT.ABSENT, evidenceRead: true };

  const { state } = deriveGovernance(
    Object.assign(observations, { state: GOVERNANCE.GOVERNED, governance: GOVERNANCE.GOVERNED }),
  );
  assert.equal(state, GOVERNANCE.UNGOVERNED, "the aggregate comes from the controls and nowhere else");
});

test("every control carries the evidence source it would be read from", () => {
  for (const control of CONTROLS) {
    assert.ok(control.source, `${control.id} names no evidence source`);
    assert.ok(control.why, `${control.id} records no reason for existing`);
  }
  for (const control of CONTROLS.filter((c) => !c.required)) {
    assert.ok(
      control.deferredReason,
      `${control.id} is outside the conjunction with no recorded reason — deferring is a decision, not a default`,
    );
    assert.ok(
      control.revisitWhen,
      `${control.id} is deferred with no revisit trigger — a deferral with no way back is an abandonment`,
    );
  }
});
