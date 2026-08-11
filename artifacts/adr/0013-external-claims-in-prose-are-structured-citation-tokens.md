# 0013 — External claims in standards prose are structured citation tokens

- **Status:** Accepted
- **Date:** 2026-08-10
- **Deciders:** Project owner

## Context

[ADR 0009](0009-external-source-provenance-is-recorded-and-never-normative.md) decided that external
source provenance is recorded and never normative. It did not say how that is enforced against the
prose, and the enforcement is where the decision either holds or quietly fails.

The failure mode is specific. A standard writes a sentence like *"WCAG 2.2 requires a visible focus
indicator on every interactive element"*, and `artifacts/external-standards-provenance.json` records
a mapping from that standard to WCAG 2.2. A checker that asks only *"does a mapping exist for this
standard?"* passes. The sentence can then be edited to attribute something WCAG does not say — a
different requirement, a different conformance level, a criterion that does not exist — and the
mapping still exists, so the check still passes. The provenance artifact would be documenting that
*a citation was made*, not that *the citation is true*.

The source prompt names this exact hazard in §62: *do not claim a rule is required by WCAG or
another external authority unless that is actually supported by the source*. A presence check cannot
establish that.

Two further hazards were identified while auditing the sources:

- **Conformance level is not enforcement level.** WCAG assigns Level A / AA / AAA to its success
  criteria. Those describe external conformance tiers. This framework assigns `required`,
  `recommended`, `optional`, and `forbidden` to its own rules. The two axes are independent, and a
  mechanism that let one derive the other would import an external authority's governance decisions
  into the local catalog.
- **Two of the five candidate sources could not be retrieved.** Apple's Human Interface Guidelines
  and Material Design 3 serve their documentation from client-rendered applications; fetching them
  yields a title and no citable content. A framework that cites what it could not read is doing the
  thing this ADR exists to prevent.

## Decision

**A standards document may name an external source only inside a structured citation token, and
every token is validated against enumerated facts recorded in the provenance artifact.**

Three token forms, and no others:

```text
[WCAG 2.2 SC 2.4.7 "Focus Visible" (AA)]      external requirement claim
[NN/g heuristic 5 "Error Prevention"]          published-heuristic claim
[APG pattern "Dialog (Modal)"]                 authoring-practice claim
[see: apple-hig]                               non-normative pointer, asserts nothing
```

`scripts/provenance.mjs` enforces four checks over `standards/*.md`:

1. **No unstructured external claim.** The source names recorded in the provenance artifact's
   `proseGuard` list may not appear in prose outside a token. A sentence beginning *"WCAG 2.2
   requires…"* is a load-time failure, not a review comment.
2. **Every claim token resolves to a recorded fact.** The success criterion number, its exact title,
   and its conformance level must all match the criteria enumerated under the WCAG source record.
   The same applies to heuristic numbers and titles, and to pattern names.
3. **Every claim token is covered by a mapping** whose `citation` names that same criterion,
   heuristic, or pattern, for that standard. Citing a criterion the provenance artifact does not map
   fails.
4. **A mapping may not cite a source whose retrieval did not succeed.** A source recorded with
   `retrieval.status` other than `retrieved` may be pointed at with `[see: …]` and may never back a
   claim.

Conformance level travels **inside the token only**. It is a property of the external criterion, it
is recorded as such, and no mechanism reads it. Mapping entries carry no `level`, `severity`,
`appliesTo`, or requirement text — the artifact is structurally incapable of expressing a local
governance decision, which is what makes the two axes stay separate.

Requirement text is always the framework's own. A token states what external criterion informed a
requirement; it never states the requirement.

## Alternatives considered

**Check only that a mapping exists for each standard naming a source.** Rejected — this is the
mechanism the Context section falsifies. It cannot distinguish a true citation from a false one, and
its passing tells the reader nothing they did not already know.

**Free-form prose plus a human review step.** Rejected. Every other epistemic guarantee in this
framework is mechanical; an external-accuracy claim defended only by review is the weakest link, and
it degrades silently as the corpus grows.

**Copy the criterion text into the standards documents so the claim is self-evident.** Rejected on
two grounds: §62 forbids copying external standards wholesale, and reproduced text drifts from its
source without any signal that it has.

**Derive rule level from WCAG conformance level (A → required, AA → recommended, or similar).**
Rejected. It reads as convenient and is a category error: it would make an external body's
conformance tiering into this framework's enforcement policy, and it would silently change local
governance whenever an external body re-tiers a criterion.

**Cite Apple HIG and Material Design 3 from general knowledge.** Rejected. The retrieval failed; a
citation to a document this project did not read is exactly the unsupported external claim §62
prohibits. Both remain in `sources[]` with their failure recorded, reachable by pointer only.

## Consequences

**Makes easier.** External accuracy becomes falsifiable: changing a cited criterion, its title, its
level, or the requirement attributed to it fails a command rather than surviving review. A reader
can tell at a glance which sentences carry external weight and which are the framework's own.

**Makes harder.** Prose is more constrained. A standard cannot casually mention WCAG in passing;
every mention costs a verified token and a mapping entry. Adding a source means enumerating enough
of its content to validate claims against it.

**Commits the project to.** Maintaining the enumerated criteria list as external sources revise.
When WCAG 2.3 arrives it becomes a new source record with its own enumeration, not an edit to this
one — the recorded facts are facts about a specific retrieved version.

**Known cost accepted.** Two of five planned sources back no claims in v1.0.0. Standards that would
have drawn on platform human-interface guidance state project-authored requirements instead and
point at the guidance. That is a smaller corpus of externally-backed requirements than the plan
anticipated, and it is the honest one.
