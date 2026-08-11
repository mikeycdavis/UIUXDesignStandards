# 0014 — Matched two forbidden rules to the evidence surface that can establish them

- **Status:** Accepted
- **Date:** 2026-08-11
- **Deciders:** repository owner

## Context

The release-readiness checker, on its first run, reported that two `forbidden` rules were typed
`code-analysis` and had no detector:

- `design-integrity.no-fake-progress`
- `accessibility.no-inaccessible-custom-controls`

Plan section 12 had named this failure class in advance and had already ruled on it: a forbidden rule
without a detector is an acceptable gap *only* when it is typed `browser-analysis`,
`visual-analysis`, or `manual-review` — that is, when its evidence surface genuinely is not static
analysis. A `code-analysis` rule with no detector cannot be filed under "differently typed".

Nothing false was being produced. Both rules reported `not-evaluated` and capped the verdict, which
is the safe behaviour and the whole point of the framework. The defect is in the *contract*. A
`validationType` is a claim about which evidence surface can establish a rule; these two made a claim
about repository-static evidence that no implementation could honour. A reader comparing types
against detectors — a reasonable thing for an adopter to do — would conclude both rules were
machine-checked. That disagreement between what the catalog promises and what the framework does was
about to be frozen into the first immutable release, where correcting it costs a MAJOR increment.

The release record initially carried this as a recorded gap. That was rejected on review, correctly:
a recorded gap is appropriate where the missing evidence cannot honestly be recovered, and it is not
appropriate for a present-tense contract defect that can still be fixed before the release exists.

## Decision

**Ask each rule the epistemic question separately, and let the answers differ.** The question is not
"how do we get the release green". It is: *can repository-static evidence establish this prohibition,
with false-positive and false-negative behaviour a project would accept?* If yes, implement a
detector and falsify it. If no, change the type to the surface that can establish it and record why.

**`accessibility.no-inaccessible-custom-controls` — yes. A detector was implemented.** The
prohibition is that a control built from a generic element ships without the role, focusability, and
keyboard behaviour the native control it replaced would have supplied. All three are attributes, so
the finding is a conjunction over attributes present on one element: a click handler present, and
`role`, `tabindex`, and any key handler all absent. Any one of the three present means someone was
restoring semantics, and the detector stops there. Elements carrying a JSX spread are skipped,
because the attributes are not knowable and guessing produces the false positive that gets a detector
switched off. The catalog entry does not change: level, severity, `code-analysis`, and `partial`
assurance are all already correct, and the rule's existing assurance note already conceded the limit
this detector has — source can show that a click handler sits on a non-interactive element with
nothing else, not that the resulting component is unusable. Findings are labeled INFERRED for that
reason. The framework now ships thirteen static detectors.

**`design-integrity.no-fake-progress` — no. Re-typed `code-analysis`/`partial` →
`manual-review`/`none`.** Whether a number is a measurement is a question about the work it describes,
not about the code that renders it. A timer-driven value, a server-computed value, and a genuine
measurement are the same expression at the call site; there is no syntactic property that separates
them, and the rule's own assurance note said so before this decision was made. Nor does the browser
surface reach it. The sibling rule `design-integrity.no-fake-success` is `browser-analysis` because
success and failure have objective external ground truth — an HTTP status can contradict a success
message. A progress percentage has no external truth to contradict it: a producer can watch a bar
advance and still not know what fraction of the work is done. What remains is a reviewer who knows
what the operation does. That is `manual-review`, assurance `none`, and — because `attestable`
derives from the type — the rule gains an attestation path it did not have before.

Both changes are recorded as a governed amendment to `artifacts/design/rule-catalog-v1.md`, and the
frozen v1.0.0 catalog snapshot is regenerated deliberately as a consequence.

## Alternatives considered

**Ship v1.0.0 with both recorded as gaps in the release report.** Rejected. A recorded gap is honest
where the evidence cannot now be recovered — the Git chronology is the genuine case, because
manufacturing it would mean rewriting history. These two are present-tense implementation and
contract defects that can be resolved before the release exists. Recording a fixable defect instead
of fixing it makes `RECORDED_GAP` a general-purpose release waiver, which would let it absorb exactly
the failures the state was invented to expose.

**Re-type both to `manual-review` and move on.** Rejected. It is the cheapest way to a green release
and it would have been wrong for the custom-controls rule, whose subject genuinely is visible in
source. Retyping a rule that static evidence *can* reach trades a real check for a clean report,
which is the trade this framework exists to refuse.

**Write a detector for both.** Rejected. A `no-fake-progress` detector would have to identify a
progress value not derived from work — dataflow across a component at best, and defeated by any value
computed elsewhere. It would produce false positives on legitimate time-based progress and false
negatives on the common case, and a forbidden, non-exemptible rule is the worst place in the catalog
to put an unreliable detector, since its findings cannot be excepted.

**Defer both to 1.1.0.** Rejected. A `validationType` change to a released rule is a change to a
published contract. Before the first release it is free; after it, it is a breaking change to
something adopters have pinned. This is the last moment at which the correction costs nothing.

**Delete `design-integrity.no-fake-progress`.** Rejected. The prohibition is sound and is stated by
Standard 29 R3 and Standard 16 R3/R4. The rule was not wrong about what it forbids, only about who
can establish it.

## Consequences

**Makes easier.** An adopter reading `validationType` against the detector list now finds them
consistent: every `code-analysis` rule either has a detector or is honestly reported. Fake progress
becomes attestable, so a project can establish it rather than carrying it as permanently
`not-evaluated`. The custom-controls prohibition is enforced by machine on every run instead of never.

**Makes harder.** `design-integrity.no-fake-progress` can no longer be established by running
anything, so establishing it requires a human review recorded as an attestation. The frozen catalog
snapshot changed before the release it describes, which means the release record must explain why a
frozen artifact moved — an explanation that must never become routine.

**Commits the project to.** Answering the evidence-surface question per rule rather than per release
deadline. A future `forbidden` rule typed `code-analysis` must arrive with its detector, and the
readiness checker fails if one does not. `RECORDED_GAP` is reserved for evidence that cannot honestly
be recovered, never for work that could still be done.

**Known cost accepted.** The custom-controls detector labels its findings INFERRED and will miss
controls whose semantics are applied by a wrapper, a spread, or a framework helper it cannot see. A
rule with a partial detector reads as better covered than one with none, and this one is not: it
catches the plain case and says nothing about the rest. That is stated in the rule's assurance note
and in Standard 5 rather than left for an adopter to discover.
