/**
 * The compliance evaluator.
 *
 * The flagship guard is asserted over the whole catalog rather than a sample: no rule whose evidence
 * surface is a browser, a screenshot, or a human may reach `passed` in a run with no evidence and no
 * attestation. "No automated finding" is not evidence for a property no automated check can observe,
 * and a framework that let it be one would report confidence it never earned.
 *
 * The rest establish the verdict order, the five-bucket assurance sum, and the dispositions that
 * distinguish "nobody looked" from "the run failed" from "the evidence is about different material".
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { loadCatalog } from "../scripts/catalog.mjs";
import { evaluate, envelope, STATUS } from "../scripts/compliance.mjs";

const TODAY = "2026-08-10";

const rule = (over = {}) => ({
  id: "accessibility.img-alt-text",
  title: "Images carry a text alternative",
  standard: 3,
  category: "accessibility",
  level: "required",
  severity: "error",
  validationType: "code-analysis",
  assurance: "partial",
  nonExemptible: false,
  introducedIn: "1.0.0",
  description: "d",
  rationale: "r",
  remediation: "m",
  aliases: [],
  appliesTo: ["any-ui"],
  crossReferences: [],
  deprecatedIn: null,
  supersededBy: null,
  removedIn: null,
  ...over,
});

async function withCatalog(rules, fn) {
  const dir = await mkdtemp(path.join(tmpdir(), "uiux-comp-"));
  try {
    await writeFile(path.join(dir, "rules.json"), JSON.stringify({ $comment: "x", rules }, null, 2));
    return await fn(await loadCatalog(dir));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const run = (catalog, over = {}) =>
  evaluate({
    catalog,
    policy: { rules: {}, applicability: {}, exceptions: [], attestations: {} },
    findings: [],
    evaluated: [...catalog.rules.keys()],
    today: TODAY,
    ...over,
  });

const of = (verdict, id) => verdict.results.find((r) => r.ruleId === id);

// --- The flagship guard ---

test("no non-static rule can pass without evidence or attestation, over the whole catalog", async () => {
  const types = ["manual-review", "browser-analysis", "visual-analysis"];
  const rules = types.map((t, i) =>
    rule({ id: `visual.rule-${i}`, validationType: t, assurance: t === "manual-review" ? "none" : "partial" }),
  );
  await withCatalog(rules, (catalog) => {
    assert.ok(catalog.rules.size > 0, "empty catalog — the guard would pass vacuously");
    const verdict = run(catalog);
    const wrongly = verdict.results.filter(
      (r) => types.includes(r.validationType) && r.status === "passed",
    );
    assert.deepEqual(
      wrongly.map((r) => r.ruleId),
      [],
      "a rule requiring browser, visual, or human evidence passed from a static run",
    );
    for (const r of verdict.results) assert.equal(r.status, "skipped");
  });
});

test("a static rule with no findings does pass — the guard is not blanket", async () => {
  await withCatalog([rule()], (catalog) => {
    assert.equal(of(run(catalog), "accessibility.img-alt-text").status, "passed");
  });
});

test("a rule outside the evaluated set is not-evaluated, never passed", async () => {
  await withCatalog([rule()], (catalog) => {
    const r = of(run(catalog, { evaluated: [] }), "accessibility.img-alt-text");
    assert.equal(r.status, "skipped");
    assert.equal(r.disposition, "not-evaluated");
  });
});

// --- Verdict order ---

test("verdict order: failures outrank exceptions, which outrank the unestablished cap", async () => {
  const rules = [
    rule({ id: "forms.control-label" }),
    rule({ id: "design-integrity.no-dark-patterns", level: "forbidden", validationType: "manual-review", assurance: "none" }),
  ];
  await withCatalog(rules, (catalog) => {
    // Unexamined forbidden rule alone caps at NOT_EVALUATED.
    assert.equal(run(catalog).status, STATUS.NOT_EVALUATED);

    // An excepted failure outranks the cap.
    const excepted = run(catalog, {
      findings: [{ rule: "forms.control-label", message: "no label", evidence: ["a.html"] }],
      policy: {
        rules: {},
        applicability: {},
        attestations: {},
        exceptions: [{ rule: "forms.control-label", reason: "r", approvedBy: "o", approvedAt: "2026-01-01" }],
      },
    });
    assert.equal(excepted.status, STATUS.COMPLIANT_WITH_EXCEPTIONS);

    // An unexcepted required failure outranks everything.
    const failed = run(catalog, {
      findings: [{ rule: "forms.control-label", message: "no label", evidence: ["a.html"] }],
    });
    assert.equal(failed.status, STATUS.NON_COMPLIANT);
  });
});

test("no policy is NOT_EVALUATED, whatever the rules say", async () => {
  await withCatalog([rule()], (catalog) => {
    assert.equal(run(catalog, { policy: null }).status, STATUS.NOT_EVALUATED);
  });
});

test("unestablishedProhibitions is present and empty rather than absent", async () => {
  await withCatalog([rule()], (catalog) => {
    assert.deepEqual(run(catalog).unestablishedProhibitions, []);
  });
});

test("a forbidden rule whose evidence run failed still caps the verdict", async () => {
  const rules = [rule({ id: "design-integrity.no-fake-success", level: "forbidden", validationType: "browser-analysis" })];
  await withCatalog(rules, (catalog) => {
    const verdict = run(catalog, {
      evidence: { available: true, freshness: "FRESH", run: { status: "failed", failureReason: "browser crashed" }, byRule: new Map() },
    });
    assert.equal(of(verdict, "design-integrity.no-fake-success").disposition, "evidence-unavailable");
    assert.deepEqual(verdict.unestablishedProhibitions, ["design-integrity.no-fake-success"]);
    assert.equal(verdict.status, STATUS.NOT_EVALUATED);
  });
});

// --- Evidence dispositions ---

test("evidence dispositions distinguish absent, failed, stale, inconclusive, and established", async () => {
  const rules = [rule({ id: "accessibility.focus-order", validationType: "browser-analysis" })];
  const id = "accessibility.focus-order";
  await withCatalog(rules, (catalog) => {
    const cases = [
      [{ available: false }, "not-evaluated"],
      [{ available: true, freshness: "FRESH", run: { status: "failed" }, byRule: new Map() }, "evidence-unavailable"],
      [{ available: true, freshness: "STALE", run: { status: "completed" }, byRule: new Map() }, "stale-evidence"],
      [{ available: true, freshness: "EVIDENCE_UNAVAILABLE", run: { status: "completed" }, byRule: new Map() }, "evidence-unavailable"],
      [
        { available: true, freshness: "FRESH", run: { status: "completed" }, byRule: new Map([[id, [{ outcome: "inconclusive" }]]]) },
        "not-evaluated",
      ],
    ];
    for (const [evidence, expected] of cases) {
      const r = of(run(catalog, { evidence }), id);
      assert.equal(r.disposition, expected, `evidence ${JSON.stringify(evidence.freshness ?? evidence.available)} → ${r.disposition}`);
      assert.equal(r.status, "skipped");
    }

    const fresh = of(
      run(catalog, {
        evidence: {
          available: true,
          freshness: "FRESH",
          run: { status: "completed" },
          byRule: new Map([[id, [{ outcome: "passed", route: "/", viewport: "mobile" }]]]),
        },
      }),
      id,
    );
    assert.equal(fresh.status, "passed");
    assert.equal(fresh.disposition, "evidenced");
  });
});

test("a failed evidence check is a finding, not silence", async () => {
  const id = "accessibility.focus-order";
  await withCatalog([rule({ id, validationType: "browser-analysis" })], (catalog) => {
    const r = of(
      run(catalog, {
        evidence: {
          available: true,
          freshness: "FRESH",
          run: { status: "completed" },
          byRule: new Map([[id, [{ outcome: "failed", route: "/settings", viewport: "mobile", evidence: "focus left the dialog" }]]]),
        },
      }),
      id,
    );
    assert.equal(r.status, "failed");
    assert.equal(r.disposition, "evidenced");
  });
});

// --- Attestations ---

/**
 * The resolution scripts/attestation.mjs produces, in the shape the evaluator consumes. Written out
 * here rather than imported so that a change to either side has to be made deliberately on both: this
 * is the seam between "is the review still about this material" and "what does that mean for the
 * verdict", and a shared helper would let the two drift together silently.
 */
