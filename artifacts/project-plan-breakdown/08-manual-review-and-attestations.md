# 08 — Manual design review and attestations

A large share of this framework's highest-value rules cannot be automated. Whether an interface
manipulates its user, whether its hierarchy communicates, whether its wording is comprehensible,
whether progressive disclosure is appropriate — these are judgments, and the honest mechanism for a
judgment is a recorded human review with provenance.

The source prompt is explicit about what must not happen: *"Do not convert 'we haven't established
it' into pass."* It also warns, from EngineeringStandards' own history, against promising gating
semantics the evaluator does not implement:

> Do not accidentally promise: all required manual reviews block if absent — unless the evaluator
> actually implements that behavior.

So this section's most important deliverable is not code. It is an unambiguous statement of what
manual review does and does not block, written into Standard 37 and matched exactly by the
implementation.

---

### Implement the attestation model

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Let a human review establish a rule honestly, with freshness that survives unrelated
  work and fails on relevant change.
- **Deliverables:** attestation handling in `scripts/compliance.mjs`, structurally following
  EngineeringStandards except for freshness:
  `reviewedAgainst: { paths[], contentIdentity?, revision? }` — `contentIdentity` from
  `scripts/content-identity.mjs`, not a working-tree digest
  ([ADR 0011](../adr/0011-freshness-is-committed-content-identity-with-path-scoped-working-subject-integrity.md)).
  Dispositions: `attested` (fresh and approved), `attested-rejected`, `invalid-attestation`
  (attestation on a non-attestable rule), `contradicted-attestation` (an automated finding exists —
  evidence outranks assertion). The validator prints the current identity when `contentIdentity` is
  absent, so it can be recorded. A `visual-analysis` attestation may name committed screenshot files
  in `paths`.
  Two additional dispositions arrived with the scope work below: `unscoped-review` and
  `partial-review`. `STALE` and `EVIDENCE_UNAVAILABLE` reach the per-rule result as `stale-evidence`
  and `evidence-unavailable` rather than collapsing into `not-evaluated` — the disposition says why a
  rule was not established, `validationType` says which surface failed to establish it.
  `scripts/attestation.mjs` resolves both axes; the evaluator fails closed on an attestation the
  caller never resolved.
- **Acceptance Criteria:**
  - `FRESH` and approved → `attested / passed`.
  - `STALE` → not-evaluated, never a failure.
  - `EVIDENCE_UNAVAILABLE` → not-evaluated, reported distinctly from `STALE`.
  - Expired → not-evaluated, never a failure.
  - An automated finding always beats an approving attestation.
  - No attestation can clear a rule that is not `attestable`.
- **Verification:**
  ```bash
  node --test test/attestation.test.mjs    # → 17 pass
  ```
- **Dependencies:** `01-repo-skeleton-and-vendored-core.md` (`content-identity.mjs`),
  `04-policy-schema-and-templates.md` (the attestation `$defs`).

### Decide and document the gating semantics

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** State exactly what manual review blocks, so the framework never promises enforcement
  it does not perform.
- **Deliverables:** the semantics, implemented and written into Standard 37 in the same words:
  - Fresh approved attestation → established.
  - Rejected attestation → `NON_COMPLIANT`.
  - No review, expired review, `STALE` identity, `EVIDENCE_UNAVAILABLE` identity, undeclared review
    subject, or a review narrower than that subject → unestablished. Never a pass. Each keeps its own
    disposition rather than collapsing into one.
  - An unestablished **forbidden** rule caps the verdict at `NOT_EVALUATED` and exits 1. A
    prohibition nobody examined has established nothing.
  - An unestablished **required** manual-review rule does **not** individually block in v1.0.0. It
    is visible in `assurance.manualReview` and `assurance.notEvaluated`, and named in human output.
  - A stricter mode is a future minor release. The flag name `--require-established` is reserved and
    deliberately not implemented, so nothing suggests it exists.
- **Acceptance Criteria:**
  - Standard 37 R3 states every case explicitly, in precedence order, with no hedging language.
  - The implementation matches the prose case for case, verified by a test per case AND by a meta-test
    that binds R3's table to the disposition names the evaluator emits, in both directions.
  - The forbidden/required asymmetry is a paired test over the same unestablished state, with the
    verdict half measured one rule at a time — against the whole fixture both runs report
    `NOT_EVALUATED`, so the difference is invisible unless isolated.
  - `INSTRUCTIONS.md` repeats the required-manual-review behavior, because that is the case an
    adopter is most likely to assume wrongly. **BLOCKED on section 11**, which owns that file;
    recorded there as a carried obligation rather than treated as done.
