/**
 * VENDORED AND MODIFIED — derived from EngineeringStandards/scripts/compliance.mjs on 2026-08-10.
 * See artifacts/adr/0001-vendor-the-neutral-core-rather-than-share-a-package.md.
 *
 * Modifications, each with its own decision record:
 *   - five-way assurance breakdown                                        (ADR 0004)
 *   - browser and visual rules can never pass from a static run           (ADR 0002, ADR 0005)
 *   - dispositions: evidenced, evidence-unavailable, stale-evidence,
 *     contradicted-applicability                                          (ADR 0002, ADR 0003)
 *   - ingested browser evidence as an input to evaluate()                 (ADR 0002)
 *   - three-block envelope: applicability / uiCompliance / frameworkCompliance  (ADR 0003)
 *   - attestation freshness via committed-content identity                (ADR 0011)
 *   - class scoping: a class-specific rule under an unresolved class is
 *     visibly unestablished rather than silently included or excluded      (ADR 0003)
 *
 * The compliance engine: catalog + policy + observed findings + ingested evidence → a verdict.
 *
 * Four properties are load-bearing:
 *
 *   1. Status is computed from rules, never from the score. There is no threshold at which a
 *      percentage grants or withdraws compliance.
 *   2. A rule nothing evaluated is `skipped`, never `passed`. Unknown is not a pass.
 *   3. A rule whose evidence surface is a browser, a screenshot, or a human can never reach `passed`
 *      from a static run. "No automated finding" is not evidence for a property no automated check
 *      can observe. This is the single most important guard in the file.
 *   4. The score's denominator is the rules actually evaluated, and the assurance breakdown ships
 *      beside it so the number cannot imply coverage it does not have.
 */

import { resolve } from "./catalog.mjs";

export const STATUS = {
  COMPLIANT: "COMPLIANT",
  COMPLIANT_WITH_EXCEPTIONS: "COMPLIANT_WITH_EXCEPTIONS",
  NON_COMPLIANT: "NON_COMPLIANT",
  NOT_EVALUATED: "NOT_EVALUATED",
};

const RESULT = { passed: "passed", failed: "failed", warning: "warning", skipped: "skipped" };

/**
 * Rules whose subject a file scan cannot observe. Each needs evidence from its own surface — an
 * ingested browser run, a reviewed screenshot, or a recorded human judgement — before it can be
 * established. Without that evidence they are not-evaluated, however thoroughly the static
 * detectors ran (ADR 0002, ADR 0004).
 */
const NON_STATIC_TYPES = new Set(["manual-review", "browser-analysis", "visual-analysis"]);

/**
 * Dispositions that mean "this rule has no subject in this project".
 *
 * They are excluded from the assurance breakdown and from the applicable denominator, because a rule
 * with no subject is not a rule that went unevaluated — counting it as one would make every project
 * look less examined the more precisely it declared its own scope.
 *
 * `class-unresolved` is deliberately NOT in this set. "We do not know whether this rule applies" is
 * not "this rule does not apply", and folding the first into the second is how an unproven exclusion
 * becomes a silent one.
 */
const NO_SUBJECT = new Set(["not-applicable", "not-applicable-by-class"]);

/**
 * @param catalog      from loadCatalog()
 * @param policy       a validated project-policy document, or null when the project declares none
 * @param findings     evaluator findings, each optionally carrying `rule` (a canonical id)
 * @param evaluated    the rule ids the static evaluator actually examined — the crucial input. A rule
 *                     absent from this set was not checked, and reporting it as passing because
 *                     nothing failed is the false green this framework exists to stop.
 * @param evidence     ingested browser evidence, or null. Shape: { available, freshness, run,
 *                     byRule: Map<ruleId, {outcome, evidence, viewport}[]> }
 * @param identities   Map<ruleId, {freshness, scope}> for attestations, from
 *                     scripts/attestation.mjs. Two axes, never merged: whether the reviewed material
 *                     is still current, and whether the review covered what the policy required
 *                     (ADR 0011, Standard 37 R9)
 * @param today        ISO date, for expiry
 * @param appliesFilter optional (rule) => boolean, used to evaluate the UI and process rule sets
 *                     separately without either seeing the other's results (ADR 0003)
 * @param classScopes  optional Map<ruleId, {scope: "in"|"out"|"unresolved", reason}> from Gate 1.
 *                     Absent means every rule in this set is in scope, which is correct for the
 *                     process rules — they do not have a UI class.
 * @param unexamined   [{rule, reason}] — conditional detectors that met no instance of their
 *                     subject, so a not-evaluated result can say why nothing was established
 */