const resolved = (state = "FRESH", scope = { covered: true, unscoped: false, missing: [] }) => ({
  freshness: { state, reason: `${state} for test` },
  scope,
});

const attested = (over = {}) => ({
  status: "approved",
  reviewedBy: "owner",
  reviewedAt: "2026-08-01",
  evidence: "Reviewed the interface.",
  reviewedAgainst: { paths: ["src/App.tsx"], revision: "a".repeat(40), contentIdentity: "b".repeat(32) },
  ...over,
});

test("a fresh approved attestation establishes a manual-review rule", async () => {
  const id = "visual.hierarchy-intentional";
  await withCatalog([rule({ id, validationType: "manual-review", assurance: "none" })], (catalog) => {
    const r = of(
      run(catalog, {
        policy: { rules: {}, applicability: {}, exceptions: [], attestations: { [id]: attested() } },
        identities: new Map([[id, resolved()]]),
      }),
      id,
    );
    assert.equal(r.status, "passed");
    assert.equal(r.disposition, "attested");
    assert.equal(r.validationType, "manual-review", "an attested pass was filed as automated");
  });
});

test("STALE and EVIDENCE_UNAVAILABLE identities both unestablish, and stay distinct in the result", async () => {
  const id = "visual.hierarchy-intentional";
  await withCatalog([rule({ id, validationType: "manual-review", assurance: "none" })], (catalog) => {
    // Freshness has already separated "the reviewed material provably changed" from "the reviewed
    // material could not be reconstructed". Those are different facts, they call for different
    // actions — re-review versus fix the record — and the per-rule result keeps them apart rather
    // than normalising both back to a bare not-evaluated.
    const dispositions = { STALE: "stale-evidence", EVIDENCE_UNAVAILABLE: "evidence-unavailable" };
    for (const [state, disposition] of Object.entries(dispositions)) {
      const r = of(
        run(catalog, {
          policy: { rules: {}, applicability: {}, exceptions: [], attestations: { [id]: attested() } },
          identities: new Map([[id, resolved(state)]]),
        }),
        id,
      );
      assert.equal(r.status, "skipped", `${state} produced ${r.status}`);
      assert.equal(r.disposition, disposition);
      assert.notEqual(r.status, "failed", `${state} was reported as a violation`);
    }
  });
});

