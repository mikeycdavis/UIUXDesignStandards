/**
 * Attestations — human review as evidence.
 *
 * The static layer's failure mode is passing what it never looked at. The browser layer's is
 * over-reading a partial run. This layer's is the oldest one in the family: A PERSON SAYING SO.
 *
 * An attestation is the only evidence some rules can ever have, so the mechanism has to exist; and it
 * is the evidence with the least independent corroboration, so it needs the most structure around it.
 * The suite is arranged around the three ways a review can look like evidence without being any:
 *
 *   it describes material that has since changed        → freshness
 *   it covers whatever the reviewer chose to look at    → scope
 *   it approves something a machine watched fail        → precedence
 *
 * Every freshness assertion runs against a real repository built and committed by the suite, for the
 * same reason the browser-evidence fixtures do: a hand-written identity would turn a test of the
 * committed-tree primitive into a test of string equality.
 */

import { strict as assert } from "node:assert";
import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { mkdtemp, cp, readFile, writeFile, rm, appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runValidate, exitCodeFor, ValidationError } from "../scripts/uiux.mjs";
import { assessScope, requiredSubject, resolveAttestations } from "../scripts/attestation.mjs";
import { checkPolicy } from "../scripts/policy.mjs";
import { evaluate } from "../scripts/compliance.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixture = (name) => path.join(ROOT, "test/fixtures", name);
const SCHEMA = path.join(ROOT, "schemas/project-policy.schema.json");

/** Attestable, `visual-analysis`, and therefore able to receive machine evidence as well as review. */
const VISUAL = "visual.regression-evidence";
/** Attestable, `manual-review`, `required`. */
const REQUIRED_RULE = "visual.hierarchy-intentional";
/** Attestable, `manual-review`, `forbidden` — the level that caps a verdict. */
const FORBIDDEN_RULE = "design-integrity.no-dark-patterns";

const REVIEW_PATHS = ["index.html", "src"];

const block = (indent, items) => items.map((i) => `${" ".repeat(indent)}- ${i}`).join("\n");

/**
 * A policy for the compliant fixture, carrying whatever attestations a test needs.
 *
 * Written as block-sequence YAML throughout: the vendored parser is a deliberate strict subset and
 * rejects flow sequences, so `[web]` here would fail as a parse error rather than as the thing under
 * test.
 */
function policyFor(attestations, { reviewPaths = REVIEW_PATHS, reviewScopes = null } = {}) {
  const entries = Object.entries(attestations)
    .map(([ruleId, a]) => {
      const against = a.reviewedAgainst;
      return [
        `  ${ruleId}:`,
        `    status: ${a.status}`,
        `    reviewedBy: ${a.reviewedBy ?? "design-owner"}`,
        `    reviewedAt: ${a.reviewedAt ?? "2026-08-10"}`,
        `    evidence: ${a.evidence ?? "Reviewed the screens named below, in full."}`,
        ...(a.expires ? [`    expires: ${a.expires}`] : []),
        ...(against
          ? [
              "    reviewedAgainst:",
              "      paths:",
              block(8, against.paths),
              ...(against.revision ? [`      revision: ${against.revision}`] : []),
              ...(against.contentIdentity ? [`      contentIdentity: ${against.contentIdentity}`] : []),
            ]
          : []),
      ].join("\n");
    })
    .join("\n");

  const scopes = reviewScopes
    ? ["  reviewScopes:", ...Object.entries(reviewScopes).map(([id, paths]) => `    ${id}:\n${block(6, paths)}`)]
    : [];

  return [
    "standardVersion: 1.0.0",
    "project: fixture-attestation",
    "",
    "ui:",
    "  applicability: web-ui",
    "  platforms:",
    "    - web",
    "  viewportClasses:",
    "    - mobile",
    "    - desktop",
    ...(reviewPaths ? ["  reviewPaths:", block(4, reviewPaths)] : []),
    ...scopes,
    "  accessibility:",
    "    target: framework-baseline",
    "",
    "exceptions: []",
    "",
    ...(entries ? ["attestations:", entries] : []),
    "",
  ].join("\n");
}

/**
 * A throwaway repository with the compliant fixture committed into it.
 *
 * The policy is written after the commit and stays uncommitted on purpose: freshness is path-scoped,
 * so a modified `project-policy.yml` must not stale a review of `src/`. Every test in this file
 * therefore exercises that property incidentally, which is the right way for it to be exercised.
 */