export function evaluate({
  catalog,
  policy,
  findings,
  evaluated,
  evidence = null,
  identities,
  today,
  appliesFilter = null,
  classScopes = null,
  unexamined = [],
}) {
  const declaredRules = policy?.rules ?? {};
  const applicability = policy?.applicability ?? {};
  const exceptions = Array.isArray(policy?.exceptions) ? policy.exceptions : [];
  const attestations = policy?.attestations ?? {};
  const examined = new Set(evaluated ?? []);
  const noSubject = new Map(unexamined.map((entry) => [entry.rule, entry.reason]));
  const freshnessByRule = identities ?? new Map();
  const evidenceByRule = evidence?.byRule ?? new Map();

  const byRule = new Map();
  for (const finding of findings) {
    if (!finding.rule) continue;
    const rule = resolve(catalog, finding.rule);
    if (!rule) continue;
    if (!byRule.has(rule.id)) byRule.set(rule.id, []);
    byRule.get(rule.id).push(finding);
  }

  const activeExceptions = new Map();
  const expiredExceptions = [];
  const rejectedExceptions = [];
  for (const entry of exceptions) {
    const rule = resolve(catalog, entry.rule);
    if (!rule) continue;
    if (appliesFilter && !appliesFilter(rule)) continue;
    // A non-exemptible rule admits no exception. The waiver is REJECTED, not honoured and not
    // quietly ignored: an exception engine that can waive a rule its standard declared
    // non-exemptible has made the prohibition optional, which is not a prohibition. Order matters —
    // this is checked before expiry, because a non-exemptible waiver is invalid whether or not it
    // has lapsed.
    if (rule.nonExemptible) {
      rejectedExceptions.push({ ...entry, rule: rule.id });
      continue;
    }
    if (entry.expires && entry.expires < today) expiredExceptions.push({ ...entry, rule: rule.id });
    else activeExceptions.set(rule.id, entry);
  }

  const results = [];
  for (const rule of catalog.rules.values()) {
    if (appliesFilter && !appliesFilter(rule)) continue;

    const declared = declaredRules[rule.id];
    const level = declared?.level ?? rule.level;
    const applies = applicability[rule.id];
    const hits = byRule.get(rule.id) ?? [];

    // Not applicable: the rule's subject does not exist here. Visible, never a silent exclusion.
    if (applies?.applicable === false || applies?.status === "not-applicable") {
      // ...unless a detector found the subject anyway. A declaration that the subject is absent,
      // contradicted by evidence that it is present, is a required-rule failure rather than a
      // silent opt-out — the applicability analogue of a contradicted attestation (ADR 0003).
      if (hits.length > 0) {
        results.push({
          ruleId: rule.id,
          status: RESULT.failed,
          severity: "error",
          level: "required",
          validationType: "configuration",
          assurance: "full",
          disposition: "contradicted-applicability",
          message: `${rule.id} is declared not-applicable, but a check found its subject: ${hits[0].message}`,
          evidence: hits.flatMap((h) => h.evidence ?? []),
          files: hits.flatMap((h) => h.evidence ?? []),
          remediation:
            "Remove the not-applicable declaration and satisfy the rule, or correct the declaration's scope. A declaration cannot make an observed subject absent.",
        });
        continue;
      }
      results.push(base(rule, level, RESULT.skipped, "not-applicable", applies.reason));
      continue;
    }

    // Class scoping, from Gate 1. `APPLICABLE` says an interface exists; it does not always say
    // which class of interface, and a rule that governs `web-ui` only cannot be evaluated against a
    // project the evidence has not placed on the web.
    //
    // Placed AFTER the policy declaration, which is more specific — a project that has declared this
    // rule not-applicable has said something about this rule, and a derived class scope must not
    // overrule it. Placed BEFORE everything else, because a rule that may not have a subject here
    // cannot be established by an attestation, by evidence, or by a static run that found nothing.
    const scope = classScopes?.get(rule.id);
    if (scope?.scope === "out") {
      results.push(
        base(rule, level, RESULT.skipped, "not-applicable-by-class", `${rule.id} ${scope.reason}.`),
      );
      continue;
    }
    if (scope?.scope === "unresolved") {
      results.push(base(rule, level, RESULT.skipped, "class-unresolved", `${rule.id} ${scope.reason}`));
      continue;
    }

    // Ingested browser or visual evidence, for the rules whose surface is a rendered interface.
    // Computed BEFORE the attestation is judged, because a machine that witnessed this rule fail is
    // the thing an approving review has to be measured against.
    const evidenceTyped =
      rule.validationType === "browser-analysis" || rule.validationType === "visual-analysis";
    const evidenceVerdict = evidenceTyped
      ? judgeEvidence(rule, level, evidence, evidenceByRule.get(rule.id) ?? [], hits)
      : null;

    // A recorded human judgement. Checked BEFORE not-evaluated, because an attestation is precisely
    // what turns "nobody looked" into "somebody looked" — but AFTER the findings and the evidence
    // verdict are in hand, because it may never override either.
    const attestation = attestations[rule.id];
    if (attestation) {
      const judged = judgeAttestation(rule, level, attestation, hits, evidenceVerdict, today, freshnessByRule);
      if (judged.conclusive) {
        results.push(judged.result);
        continue;
      }
      // The attestation established nothing. For a rule whose other surface reached a conclusion, that
      // conclusion is the better answer — a machine that measured the interface outranks a review that
      // has gone stale. Otherwise the attestation's own unestablished state is reported, distinctly:
      // freshness has already done the epistemic work of separating "the material changed" from "the
      // subject could not be reconstructed", and collapsing both into a bare not-evaluated here would
      // throw that away one line before it reached the output.
      if (evidenceTyped && (evidenceVerdict.status === RESULT.passed || evidenceVerdict.status === RESULT.failed)) {
        results.push(evidenceVerdict);
        continue;
      }
      results.push(judged.result);
      continue;
    }

    if (evidenceTyped) {
      results.push(evidenceVerdict);
      continue;
    }

    // A rule whose evidence surface is not static analysis is never established by a static run.
    // Without valid evidence or a valid attestation it is not-evaluated, even if the evaluator
    // claims to have examined it and found nothing — "no automated finding" is not evidence for a
    // requirement whose evaluator is a human.
    if (NON_STATIC_TYPES.has(rule.validationType) || !examined.has(rule.id)) {
      results.push(
        base(rule, level, RESULT.skipped, "not-evaluated", notEvaluatedMessage(rule, examined, noSubject)),
      );
      continue;
    }

    if (hits.length === 0) {
      results.push(base(rule, level, RESULT.passed, "evaluated", `No violation of ${rule.id} was observed.`));
      continue;
    }

    const exception = activeExceptions.get(rule.id);
    const outcome = level === "required" || level === "forbidden" ? RESULT.failed : RESULT.warning;
    const result = base(rule, level, outcome, exception ? "excepted" : "evaluated", hits[0].message);
    result.evidence = hits.flatMap((h) => h.evidence ?? []);
    result.files = result.evidence;
    if (exception) {
      result.exception = {
        reason: exception.reason,
        approvedBy: exception.approvedBy,
        approvedAt: exception.approvedAt,
        expires: exception.expires ?? null,
        reference: exception.reference ?? null,
      };
    }
    results.push(result);
  }

  for (const entry of rejectedExceptions) {
    results.push(policyFailure(
      entry.rule,
      "rejected-exception",
      `${entry.rule} is non-exemptible; the exception against it is rejected, not applied.`,
      "Remove the exception and satisfy the rule. If the rule genuinely has no subject in this project, declare it not-applicable instead.",
    ));
  }

  for (const entry of expiredExceptions) {
    results.push(policyFailure(
      entry.rule,
      "expired-exception",
      `The exception for ${entry.rule} expired on ${entry.expires}.`,
      "Renew the exception with a new approval, or satisfy the rule.",
    ));
  }

  return summarise(results, policy);
}