test("an attestation the caller never resolved establishes nothing", async () => {
  const id = "visual.hierarchy-intentional";
  await withCatalog([rule({ id, validationType: "manual-review", assurance: "none" })], (catalog) => {
    // Fail closed. Omitting the freshness resolution is not a claim that the review is fresh, and a
    // caller that forgot to wire it must not get a pass out of the omission.
    const r = of(
      run(catalog, {
        policy: { rules: {}, applicability: {}, exceptions: [], attestations: { [id]: attested() } },
        identities: new Map(),
      }),
      id,
    );
    assert.equal(r.status, "skipped");
    assert.equal(r.disposition, "evidence-unavailable");
  });
});

test("an expired attestation is not-evaluated, never a failure", async () => {
  const id = "visual.hierarchy-intentional";
  await withCatalog([rule({ id, validationType: "manual-review", assurance: "none" })], (catalog) => {
    const r = of(
      run(catalog, {
        policy: { rules: {}, applicability: {}, exceptions: [], attestations: { [id]: attested({ expires: "2026-01-01" }) } },
        identities: new Map([[id, resolved()]]),
      }),
      id,
    );
    assert.equal(r.status, "skipped");
  });
});

test("an automated finding contradicts an approving attestation", async () => {
  const id = "accessibility.img-alt-text";
  await withCatalog([rule({ id, attestable: true })], (catalog) => {
    const r = of(
      run(catalog, {
        findings: [{ rule: id, message: "img without alt", evidence: ["a.html"] }],
        policy: { rules: {}, applicability: {}, exceptions: [], attestations: { [id]: attested() } },
        identities: new Map([[id, resolved()]]),
      }),
      id,
    );
    assert.equal(r.disposition, "contradicted-attestation");
    assert.equal(r.status, "failed");
  });
});

test("an attestation on a non-attestable rule is invalid", async () => {
  const id = "accessibility.img-alt-text";
  await withCatalog([rule({ id })], (catalog) => {
    const r = of(
      run(catalog, { policy: { rules: {}, applicability: {}, exceptions: [], attestations: { [id]: attested() } } }),
      id,
    );
    assert.equal(r.disposition, "invalid-attestation");
  });
});

// --- Applicability and exceptions ---

test("a not-applicable declaration contradicted by a finding is a failure, not an opt-out", async () => {
  const id = "forms.control-label";
  await withCatalog([rule({ id })], (catalog) => {
    const r = of(
      run(catalog, {
        findings: [{ rule: id, message: "input without label", evidence: ["form.html"] }],
        policy: {
          rules: {},
          applicability: { [id]: { applicable: false, reason: "this product has no forms" } },
          exceptions: [],
          attestations: {},
        },
      }),
      id,
    );
    assert.equal(r.disposition, "contradicted-applicability");
    assert.equal(r.status, "failed");
  });
});