- **Verification:**
  ```bash
  node --test test/attestation.test.mjs    # → 17 pass
  ```
- **Dependencies:** the attestation model.

### Provide the design-review evidence-pack template

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Make a design review a reviewable artifact rather than a checkbox, so an attestation
  points at material a second reader could re-examine.
- **Deliverables:** `templates/design-review-pack.md`, modeled on the release-review evidence packs
  in `F:\Repos\HealthAndFitnessAndNutritionStandards\artifacts\release-review\`: `**The rule.**`
  (with the requirement quoted), `**What the reviewer must decide.**`, `## Material to review, in
  full` (a Path | What it contributes table), then the reviewer's recorded commitments. Aimed at the
  judgment rules: visual hierarchy, dark patterns, content clarity, information architecture,
  progressive disclosure.
- **Acceptance Criteria:**
  - The template's path table feeds directly into `reviewedAgainst.paths`, so the reviewed material
    and the freshness subject are the same set.
  - The template records what was *not* reviewed, so scope is explicit.
- **Verification:**
  ```bash
  ls templates/design-review-pack.md    # → the path
  ```
- **Dependencies:** the gating semantics.

---

## Gotchas this section discovered

**An expired attestation must not be a failure** (known in advance, and confirmed). The tempting
implementation treats expiry as rejection, which punishes a team for a review going stale and pushes
them toward long expiry windows. Expiry means the review no longer establishes the rule — the same
state as never having reviewed it. EngineeringStandards returns null from its attestation judgment for
this case, deliberately, and that behaviour carries over.

**Freshness was the axis this section was planned around, and scope turned out to be the harder
one** — the same shape section 07 hit, one surface later. A review can be perfectly fresh, anchored to
a real commit, and cover one file of an interface. Every freshness mechanism in the framework would
call that evidence. The asymmetry that forces the extra work: a browser producer enumerates the routes
it visited, and that list can be checked against the routes the source scan found, while a reviewer's
account of what they read has no independent counterpart anywhere. So the required subject had to move
out of the review entirely — `ui.reviewPaths`, narrowed per rule by `ui.reviewScopes`, declared ahead
of and apart from any individual review.

**Coverage by containment runs in the direction that is easy to invert.** Reviewing `src/` covers a
requirement of `src/Button.tsx`; reviewing `src/Button.tsx` does not cover a requirement of `src/`.
Written the other way it would have accepted exactly the narrow self-selected review the check exists
to reject, and every test would still have passed — which is why the containment direction has a test
of its own rather than being asserted only through the fixtures.

**The attestation path had to fail closed on an unresolved record.** The first version read freshness
from a map and skipped the check when the map had no entry for a rule, so a caller that forgot to wire
the resolution got `attested` for free. The whole mechanism would have been opt-in for anyone who did
not know it existed. An attestation with no resolution is now `evidence-unavailable`.

**An attestation had to be able to contradict a browser run, not only a static finding.** The
inherited judgement path saw static findings only, so an attestable `visual-analysis` rule with an
approving review and a failed visual check would have reported `attested / passed` — a review erasing
a measurement of the thing reviewed, which is R6 defeated by ordering rather than by argument. The
evidence verdict is now computed before the attestation is judged, and feeds into it.

**Two dispositions are shared with the browser surface on purpose.** `STALE` and
`EVIDENCE_UNAVAILABLE` produce `stale-evidence` and `evidence-unavailable` for a review just as they
do for a run. The alternative — minting `stale-attestation` and `attestation-unavailable` — would have
made the verdict cap list two entries longer to say the same thing twice. The disposition answers WHY
a rule was not established; `validationType` on the same result answers WHICH surface failed to
establish it. Two fields, two questions.

**An attested `visual-analysis` rule is filed under `manualReview`, not `visualAnalysis`.** The
assurance bucket follows the surface that established the result, not the surface the rule could in
principle use. Filing it by the rule's declared type would report that a machine looked at something
only a person looked at — the assurance breakdown quietly overstating itself, which is the one thing
it exists to prevent.
