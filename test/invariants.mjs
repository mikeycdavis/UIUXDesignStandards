/**
 * The invariant registry, as data.
 *
 * Extracted from the suite that asserts it for the same reason `test/falsifiers.mjs` was: importing a
 * `.test.mjs` file EXECUTES its tests, so a consumer that only wants the table would run the suite as
 * a side effect. `scripts/release-readiness.mjs` is that consumer — it has to be able to ask whether
 * every registered invariant still names a defending test and a breaking mutation, and it cannot do
 * that by running the suite it is being asked to judge.
 *
 * The prose explaining what each field means lives in test/invariants.test.mjs, beside the assertions
 * that enforce it.
 */

export const INVARIANTS = [
  {
    id: "verdict.inability-is-never-a-pass",
    statement: "An inability to evaluate is never converted into compliance.",
    record: { file: "standards/35-evidence-assurance-and-compliance-output.md", quote: "A verdict MUST NEVER be strengthened by an inability to run" },
    tests: ["no non-static rule can pass without evidence or attestation, over the whole catalog"],
    falsifier: "evidence.non-static-rules-never-pass-from-a-static-run",
  },
  {
    id: "gate1.indeterminate-is-not-not-applicable",
    statement: "Failure to establish applicability is INDETERMINATE, never NOT_APPLICABLE.",
    record: { file: "standards/34-project-policy-applicability-and-exceptions.md", quote: "INDETERMINATE" },
    tests: [
      "rule 6 — zero signals with no declaration is INDETERMINATE, never NOT_APPLICABLE",
      "the Gate 1 transition sequence never passes through NOT_APPLICABLE illegitimately",
    ],
    falsifier: "gate1.indeterminate-is-not-not-applicable",
  },
  {
    id: "gate1.class-unresolved-is-not-an-exclusion",
    statement: "An unresolved applicability class stays inside the applicable denominator.",
    record: { file: "standards/34-project-policy-applicability-and-exceptions.md", quote: "MUST NOT be scoped by declaration alone" },
    tests: ["class-unresolved is not folded into not-applicable: it stays in the applicable denominator"],
    falsifier: "gate1.class-unresolved-is-not-an-exclusion",
  },
  {
    id: "gate1.a-declaration-does-not-resolve-its-own-class",
    statement: "A rule is scoped by the classes evidence proved, never by the class a policy declared.",
    record: { file: "docs/integration-contract.md", quote: "matched against the classes Gate 1 **proved**" },
    tests: ["scopeOfRule: a DECLARED class does not scope a rule in — only evidence does"],
    falsifier: "gate1.a-declaration-does-not-resolve-its-own-class",
  },
  {
    id: "verdict.absent-policy-is-not-compliance",
    statement: "With no policy, nothing was declared and nothing is compliant.",
    record: { file: "docs/integration-contract.md", quote: "NOT_EVALUATED" },
    tests: ["no policy is NOT_EVALUATED, whatever the rules say", "an absent policy is an absent configuration, not a broken one"],
    falsifier: "verdict.absent-policy-is-not-compliance",
  },
  {
    id: "envelope.framework-verdict-does-not-answer-for-the-ui-gate",
    statement: "A satisfied framework-process verdict never produces a passing exit for an unresolved UI gate.",
    record: { file: "standards/34-project-policy-applicability-and-exceptions.md", quote: "MUST NOT produce a passing exit for an unresolved UI gate" },
    tests: ["INDETERMINATE exits 1 even when frameworkCompliance is COMPLIANT"],
    falsifier: "envelope.framework-verdict-does-not-answer-for-the-ui-gate",
  },
  {
    id: "prohibition.unestablished-caps-the-verdict",
    statement: "A forbidden rule nobody established caps the verdict at NOT_EVALUATED and exits 1.",
    record: { file: "standards/35-evidence-assurance-and-compliance-output.md", quote: "Unestablished prohibitions MUST cap the verdict" },
    tests: [
      "a forbidden rule whose evidence run failed still caps the verdict",
      "an unestablished forbidden rule caps the verdict even when every check passed",
      "the same unestablished review caps a FORBIDDEN rule and does not block a REQUIRED one",
    ],
    falsifier: null,
  },
  {
    id: "evidence.partial-coverage-is-not-established",
    statement: "Passing checks over a surface that was not fully exercised establish nothing.",
    record: { file: "standards/36-browser-and-visual-evidence.md", quote: "reported `partial-coverage` and\nremains unestablished" },
    tests: [
      "a declared viewport class the run never tested leaves the rule unestablished",
      "a route the run never reached leaves the rule unestablished, however well the others went",
    ],
    falsifier: "evidence.partial-coverage-is-not-established",
  },
  {
    id: "evidence.one-failure-outranks-any-passes",
    statement: "One conclusive failure beats any number of passes. There is no majority vote.",
    record: { file: "standards/36-browser-and-visual-evidence.md", quote: "There is no majority vote" },
    tests: ["one conclusive failure beats any number of passes — there is no majority vote", "a failure is established even where coverage is not"],
    falsifier: null,
  },
  {
    id: "evidence.wrong-surface-is-a-broken-contract",
    statement: "A rule is never established through a surface its validationType does not name.",
    record: { file: "standards/36-browser-and-visual-evidence.md", quote: "MUST NOT be established through a surface its validationType does not name" },
    tests: ["the four axes stay independent through the whole mutation sequence"],
    falsifier: null,
  },
  {
    id: "evidence.unavailable-means-an-attempt-was-made",
    statement: "evidence-unavailable means an attempt established nothing; no attempt is not-evaluated.",
    record: { file: "standards/35-evidence-assurance-and-compliance-output.md", quote: "MUST mean an attempt was made and established nothing" },
    tests: ["omitting --evidence leaves browser rules not-evaluated, never evidence-unavailable"],
    falsifier: null,
  },
  {
    id: "attestation.evidence-outranks-assertion",
    statement: "A recorded human approval never overrides what a check or a run observed.",
    record: { file: "standards/37-manual-design-review.md", quote: "Evidence MUST outrank assertion" },
    tests: ["an automated finding contradicts an approving attestation", "the attestation lifecycle: each mutation moves exactly one thing, and the state follows"],
    falsifier: "attestation.evidence-outranks-assertion",
  },
  {
    id: "attestation.partial-review-is-not-attested",
    statement: "A review narrower than the project-declared subject establishes nothing.",
    record: { file: "standards/37-manual-design-review.md", quote: "The scope a review must cover MUST be declared outside the review" },
    tests: ["a review narrower than the declared subject is partial, not established", "an undeclared review subject establishes nothing, at both layers that can catch it"],
    falsifier: "attestation.partial-review-is-not-attested",
  },
  {
    id: "attestation.expiry-is-not-failure",
    statement: "An expired review returns a rule to unestablished, and is never a violation.",
    record: { file: "standards/37-manual-design-review.md", quote: "Expiry MUST NOT become failure" },
    tests: ["an expired review returns the rule to unreviewed, and is never recorded as a violation"],
    falsifier: null,
  },
  {
    id: "freshness.stale-is-not-fresh",
    statement: "Material proved changed since the record was made establishes nothing.",
    record: { file: "standards/36-browser-and-visual-evidence.md", quote: "Evidence freshness MUST be established against committed content" },
    tests: ["an unstaged modification to a reviewed path is STALE", "a staged-only modification to a reviewed path is STALE"],
    falsifier: "freshness.stale-is-not-fresh",
  },
  {
    id: "freshness.unavailable-is-not-stale",
    statement: "Could-not-reconstruct and proved-changed are different facts and are never collapsed.",
    record: { file: "standards/36-browser-and-visual-evidence.md", quote: "never collapsed" },
    tests: ["an unresolvable revision is EVIDENCE_UNAVAILABLE, not STALE", "an untracked replacement does not downgrade a proved change to EVIDENCE_UNAVAILABLE"],
    falsifier: "freshness.unavailable-is-not-stale",
  },
  {
    id: "freshness.identity-is-committed-content",
    statement: "Identity comes from the committed tree — never working-tree bytes, never the index.",
    record: { file: "artifacts/adr/0011-freshness-is-committed-content-identity-with-path-scoped-working-subject-integrity.md", quote: "committed" },
    tests: ["identity ignores working-tree bytes entirely", "identity ignores the staging area entirely", "two clean checkouts of one commit produce the same identity"],
    falsifier: null,
  },
  {
    id: "freshness.one-owner",
    statement: "There is exactly one content-identity implementation, and it does not use the rejected alternatives.",
    record: { file: "standards/37-manual-design-review.md", quote: "one owner, not two implementations" },
    tests: ["content-identity.mjs is the only identity implementation in scripts/", "the primitive does not USE the rejected alternatives, and is free to EXPLAIN them"],
    falsifier: "freshness.one-owner",
  },
  {
    id: "catalog.identity-is-frozen-before-implementation",
    statement: "Detectors bind to frozen identities and never move them.",
    record: { file: "artifacts/design/rule-catalog-v1.md", quote: "static detectors" },
    tests: ["the shipped detectors agree with the frozen catalog, name for name and binding for binding", "the corpus, the freeze, and the catalog reconcile, and the pass is not vacuous"],
    falsifier: null,
  },
  {
    id: "exit.codes-are-never-collapsed",
    statement: "0 the condition holds, 1 the tool worked and found problems, 2 no verdict was reached.",
    record: { file: "standards/35-evidence-assurance-and-compliance-output.md", quote: "Exit codes MUST NOT be collapsed" },
    tests: ["the three failure kinds map onto exit codes without collapsing into each other", "an incoherent policy stops the run at Gate 0, and produces no compliance blocks at all"],
    falsifier: null,
  },
  {
    id: "assurance.buckets-sum-to-applicable",
    statement: "The five assurance buckets account for every applicable rule.",
    record: { file: "standards/35-evidence-assurance-and-compliance-output.md", quote: "MUST sum to the applicable set" },
    tests: ["the five assurance buckets sum to the applicable count", "a browser-established pass is filed under browserAnalysis, never automated"],
    falsifier: null,
  },
  {
    id: "detector.instances-not-mentions",
    statement: "A detector reports an instance of its subject, never a discussion of it.",
    record: { file: "standards/40-detector-and-testing-integrity.md", quote: "mention" },
    tests: ["never-clean names every prohibited pattern and produces no finding", "every detector declares the view it reads"],
    falsifier: "fixtures.the-known-negative-drawer-is-load-bearing",
  },
  {
    id: "detector.no-subject-is-not-a-pass",
    statement: "A detector that met no instance of its subject establishes nothing.",
    record: { file: "standards/40-detector-and-testing-integrity.md", quote: "vacuous" },
    tests: ["the token-drift detector is conditional, and its absent subject is not-evaluated rather than clean"],
    falsifier: null,
  },
  {
    id: "policy.malformed-is-not-a-failing-project",
    statement: "A configuration error is exit 2 and produces no verdict, never a compliance finding.",
    record: { file: "artifacts/adr/0012-schema-validates-shape-policy-validates-cross-field-semantics.md", quote: "configuration error" },
    tests: ["the three failure kinds map onto exit codes without collapsing into each other", "the accessibility-target mutation proves both halves of the fail-closed decision"],
    falsifier: null,
  },
  {
    id: "provenance.origin-is-recorded-or-declared",
    statement: "Every accessibility rule is mapped to a source or declared project-authored.",
    record: { file: "standards/38-external-source-provenance.md", quote: "provenance" },
    tests: ["an accessibility rule with no recorded origin is rejected", "the corpus passes, and the pass is not vacuous"],
    falsifier: null,
  },
  {
    id: "provenance.the-freeze-is-an-independent-oracle",
    statement: "Provenance is reconciled against the freeze, which no generator writes, and not only against the catalog.",
    record: { file: "artifacts/design/rule-catalog-v1.md", quote: "frozen" },
    tests: [
      "a frozen accessibility rule with no recorded origin is rejected against the freeze",
      "provenance for an identity the freeze does not define is rejected",
    ],
    falsifier: null,
  },
  {
    id: "init.plan-is-pure",
    statement: "init's planner writes nothing; the dry run is that planner, not a second implementation.",
    record: { file: "artifacts/project-plan-breakdown/09-init-bootstrap.md", quote: "`plan()` is pure and\ntouches nothing" },
    tests: ["plan() changes nothing at all, directories included", "apply() is the only writer in the module", "--dry-run changes nothing, and reports what a real run would do"],
    falsifier: null,
  },
  {
    id: "ci.validate-is-the-gate",
    statement: "CI's verdict comes from validate, not from assembling one out of other commands' exit codes.",
    record: { file: "artifacts/project-plan-breakdown/11-ci-and-docs.md", quote: "`validate` is the gate" },
    tests: ["CI runs the gate, the full suite, and the self-check — removing any one is caught"],
    falsifier: "ci.validate-is-the-gate",
  },
  {
    id: "ci.the-workflow-installs-nothing",
    statement: "The zero-dependency decision holds in CI: no install step, and a comment may say so.",
    record: { file: "artifacts/project-plan-breakdown/11-ci-and-docs.md", quote: "No `npm ci`, `npm install`, or dependency cache step" },
    tests: [
      "the CI workflow invokes only scripts the package declares, and installs nothing",
      "the install-step guard reads a use and not a mention — both directions",
    ],
    falsifier: "ci.the-workflow-installs-nothing",
  },
  {
    id: "docs.diagrams-match-their-canonical-source",
    statement: "The architecture document's diagrams are the .mmd file, not a copy that has drifted from it.",
    record: { file: "artifacts/project-plan-breakdown/11-ci-and-docs.md", quote: "canonical diagram source" },
    tests: ["the architecture diagrams match their canonical source"],
    falsifier: "docs.diagrams-match-their-canonical-source",
  },
  {
    id: "docs.prose-is-bound-to-the-implementation",
    statement: "A command, field, disposition, rule, or link a document names must resolve against the implementation.",
    record: { file: "artifacts/project-plan-breakdown/11-ci-and-docs.md", quote: "Every path, script, and subcommand named in `INSTRUCTIONS.md` exists" },
    tests: [
      "every command the documentation names exists as a script the package declares",
      "every disposition the documentation names is one the evaluator can produce",
      "every rule id the documentation names is a catalog identity",
      "every standard and every relative link the documentation names resolves",
    ],
    falsifier: null,
  },
  {
    id: "fixtures.the-evidence-drawer-is-load-bearing",
    statement: "The evidence suite's assertions depend on its fixtures existing.",
    record: { file: "standards/40-detector-and-testing-integrity.md", quote: "Assertions MUST NOT be vacuous" },
    tests: ["the four axes stay independent through the whole mutation sequence"],
    falsifier: "fixtures.the-evidence-drawer-is-load-bearing",
  },
  {
    id: "release.not-evaluated-never-satisfies",
    statement: "A criterion nobody could measure never counts towards a release being ready.",
    record: { file: "artifacts/project-plan-breakdown/12-release-readiness-and-v1.md", quote: "never satisfies a completion criterion" },
    tests: ["a criterion nobody could measure is NOT_EVALUATED, and NOT_EVALUATED never satisfies"],
    falsifier: "release.not-evaluated-never-satisfies",
  },
  {
    id: "release.the-snapshot-is-an-independent-oracle",
    statement: "The released catalog snapshot is compared against, never regenerated from, the live catalog.",
    record: { file: "artifacts/project-plan-breakdown/12-release-readiness-and-v1.md", quote: "written once at release and never regenerated" },
    tests: [
      "a snapshot that no longer describes the catalog fails the release",
      "a snapshot edited without being regenerated fails, because it no longer agrees with itself",
      "an internally consistent snapshot that describes a different catalog still fails",
      "the snapshot is an oracle: the checker never rewrites it to make itself agree",
    ],
    falsifier: "release.the-snapshot-is-an-independent-oracle",
  },
  {
    id: "release.a-recorded-gap-is-not-a-waiver",
    statement:
      "A gap may be carried into a release only where the missing evidence cannot now be recovered honestly. " +
      "A gap naming work that could still be done blocks the release however accurately it is recorded.",
    record: { file: "artifacts/adr/0014-two-forbidden-rules-were-matched-to-the-evidence-that-can-establish-them.md", quote: "general-purpose release waiver" },
    tests: [
      "a forbidden rule claiming a built validation type with no detector blocks the release",
      "naming that gap in the release report does not make it shippable",
      "the chronology gap is the only one permitted to be an accepted limitation, and it says why",
    ],
    falsifier: "release.a-recorded-gap-is-not-a-waiver",
  },
  {
    id: "release.identity-is-equality-never-ancestry",
    statement:
      "Whether a tree is the released artifact is established by commit equality with the tag, never by the tag " +
      "being an ancestor. Ancestry establishes only that the development line still contains the release, which " +
      "is a different proposition with its own criterion. Neither may substitute for the other.",
    record: { file: "artifacts/adr/0015-version-names-the-last-release-and-identity-is-not-ancestry.md", quote: "Equality establishes artifact identity. Ancestry establishes historical continuity." },
    tests: [
      "the tag is looked up, not assumed: a tag on this commit is the release tree",
      "an ordinary post-release commit is development, not a failure and not the release tree",
      "a release that is no longer in this line's history fails, however far ahead HEAD is",
      "an absent tag satisfies both criteria — the gate is never circular",
    ],
    falsifier: "release.identity-is-equality-never-ancestry",
  },
  {
    id: "release.inapplicability-is-a-recorded-decision",
    statement:
      "A criterion may report NOT_APPLICABLE only where an applicability condition is on record for it. " +
      "Unlisted criteria get NOT_EVALUATED, which never satisfies.",
    record: { file: "artifacts/adr/0015-version-names-the-last-release-and-identity-is-not-ancestry.md", quote: "an ungoverned inapplicability is a waiver" },
    tests: ["NOT_APPLICABLE is not available to a criterion with no recorded applicability condition"],
    falsifier: null,
  },
  {
    id: "identity.a-refusal-is-machine-readable",
    statement:
      "An identity refusal emits a record whose code is the state that actually occurred, carrying no field a " +
      "consumer could read as a verdict. The state name reaching a consumer only as the first token of an " +
      "English sentence is not machine-readable, and neither is a zero-byte file, which cannot be told apart " +
      "from a step that never ran.",
    record: {
      file: "artifacts/project-plan-breakdown/13-version-identity-and-reusable-workflow.md",
      quote: "The machine-readable identity error survives the workflow boundary intact.",
    },
    tests: [
      "consumer: an identity refusal emits a machine-readable record and no verdict",
      "consumer: the record names the state that actually occurred, not one state always",
      "the record is emitted only when a record was asked for",
    ],
    falsifier: "identity.a-refusal-is-machine-readable",
  },
  {
    id: "identity.a-verdict-names-the-framework-that-produced-it",
    statement:
      "A verdict labelled with a standards version is produced by that released version. Where the executing " +
      "framework is not the release the policy names, no verdict is produced at all — a configuration and " +
      "evaluation-identity failure at exit 2, never NON_COMPLIANT, because nothing established that the project " +
      "violates anything.",
    record: { file: "artifacts/adr/0016-a-verdict-names-the-framework-that-produced-it.md", quote: "a provenance lie" },
    tests: [
      "the positive: a released framework and a policy naming it match, and name the commit",
      "declaring a version the framework is not is a mismatch, in either direction",
      "THE ONE A VERSION STRING CANNOT SEE: post-release main is not the release it names",
      "consumer: THE FALSIFIER — a workflow running main instead of the tag gets no verdict",
      "a provenance refusal is never reported as a failing project",
    ],
    falsifier: "identity.a-verdict-names-the-framework-that-produced-it",
  },
  {
    id: "identity.unverifiable-is-never-a-match",
    statement:
      "Where which artifact is executing cannot be established, identity is UNVERIFIED and the executed commit is " +
      "null. An unanswered question is never recorded as a match.",
    record: { file: "artifacts/adr/0016-a-verdict-names-the-framework-that-produced-it.md", quote: "never becomes" },
    tests: ["a vendored copy with no git is UNVERIFIED — never MATCH, and never a mismatch"],
    falsifier: null,
  },
  {
    id: "ci.container-identity-is-a-conjunction",
    statement:
      "A container establishes an identity only when it names the expected commit AND its own files match the commit " +
      "it names. `rev-parse HEAD` reads metadata and cannot speak for the tree, so half of the conjunction is never " +
      "recorded as the whole of it.",
    record: { file: "docs/local-ci.md", quote: "container files == container HEAD" },
    tests: [
      "container identity is established when the container names the right commit AND its files are that commit",
      "container identity is withheld when the container's files do not match the commit it names",
      "the container's failure modes stay distinct from one another",
      "the runner asks the container to compare its own files against its own HEAD",
      "submission refuses when the container's files were never established to match the commit",
    ],
    falsifier: "ci.container-identity-is-a-conjunction",
  },
  {
    id: "submission.the-remote-owns-its-own-default-branch",
    statement:
      "The base branch comes from the caller or from the remote itself. A local refs/remotes/origin/HEAD cache, which " +
      "nothing refreshes after a rename, never decides where a pull request is opened.",
    record: { file: "docs/local-ci.md", quote: "the remote owns its own default branch" },
    tests: [
      "a stale local origin/HEAD never decides the base",
      "an explicit base decides alone, whatever discovery would have said",
      "naming a base skips remote discovery entirely rather than merely outranking it",
      "the remote's default branch is read from the remote's own symbolic ref",
    ],
    falsifier: "submission.the-remote-owns-its-own-default-branch",
  },
  {
    id: "submission.updating-an-existing-pull-request-is-success",
    statement:
      "A verified commit pushed to a branch whose pull request is already open, and now points at that commit, is a " +
      "successful submission and exits 0. Whether one already exists is read from repository state, never from the " +
      "wording of a CLI error, and PR_UPDATED is reported distinctly from PR_CREATED.",
    record: { file: "docs/local-ci.md", quote: "is a successful submission, not a failure" },
    tests: [
      "an existing pull request already pointing at the verified commit is a successful submission",
      "creating and updating are distinct outcomes even though both succeed",
      "no existing pull request leaves the creation path exactly as it was",
      "a pull request whose head lags the push is confirmed once GitHub catches up",
      "waiting for the head is a wait, never a retry until the answer is agreeable",
      "both submission paths confirm the head, so a created pull request gets an existing one's scrutiny",
      "an existing pull request onto another base is never silently reused or retargeted",
      "a failed discovery is refused rather than assumed to mean no pull request exists",
      "submission consults the repository's state before creating, and never the wording of an error",
    ],
    falsifier: "submission.updating-an-existing-pull-request-is-success",
  },
  {
    id: "governance.unreadable-is-not-ungoverned",
    statement:
      "A host whose controls could not be read is INDETERMINATE, never UNGOVERNED and never GOVERNED. Unreadability " +
      "outranks absence, because UNGOVERNED is a positive finding about a host that was fully read.",
    record: { file: "docs/host-enforcement.md", quote: "Unreadability outranks absence" },
    tests: [
      "an unreadable required control is INDETERMINATE, never UNGOVERNED",
      "unreadability outranks absence: one missing and one unreadable is INDETERMINATE",
      "SATISFIED claimed over a source that was not read is not believed",
      "an unrecognised result value is treated as unreadable, not as satisfied",
    ],
    falsifier: "governance.unreadable-is-not-ungoverned",
  },
  {
    id: "governance.silence-does-not-shrink-the-conjunction",
    statement:
      "A required control no observation mentions is unreadable, not skipped. The aggregate is derived from the full " +
      "contract, so it can never improve because the collector reported less.",
    record: { file: "docs/host-enforcement.md", quote: "Silence must not shrink the conjunction" },
    tests: [
      "a required control nobody reported is INDETERMINATE, not silently dropped",
      "reporting no observations at all is INDETERMINATE, not GOVERNED",
      "a control the contract does not define cannot satisfy the contract",
      "a caller cannot hand in its own aggregate state",
    ],
    falsifier: "governance.silence-does-not-shrink-the-conjunction",
  },
  {
    id: "governance.a-regression-is-observed-not-inferred",
    statement:
      "Drift detection measures current enforcement. A control that was established and is now absent is reported as " +
      "drift, and a past successful check run is never evidence that a check is still required.",
    record: { file: "docs/host-enforcement.md", quote: "the durable claim is that the six controls remain established" },
    tests: [
      "the required standards check being removed is DRIFTED, even though the workflow still exists",
      "a satisfied control becoming absent is DRIFTED",
      "a bypass actor appearing is DRIFTED",
      "a satisfied control becoming unreadable is INDETERMINATE, not DRIFTED",
      "a confirmed regression is not filed under 'could not tell' by an unreadable neighbour",
    ],
    falsifier: "governance.a-regression-is-observed-not-inferred",
  },
  {
    id: "governance.the-policy-moving-is-not-the-host-moving",
    statement:
      "A change to the required-control set is CONTRACT_CHANGED, never drift. Drift is a claim about the host, and the " +
      "contract is identified independently of it.",
    record: { file: "docs/host-enforcement.md", quote: "the policy changed; the host may not have" },
    tests: [
      "a changed required-control set is CONTRACT_CHANGED, never drift",
      "the contract digest covers the required set and ignores everything else",
      "ruleset id and name may change while the six controls remain satisfied",
      "no baseline at all is INDETERMINATE, never NO_DRIFT",
    ],
    falsifier: "governance.the-policy-moving-is-not-the-host-moving",
  },
];