async function repo() {
  const dir = await mkdtemp(path.join(tmpdir(), "uiux-attest-"));
  await cp(fixture("compliant"), dir, { recursive: true });
  const git = (...args) => execFileSync("git", args, { cwd: dir, stdio: "pipe" });
  git("init", "--quiet");
  git("config", "user.email", "fixture@example.invalid");
  git("config", "user.name", "Fixture");
  git("add", "--all");
  git("commit", "--quiet", "-m", "fixture");
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();

  const identityOver = async (paths) => {
    const { computeIdentity } = await import("../scripts/content-identity.mjs");
    const computed = computeIdentity(dir, paths, sha);
    assert.equal(computed.state, "COMPUTED", computed.reason ?? "the fixture repository must be readable");
    return computed.identity;
  };

  const write = async (attestations, options) =>
    writeFile(path.join(dir, "project-policy.yml"), policyFor(attestations, options));

  return { dir, sha, git, identityOver, write, cleanup: () => rm(dir, { recursive: true, force: true }) };
}

/** An approved review of the declared subject, anchored to real committed content. */
async function approved(r, over = {}) {
  return {
    status: "approved",
    reviewedAgainst: {
      paths: REVIEW_PATHS,
      revision: r.sha,
      contentIdentity: await r.identityOver(REVIEW_PATHS),
    },
    ...over,
  };
}

async function resultOf(r, options = {}) {
  const result = await runValidate(r.dir, options);
  return {
    result,
    of: (ruleId) =>
      result.envelope.uiCompliance.results.find((rr) => rr.ruleId === ruleId) ??
      result.envelope.frameworkCompliance.results.find((rr) => rr.ruleId === ruleId),
  };
}

/** A schema-valid browser-evidence document recording one failed visual check. */
async function evidenceWithFailure(r) {
  const document = JSON.parse(await readFile(fixture("evidence/valid-fresh.json"), "utf8"));
  const { computeIdentity } = await import("../scripts/content-identity.mjs");
  document.revision.gitSha = r.sha;
  document.revision.sourceIdentity = computeIdentity(r.dir, document.revision.paths, r.sha).identity;
  document.routes[0].checks.push({
    ruleId: VISUAL,
    outcome: "failed",
    viewport: "laptop",
    evidence: "the account header moved 40px against the recorded baseline at laptop",
  });
  const at = path.join(r.dir, "browser-evidence.json");
  await writeFile(at, JSON.stringify(document, null, 2));
  return at;
}

// --- The mutation sequence -------------------------------------------------------------------------

test("the attestation lifecycle: each mutation moves exactly one thing, and the state follows", async () => {
  const r = await repo();
  try {
    // 1. Fresh, approved, covering the declared subject.
    await r.write({ [VISUAL]: await approved(r) });
    let run = await resultOf(r);
    assert.equal(run.of(VISUAL).status, "passed");
    assert.equal(run.of(VISUAL).disposition, "attested");
    assert.equal(
      run.of(VISUAL).validationType,
      "manual-review",
      "a human-established visual rule was filed under the machine surface",
    );

    // 2. A reviewed path changes. The review is intact; what it was about is not.
    await appendFile(path.join(r.dir, "src/App.jsx"), "\n// a later edit\n");
    run = await resultOf(r);
    assert.equal(run.of(VISUAL).status, "skipped");
    assert.equal(run.of(VISUAL).disposition, "stale-evidence");

    // 3. Restore the material; break the anchor instead. A revision that does not resolve is a
    //    subject that cannot be reconstructed — which is not the same fact as one that changed.
    r.git("checkout", "--", "src/App.jsx");
    await r.write({ [VISUAL]: await approved(r, { reviewedAgainst: { paths: REVIEW_PATHS, revision: "b".repeat(40), contentIdentity: await r.identityOver(REVIEW_PATHS) } }) });
    run = await resultOf(r);
    assert.equal(run.of(VISUAL).status, "skipped");
    assert.equal(run.of(VISUAL).disposition, "evidence-unavailable");

    // 4. Restore the anchor and let a machine watch the rule fail. Evidence outranks assertion: the
    //    approval does not survive a measurement of the thing approved.
    await r.write({ [VISUAL]: await approved(r) });
    run = await resultOf(r, { evidencePath: await evidenceWithFailure(r) });
    assert.equal(run.of(VISUAL).status, "failed");
    assert.equal(run.of(VISUAL).disposition, "contradicted-attestation");

    // 5. Remove the contradiction; record a rejection. A human who looked and said no is a failure,
    //    not silence.
    await r.write({ [VISUAL]: await approved(r, { status: "rejected" }) });
    run = await resultOf(r);
    assert.equal(run.of(VISUAL).status, "failed");
    assert.equal(run.of(VISUAL).disposition, "attested-rejected");

    // 6. Remove the attestation entirely. Back to nobody having looked.
    await r.write({});
    run = await resultOf(r);
    assert.equal(run.of(VISUAL).status, "skipped");
    assert.equal(run.of(VISUAL).disposition, "not-evaluated");
  } finally {
    await r.cleanup();
  }
});

