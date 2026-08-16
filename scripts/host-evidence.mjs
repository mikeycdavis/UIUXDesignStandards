/**
 * Read GitHub's enforcement state, and report it as control observations.
 *
 * Read-only by construction. Every request this module can make is a GET, and the one place that
 * spawns a process is `defaultRequest` below, which passes `gh api` a path and nothing else — no
 * method, no body, no field. It changes no setting; changing settings is a later, separately
 * authorized step (see artifacts/project-plan-breakdown/17-host-enforcement.md).
 *
 * The interpretation is a pure function taking already-fetched responses, so the whole decision
 * procedure runs inside the CI container, which has no network and no credentials. The container
 * cannot reach GitHub; it can still prove that a 403 is not read as "no protection exists".
 *
 * Authentication uses the developer's existing `gh` session. No token is read from, written to, or
 * stored in this repository.
 *
 * The distinction this module exists to preserve:
 *
 *     404 Branch not protected   → the host answered, and the control is ABSENT
 *     403 / network / no auth    → the host did not answer, and the control is UNREADABLE
 *
 * One is a fact about the repository. The other is a fact about the caller. Collapsing them is how a
 * governance report comes to describe the observer instead of the subject.
 */

import { spawnSync } from "node:child_process";

import { CONTROLS, CONTROL_RESULT, deriveGovernance } from "./governance.mjs";

/** What a single endpoint read produced. */
export const READ = {
  /** The endpoint answered with a body. */
  OK: "OK",
  /** The endpoint answered that the thing does not exist. An answer, not a failure. */
  NOT_FOUND: "NOT_FOUND",
  /** No usable answer: permissions, transport, auth, malformed body, anything else. */
  FAILED: "FAILED",
};

/**
 * Endpoints, named once. `{owner}/{repo}` are gh's own placeholders, resolved from the checked-out
 * remote, so no repository identity is hard-coded here.
 */
export const ENDPOINTS = {
  branchProtection: "repos/{owner}/{repo}/branches/main/protection",
  rulesets: "repos/{owner}/{repo}/rulesets",
  ruleset: (id) => `repos/{owner}/{repo}/rulesets/${id}`,
};

/**
 * Run one read through `gh api`.
 *
 * The HTTP status is taken from the `status` field of GitHub's own JSON error body rather than from
 * gh's human-readable stderr line. That field is API data; the stderr sentence is CLI prose, and
 * making correctness depend on a phrasing nobody promised to keep is the defect this project already
 * fixed once in submit-pr. If the status cannot be determined at all, the read is FAILED — never
 * NOT_FOUND, because "I could not tell" must not become "it is not there".
 */
export function defaultRequest(pathname) {
  const run = spawnSync("gh", ["api", pathname], { encoding: "utf8", shell: process.platform === "win32" });

  if (run.error) return { read: READ.FAILED, detail: `gh could not be executed: ${run.error.message}` };

  let body = null;
  try {
    body = JSON.parse(run.stdout);
  } catch {
    body = null;
  }

  if (run.status === 0) {
    if (body === null) return { read: READ.FAILED, detail: "the response was not JSON" };
    return { read: READ.OK, body };
  }

  const status = body && typeof body === "object" && !Array.isArray(body) ? Number(body.status) : NaN;
  if (status === 404) return { read: READ.NOT_FOUND, detail: body.message ?? "not found" };
  if (Number.isFinite(status)) return { read: READ.FAILED, detail: `HTTP ${status}: ${body.message ?? ""}`.trim() };
  return { read: READ.FAILED, detail: (run.stderr || "gh failed with no readable status").trim() };
}

/**
 * Fetch everything the contract needs. Separated from interpretation so the interpreter is pure.
 */