function notEvaluatedMessage(rule, examined, noSubject) {
  if (rule.validationType === "manual-review") {
    return `${rule.id} is established by human review, and no current attestation records one.`;
  }
  // A detector exists and met no instance of its subject. That is a different fact from having no
  // detector at all, and collapsing the two would hide which of the framework's gaps is a gap in the
  // tooling and which is a property of the project.
  if (noSubject.has(rule.id)) return `${rule.id} was not established: ${noSubject.get(rule.id)}.`;
  if (!examined.has(rule.id)) return `No implemented check evaluates ${rule.id}.`;
  return `${rule.id} was not established.`;
}

/**
 * Decide what ingested browser evidence establishes for one rule.
 *
 * THE PRECEDENCE IS EXPLICIT, AND THE ORDER IS THE ARGUMENT. First match wins:
 *
 *   0. a static finding exists              → failed        evidence outranks silence
 *   1. no evidence was supplied             → not-evaluated  NOT evidence-unavailable — see below
 *   2. the run did not complete             → evidence-unavailable
 *   3. the identity is stale                → stale-evidence
 *   4. the identity cannot be reconstructed → evidence-unavailable
 *   5. any conclusive failure               → failed
 *   6. no conclusive pass                   → not-evaluated
 *   7. coverage incomplete, or any
 *      inconclusive check for this rule     → partial-coverage
 *   8. otherwise                            → evidenced / passed
 *
 * Rule 5 sits ABOVE coverage deliberately, and rules 5–8 are the whole point of this function. A
 * failure observed at one route and viewport is a failure: the interface did that, and no amount of
 * unexercised surface elsewhere makes it not have happened. A PASS is the opposite kind of claim —
 * it says the defect is absent — so it needs the surface to have been covered. Presence can be
 * witnessed; absence has to be justified over a search surface. There is no majority vote anywhere
 * in this ordering: one failure beats any number of passes, and passes never outvote an inconclusive
 * check, they are merely insufficient without it.
 *
 * Rule 1 versus rules 2 and 4 is the distinction an adapter most needs. `evidence-unavailable` means
 * an attempt was made and established nothing. Nobody having run a browser at all is
 * `not-evaluated` — the ordinary state of a project that has not adopted the evidence surface yet,
 * and not a fault.
 */