// --- Expiry is not failure --------------------------------------------------------------------------

test("an expired review returns the rule to unreviewed, and is never recorded as a violation", async () => {
  const r = await repo();
  try {
    await r.write({ [REQUIRED_RULE]: await approved(r, { expires: "2026-01-01" }) });
    const run = await resultOf(r, { today: "2026-08-10" });
    const result = run.of(REQUIRED_RULE);
    assert.equal(result.status, "skipped");
    assert.equal(result.disposition, "not-evaluated");
    assert.match(result.message, /expired/);
    assert.notEqual(result.status, "failed", "expiry was treated as a violation");
  } finally {
    await r.cleanup();
  }
});

// --- Scope: the reviewer does not choose how much reviewing is enough -------------------------------

test("a review narrower than the declared subject is partial, not established", async () => {
  const r = await repo();
  try {
    // Perfectly fresh — the identity is computed over exactly what was reviewed. Freshness is not
    // the axis that fails here, and that is the point: a narrow review is a current review of a
    // fragment.
    await r.write({
      [REQUIRED_RULE]: {
        status: "approved",
        reviewedAgainst: {
          paths: ["src"],
          revision: r.sha,
          contentIdentity: await r.identityOver(["src"]),
        },
      },
    });
    const run = await resultOf(r);
    const result = run.of(REQUIRED_RULE);
    assert.equal(result.status, "skipped");
    assert.equal(result.disposition, "partial-review");
    assert.match(result.message, /index\.html/);
  } finally {
    await r.cleanup();
  }
});

test("a per-rule review scope narrows the subject, and it is the policy that narrows it", async () => {
  const r = await repo();
  try {
    await r.write(
      {
        [REQUIRED_RULE]: {
          status: "approved",
          reviewedAgainst: { paths: ["src"], revision: r.sha, contentIdentity: await r.identityOver(["src"]) },
        },
      },
      { reviewScopes: { [REQUIRED_RULE]: ["src"] } },
    );
    const run = await resultOf(r);
    assert.equal(run.of(REQUIRED_RULE).status, "passed");
    assert.equal(run.of(REQUIRED_RULE).disposition, "attested");
    assert.equal(run.of(REQUIRED_RULE).attestation.scopeSource, `ui.reviewScopes.${REQUIRED_RULE}`);
  } finally {
    await r.cleanup();
  }
});

test("coverage is by containment, and the containment runs the way that cannot be gamed", () => {
  const required = { paths: ["src", "index.html"], source: "ui.reviewPaths" };
  // A directory covers what is inside it.
  assert.equal(assessScope(["src", "index.html"], required).covered, true);
  assert.equal(assessScope(["."], required).covered, false, "'.' is not a declared ancestor spelling");
  assert.equal(assessScope(["src/Button.jsx", "index.html"], required).covered, false, "a file inside src does not cover src");
  assert.deepEqual(assessScope(["src"], required).missing, ["index.html"]);
  // Reviewing more than required is not an error. The requirement is a floor.
  assert.equal(assessScope(["src", "index.html", "docs"], required).covered, true);
});

