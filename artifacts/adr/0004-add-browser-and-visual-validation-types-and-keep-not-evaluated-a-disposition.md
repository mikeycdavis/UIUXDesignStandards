# 0004 — Add browser-analysis and visual-analysis validation types, and keep not-evaluated a disposition

- **Status:** Accepted
- **Date:** 2026-08-10
- **Deciders:** Project owner

## Context

EngineeringStandards closes `validationType` at five values: `structural`, `document`,
`configuration`, `code-analysis`, `manual-review`. That set was built for a domain where every
mechanical check reads files. This domain has two more evidence surfaces that read nothing —
a rendered document in a browser engine, and a captured image — and they differ from each other and
from source analysis in what they can establish.

The source prompt (§40) asks for validation types including `browser-analysis` and
`visual-analysis`, and lists `not-evaluated` in the same block:

```text
structural
code-analysis
browser-analysis
visual-analysis
manual-review
not-evaluated
```

That last entry is the problem. In this family `not-evaluated` already exists as a *disposition* —
a property of a result on a particular run. Adding it as a validation type would put the same
concept on two axes at once.

## Decision

**`validationType` becomes seven values:**

```text
structural  document  configuration  code-analysis  browser-analysis  visual-analysis  manual-review
```

**`not-evaluated` is not among them. It remains a disposition, exactly as in EngineeringStandards.**

The two axes answer different questions, and the distinction is the framework's central claim:

- `validationType` says **how evidence for this rule would be produced**. It is a property of the
  rule, stable across every project and every run, authored in the catalog.
- `disposition` says **what happened on this run**. It is a property of a result, computed by the
  evaluator against a specific repository with specific evidence available.

A rule typed `browser-analysis` has a defined path to being established. On a run with no browser
evidence, that same rule gets disposition `not-evaluated`. On a run with fresh evidence, it gets
`evidenced`. The type did not change; the outcome did.

Making `not-evaluated` a type would let the catalog declare, permanently and in advance, that a
rule is never evaluated. That collapses the coverage/compliance distinction the source prompt
demands in §47 — a rule would carry its own non-evaluation as an identity trait rather than as an
observation, and no run could ever report it as newly established. It would also make the evidence
surface unreportable in the terms §59 requires, because "not evaluated" would no longer be
something that happened to be true of this run.

The prompt's list is satisfied: `not-evaluated` exists in the system, in the enum where it already
belongs.

**Each type maps to exactly one evidence surface**, derived at catalog load in the manner
EngineeringStandards derives `attestable`:

| validationType | Evidence surface |
| --- | --- |
| `structural`, `document`, `configuration`, `code-analysis` | static |
| `browser-analysis` | browser |
| `visual-analysis` | visual |
| `manual-review` | human |

This derivation is what lets the envelope report a five-way assurance breakdown without the catalog
restating the surface on every rule.

## Alternatives considered

**Adopt the prompt's list literally, including `not-evaluated` as a type.** Rejected. It puts one
concept on two axes, permits a permanently-unevaluated rule identity, and breaks the reporting the
same prompt requires elsewhere. Where a source and its own downstream requirements conflict, the
requirements govern and the departure is disclosed — which is what this ADR and the
`## Additions this standard makes beyond the source` section of Standard 35 do.

**Fold browser and visual into one `runtime-analysis` type.** Rejected. They have different
assurance ceilings and different failure modes: a browser run establishes behavior for the routes
and viewports it exercised, while a screenshot establishes what rendered and nothing about whether
it is good (§42). Collapsing them would make that boundary unstateable in the catalog, and the
boundary is the point.

**Keep the five ES types and express the surface in a separate field.** Rejected as redundant. The
surface is a function of the type; a second field could disagree with the first, and then something
would have to arbitrate.

**Model browser and visual as `code-analysis` with a note.** Rejected outright. It would let a rule
that requires a rendered document appear to be settled by a file scan, which is the exact false
green this framework exists to prevent.

## Consequences

**Makes easier.** A rule can be real, catalogued, and honestly unestablished at the same time. The
assurance breakdown can report five distinct buckets that sum to the applicable set. Standards
prose can name the evidence surface a requirement needs without inventing vocabulary.

**Makes harder.** Two more types to hold apart when authoring a rule, and one more chance to type a
rule wrongly. The catalog loader gains constraints ([ADR 0005](0005-full-assurance-requires-an-enumerable-subject.md))
to catch the cases that matter.

**Commits the project to.** The type/disposition separation as a permanent architectural line.
Anything that would let the catalog pre-declare an outcome is now a violation of this decision.

**Known cost accepted.** This repository's `validationType` enum diverges from every sibling pack,
so the vocabularies are not interchangeable across the family. That is correct — the sibling packs
have no browser surface — but it means a future shared consumer must read each pack's enum rather
than assume one.