function judgeEvidence(rule, level, evidence, outcomes, staticHits) {
  // A static finding against a browser-typed rule still counts. Evidence outranks assertion, and it
  // also outranks silence.
  if (staticHits.length > 0) {
    const result = base(rule, level, level === "required" || level === "forbidden" ? RESULT.failed : RESULT.warning, "evaluated", staticHits[0].message);
    result.evidence = staticHits.flatMap((h) => h.evidence ?? []);
    result.files = result.evidence;
    return result;
  }

  if (!evidence?.available) {
    return base(
      rule,
      level,
      RESULT.skipped,
      "not-evaluated",
      `${rule.id} requires ${rule.evidenceSurface} evidence, and none was supplied.`,
    );
  }

  if (evidence.run?.status === "failed") {
    return base(
      rule,
      level,
      RESULT.skipped,
      "evidence-unavailable",
      `The ${rule.evidenceSurface} run failed (${evidence.run.failureReason ?? "no reason recorded"}), so ${rule.id} was not established.`,
    );
  }

  if (evidence.freshness === "STALE") {
    return base(
      rule,
      level,
      RESULT.skipped,
      "stale-evidence",
      `The ${rule.evidenceSurface} evidence describes a different revision of the reviewed paths, so ${rule.id} was not established.`,
    );
  }

  if (evidence.freshness !== "FRESH") {
    return base(
      rule,
      level,
      RESULT.skipped,
      "evidence-unavailable",
      `The ${rule.evidenceSurface} evidence could not be anchored to committed content, so ${rule.id} was not established.`,
    );
  }

  const where = (o) => `${o.route ?? "?"}@${o.viewport ?? "?"}`;

  const failed = outcomes.filter((o) => o.outcome === "failed");
  if (failed.length > 0) {
    const result = base(
      rule,
      level,
      level === "required" || level === "forbidden" ? RESULT.failed : RESULT.warning,
      "evidenced",
      failed[0].evidence ?? `${rule.id} failed in the ${rule.evidenceSurface} run.`,
    );
    result.evidence = failed.map((o) => `${where(o)}: ${o.evidence ?? "failed"}`);
    result.files = [];
    return result;
  }

  // A pass observed on a route the run did not finish is not a pass. The route's own status says the
  // producer did not get through it, and a conclusion drawn from an unfinished route is a conclusion
  // about nothing. A FAILURE from the same route was still observed, which is why the filter is here
  // and not above.
  const passed = outcomes.filter((o) => o.outcome === "passed" && o.routeStatus !== "failed" && o.routeStatus !== "skipped");
  if (passed.length === 0) {
    // Nothing checked this rule, every check was inconclusive, or every pass came from a route the
    // run did not complete. All three establish nothing, and none of them is a failure.
    return base(
      rule,
      level,
      RESULT.skipped,
      "not-evaluated",
      `The ${rule.evidenceSurface} run reached no conclusion about ${rule.id}.`,
    );
  }

  const inconclusive = outcomes.filter((o) => o.outcome === "inconclusive");
  const coverage = evidence.coverage;
  if (inconclusive.length > 0 || coverage?.complete === false) {
    const why = [
      ...(inconclusive.length > 0
        ? [`${inconclusive.length} check(s) for this rule were inconclusive (${inconclusive.map(where).join(", ")})`]
        : []),
      ...(coverage?.reasons ?? []),
    ];
    const result = base(
      rule,
      level,
      RESULT.skipped,
      "partial-coverage",
      `${rule.id} passed everywhere it was conclusively checked, which is not the same as passing: ${why.join("; ")}.`,
    );
    result.evidence = passed.map(where);
    return result;
  }

  const result = base(rule, level, RESULT.passed, "evidenced", `${rule.id} was established by ${rule.evidenceSurface} evidence.`);
  result.evidence = passed.map(where);
  return result;
}