test("requiredSubject prefers the per-rule scope, and reports which declaration it used", () => {
  const policy = { ui: { reviewPaths: ["src"], reviewScopes: { [REQUIRED_RULE]: ["src/screens"] } } };
  assert.deepEqual(requiredSubject(REQUIRED_RULE, policy), {
    paths: ["src/screens"],
    source: `ui.reviewScopes.${REQUIRED_RULE}`,
  });
  assert.deepEqual(requiredSubject(VISUAL, policy), { paths: ["src"], source: "ui.reviewPaths" });
  assert.equal(requiredSubject(VISUAL, { ui: {} }), null, "an undeclared subject must be null, not empty");
});

test("an undeclared review subject establishes nothing, at both layers that can catch it", async () => {
  const r = await repo();
  try {
    // Layer 1 — the policy is incoherent: it records a review with nothing to measure it against.
    await r.write({ [REQUIRED_RULE]: await approved(r) }, { reviewPaths: null });
    const checked = await checkPolicy(path.join(r.dir, "project-policy.yml"), SCHEMA, "2026-08-10");
    assert.equal(checked.status, "invalid-semantics");
    assert.match(checked.semanticErrors[0].path, /reviewPaths/);

    // Layer 2 — the evaluator, reached by any caller that assembles a policy without policy.mjs.
    // Defence in depth rather than redundancy: policy.mjs is not in the trust path of evaluate().
    const resolvedScope = resolveAttestations(r.dir, {
      ui: {},
      attestations: { [REQUIRED_RULE]: { reviewedAgainst: { paths: REVIEW_PATHS } } },
    });
    assert.equal(resolvedScope.get(REQUIRED_RULE).scope.unscoped, true);
    assert.equal(resolvedScope.get(REQUIRED_RULE).scope.covered, false);
  } finally {
    await r.cleanup();
  }
});

// --- The paired verdict decision --------------------------------------------------------------------

test("the same unestablished review caps a FORBIDDEN rule and does not block a REQUIRED one", async () => {
  const r = await repo();
  try {
    const stale = async (ruleId) => {
      await r.write({ [ruleId]: await approved(r, { expires: "2026-01-01" }) });
      return resultOf(r, { today: "2026-08-10" });
    };

    // Identical inputs, identical unestablished state, deliberately different consequences. A
    // prohibition nobody established is not a prohibition anybody kept, so the verdict may not be
    // COMPLIANT. An unreviewed requirement is a gap in assurance, visible and named — and blocking
    // every one of them on day one would produce a framework that gets turned off.
    const forbidden = await stale(FORBIDDEN_RULE);
    const forbiddenResult = forbidden.of(FORBIDDEN_RULE);
    assert.equal(forbiddenResult.status, "skipped");
    assert.ok(
      forbidden.result.envelope.uiCompliance.unestablishedProhibitions.includes(FORBIDDEN_RULE),
      "an unestablished prohibition was not named",
    );
    assert.equal(forbidden.result.envelope.uiCompliance.status, "NOT_EVALUATED");

    const required = await stale(REQUIRED_RULE);
    const requiredResult = required.of(REQUIRED_RULE);
    assert.equal(requiredResult.status, "skipped");
    assert.notEqual(requiredResult.status, "failed", "an unestablished required review became a failure");
    assert.equal(
      required.result.envelope.uiCompliance.unestablishedProhibitions.includes(REQUIRED_RULE),
      false,
      "a required rule was reported as an unestablished prohibition",
    );

    // The asymmetry is between the two rules' effect on the verdict, and nothing else. Both remain
    // visible in the same bucket.
    assert.ok(required.result.envelope.uiCompliance.assurance.notEvaluated > 0);

    // The verdict half of the pair, in isolation. Against the whole fixture both runs report
    // NOT_EVALUATED — there are other unestablished prohibitions in a catalog this size — so the
    // difference is only observable over one rule at a time. Same catalog, same policy, same
    // unestablished state, and the level is the only thing that varies.
    const catalog = required.result.catalog;
    const verdictOver = (ruleId) =>
      evaluate({
        catalog,
        policy: { rules: {}, applicability: {}, exceptions: [], attestations: {} },
        findings: [],
        evaluated: [],
        identities: new Map(),
        today: "2026-08-10",
        appliesFilter: (rule) => rule.id === ruleId,
      }).status;
    assert.equal(verdictOver(FORBIDDEN_RULE), "NOT_EVALUATED", "an unestablished prohibition did not cap");
    assert.equal(verdictOver(REQUIRED_RULE), "COMPLIANT", "an unestablished requirement blocked on its own");
  } finally {
    await r.cleanup();
  }
});

