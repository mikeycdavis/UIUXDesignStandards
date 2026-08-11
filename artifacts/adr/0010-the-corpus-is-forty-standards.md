# 0010 — The corpus is forty numbered standards

- **Status:** Accepted
- **Date:** 2026-08-10
- **Deciders:** Project owner

## Context

The source prompt has 64 sections. They are not a standards series: some are repository scaffolding
instructions, some are process directives, one is a deliverables list, one is a closing philosophy.
Several that *are* normative overlap heavily — §5 (interface states), §6 (loading), and §7 (empty
states) describe one subject at three granularities.

So the corpus had to be designed rather than transcribed, and the design has to be recorded,
because `standards/NN-*.md` filenames and the `standard` field on every rule depend on it. A
renumbering later is not a cosmetic change: it breaks every rule's binding and every prose
cross-reference.

A first mapping produced 40 standards. Four merges were proposed to reach 36: folding
Keyboard-and-Focus into Accessibility Foundations, Onboarding into Interface States,
External-Source-Provenance into Rule Catalog, and Browser-and-Visual-Evidence into
Evidence-and-Assurance.

## Decision

**Forty numbered standards. None of the proposed merges is applied.**

The test for whether two standards should be one, stated by the owner:

> Merge standards when they share the same subject, applicability boundary, evidence source, and
> likely change cadence. Keep them separate when any of those differ materially.

Each proposed merge fails it:

- **Keyboard-and-Focus (04) stays separate from Accessibility Foundations (03).** Different
  evidence source — focus order, focus visibility, and keyboard operation are browser-established,
  while alt text and heading structure are static. Different failure modes, and a detector
  population that will grow independently.
- **First-Use and Onboarding (27) stays separate from Interface States (16).** Different subject:
  onboarding is a product workflow pattern; loading, empty, error, and read-only are lifecycle
  states of a data-driven surface. Different applicability — many interfaces have states and no
  onboarding.
- **External Source Provenance (38) stays separate from Rule Catalog and Rule Identity (33).**
  Different subject: provenance governs epistemic authority, catalog governs rule identity and
  metadata. Combining them would weaken the separation that
  [ADR 0009](0009-external-source-provenance-is-recorded-and-never-normative.md) depends on.
- **Browser and Visual Evidence (36) stays separate from Evidence, Assurance, and Compliance Output
  (35).** The owner singled this pair out: *"'How evidence is obtained' and 'what assurance follows
  from it' should not share an owner unless there is a very strong reason."* One defines an
  acquisition surface; the other defines what conclusions that surface licenses.

Forty is not excessive against the family precedent of 53 in EngineeringStandards. Granularity is
not itself a defect; accidental overlap is.

**Sections that become no standard**, recorded here and in the inventory's `$comment` so the count
of 40 is defensible rather than arbitrary:

| Section | Where it goes instead |
| --- | --- |
| §3 | Repository scaffolding — realized by the repository layout itself |
| §54 | The CLI contract — tooling; Standards 34 and 35 cross-reference it |
| §60 | This repository's definition of done — the release-readiness artifact |
| §61 | Development process — `artifacts/project-plan-breakdown/` and ADR practice, governed by EngineeringStandards' planning standards |
| §63 | Deliverables list — the plan |
| §64 | Closing philosophy — README preamble and the Standard 35 abstract |

§1 and §62 split: their architectural and provenance requirements become Standards 33 and 38, while
their instructions about how to build the repository do not.

**Future merges are supersessions, not renumbering.** If two standards later prove to have
inseparable requirements and identical evidence semantics, they merge in a later release using
alias and supersession metadata, not by re-compressing the series.

## Alternatives considered

**Apply the four merges for a 36-standard series.** Rejected on the test above; three of the four
collapse a boundary that carries real distinctions in evidence source or applicability.

**One standard per prompt section (64).** Rejected. It would produce standards with no requirements
of their own — a "deliverables" standard, a "philosophy" standard — and split single subjects
across three documents.

**A small series (~15) with many requirements each.** Rejected. Rules bind to standards by number;
coarse standards make that binding uninformative, and the per-standard `## Implementation` table
becomes unreadable at that size.

**Number by domain (`A1`, `A2` for accessibility).** Rejected. It breaks the family's flat,
gapless, ever-growing convention and would make cross-repository citation ambiguous.

## Consequences

**Makes easier.** Every rule binds to a standard whose subject actually contains it. Merge
decisions have a stated test rather than being argued case by case.

**Makes harder.** Forty documents to write and keep internally consistent, with more
cross-references between them than a coarser series would need.

**Commits the project to.** The numbering as permanent. A number identifies a standard for the life
of the framework; gaps from future supersession are acceptable, renumbering is not.

**Known cost accepted.** Some standards will stay short. A short standard with a clean boundary is
better than a long one with two subjects.
