# Standard 38 — External Source Provenance

Where the substance of a requirement came from, how strongly it is claimed, and why an external
source can never become a second rule authority. This standard governs this framework's own
authoring.

Source: §62 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to this repository's standards corpus and rule catalog.

## Requirements

### R1 — External guidance MUST NOT be copied wholesale

Requirements are written in this framework's own words. External guidance informs them; it is not
transcribed into them.

### R2 — Normative strength MUST be recorded per requirement

Every externally informed requirement is classified at authoring time as exactly one of:

```text
directly-adopted   the external criterion's requirement, adopted as written in substance
interpreted        this framework's reading, combining or applying external criteria
strengthened       stricter than the external criterion, deliberately
recommendation     advisory guidance adopted as a SHOULD
project-authored   no external source; this framework's own
```

The classification is made **while the requirement is written**, not retrofitted afterwards. Writing
prose first and then searching for a source that appears to justify it is how false provenance is
manufactured.

### R3 — An external requirement MUST NOT be claimed unless the source supports it

A requirement MUST NOT be described as required by an external authority unless that authority
actually requires it. This is the failure §62 names, and R6 is the mechanism that makes it
falsifiable rather than merely prohibited.

### R4 — Provenance MUST NOT redefine local normative text

> A provenance record may justify the origin or interpretation of a requirement. It may never
> redefine it. The standards prose and the rule catalog remain the sole rule authority.

The provenance artifact is structurally incapable of the alternative: no entry carries `level`,
`severity`, `appliesTo`, or requirement text. Even a maliciously edited provenance file cannot change
what a rule requires. See
[ADR 0009](../artifacts/adr/0009-external-source-provenance-is-recorded-and-never-normative.md).

### R5 — External conformance level and local enforcement level are independent axes

An external criterion's conformance tier MUST NOT determine a local rule's level. A criterion at the
lowest external tier may be `required` here; one at a higher tier may be `recommended`. External
bodies decide their conformance tiering; this framework decides its own governance, and no mechanism
converts between them.

Where this framework is stricter than its source, the requirement is classified `strengthened` and
that classification is visible.

### R6 — A source MUST be named in prose only inside a structured citation token

Four token forms exist and no others: an external-criterion claim, a published-heuristic claim, an
authoring-pattern claim, and a non-normative pointer that asserts nothing. Every claim token is
validated against facts enumerated in the provenance artifact — the criterion's identifier, its exact
title, and its conformance tier must all match, and a mapping must exist linking that standard to
that criterion.

A source name appearing in prose outside a token is a **failure**, not a style issue. A sentence
asserting that an external body requires something, written as free prose, cannot be checked and is
therefore not permitted. See
[ADR 0013](../artifacts/adr/0013-external-claims-in-prose-are-structured-citation-tokens.md).

### R7 — A source that could not be retrieved MUST NOT back a claim

Where a source's content could not be obtained, that failure is recorded with its reason, and the
source may be pointed at but may not support any requirement. **Two of this framework's five
recorded sources are in this state in v1.0.0**, both platform design-guidance publications whose
documentation is served from client-rendered applications. Requirements that would have drawn on them
are `project-authored` instead.

Citing a document this project did not read is precisely the unsupported external claim R3
prohibits.

### R8 — Provenance MUST NOT upgrade assurance

That a requirement is directly adopted from an authoritative source says nothing about whether this
framework can evaluate it. Assurance is determined by validation type and evidence; see
[Standard 35](35-evidence-assurance-and-compliance-output.md).

### R9 — Coverage MUST be complete for accessibility rules

Every `accessibility.*` rule MUST appear in the provenance artifact's mappings or in its
project-authored list. There is no third state: a rule with no recorded provenance is a rule whose
origin nobody decided.

### R10 — Source records MUST be version-specific and dated

A source record names the exact published version retrieved and the retrieval date. When a source
publishes a new version it becomes a **new source record**, not an edit to the existing one: the
recorded facts are facts about a specific retrieved document.

## Additions this standard makes beyond the source

- R2's requirement that classification happen *during* authoring is this framework's process
  decision, and its rationale — that retrofitting manufactures false provenance — is stated because
  it is the failure mode a reader would not otherwise see.
- R5 is this framework's, recorded in ADR 0013. The source distinguishes normative strengths without
  addressing the conformance-tier-to-enforcement-level confusion.
- R6, R7, and R10 are this framework's enforcement mechanism and its consequences, recorded in
  ADR 0013.
- R9's "no third state" is this framework's.

## Relationship to other standards

[Standard 33](33-rule-catalog-and-rule-identity.md) owns rule identity; R4 is that standard's law
applied to external sources. [Standard 35](35-evidence-assurance-and-compliance-output.md) owns
assurance, which R8 protects, and R11 of that standard states the consumer-facing form of R3.
[Standard 3](03-accessibility-foundations.md) is the standard with the most externally informed
requirements and therefore the heaviest provenance obligation.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1, R2, R3, R6, R7, R9, R10 | — | No rule. Enforced by `scripts/provenance.mjs`, run in CI, with mutation tests proving each check fails against its defect. |
| R4, R5 | — | No rule. Enforced structurally: the artifact has no field capable of expressing a rule property. |
| R8 | — | No rule. Enforced by the assurance legality matrix in [Standard 33](33-rule-catalog-and-rule-identity.md) R5. |
