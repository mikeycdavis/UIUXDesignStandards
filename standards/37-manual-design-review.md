# Standard 37 — Manual Design Review

Some rules cannot honestly be automated. This standard defines the attestation model that records
human judgment as evidence, and states — unambiguously — what an unreviewed rule does to a verdict.

Source: §39 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md),
and the enforcement-architecture prompt at
[`artifacts/prompts/enforcement-architecture-prompt.md`](../artifacts/prompts/enforcement-architecture-prompt.md).

## Scope

Applies to every rule typed `manual-review`, and to `visual-analysis` rules that declare themselves
attestable. Subjects include visual hierarchy, content clarity, interaction comprehensibility,
dark-pattern review, progressive disclosure, and overall information architecture.

## Requirements

### R1 — An attestation MUST record who, when, and against what

```text
status        approved | rejected
reviewedBy    the reviewer
reviewedAt    the review date
evidence      what was reviewed
reviewedAgainst
  paths       the files the review covered
  revision    the resolved revision reviewed
  contentIdentity  the identity of that content
reference     optional link to the review record
expires       optional
```

`reviewedAgainst` is required: a review that does not say what it covered has no subject, and
freshness and scope both have nothing to work on.

`revision` MUST be a resolved revision — a full commit SHA, made **unrepresentable** in the policy
schema rather than checked for afterwards. A symbolic name such as a branch head would re-anchor
silently as the branch moves, which is a claim about content nobody made. `contentIdentity` is
likewise exactly the identity the shared primitive produces: a string that could never match one is a
malformed record, and accepting it would let the framework report PROVED CHANGED where nothing was
proved. Both are configuration errors at exit 2, never findings about the project.

### R2 — Freshness MUST be established mechanically, using the shared primitive

An attestation's freshness is computed by the same implementation that computes browser-evidence
freshness — one owner, not two implementations of one algorithm. The outcomes and their precedence
are stated in [Standard 36](36-browser-and-visual-evidence.md) R3 and apply here unchanged.

Freshness is path-scoped: modifying a file the review did not cover MUST NOT stale the review.

### R3 — Gating semantics, stated explicitly

This is the decision the source leaves open, and leaving it open is how a manual-review model becomes
either theatre or an unusable gate. For v1.0.0, in precedence order — the first situation that
applies decides, and the order is itself normative:

| # | Situation | Status | Disposition |
| --- | --- | --- | --- |
| 1 | The rule is not attestable | failed | `invalid-attestation` |
| 2 | A check or a run witnessed the rule fail | failed | `contradicted-attestation` |
| 3 | The review recorded a rejection | failed | `attested-rejected` |
| 4 | The attestation has expired | unestablished | `not-evaluated` |
| 5 | The content identity is `STALE` | unestablished | `stale-evidence` |
| 6 | The content identity is `EVIDENCE_UNAVAILABLE` | unestablished | `evidence-unavailable` |
| 7 | No review subject is declared for the rule | unestablished | `unscoped-review` |
| 8 | The review did not cover the declared subject | unestablished | `partial-review` |
| 9 | Fresh, approved, covering the declared subject | passed | `attested` |
| — | No attestation at all | unestablished | `not-evaluated` |

**Rows 1–3 sit above row 9, and that ordering is the standard's content.** Evidence outranks
assertion: a fresh approved review MUST NOT erase a witnessed failure, whether the witness was a
static check or a browser run. It is also why an attestation cannot clear a `nonExemptible` rule —
not as a separate prohibition, but because the failure survives the review.

Rows 4–8 are all unestablished and **none of them is a failure**. The team did review something; what
they have is no longer, or not yet, evidence about what is here now.

Rows 5 and 6 carry the same disposition names browser evidence uses, deliberately: the disposition
says WHY a rule was not established, and the result's `validationType` says WHICH surface failed to
establish it. Two fields, two questions. Freshness has already distinguished "the material provably
changed" from "the material could not be reconstructed", and that distinction MUST survive into the
per-rule result rather than being normalised back into a bare `not-evaluated`.

**Unestablished `forbidden` rules cap the verdict at `NOT_EVALUATED` and exit 1.**

**Unestablished `required` manual-review rules do not individually block in v1.0.0.** They appear in
the `notEvaluated` assurance bucket and are named in human-readable output. This is the honest,
implementable promise: a framework that blocked every unreviewed judgment rule on day one would be
turned off, and a framework that passed them silently would be lying. A stricter mode is a future
MINOR release; the `--require-established` flag is reserved and not implemented.