export function collect(request = defaultRequest) {
  const protection = request(ENDPOINTS.branchProtection);
  const rulesetList = request(ENDPOINTS.rulesets);

  let rulesets = { read: rulesetList.read, detail: rulesetList.detail, items: [] };
  if (rulesetList.read === READ.OK) {
    const items = [];
    for (const summary of Array.isArray(rulesetList.body) ? rulesetList.body : []) {
      const detail = request(ENDPOINTS.ruleset(summary.id));
      // A listed ruleset whose detail cannot be read makes the whole ruleset source unreadable: the
      // rule it contains might be the one that establishes a control, and assuming it does not is
      // assuming the favourable answer to a question that was not asked.
      if (detail.read !== READ.OK) {
        return { protection, rulesets: { read: READ.FAILED, detail: `ruleset ${summary.id}: ${detail.detail}`, items: [] } };
      }
      items.push(detail.body);
    }
    rulesets = { read: READ.OK, items };
  } else if (rulesetList.read === READ.NOT_FOUND) {
    // No ruleset API state is an answer: there are none.
    rulesets = { read: READ.OK, items: [] };
  }

  return { protection, rulesets };
}

/** Active rulesets targeting a given ref kind. */
function activeRulesets(items, target) {
  return items.filter((r) => r?.enforcement === "active" && (r?.target ?? "branch") === target);
}

function hasRule(rulesets, type) {
  return rulesets.some((r) => (r.rules ?? []).some((rule) => rule?.type === type));
}

/**
 * Does any active ruleset apply to the default branch? GitHub expresses this several ways; the
 * `~DEFAULT_BRANCH` token and an explicit `refs/heads/main` are the two that matter here.
 */
function targetsMain(ruleset) {
  const include = ruleset?.conditions?.ref_name?.include ?? [];
  return include.includes("~DEFAULT_BRANCH") || include.includes("~ALL") || include.includes("refs/heads/main");
}

function targetsVStar(ruleset) {
  const include = ruleset?.conditions?.ref_name?.include ?? [];
  return include.includes("~ALL") || include.some((p) => /^refs\/tags\/v/.test(p));
}

/**
 * Combine what two independent sources say about one control.
 *
 * A control is established if EITHER source establishes it, so this is a disjunction — and the
 * unreadability rule falls out of that shape rather than being bolted on. If no source establishes
 * the control, "absent" may only be concluded when every source that COULD have established it was
 * actually read. One source saying "no" while another could not be read is UNREADABLE, because the
 * unread one is exactly where the answer might have been.
 */
export function combine({ establishedBy, sources }) {
  if (establishedBy.length > 0) {
    return { result: CONTROL_RESULT.SATISFIED, evidenceRead: true, source: establishedBy.join(" + ") };
  }
  const unread = sources.filter((s) => s.read !== READ.OK && s.read !== READ.NOT_FOUND);
  if (unread.length > 0) {
    return {
      result: CONTROL_RESULT.UNREADABLE,
      evidenceRead: false,
      source: sources.map((s) => s.name).join(" + "),
      detail: unread.map((s) => `${s.name}: ${s.detail ?? "unreadable"}`).join("; "),
    };
  }
  return { result: CONTROL_RESULT.ABSENT, evidenceRead: true, source: sources.map((s) => s.name).join(" + ") };
}

/**
 * Interpret fetched host state as one observation per contract control. Pure.
 */
