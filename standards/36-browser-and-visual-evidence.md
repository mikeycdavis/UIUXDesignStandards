# Standard 36 — Browser and Visual Evidence

How evidence that requires a rendered interface is obtained and what makes it trustworthy. This
standard owns the acquisition surface; what conclusions that surface licenses belongs to
[Standard 35](35-evidence-assurance-and-compliance-output.md).

Source: §26 and §41 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md),
and the enforcement-architecture prompt at
[`artifacts/prompts/enforcement-architecture-prompt.md`](../artifacts/prompts/enforcement-architecture-prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui`, and to producers of browser or
visual evidence for this framework.

**This framework does not produce browser evidence.** It defines and verifies an ingestion contract;
see [ADR 0002](../artifacts/adr/0002-browser-evidence-arrives-by-ingestion-contract.md). Until a
producer exists, every `browser-analysis` rule reports `not-evaluated` — which is the point rather
than a gap concealed.

## Requirements

### R1 — Browser-established properties MUST be identified as such

The properties requiring a rendered interface include: keyboard-only navigation, focus order, modal
focus trapping, zoom behavior, reduced-motion response, empty and loading and error states,
responsive navigation, overflow, touch-target sizing, accessible names, and computed contrast.

Each MUST be documented as browser-requiring and MUST report `not-evaluated` when browser evidence is
unavailable.

### R2 — Evidence MUST arrive through a declared contract

Browser evidence is a document with a schema: producer identity, run time, revision, run status,
viewports, per-route results, per-check outcomes bound to rule ids, and screenshot references.

A check naming a rule id that does not exist in the catalog is a **configuration error at exit 2**,
not a finding. An external producer MUST NOT invent rule identities; see
[Standard 33](33-rule-catalog-and-rule-identity.md) R7.

### R3 — Evidence freshness MUST be established against committed content

Evidence records the revision it was produced against and a content identity over the project's
declared interface paths, computed from the committed tree at that revision — never from the index,
never from working-tree bytes. Three outcomes, never collapsed:

| Outcome | Meaning | Effect |
| --- | --- | --- |
| `FRESH` | Identity reconstructs and matches; reviewed paths are unmodified | Results usable |
| `STALE` | Change was **proved** — identity mismatch, path gone, or a reviewed path modified | Results degrade to `stale-evidence` |
| `EVIDENCE_UNAVAILABLE` | The identity could **not be established** | Results become `evidence-unavailable` |

Provable change outranks unavailability: where both could apply, the outcome is `STALE`. Neither
non-fresh outcome is a pass and neither is a failure — both unestablish the claim. See
[ADR 0011](../artifacts/adr/0011-freshness-is-committed-content-identity-with-path-scoped-working-subject-integrity.md).

Freshness is path-scoped. Modifications to paths outside the declared interface set MUST NOT
invalidate evidence.

### R4 — A failed run MUST NOT establish anything

`run.status: failed` yields `evidence-unavailable` for every browser-established rule. A failed route
establishes nothing for that route and is recorded in the evidence surface. An `inconclusive` check
outcome establishes nothing.

A check reported `passed` inside a failed run MUST NOT pass. The run's status outranks the check's.

### R4a — Run completion, freshness, coverage, and check outcome are four separate axes

None of them implies another, and a rule is established as PASSING only when all four hold: the
producer finished, the identity is fresh, the surface was covered, and a conclusive `passed` check
exists for that rule.

**Coverage MUST be assessed against declarations and observations the producer does not control.**
Every route the record enumerates must have been exercised; every viewport class the policy declares
must have been tested; and a run enumerating fewer routes than the source scan discovered route
modules MUST NOT be treated as complete. Otherwise a producer could widen its own claim by measuring
less. Where coverage is incomplete, a rule whose checks all passed is reported `partial-coverage` and
remains unestablished — it is not a pass, and it is not a failure.

**A conclusive failure is established regardless of coverage.** One witnessed failure at one route
and viewport is a fact about the interface, and unexercised surface elsewhere does not undo it.
Presence can be witnessed; absence has to be justified over a search surface — the same asymmetry
that governs applicability.

There is no majority vote. One failure outranks any number of passes; passes alongside an
`inconclusive` check for the same rule do not establish it.

### R4b — A rule MUST NOT be established through a surface its validationType does not name

Evidence claiming an outcome for a rule typed `structural`, `configuration`, `document`,
`code-analysis`, or `manual-review` is a **broken contract**, rejected at exit 2. The rule id
existing is not authority to speak for it: allowing this would let a producer satisfy a static or
human-reviewed rule by asserting it, which is the identity discipline defeated one layer out.

Likewise a record that contradicts itself — a check on a viewport it never declared — and a record
whose identity covers paths other than the project's declared `ui.evidencePaths`. Each is a defect in
the producer, never a finding about the project.

### R5 — A failed check outranks an attestation

Where evidence reports a check failed and an attestation asserts the same rule is satisfied, the
evidence wins and the attestation is recorded as contradicted. Evidence outranks assertion.

### R6 — Visual regression answers one question only

A screenshot comparison establishes whether the interface visibly changed. It does not establish
whether the interface is good. These are separate assurance claims and MUST NOT be conflated.

Screenshot equality MUST NOT be treated as proof of good user experience.

### R7 — Visual evidence MUST be identified

A screenshot used as evidence MUST record what it depicts, at what viewport, and against what
revision. An unidentified screenshot is an image, not evidence.

### R8 — The initial version MUST NOT depend on a large automation stack

This framework carries no dependencies. A producer may use any automation it likes; the contract is
the boundary, and the framework's own zero-dependency law is unaffected by the producer's choices.

## Additions this standard makes beyond the source

- R3's entire mechanism is this framework's, recorded in ADR 0011. The source asks for
  "deterministic freshness where possible" without specifying it.
- R4's final sentence — that a passed check inside a failed run must not pass — is this framework's,
  and it is a named mutation test rather than an assumption.
- R5 states the precedence between evidence and attestation. The source does not.
- R7 is this framework's.

## Relationship to other standards

[Standard 35](35-evidence-assurance-and-compliance-output.md) owns what this evidence licenses.
[Standard 37](37-manual-design-review.md) uses the same freshness primitive for attestations — one
implementation, not two. [Standard 30](30-design-code-consistency.md) owns screenshot staleness as a
documentation concern. [Standard 4](04-keyboard-and-focus.md),
[Standard 13](13-responsive-and-adaptive-design.md), and
[Standard 16](16-interface-states.md) are the standards most dependent on this evidence surface.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1, R2, R3, R4, R5 | — | No rule. Implemented in the evidence ingestion path and asserted by fixture tests. |
| R6, R7 | `visual.regression-evidence` | `visual-analysis`, partial. Attestable. `not-evaluated` in v1.0.0. |
| R8 | — | No rule. A constraint on this repository, asserted by a zero-dependency test. |
