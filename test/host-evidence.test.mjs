/**
 * The host evidence collector.
 *
 * Runs entirely offline against recorded API shapes: the request function is injected, so the
 * container — which has no network and no credentials — can still prove that a 403 never becomes
 * "no protection exists".
 *
 * Expectations are derived from the contract in scripts/governance.mjs, never from a hard-coded
 * count. A number written here would drift the moment a control is added or deferred, and would drift
 * silently in the favourable direction.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CONTROLS, CONTROL_RESULT, GOVERNANCE } from "../scripts/governance.mjs";
import { READ, collect, interpret, report, defaultRequest } from "../scripts/host-evidence.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REQUIRED = CONTROLS.filter((c) => c.required).map((c) => c.id);

/** A request function serving recorded responses by endpoint substring. */
function serving(map) {
  return (pathname) => {
    for (const [fragment, response] of Object.entries(map)) {
      if (pathname.includes(fragment)) return response;
    }
    return { read: READ.FAILED, detail: `no recorded response for ${pathname}` };
  };
}

const NOT_PROTECTED = { read: READ.NOT_FOUND, detail: "Branch not protected" };
const NO_RULESETS = { read: READ.OK, body: [] };
const FORBIDDEN = { read: READ.FAILED, detail: "HTTP 403: Resource not accessible by personal access token" };

/** A ruleset establishing every branch control, with no bypass. */
const FULL_BRANCH_RULESET = {
  id: 1,
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
};

const TAG_RULESET = {
  id: 2,
  target: "tag",
  enforcement: "active",
  conditions: { ref_name: { include: ["refs/tags/v*"] } },
  bypass_actors: [],
  rules: [{ type: "deletion" }, { type: "update" }],
};

function governedHost() {
  return serving({
    "branches/main/protection": NOT_PROTECTED,
    "rulesets/1": { read: READ.OK, body: FULL_BRANCH_RULESET },
    "rulesets/2": { read: READ.OK, body: TAG_RULESET },
    rulesets: { read: READ.OK, body: [{ id: 1 }, { id: 2 }] },
  });
}

function resultFor(request) {
  return report(request);
}

// --- Anti-vacuity ---

test("the contract has required controls for these cases to be about", () => {
  assert.ok(REQUIRED.length > 0);
});

// --- The dogfood case: this repository as it stands today ---

test("an unprotected repository is UNGOVERNED, with every required control read and absent", () => {
  const { state, controls, unreadable } = resultFor(
    serving({ "branches/main/protection": NOT_PROTECTED, rulesets: NO_RULESETS }),
  );

  assert.equal(state, GOVERNANCE.UNGOVERNED, "the host answered; this is a finding, not a failure to look");
  assert.deepEqual(unreadable, [], "nothing was unreadable — 404 is an answer");

  const required = controls.filter((c) => c.required);
  assert.deepEqual(
    required.map((c) => c.id).sort(),
    [...REQUIRED].sort(),
    "the expectation is derived from the contract, so adding a control cannot silently escape it",
  );
  for (const control of required) {
    assert.equal(control.result, CONTROL_RESULT.ABSENT, `${control.id} should be absent on an unprotected repository`);
    assert.equal(control.evidenceRead, true, `${control.id} was established by a read, not assumed`);
  }
});

test("the deferred control is still observed and reported on that same run", () => {
  const { controls } = resultFor(serving({ "branches/main/protection": NOT_PROTECTED, rulesets: NO_RULESETS }));
  const review = controls.find((c) => c.id === "main.review_required");
  assert.ok(review, "a deferred control is reported, not omitted");
  assert.equal(review.required, false, "and it is outside the conjunction");
});

// --- The unreadable/absent distinction ---

test("a forbidden branch-protection read is INDETERMINATE, never UNGOVERNED", () => {
  const { state, unreadable } = resultFor(serving({ "branches/main/protection": FORBIDDEN, rulesets: NO_RULESETS }));
  assert.equal(state, GOVERNANCE.INDETERMINATE);
  assert.ok(unreadable.length > 0, "the controls whose source failed are named");
});

test("one source answering 'no' while the other is unreadable is UNREADABLE, not ABSENT", () => {
  // Branch protection says 404 — a real answer. But a ruleset could still establish these controls,
  // and the rulesets endpoint failed, so absence is not established.
  const { state, controls } = resultFor(serving({ "branches/main/protection": NOT_PROTECTED, rulesets: FORBIDDEN }));

  assert.equal(state, GOVERNANCE.INDETERMINATE);
  const prRequired = controls.find((c) => c.id === "main.pr_required");
  assert.equal(
    prRequired.result,
    CONTROL_RESULT.UNREADABLE,
    "the unread source is exactly where the establishing answer might have been",
  );
});

test("a listed ruleset whose detail cannot be read makes the ruleset source unreadable", () => {
  const request = serving({
    "branches/main/protection": NOT_PROTECTED,
    "rulesets/1": FORBIDDEN,
    rulesets: { read: READ.OK, body: [{ id: 1 }] },
  });
  const { rulesets } = collect(request);
  assert.equal(rulesets.read, READ.FAILED, "the rule it contains might be the one that establishes a control");

  assert.equal(resultFor(request).state, GOVERNANCE.INDETERMINATE);
});

// --- Known-positive: the same code must be able to say GOVERNED ---