/**
 * Decide what an attestation establishes.
 *
 * THE PRECEDENCE IS EXPLICIT, AND THE ORDER IS THE ARGUMENT. First match wins:
 *
 *   1. the rule is not attestable          → invalid-attestation    / failed
 *   2. a check or a run witnessed a failure → contradicted-attestation / failed
 *   3. the review recorded a rejection      → attested-rejected      / failed
 *   4. the attestation has expired          → not-evaluated
 *   5. the identity is stale                → stale-evidence
 *   6. the identity cannot be reconstructed → evidence-unavailable
 *   7. no declared subject to review against→ unscoped-review
 *   8. the review did not cover the subject → partial-review
 *   9. otherwise                            → attested / passed
 *
 * Step 2 above step 9 is the load-bearing one: EVIDENCE OUTRANKS ASSERTION. A human saying a rule is
 * satisfied does not change what a detector observed or what a browser run measured, and a fresh
 * approved review must never erase a witnessed failure. It is also why an attestation cannot bypass a
 * nonExemptible rule — not as a separate prohibition, but because the failure survives the review.
 *
 * Steps 5 and 6 are separate outcomes, not two spellings of one. Freshness has already distinguished
 * "the reviewed material provably changed" from "the reviewed material could not be reconstructed",
 * and that distinction is what tells an adopter whether to re-review or to fix their record. Steps 7
 * and 8 are likewise distinct: nothing to measure against, versus measured and short.
 *
 * Steps 4 through 8 are all unestablished and NONE of them is a failure. The team did review
 * something; what they have is no longer, or not yet, evidence about what is here now. Returning a
 * failure for any of them would punish a project for a review going stale, which teaches long expiry
 * windows and broad path lists — the opposite of what the mechanism is for.
 *
 * Returns { result, conclusive }. `conclusive` marks the four outcomes that settle the rule on the
 * attestation's own authority (1, 2, 3, 9); the caller uses it to let a rule's other evidence surface
 * answer when the review could not.
 */