### R4 — Expiry MUST NOT become failure

An expired attestation returns the rule to unestablished. It MUST NOT be recorded as a violation: the
project did not do something wrong, it stopped having current evidence.

### R5 — An attestation MUST NOT be accepted for a rule that does not admit one

A rule is attestable when its validation type is `manual-review`, or when a `visual-analysis` rule
declares itself attestable. An attestation on any other rule is a policy error, because it is an
attempt to satisfy a mechanical check by assertion.

### R6 — Evidence MUST outrank assertion

Where automated findings contradict an approved attestation, the findings win. A reviewer's approval
does not override a detector's observation of the thing the reviewer approved.

### R7 — A review MUST state what material it covered

An attestation whose `evidence` field does not identify what was reviewed cannot be evaluated for
freshness or scope. "Reviewed the UI" is not a scope.

### R8 — Inability to review MUST NOT become a pass

The framework MUST NOT convert "we have not established it" into compliance. This is
[Standard 35](35-evidence-assurance-and-compliance-output.md) R1 applied to human evidence, and it is
the requirement that the rest of this standard implements.

### R9 — The scope a review must cover MUST be declared outside the review

A browser producer enumerates the routes it visited, and that list can be checked against the routes
the source scan found. A reviewer writes down what they looked at, and there is no independent record
of what they could have looked at. Left there, `reviewedAgainst.paths` would mean "whatever made this
review easiest", and a reviewer could establish visual hierarchy having opened one screenshot of one
route.

So the required subject is declared by the **project**, in the policy, separately from any review and
ahead of it: `ui.reviewPaths`, optionally narrowed per rule by `ui.reviewScopes`. A review whose
`reviewedAgainst.paths` do not cover that subject is `partial-review` and establishes nothing. A rule
with no declared subject cannot be established by review at all — there is nothing the reviewer's own
account can be measured against — and a policy that records an attestation without declaring one is a
configuration error at exit 2.

Coverage is by containment: naming a directory covers what is inside it, and naming a file inside a
required directory does not cover the directory. Reviewing more than was required is not an error;
the declaration is a floor.

This standard does **not** require a universal automatic coverage algorithm for human review in
v1.0.0. It requires only that self-selected scope can never silently establish full review.

## Additions this standard makes beyond the source

- R3's table is a decision this framework makes, not source text. The source describes a review model
  without settling what an unreviewed required rule does to a verdict; the enforcement-architecture
  prompt directs that the semantics be decided explicitly before rollout, and R3 is that decision.
- R1's prohibition on storing a symbolic revision is this framework's, recorded as an amendment to
  ADR 0011.
- R4's framing — "stopped having current evidence" rather than "did something wrong" — is this
  framework's.
- R7 is this framework's.
- R9 is entirely this framework's. The source describes what a review records; it does not ask who
  decides how much reviewing is enough. Leaving that with the reviewer would have made the attestation
  model the one evidence surface whose scope was self-certified — the loophole `ui.evidencePaths`
  closes for browser evidence, left open for the surface with the least corroboration.

## Relationship to other standards

[Standard 35](35-evidence-assurance-and-compliance-output.md) owns the verdict law this standard
implements for human evidence. [Standard 36](36-browser-and-visual-evidence.md) owns the freshness
primitive R2 shares. [Standard 34](34-project-policy-applicability-and-exceptions.md) owns where
attestations live and the exception mechanism they are distinct from.
[Standard 11](11-visual-hierarchy-and-progressive-disclosure.md),
[Standard 20](20-content-design.md), and
[Standard 29](29-design-integrity-prohibitions.md) contain most of the rules this standard
establishes.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1, R2, R3, R4, R5, R6 | — | No rule. Implemented in the attestation judgement path; every row of R3's table is a test, and a meta-test binds the table's disposition names to the ones the evaluator emits. |
| R7 | — | Policy validation: an attestation without an `evidence` field, or without `reviewedAgainst`, is schema-invalid. |
| R9 | — | No rule. `ui.reviewPaths` / `ui.reviewScopes` in the policy schema, the coverage check in `scripts/attestation.mjs`, and a semantic invariant in `scripts/policy.mjs` at exit 2. |
| R8 | — | No rule. The law the above implements, asserted by an anti-vacuity meta-test over the whole catalog. |