export function interpret({ protection, rulesets }) {
  const prot = protection.read === READ.OK ? protection.body : null;
  const items = rulesets.read === READ.OK ? rulesets.items : [];
  const branchRules = activeRulesets(items, "branch").filter(targetsMain);
  const tagRules = activeRulesets(items, "tag").filter(targetsVStar);

  const protectionSource = { name: "branch-protection", read: protection.read, detail: protection.detail };
  const rulesetSource = { name: "rulesets", read: rulesets.read, detail: rulesets.detail };
  const bothSources = [protectionSource, rulesetSource];

  /** @param {string[]} establishedBy */
  const from = (establishedBy, sources = bothSources) => combine({ establishedBy, sources });

  const observations = [];
  const push = (id, combined) => observations.push({ id, ...combined });

  push(
    "main.pr_required",
    from([
      ...(prot?.required_pull_request_reviews ? ["branch-protection"] : []),
      ...(hasRule(branchRules, "pull_request") ? ["rulesets"] : []),
    ]),
  );

  push(
    "main.standards_check_required",
    from([
      ...(namesStandards(prot?.required_status_checks) ? ["branch-protection"] : []),
      ...(rulesetNamesStandards(branchRules) ? ["rulesets"] : []),
    ]),
  );

  push(
    "main.force_push_prohibited",
    from([
      ...(prot && prot.allow_force_pushes?.enabled === false ? ["branch-protection"] : []),
      ...(hasRule(branchRules, "non_fast_forward") ? ["rulesets"] : []),
    ]),
  );

  push(
    "main.deletion_prohibited",
    from([
      ...(prot && prot.allow_deletions?.enabled === false ? ["branch-protection"] : []),
      ...(hasRule(branchRules, "deletion") ? ["rulesets"] : []),
    ]),
  );

  // Tags are ruleset-only: classic branch protection cannot express them, so branch-protection is not
  // among this control's sources and its readability is irrelevant here.
  push(
    "tags.v_star_immutable",
    from(
      tagRules.length > 0 && hasRule(tagRules, "deletion") && hasRule(tagRules, "update") ? ["rulesets"] : [],
      [rulesetSource],
    ),
  );

  // Bypass: established when nothing enforcing is bypassable. An enforcing ruleset with bypass actors
  // configured is NOT satisfied — that is the "looks stronger in the UI" configuration.
  const enforcing = [...branchRules, ...tagRules];
  const noRulesetBypass = enforcing.length > 0 && enforcing.every((r) => (r.bypass_actors ?? []).length === 0);
  push(
    "bypass.policy",
    from([
      ...(prot?.enforce_admins?.enabled === true ? ["branch-protection"] : []),
      ...(noRulesetBypass ? ["rulesets"] : []),
    ]),
  );

  push(
    "main.review_required",
    from([
      ...((prot?.required_pull_request_reviews?.required_approving_review_count ?? 0) >= 1 ? ["branch-protection"] : []),
      ...(branchRules.some((r) =>
        (r.rules ?? []).some(
          (rule) => rule?.type === "pull_request" && (rule?.parameters?.required_approving_review_count ?? 0) >= 1,
        ),
      )
        ? ["rulesets"]
        : []),
    ]),
  );

  return observations;
}

/** The required check must be the standards check, by name. */
function namesStandards(checks) {
  if (!checks) return false;
  const contexts = checks.contexts ?? (checks.checks ?? []).map((c) => c.context);
  return contexts.includes("standards");
}

function rulesetNamesStandards(rulesets) {
  return rulesets.some((r) =>
    (r.rules ?? []).some(
      (rule) =>
        rule?.type === "required_status_checks" &&
        (rule?.parameters?.required_status_checks ?? []).some((c) => c.context === "standards"),
    ),
  );
}

/** Collect, interpret, and derive. The aggregate comes from governance.mjs, never from here. */
export function report(request = defaultRequest) {
  const fetched = collect(request);
  const observations = interpret(fetched);
  return { ...deriveGovernance(observations), observations, readAt: new Date().toISOString() };
}

function render(result) {
  const lines = [];
  lines.push("");
  lines.push(`  overall: ${result.state}`);
  lines.push(`  ${result.reason}`);
  lines.push("");
  lines.push("  required controls:");
  for (const control of result.controls.filter((c) => c.required)) {
    lines.push(`    ${control.id.padEnd(32)} ${control.result}`);
  }
  const deferred = CONTROLS.filter((c) => !c.required);
  if (deferred.length > 0) {
    lines.push("");
    lines.push("  deferred:");
    for (const control of deferred) {
      const observed = result.controls.find((c) => c.id === control.id);
      lines.push(`    ${control.id}${observed ? ` — observed ${observed.result}` : ""}`);
      lines.push(`      reason: ${control.deferredReason}`);
      lines.push(`      revisit when: ${control.revisitWhen}`);
    }
  }
  lines.push("");
  lines.push(`  read at ${result.readAt}. Host state can change without any file changing.`);
  lines.push("");
  return lines.join("\n");
}

const invokedDirectly = process.argv[1] && process.argv[1].endsWith("host-evidence.mjs");
if (invokedDirectly) {
  const json = process.argv.includes("--json");
  let result;
  try {
    result = report();
  } catch (error) {
    // The collector could not execute. Distinct from "it ran and could not decide", which is
    // INDETERMINATE and exits 0 — the same separation the Gate 1 classifier makes.
    process.stderr.write(`host-evidence: could not execute: ${error.message}\n`);
    process.exit(2);
  }
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : render(result));
  // Reporting is not gating. UNGOVERNED and INDETERMINATE are findings this command was asked to
  // produce, so producing them is success; only non-execution is exit 2.
  process.exit(0);
}