function judgeAttestation(rule, level, attestation, hits, evidenceVerdict, today, freshnessByRule) {
  const failure = (disposition, message, remediation) => ({
    conclusive: true,
    result: policyFailure(rule.id, disposition, message, remediation),
  });
  const unestablished = (disposition, message) => ({
    conclusive: false,
    result: base(rule, level, RESULT.skipped, disposition, message),
  });

  if (!rule.attestable) {
    return failure(
      "invalid-attestation",
      `${rule.id} is not attestable; the catalog says it is evaluated by ${rule.validationType}, not by human review.`,
      "Remove the attestation. A rule the catalog does not mark attestable cannot be satisfied by assertion.",
    );
  }

  if (hits.length > 0) {
    return failure(
      "contradicted-attestation",
      `${rule.id} is attested as approved, but an automated check found: ${hits[0].message}`,
      "Fix the finding. An attestation records human evidence; it never overrides what a check observed.",
    );
  }

  // The same rule, from the other direction: a browser or visual run that witnessed this rule fail.
  // A reviewer approving what a run measured failing does not make the run not have happened.
  if (evidenceVerdict && (evidenceVerdict.status === RESULT.failed || evidenceVerdict.status === RESULT.warning)) {
    return failure(
      "contradicted-attestation",
      `${rule.id} is attested as approved, but the ${rule.evidenceSurface} run recorded a failure: ${evidenceVerdict.message}`,
      "Fix what the run observed, then re-attest. A review never overrides a measurement of the thing reviewed.",
    );
  }

  if (attestation.status === "rejected") {
    return failure(
      "attested-rejected",
      `${rule.id} was reviewed by ${attestation.reviewedBy} and found unmet.`,
      "Satisfy the rule, then re-attest. A recorded rejection is a failure, not silence.",
    );
  }

  if (attestation.expires && attestation.expires < today) {
    return unestablished(
      "not-evaluated",
      `The review of ${rule.id} by ${attestation.reviewedBy} expired on ${attestation.expires}, so the rule is unreviewed again. This is not a violation.`,
    );
  }

  // Fail closed. A caller that judged no freshness for this attestation has not shown it to be fresh,
  // and defaulting an unresolved record to usable would make the whole mechanism opt-in for anyone
  // who forgot to wire it — the one failure mode this file exists to prevent.
  const resolution = freshnessByRule.get(rule.id);
  if (!resolution?.freshness) {
    return unestablished(
      "evidence-unavailable",
      `The freshness of the review of ${rule.id} was never resolved, so nothing establishes that the reviewed material is the material that is here now.`,
    );
  }

  const freshness = resolution.freshness;
  if (freshness.state === "STALE") {
    return unestablished(
      "stale-evidence",
      `The review of ${rule.id} describes material that has since changed, so it establishes nothing about what is here now: ${freshness.reason}.`,
    );
  }
  if (freshness.state !== "FRESH") {
    return unestablished(
      "evidence-unavailable",
      `The subject of the review of ${rule.id} could not be reconstructed, so the review could not be checked against it: ${freshness.reason}.`,
    );
  }

  const scope = resolution.scope;
  if (scope && scope.unscoped) {
    return unestablished(
      "unscoped-review",
      `${rule.id} was reviewed, but ${scope.reason}. A review that names its own scope establishes whatever the reviewer chose to look at.`,
    );
  }
  if (scope && !scope.covered) {
    return unestablished(
      "partial-review",
      `The review of ${rule.id} covered part of the declared subject, which is not the same as covering it: ${scope.reason}.`,
    );
  }

  return {
    conclusive: true,
    result: {
      ruleId: rule.id,
      status: RESULT.passed,
      severity: rule.severity,
      level,
      // Human judgement establishes the requirement, and does so without a machine. `manual-review`
      // here is not the rule's declared type but the surface that established THIS result: an
      // attestable `visual-analysis` rule established by a person belongs in the `manualReview`
      // assurance bucket, because filing it under `visualAnalysis` would claim a machine looked.
      // The `attested` disposition and `evidenced` disposition stay distinct for the same reason.
      validationType: "manual-review",
      assurance: "full",
      disposition: "attested",
      message: `Attested by ${attestation.reviewedBy} on ${attestation.reviewedAt}: ${attestation.evidence}`,
      evidence: attestation.reviewedAgainst?.paths ?? [],
      files: attestation.reviewedAgainst?.paths ?? [],
      remediation: rule.remediation,
      attestation: {
        reviewedBy: attestation.reviewedBy,
        reviewedAt: attestation.reviewedAt,
        evidence: attestation.evidence,
        reference: attestation.reference ?? null,
        expires: attestation.expires ?? null,
        revision: attestation.reviewedAgainst?.revision ?? null,
        reviewedAgainst: attestation.reviewedAgainst?.paths ?? [],
        scopeSource: scope?.source ?? null,
      },
    },
  };
}