// --- Precedence between the two evidence surfaces ---------------------------------------------------

test("machine evidence and human review establish a visual rule under different dispositions", async () => {
  const r = await repo();
  try {
    // Human review, no machine run.
    await r.write({ [VISUAL]: await approved(r) });
    const reviewed = await resultOf(r);
    assert.equal(reviewed.of(VISUAL).disposition, "attested");
    assert.ok(reviewed.result.envelope.uiCompliance.assurance.manualReview > 0);

    // The same rule, established by a run instead. Two surfaces, two dispositions, one status — a
    // consumer that needs to know which kind of evidence it has can tell without parsing prose.
    const document = JSON.parse(await readFile(fixture("evidence/valid-fresh.json"), "utf8"));
    const { computeIdentity } = await import("../scripts/content-identity.mjs");
    document.revision.gitSha = r.sha;
    document.revision.sourceIdentity = computeIdentity(r.dir, document.revision.paths, r.sha).identity;
    for (const route of document.routes) {
      route.checks.push({
        ruleId: VISUAL,
        outcome: "passed",
        viewport: "laptop",
        evidence: "every screen matched its recorded baseline at laptop",
      });
    }
    const at = path.join(r.dir, "browser-evidence.json");
    await writeFile(at, JSON.stringify(document, null, 2));

    await r.write({});
    const measured = await resultOf(r, { evidencePath: at });
    assert.equal(measured.of(VISUAL).status, "passed");
    assert.equal(measured.of(VISUAL).disposition, "evidenced");
    assert.notEqual(measured.of(VISUAL).disposition, "attested");
  } finally {
    await r.cleanup();
  }
});

test("an attestation on a rule the catalog does not make attestable is a policy error", async () => {
  const r = await repo();
  try {
    await r.write({ "accessibility.img-alt-text": await approved(r) });
    const run = await resultOf(r);
    const result = run.of("accessibility.img-alt-text");
    assert.equal(result.disposition, "invalid-attestation");
    assert.equal(result.status, "failed");
  } finally {
    await r.cleanup();
  }
});

// --- The record has to be a record --------------------------------------------------------------------

test("a review with no recorded identity establishes nothing, and is told what to record", async () => {
  const r = await repo();
  try {
    await r.write({ [REQUIRED_RULE]: { status: "approved", reviewedAgainst: { paths: REVIEW_PATHS } } });
    const run = await resultOf(r);
    const result = run.of(REQUIRED_RULE);
    assert.equal(result.status, "skipped");
    assert.equal(result.disposition, "evidence-unavailable");

    // The recording workflow: the identity to paste back is reported, never written on the
    // reviewer's behalf. One the framework stored for them would say only that the paths match
    // themselves.
    const offered = run.result.attestations.get(REQUIRED_RULE).currentIdentity;
    assert.match(offered.identity, /^[0-9a-f]{32}$/);
    assert.equal(offered.revision, r.sha);
  } finally {
    await r.cleanup();
  }
});

test("a symbolic revision is unrepresentable in the policy, not merely unusable", async () => {
  const r = await repo();
  try {
    // A branch name re-anchors as the branch moves, so a record carrying one is a claim about
    // content nobody reviewed. The schema makes it unwritable; that is a configuration error at
    // exit 2, never a finding about the project.
    await r.write({
      [REQUIRED_RULE]: {
        status: "approved",
        reviewedAgainst: { paths: REVIEW_PATHS, revision: "HEAD", contentIdentity: await r.identityOver(REVIEW_PATHS) },
      },
    });
    const checked = await checkPolicy(path.join(r.dir, "project-policy.yml"), SCHEMA, "2026-08-10");
    assert.equal(checked.status, "invalid-shape");

    await assert.rejects(() => runValidate(r.dir), ValidationError);
  } finally {
    await r.cleanup();
  }
});

test("an attestation with no reviewedAgainst block cannot be written at all", async () => {
  const r = await repo();
  try {
    await r.write({ [REQUIRED_RULE]: { status: "approved" } });
    const checked = await checkPolicy(path.join(r.dir, "project-policy.yml"), SCHEMA, "2026-08-10");
    assert.equal(checked.status, "invalid-shape");
    assert.match(JSON.stringify(checked.schemaErrors), /reviewedAgainst/);
  } finally {
    await r.cleanup();
  }
});