test("a fully configured host is GOVERNED, from the same collector", () => {
  const { state, controls, absent, unreadable } = resultFor(governedHost());
  assert.equal(state, GOVERNANCE.GOVERNED, "without this, every refusal above would be satisfied by 'always refuses'");
  assert.deepEqual([absent, unreadable], [[], []]);
  for (const control of controls.filter((c) => c.required)) {
    assert.equal(control.result, CONTROL_RESULT.SATISFIED);
  }
});

// --- Known-negative: each control can independently fail ---

test("a required check by another name does not satisfy the standards check control", () => {
  const ruleset = structuredClone(FULL_BRANCH_RULESET);
  ruleset.rules[1].parameters.required_status_checks = [{ context: "build" }];
  const { state, absent } = resultFor(
    serving({
      "branches/main/protection": NOT_PROTECTED,
      "rulesets/1": { read: READ.OK, body: ruleset },
      "rulesets/2": { read: READ.OK, body: TAG_RULESET },
      rulesets: { read: READ.OK, body: [{ id: 1 }, { id: 2 }] },
    }),
  );
  assert.equal(state, GOVERNANCE.UNGOVERNED);
  assert.deepEqual(absent, ["main.standards_check_required"]);
});

test("an enforcing ruleset with bypass actors does not satisfy the bypass control", () => {
  const ruleset = structuredClone(FULL_BRANCH_RULESET);
  ruleset.bypass_actors = [{ actor_id: 1, actor_type: "OrganizationAdmin", bypass_mode: "always" }];
  const { state, absent } = resultFor(
    serving({
      "branches/main/protection": NOT_PROTECTED,
      "rulesets/1": { read: READ.OK, body: ruleset },
      "rulesets/2": { read: READ.OK, body: TAG_RULESET },
      rulesets: { read: READ.OK, body: [{ id: 1 }, { id: 2 }] },
    }),
  );
  assert.equal(state, GOVERNANCE.UNGOVERNED, "a control everyone may bypass is the configuration that looks strongest");
  assert.deepEqual(absent, ["bypass.policy"]);
});

test("an inactive ruleset establishes nothing", () => {
  const ruleset = { ...structuredClone(FULL_BRANCH_RULESET), enforcement: "evaluate" };
  const { state } = resultFor(
    serving({
      "branches/main/protection": NOT_PROTECTED,
      "rulesets/1": { read: READ.OK, body: ruleset },
      rulesets: { read: READ.OK, body: [{ id: 1 }] },
    }),
  );
  assert.equal(state, GOVERNANCE.UNGOVERNED, "a ruleset in evaluate mode reports; it does not enforce");
});

test("a tag ruleset that permits updates does not make v* immutable", () => {
  const tag = structuredClone(TAG_RULESET);
  tag.rules = [{ type: "deletion" }];
  const { absent } = resultFor(
    serving({
      "branches/main/protection": NOT_PROTECTED,
      "rulesets/1": { read: READ.OK, body: FULL_BRANCH_RULESET },
      "rulesets/2": { read: READ.OK, body: tag },
      rulesets: { read: READ.OK, body: [{ id: 1 }, { id: 2 }] },
    }),
  );
  assert.deepEqual(absent, ["tags.v_star_immutable"], "immutable means neither deleted nor moved");
});

// --- Every control is independently falsifiable ---

test("each required control can be the only one absent, so none is decorative", () => {
  const seen = new Set();
  const variants = [
    ["main.pr_required", (r) => r.rules.splice(0, 1)],
    ["main.standards_check_required", (r) => r.rules.splice(1, 1)],
    ["main.force_push_prohibited", (r) => r.rules.splice(2, 1)],
    ["main.deletion_prohibited", (r) => r.rules.splice(3, 1)],
    ["bypass.policy", (r) => r.bypass_actors.push({ actor_type: "RepositoryRole" })],
  ];

  for (const [id, mutate] of variants) {
    const ruleset = structuredClone(FULL_BRANCH_RULESET);
    mutate(ruleset);
    const { absent } = resultFor(
      serving({
        "branches/main/protection": NOT_PROTECTED,
        "rulesets/1": { read: READ.OK, body: ruleset },
        "rulesets/2": { read: READ.OK, body: TAG_RULESET },
        rulesets: { read: READ.OK, body: [{ id: 1 }, { id: 2 }] },
      }),
    );
    assert.deepEqual(absent, [id], `removing the ${id} rule should make exactly that control absent`);
    seen.add(id);
  }
  assert.equal(seen.size, variants.length);
});

// --- Read-only by construction ---

test("the collector can only issue reads", async () => {
  const source = await readFile(path.join(ROOT, "scripts/host-evidence.mjs"), "utf8");
  const code = source.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  for (const forbidden of ["--method", '"-X"', "-f ", "--field", "--input"]) {
    assert.ok(!code.includes(forbidden), `the collector must not be able to send ${forbidden}`);
  }
  for (const verb of ["POST", "PATCH", "PUT", "DELETE"]) {
    assert.ok(!code.includes(verb), `the collector names the HTTP verb ${verb}, which a reader never needs`);
  }
  assert.match(code, /spawnSync\("gh", \["api", pathname\]/, "gh is passed a path and nothing else");
});

test("an undeterminable HTTP status is a failed read, never a not-found", () => {
  // The guard against inferring absence from a response nobody could parse.
  const source = defaultRequest;
  assert.equal(typeof source, "function");

  const { state } = resultFor(
    serving({ "branches/main/protection": { read: READ.FAILED, detail: "gh failed with no readable status" }, rulesets: NO_RULESETS }),
  );
  assert.equal(state, GOVERNANCE.INDETERMINATE);
});