function policyFailure(ruleId, disposition, message, remediation) {
  return {
    ruleId,
    status: RESULT.failed,
    severity: "error",
    level: "required",
    validationType: "configuration",
    assurance: "full",
    disposition,
    message,
    evidence: ["project-policy.yml"],
    files: ["project-policy.yml"],
    remediation,
  };
}

function base(rule, level, status, disposition, message) {
  return {
    ruleId: rule.id,
    status,
    severity: rule.severity,
    level,
    validationType: rule.validationType,
    assurance: status === RESULT.skipped ? "none" : rule.assurance,
    disposition,
    message,
    evidence: [],
    files: [],
    remediation: rule.remediation,
  };
}

function summarise(results, policy) {
  const counts = { passed: 0, failed: 0, warnings: 0, skipped: 0 };
  for (const r of results) {
    if (r.status === RESULT.passed) counts.passed++;
    else if (r.status === RESULT.failed) counts.failed++;
    else if (r.status === RESULT.warning) counts.warnings++;
    else counts.skipped++;
  }

  // Assurance accounts for every applicable rule, and the five buckets MUST sum. The bucket follows
  // the evidence surface that established the result, so a browser-established pass is never filed
  // under `automated` (ADR 0004).
  const assurance = { automated: 0, browserAnalysis: 0, visualAnalysis: 0, manualReview: 0, notEvaluated: 0 };
  for (const r of results) {
    if (NO_SUBJECT.has(r.disposition)) continue;
    if (r.status === RESULT.skipped) assurance.notEvaluated++;
    else if (r.validationType === "manual-review") assurance.manualReview++;
    else if (r.validationType === "browser-analysis") assurance.browserAnalysis++;
    else if (r.validationType === "visual-analysis") assurance.visualAnalysis++;
    else assurance.automated++;
  }

  const applicable = results.filter((r) => !NO_SUBJECT.has(r.disposition));
  const scored = applicable.filter((r) => r.status !== RESULT.skipped && r.level === "required");
  const scoredPassed = scored.filter((r) => r.status === RESULT.passed).length;
  const score = scored.length === 0 ? null : Math.round((scoredPassed / scored.length) * 100);

  const requiredFailures = results.filter(
    (r) => r.status === RESULT.failed && !(r.disposition === "excepted"),
  );
  const excepted = results.filter((r) => r.disposition === "excepted");

  /**
   * An applicable `forbidden` rule that nobody established caps the verdict.
   *
   * For a `required` rule, not-evaluated means "we did not check that you did the thing". For a
   * `forbidden` rule it means "nobody looked for the prohibited behaviour", and reporting COMPLIANT
   * over an unexamined prohibition is a false green at the verdict level.
   *
   * The seven unestablishing dispositions all count: nothing looked, the run failed, the evidence
   * describes different material, the rule's class scope was never resolved, the run covered only part
   * of the surface, no subject was declared for a review to cover, and the review covered part of the
   * subject. They are seven ways of not having established a prohibition, and the list grows every
   * time this framework learns a new way to not know something — which is the correct direction for it
   * to grow. A forbidden rule must not pass quietly on an unresolved class, on a browser run that
   * never opened half the interface, or on a design review whose scope the reviewer chose.
   *
   * Placed AFTER the NON_COMPLIANT and COMPLIANT_WITH_EXCEPTIONS determinations on purpose, so it
   * cannot intercept the exception machinery. A rule that was excepted, rejected, or declared
   * not-applicable has been LOOKED AT; the cap exists only for the case where nothing happened at
   * all.
   */
  const unestablished = applicable.filter(
    (r) =>
      r.level === "forbidden" &&
      r.status === RESULT.skipped &&
      [
        "not-evaluated",
        "evidence-unavailable",
        "stale-evidence",
        "class-unresolved",
        "partial-coverage",
        "unscoped-review",
        "partial-review",
      ].includes(r.disposition),
  );

  let status;
  if (!policy) status = STATUS.NOT_EVALUATED;
  else if (requiredFailures.length > 0) status = STATUS.NON_COMPLIANT;
  else if (excepted.length > 0) status = STATUS.COMPLIANT_WITH_EXCEPTIONS;
  else if (unestablished.length > 0) status = STATUS.NOT_EVALUATED;
  else status = STATUS.COMPLIANT;

  return {
    status,
    unestablishedProhibitions: unestablished.map((r) => r.ruleId),
    score,
    summary: counts,
    assurance,
    denominator: {
      total: results.length,
      applicable: applicable.length,
      scored: scored.length,
      basis: "required-level rules that were evaluated",
    },
    results,
  };
}

