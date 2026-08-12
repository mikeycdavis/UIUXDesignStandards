/**
 * The falsifier table — architectural mutations and the suites that must object to them.
 *
 * Data only, and in a file the test runner does not collect, so that test/invariants.test.mjs can
 * cross-check it against the invariant registry without running the harness. Importing a `.test.mjs`
 * file executes its tests, and a registry check that took seventy seconds to answer a question about
 * a list would not get run.
 *
 * The harness that executes these is test/falsifiers.test.mjs.
 */

/**
 * @property invariant  the thing being defended, in the words the framework uses for it
 * @property file       the source or fixture the mutation lands in
 * @property find       text that must appear EXACTLY ONCE — a falsifier matching nothing, or matching
 *                      several places, is not aimed at anything
 * @property replace    what to put there, or `null` to delete the path entirely
 * @property suite      the test file that must object
 */
export const FALSIFIERS = [
  {
    invariant: "gate1.indeterminate-is-not-not-applicable",
    file: "scripts/applicability.mjs",
    find: `return { classification: "INDETERMINATE", agreement: "undeclared", applicabilityClasses: [], reasons };`,
    replace: `return { classification: "NOT_APPLICABLE", agreement: "undeclared", applicabilityClasses: [], reasons };`,
    suite: "test/applicability.test.mjs",
  },
  {
    invariant: "gate1.class-unresolved-is-not-an-exclusion",
    file: "scripts/compliance.mjs",
    find: `results.push(base(rule, level, RESULT.skipped, "class-unresolved", \`\${rule.id} \${scope.reason}\`));`,
    replace: `results.push(base(rule, level, RESULT.skipped, "not-applicable", \`\${rule.id} \${scope.reason}\`));`,
    suite: "test/validate.test.mjs",
  },
  {
    invariant: "verdict.absent-policy-is-not-compliance",
    file: "scripts/compliance.mjs",
    find: `if (!policy) status = STATUS.NOT_EVALUATED;`,
    replace: `if (!policy) status = STATUS.COMPLIANT;`,
    suite: "test/validate.test.mjs",
  },
  {
    invariant: "evidence.non-static-rules-never-pass-from-a-static-run",
    file: "scripts/compliance.mjs",
    find: `const NON_STATIC_TYPES = new Set(["manual-review", "browser-analysis", "visual-analysis"]);`,
    replace: `const NON_STATIC_TYPES = new Set([]);`,
    suite: "test/compliance.test.mjs",
  },
  {
    invariant: "attestation.evidence-outranks-assertion",
    file: "scripts/compliance.mjs",
    find: `  if (hits.length > 0) {
    return failure(
      "contradicted-attestation",`,
    replace: `  if (false && hits.length > 0) {
    return failure(
      "contradicted-attestation",`,
    suite: "test/compliance.test.mjs",
  },
  {
    invariant: "evidence.partial-coverage-is-not-established",
    file: "scripts/compliance.mjs",
    find: `if (inconclusive.length > 0 || coverage?.complete === false) {`,
    replace: `if (inconclusive.length > 0) {`,
    suite: "test/evidence.test.mjs",
  },
  {
    invariant: "attestation.partial-review-is-not-attested",
    file: "scripts/compliance.mjs",
    find: `  if (scope && !scope.covered) {
    return unestablished(
      "partial-review",`,
    replace: `  if (false && scope && !scope.covered) {
    return unestablished(
      "partial-review",`,
    suite: "test/attestation.test.mjs",
  },
  {
    invariant: "freshness.stale-is-not-fresh",
    file: "scripts/content-identity.mjs",
    find: `      state: FRESHNESS.STALE,
      reason: "the reviewed paths have changed since the recorded revision",`,
    replace: `      state: FRESHNESS.FRESH,
      reason: "the reviewed paths have changed since the recorded revision",`,
    suite: "test/content-identity.test.mjs",
  },
  {
    invariant: "freshness.unavailable-is-not-stale",
    file: "scripts/content-identity.mjs",
    find: `    return { state: FRESHNESS.EVIDENCE_UNAVAILABLE, reason: historical.reason, code: historical.code };`,
    replace: `    return { state: FRESHNESS.STALE, reason: historical.reason, code: historical.code };`,
    suite: "test/content-identity.test.mjs",
  },
  {
    invariant: "gate1.a-declaration-does-not-resolve-its-own-class",
    file: "scripts/uiux.mjs",
    find: `  const proven = gate.applicabilityClasses ?? [];`,
    replace: `  const proven = [...(gate.applicabilityClasses ?? []), ...(gate.declaredClasses ?? [])];`,
    suite: "test/validate.test.mjs",
  },
  {
    invariant: "envelope.framework-verdict-does-not-answer-for-the-ui-gate",
    file: "scripts/uiux.mjs",
    find: `  if (envelopeResult.applicability.classification === "INDETERMINATE") return EXIT_FINDINGS;`,
    replace: `  // falsifier: the INDETERMINATE guard removed`,
    suite: "test/validate.test.mjs",
  },
  {
    invariant: "ci.validate-is-the-gate",
    file: ".github/workflows/ci.yml",
    find: "run: npm run validate",
    replace: "run: echo skipped",
    suite: "test/package.test.mjs",
  },
  {
    invariant: "ci.the-workflow-installs-nothing",
    file: ".github/workflows/ci.yml",
    find: "      - name: Tests",
    replace: "      - run: npm ci\n      - name: Tests",
    suite: "test/package.test.mjs",
  },
  {
    invariant: "docs.diagrams-match-their-canonical-source",
    file: "docs/architecture.mmd",
    find: "Gate 1 — is a UI applicable?",
    replace: "Gate 1 — something else entirely",
    suite: "test/instructions.test.mjs",
  },
  {
    // The release gate's own shortcut: treat "could not measure it" as "it is fine". This is the
    // NOT_EVALUATED-satisfies-a-criterion bug at the one layer where it would ship.
    invariant: "release.not-evaluated-never-satisfies",
    file: "scripts/release-readiness.mjs",
    find: `  const failed = criteria.filter((c) => [FAILED, NOT_EVALUATED, BLOCKING_GAP].includes(c.state));`,
    replace: `  const failed = criteria.filter((c) => c.state === FAILED);`,
    suite: "test/release.test.mjs",
  },
  {
    // The snapshot stops being an independent oracle the moment the checker will accept whatever it
    // finds. A comparison that cannot disagree is a comparison of the catalog with itself.
    invariant: "release.the-snapshot-is-an-independent-oracle",
    file: "scripts/release-readiness.mjs",
    find: `      if (snapshot.digest !== liveDigest) problems.push`,
    replace: `      if (false) problems.push`,
    suite: "test/release.test.mjs",
  },
  {
    // The repair that looks obvious and is wrong: accept an ancestor tag as agreement, so ordinary
    // post-release development stops failing. It also accepts a tree that has rewritten every file
    // since the release. Ancestry proves the release is behind us, never that this IS it.
    invariant: "release.identity-is-equality-never-ancestry",
    file: "scripts/version-identity.mjs",
    find: `  if (at === now) {`,
    replace: `  if (at === now || git(["merge-base", "--is-ancestor", \`\${tag}^{commit}\`, "HEAD"]).status === 0) {`,
    suite: "test/version-identity.test.mjs",
  },
  {
    // The version-identity guard, weakened to the comparison every inherited implementation makes:
    // declared version against executing VERSION. Under this family's release convention both read
    // "1.0.0" on a post-release branch, so the consumer that pinned the release is handed a verdict
    // from unreleased code and told it came from the release.
    invariant: "identity.a-verdict-names-the-framework-that-produced-it",
    file: "scripts/version-identity.mjs",
    find: `  if (release.tree === "RELEASE_TREE") {`,
    replace: `  if (true) {`,
    suite: "test/version-identity.test.mjs",
  },
  {
    // Let every criterion grant itself an accepted limitation, and RECORDED_GAP stops meaning "this
    // evidence cannot be recovered" and starts meaning "we wrote it down". That is the release waiver
    // the state was invented to prevent, and it is one boolean away at all times.
    invariant: "release.a-recorded-gap-is-not-a-waiver",
    file: "scripts/release-readiness.mjs",
    find: `    const grantedGap = state !== RECORDED_GAP || id in GAP_POLICY;`,
    replace: `    const grantedGap = true;`,
    suite: "test/release.test.mjs",
  },
  {
    // A hash in scripts/ that declares no scope is a second answer to "has this changed since it was
    // reviewed", which is the one question that must have exactly one owner.
    invariant: "freshness.one-owner",
    file: "scripts/release-readiness.mjs",
    find: " * DIGEST-SCOPE: the resolved rule catalog's identity projection, for the release snapshot only.",
    replace: " * (falsifier: the digest scope declaration removed)",
    suite: "test/content-identity.test.mjs",
  },
  {
    invariant: "fixtures.the-known-negative-drawer-is-load-bearing",
    file: "test/fixtures/never-clean",
    replace: null,
    suite: "test/audit.test.mjs",
  },
  {
    invariant: "fixtures.the-evidence-drawer-is-load-bearing",
    file: "test/fixtures/evidence",
    replace: null,
    suite: "test/evidence.test.mjs",
  },
];