test("unrelated work does not stale a review", async () => {
  const r = await repo();
  try {
    await r.write({ [REQUIRED_RULE]: await approved(r) });
    await writeFile(path.join(r.dir, "NOTES.md"), "# not part of the reviewed subject\n");
    r.git("add", "NOTES.md");
    r.git("commit", "--quiet", "-m", "notes");

    const run = await resultOf(r);
    assert.equal(run.of(REQUIRED_RULE).status, "passed", "a commit outside the reviewed paths staled the review");
    assert.equal(run.of(REQUIRED_RULE).disposition, "attested");
  } finally {
    await r.cleanup();
  }
});

// --- The prose and the implementation name the same things -------------------------------------------

test("every disposition Standard 37 R3 names is one the evaluator emits, and vice versa", async () => {
  const standard = await readFile(path.join(ROOT, "standards/37-manual-design-review.md"), "utf8");
  const section = standard.slice(standard.indexOf("### R3"), standard.indexOf("### R4"));
  const rows = section.split("\n").filter((line) => /^\| /.test(line) && /`/.test(line));
  assert.ok(rows.length >= 10, `R3's table has ${rows.length} rows — the binding would be vacuous`);

  const named = new Set(rows.flatMap((row) => [...row.matchAll(/`([a-z-]+)`/g)].map((m) => m[1])));
  assert.ok(named.size >= 8, "R3 names too few dispositions for this test to bind anything");

  // Bound to the source of the judgement path, not to the rule id or to a hand-kept list. A
  // disposition renamed in one place and not the other is exactly the drift that lets prose promise a
  // behaviour the evaluator does not have.
  const source = await readFile(path.join(ROOT, "scripts/compliance.mjs"), "utf8");
  const judgement = source.slice(source.indexOf("function judgeAttestation"), source.indexOf("function policyFailure"));
  for (const disposition of named) {
    assert.ok(
      judgement.includes(`"${disposition}"`),
      `Standard 37 R3 names the disposition '${disposition}', which judgeAttestation never emits`,
    );
  }

  // The other direction: an outcome the evaluator can reach and the standard never mentions is an
  // undocumented state, which is how a gating model quietly stops matching its own prose.
  for (const [, disposition] of judgement.matchAll(/(?:unestablished|failure)\(\s*\n?\s*"([a-z-]+)"/g)) {
    assert.ok(named.has(disposition), `judgeAttestation emits '${disposition}', which Standard 37 R3 does not state`);
  }
});

test("every disposition that unestablishes a rule is in Standard 35 R7's verdict cap", async () => {
  const source = await readFile(path.join(ROOT, "scripts/compliance.mjs"), "utf8");
  const judgement = source.slice(source.indexOf("function judgeAttestation"), source.indexOf("function policyFailure"));
  const cap = source.slice(source.indexOf("const unestablished = applicable.filter"));
  const emitted = [...judgement.matchAll(/unestablished\(\s*\n?\s*"([a-z-]+)"/g)].map((m) => m[1]);
  assert.ok(emitted.length >= 5, `matched ${emitted.length} unestablishing outcomes — the scan found nothing to check`);
  for (const disposition of emitted) {
    assert.ok(
      cap.includes(`"${disposition}"`),
      `'${disposition}' unestablishes a rule but is missing from the forbidden-rule cap, so a prohibition in that state would pass quietly`,
    );
  }

  const standard = await readFile(path.join(ROOT, "standards/35-evidence-assurance-and-compliance-output.md"), "utf8");
  const r7 = standard.slice(standard.indexOf("### R7"), standard.indexOf("### R8"));
  for (const [, disposition] of cap.matchAll(/"([a-z-]+)"/g)) {
    assert.ok(r7.includes(`\`${disposition}\``), `the cap includes '${disposition}', which Standard 35 R7 does not name`);
  }
});

test("an unestablished review never changes the exit code from 1 to 0", async () => {
  const r = await repo();
  try {
    await r.write({ [FORBIDDEN_RULE]: await approved(r, { expires: "2026-01-01" }) });
    const result = await runValidate(r.dir, { today: "2026-08-10" });
    assert.equal(exitCodeFor(result.envelope, result.policyFindings), 1);
  } finally {
    await r.cleanup();
  }
});
