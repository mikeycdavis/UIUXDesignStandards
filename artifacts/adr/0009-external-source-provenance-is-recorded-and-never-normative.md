# 0009 — External-source provenance is recorded, and never becomes a second normative authority

- **Status:** Accepted
- **Date:** 2026-08-10
- **Deciders:** Project owner

## Context

Unlike every sibling pack in this family, this repository draws on well-known external authorities:
WCAG 2.2, the ARIA Authoring Practices Guide, platform human-interface guidance, and published
usability heuristics. The source prompt (§62) requires that the corpus be audited against them and
that provenance be recorded, while distinguishing directly adopted external requirements from
project-authored interpretation, project-authored strengthening, and recommendations. It ends with
a prohibition: *"Do not claim a rule is required by WCAG or another external authority unless that
is actually supported by the source."*

Nothing in the family does this yet. EngineeringStandards' `artifacts/standards-source-inventory.json`
records the provenance of its *own* prompt documents — which internal source text each standard
realizes — and there is no external-corpus provenance artifact anywhere in the eight sibling
repositories. The closest relative is MathematicsStandards' `artifacts/provenance-digests.json`,
which pins source documents by sha256 against the threat that the cheapest way to make a standard
true is to edit the prompt it claims to implement.

There is a second, subtler risk. Once external sources are cited per rule, a reader can start
treating the citation as the requirement — asking what WCAG says rather than what the rule says.
That would quietly relocate authority outside the repository, to a document this framework does not
control and cannot version.

## Decision

**A new hand-authored artifact, `artifacts/external-standards-provenance.json`, records where each
rule's substance came from. It is never regenerated from a run.**

Shape:

```json
{
  "$comment": "CANONICAL EXTERNAL PROVENANCE. Hand-reviewed. Never regenerated from a run.",
  "reviewedOn": "YYYY-MM-DD",
  "sources": [
    { "id": "wcag22", "title": "...", "publisher": "W3C", "version": "2.2",
      "url": "...", "retrievedOn": "YYYY-MM-DD", "authority": "normative" }
  ],
  "mappings": [
    { "ruleId": "accessibility.contrast", "sourceId": "wcag22",
      "citation": "SC 1.4.3 Contrast (Minimum), Level AA",
      "normativeStrength": "directly-adopted",
      "notes": "..." }
  ],
  "projectAuthored": [
    { "ruleId": "design-integrity.no-fake-progress", "rationale": "..." }
  ]
}
```

`normativeStrength` is closed at the prompt's four values: `directly-adopted`, `interpreted`,
`strengthened`, `recommendation`. `authority` records what the source itself is —
`normative` (a standard), `advisory` (guidance such as the ARIA APG), or `heuristic` (published
usability heuristics). A mapping links by `ruleId` **or** by `standard` number, exactly one of the
two, so prose-level provenance is expressible without inventing a rule to hang it on.

**The governing invariant, stated in Standard 38 and enforced by construction:**

> A provenance mapping may justify the origin or interpretation of a rule, but may never redefine
> the local rule's normative text.

A mapping entry carries no `level`, no `severity`, no requirement text, and no applicability — only
identification, citation, strength, and notes. There is no field through which an external source
could alter what a rule requires. The catalog and the standards prose remain the sole authority for
that; the provenance artifact answers where the idea came from and how faithfully it was adopted.

**Three checks, run by `scripts/provenance.mjs` in CI:**

1. **Coverage.** Every `accessibility.*` rule appears in `mappings` or in `projectAuthored`. There
   is no silent third state where an accessibility rule's origin is simply unrecorded.
2. **Citation precision.** `directly-adopted` requires a citation naming a specific success
   criterion or section and its conformance level. A source-only citation ("WCAG 2.2") is rejected,
   because it is not precise enough for a reader to verify the claim.
3. **Prose discipline.** Any sentence in `standards/` naming WCAG, ARIA, or a named platform HIG
   must have a corresponding mapping for that standard or rule. This is the mechanical form of the
   prompt's prohibition: a claim of external backing cannot exist in prose without a recorded,
   citable mapping behind it.

**Provenance never upgrades assurance.** "Adopted from WCAG" is a statement about origin.
Whether the rule is *established* on a given run remains a function of its `validationType`,
its `assurance`, and the evidence actually available — the two axes never interact.

## Alternatives considered

**Record provenance in each rule's `description` or `rationale` prose.** Rejected. Unstructured
text cannot be checked, so nothing would notice an accessibility rule with no recorded origin or a
`directly-adopted` claim with no citation. The coverage and precision checks are the reason for a
structured artifact.

**Extend `standards-source-inventory.json` to cover external sources too.** Rejected. That file
answers a different question — which internal prompt section each standard realizes — and its
extraction check (`scripts/inventory.mjs`) is built around that. Merging two provenance questions
into one artifact would make both harder to verify. Standard 38 is separate from Standard 33 for
the same reason.

**Vendor the external sources into the repository and pin them by digest**, as
MathematicsStandards does for its prompts. Rejected for v1.0.0 on licensing and weight grounds;
`version` plus `retrievedOn` plus a precise citation is sufficient for a reader to verify a claim.
Revisit if a source's mutability ever causes a dispute.

**Generate the mappings by scanning prose for citations.** Rejected. It would make the artifact a
derived view of the prose, so a prose error would propagate into its own evidence. The file is
hand-reviewed and the prose is checked against it, never the reverse — the same epistemics as
`standards-source-inventory.json`.

## Consequences

**Makes easier.** A reader can see exactly which requirements are external and how faithfully they
were adopted. The prompt's prohibition on unsupported external claims becomes a CI check rather
than a review habit.

**Makes harder.** Every accessibility rule needs a provenance decision at authoring time, and every
prose mention of an external authority must be backed. Sources move, so `reviewedOn` will need
periodic revisiting.

**Commits the project to.** Hand-maintaining the artifact, and to the rule that external citation
is explanation rather than authority.

**Known cost accepted.** The artifact can drift from the published sources between reviews. It
records what was reviewed and when, which makes the staleness visible rather than pretending to a
currency it does not have.
