# Standard 39 — Bootstrap and Existing-UI Reconstruction

Adopting this framework in a project that already exists. The governing rule is that scaffolding is
not evidence of intent, and that a reconstructed baseline states what it observed rather than what
someone probably meant.

Source: §51 and §52 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md),
and the enforcement-architecture prompt at
[`artifacts/prompts/enforcement-architecture-prompt.md`](../artifacts/prompts/enforcement-architecture-prompt.md).

## Scope

Applies to the `init` command and to any process producing a first policy or design baseline for an
existing project.

## Requirements

### R1 — Bootstrap MUST detect rather than assume

`init` identifies: whether the project has a UI, likely UI technologies, a likely design system,
existing accessibility tooling, existing design artifacts, a component catalog, browser automation,
viewport support, and an existing policy.

UI detection reuses the applicability classifier's signals rather than reimplementing them. One
owner for that logic; see [Standard 34](34-project-policy-applicability-and-exceptions.md).

### R2 — Three adoption modes MUST be distinguished

```text
greenfield                    nothing exists yet
existing-configured           artifacts exist and are trustworthy
reconstruction-required       an interface exists with no trustworthy design source
```

Detected mode is reported `INFERRED`. An explicitly supplied mode is `CONFIRMED_BY_OWNER`.

### R3 — Design history MUST NOT be fabricated

`init` MUST NOT state what a design intended, was planned to be, or was meant to become. It reports
what exists.

### R4 — Tool-generated scaffolding is NOT evidence of design intent

A framework's default template, a starter theme, or a generated component is evidence that a
generator ran. It is not evidence that anybody chose the result. A bootstrap that reads scaffolding
as intent produces a baseline documenting a decision nobody made.

### R5 — Scaffolded declarations MUST be explicit in the written file

Where `init` writes a policy, every value it scaffolds MUST appear literally in the file, with a
comment noting that adopting it makes it the project's declared policy. In particular the minimum
accessibility target is written out rather than left implicit — there is no silent default; see
[Standard 34](34-project-policy-applicability-and-exceptions.md) R7.

### R6 — Reconstruction MUST be evidence-based and labeled

A reconstructed baseline inspects implemented screens, routes, components, tokens, styles, assets,
responsive behavior, accessibility semantics, screenshots, component catalogs, tests, design files,
documentation, and version-control history.

Every claim carries a label:

```text
OBSERVED             established from repository evidence
INFERRED             a reasonable reading of that evidence
CONFIRMED_BY_OWNER   stated by the owner — a date is mandatory
UNKNOWN              could not be determined
```

An owner confirmation without a date is itself a finding.

### R7 — Prohibited and required phrasings

Never written:

> "The original design intended…"
> "The developer meant…"

Written instead:

> "The current implementation indicates…"
> "This cannot be determined from repository evidence."

This vocabulary is shared with EngineeringStandards rather than reinvented; see
[Standard 2](02-boundary-with-engineering-standards.md).

### R8 — Bootstrap MUST be non-destructive

`init` plans before it writes, writes through a single path, and refuses to overwrite an existing
file without an explicit per-path instruction. A dry run writes nothing.

### R9 — Adoption MUST NOT be claimed by the presence of configuration

A committed workflow file, a scaffolded policy, or an installed template is **not** proof that
enforcement exists. Adoption is established by enforcement actually running and reporting, not by
files that describe it.

## Additions this standard makes beyond the source

- R5 is this framework's, and it follows from the owner's no-silent-default decision: a scaffolded
  value that is not written down would become an implicit declaration.
- R8's specific mechanism — plan, single writer, per-path overwrite, dry run writes nothing — is this
  framework's implementation.
- R9 comes from the enforcement-architecture prompt rather than §51 or §52. It is placed here because
  bootstrap is where the false-adoption claim is most likely to originate.

## Relationship to other standards

[Standard 34](34-project-policy-applicability-and-exceptions.md) owns the policy `init` produces and
the classifier it reuses. [Standard 31](31-design-artifacts-and-documentation.md) owns the artifacts
reconstruction produces. [Standard 30](30-design-code-consistency.md) owns whether those artifacts
stay true. [Standard 27](27-first-use-and-onboarding.md) governs a product's own first-use
experience — a different subject that shares a word.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1, R2, R8 | — | No rule. Implemented in `init`, asserted by dry-run, idempotence, and conflict tests. |
| R3, R4, R7 | — | No rule. Enforced by label discipline in output and by phrasing tests. |
| R5 | — | Asserted by a test reading the file `init` writes. |
| R6 | `evidence.surfaces-declared` | `structural`, full. Applies to process. |
| R9 | — | No rule. A constraint on adoption reporting; enforced by the portfolio layer, not by this repository. |