test("a not-applicable rule stays visible with its reason", async () => {
  const id = "forms.control-label";
  await withCatalog([rule({ id })], (catalog) => {
    const r = of(
      run(catalog, {
        policy: { rules: {}, applicability: { [id]: { applicable: false, reason: "no forms" } }, exceptions: [], attestations: {} },
      }),
      id,
    );
    assert.equal(r.disposition, "not-applicable");
    assert.equal(r.message, "no forms");
  });
});

test("an exception against a non-exemptible rule is rejected, not applied", async () => {
  const id = "design-integrity.no-dark-patterns";
  await withCatalog([rule({ id, nonExemptible: true, level: "forbidden" })], (catalog) => {
    const verdict = run(catalog, {
      policy: {
        rules: {},
        applicability: {},
        attestations: {},
        exceptions: [{ rule: id, reason: "hard", approvedBy: "o", approvedAt: "2026-01-01" }],
      },
    });
    assert.ok(verdict.results.some((r) => r.disposition === "rejected-exception"));
    assert.equal(verdict.status, STATUS.NON_COMPLIANT);
  });
});

// --- Assurance and score ---

test("the five assurance buckets sum to the applicable count", async () => {
  const rules = [
    rule({ id: "accessibility.img-alt-text" }),
    rule({ id: "accessibility.focus-order", validationType: "browser-analysis" }),
    rule({ id: "visual.regression-evidence", validationType: "visual-analysis" }),
    rule({ id: "visual.hierarchy-intentional", validationType: "manual-review", assurance: "none" }),
    rule({ id: "forms.control-label" }),
  ];
  await withCatalog(rules, (catalog) => {
    const verdict = run(catalog, {
      policy: {
        rules: {},
        applicability: { "forms.control-label": { applicable: false, reason: "no forms" } },
        exceptions: [],
        attestations: {},
      },
    });
    const { automated, browserAnalysis, visualAnalysis, manualReview, notEvaluated } = verdict.assurance;
    assert.equal(
      automated + browserAnalysis + visualAnalysis + manualReview + notEvaluated,
      verdict.denominator.applicable,
      "assurance buckets do not account for every applicable rule",
    );
  });
});

test("a browser-established pass is filed under browserAnalysis, never automated", async () => {
  const id = "accessibility.focus-order";
  await withCatalog([rule({ id, validationType: "browser-analysis" })], (catalog) => {
    const verdict = run(catalog, {
      evidence: {
        available: true,
        freshness: "FRESH",
        run: { status: "completed" },
        byRule: new Map([[id, [{ outcome: "passed" }]]]),
      },
    });
    assert.equal(verdict.assurance.browserAnalysis, 1);
    assert.equal(verdict.assurance.automated, 0);
  });
});

test("score is null when nothing was scored, and never determines status", async () => {
  await withCatalog([rule({ level: "recommended", severity: "warning" })], (catalog) => {
    const verdict = run(catalog, { evaluated: [] });
    assert.equal(verdict.score, null);
    assert.equal(verdict.denominator.basis, "required-level rules that were evaluated");
  });
});

// --- The envelope ---

test("the envelope keeps applicability, uiCompliance, and frameworkCompliance independent", async () => {
  await withCatalog([rule({ id: "evidence.surfaces-declared", appliesTo: ["process"] })], (catalog) => {
    const verdict = run(catalog);
    const out = envelope({
      applicability: { classification: "NOT_APPLICABLE", agreement: "match" },
      uiVerdict: null,
      frameworkVerdict: verdict,
      project: "self",
      standardVersion: "1.0.0",
      auditedAt: "2026-08-10T00:00:00.000Z",
    });
    assert.equal(out.uiCompliance, null, "uiCompliance must be null when no UI is applicable");
    assert.equal(out.frameworkCompliance.status, STATUS.COMPLIANT);
    assert.deepEqual(out.frameworkCompliance.unestablishedProhibitions, []);
    assert.equal(out.applicability.classification, "NOT_APPLICABLE");
  });
});

test("appliesFilter partitions the rule set without either side seeing the other", async () => {
  const rules = [
    rule({ id: "accessibility.img-alt-text", appliesTo: ["any-ui"] }),
    rule({ id: "evidence.surfaces-declared", appliesTo: ["process"] }),
  ];
  await withCatalog(rules, (catalog) => {
    const ui = run(catalog, { appliesFilter: (r) => !r.appliesTo.includes("process") });
    const proc = run(catalog, { appliesFilter: (r) => r.appliesTo.includes("process") });
    assert.deepEqual(ui.results.map((r) => r.ruleId), ["accessibility.img-alt-text"]);
    assert.deepEqual(proc.results.map((r) => r.ruleId), ["evidence.surfaces-declared"]);
  });
});