/**
 * The compliance envelope.
 *
 * Three independent blocks, so that no field changes meaning by context (ADR 0003):
 *
 *   applicability        what Gate 1 established, and on what evidence
 *   uiCompliance         Gate 2 over UI-class rules — null unless applicability is APPLICABLE
 *   frameworkCompliance  the process rules — always present, whatever Gate 1 said
 *
 * An earlier draft used a single `compliance` field carrying UI results when a UI existed and
 * process results when it did not. A consumer would then have had to read the applicability block to
 * know what the field it had just read meant.
 */
export function envelope({
  applicability,
  uiVerdict,
  frameworkVerdict,
  project,
  standardVersion,
  auditedAt,
  repo,
  frameworkCoverage,
  evidenceSurface,
}) {
  const block = (verdict) =>
    verdict === null || verdict === undefined
      ? null
      : {
          status: verdict.status,
          score: verdict.score,
          summary: verdict.summary,
          assurance: verdict.assurance,
          denominator: verdict.denominator,
          // Present on every run, empty when nothing is unestablished, so a consumer can distinguish
          // "no prohibitions went unexamined" from "this validator predates the rule".
          unestablishedProhibitions: verdict.unestablishedProhibitions ?? [],
          results: verdict.results,
        };

  return {
    schemaVersion: "1.0",
    standardVersion: standardVersion ?? null,
    project: project ?? repo ?? null,
    applicability: applicability ?? null,
    uiCompliance: block(uiVerdict),
    frameworkCompliance: block(frameworkVerdict),
    // Framework maturity, sitting outside every verdict on purpose. It says how much of the
    // framework has been turned into rules — never how compliant this project is.
    frameworkCoverage: frameworkCoverage ?? null,
    // What was actually looked at. A clean result must never read as "the tool noticed nothing".
    evidenceSurface: evidenceSurface ?? null,
    auditedAt,
  };
}
