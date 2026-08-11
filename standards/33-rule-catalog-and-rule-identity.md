# Standard 33 — Rule Catalog and Rule Identity

The core architectural law and the identity system that implements it. This standard governs this
framework's own construction, and every other standard depends on it holding.

Source: §1 and §46 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to this repository. Adopting projects are bound by R6, which prohibits inventing rule
identities.

## Requirements

### R1 — Three components MUST stay separate

> The catalog defines rule identity and metadata.
> The project policy defines project applicability.
> The evaluator produces evidence.
> None of the three may redefine the others.

This is the law the rest of the framework is built on. A change that lets any one of the three
redefine another is a defect regardless of what else it improves.

### R2 — Every enforceable rule MUST have exactly one canonical identity

Standards prose, project policy, evaluator code, CI configuration, and design tooling MUST NOT invent
alternative rule identities or meanings. Duplicate identities and alias collisions are load-time
errors, detected across all catalog files rather than within each.

A finding satisfies exactly one rule identity. Where two rules could plausibly own the same defect,
ownership is settled in the catalog before the detector exists — not inferred from the detector's
behavior.

### R3 — Identities MUST follow the canonical grammar

```text
^[a-z][a-z0-9]*(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)+$
```

Domain prefixes: `accessibility`, `interaction`, `responsive`, `navigation`, `forms`, `content`,
`design-system`, `visual`, `motion`, `performance`, `privacy`, `ai-ux`, `design-integrity`,
`localization`, `evidence`.

The grammar admits a hyphen in the domain segment; see
[ADR 0007](../artifacts/adr/0007-rule-id-grammar-admits-hyphenated-domains.md). An ambiguous
catch-all prefix such as `ui.*` MUST NOT be used where a specific domain owns the rule.

### R4 — Every rule MUST carry the full metadata set

```text
id            owning standard    title        description
rationale     remediation        level        severity
validationType assurance         nonExemptible introducedIn
aliases       deprecatedIn       supersededBy  removedIn
appliesTo     crossReferences
```

Lifecycle fields MUST be present even when null. An absent field and a null field are different
claims, and only the second is a decision.

### R5 — Assurance claims MUST be legal for the validation type

`full` assurance is claimable only by `structural`, `document`, and `configuration` rules — the
types whose subject is enumerable. `code-analysis`, `browser-analysis`, `visual-analysis`, and
`manual-review` cap at `partial`. This is a load-time error, not a review comment; see
[ADR 0005](../artifacts/adr/0005-full-assurance-requires-an-enumerable-subject.md).

### R6 — An adopting project MUST NOT redefine rule semantics

A project policy declares applicability, exceptions, and attestations. It MUST NOT change what a rule
means, and it MUST NOT make a non-exemptible rule exemptible. See
[Standard 34](34-project-policy-applicability-and-exceptions.md).

### R7 — The evaluator MUST bind only to catalog identities

Every rule id an evaluator or an evidence file reports MUST exist in the catalog. This is asserted on
every run, and an unknown id from an external evidence producer is a configuration error at exit 2
rather than a finding.

### R8 — Identity changes MUST be lifecycle changes

Renaming a rule MUST use aliases and supersession metadata. Removing an alias is a breaking change.
Rule identity MUST be frozen before detector implementation, so that a detector's convenience never
shapes what a rule is.

### R9 — Cross-repository references MUST NOT create local identities

A `crossReferences` entry names a foreign repository and rule with a relationship —
`presentation-of`, `complements`, or `defers-to`. It never resolves locally, never creates an alias,
and the loader rejects one that collides with a local identity. See
[Standard 2](02-boundary-with-engineering-standards.md).

## Additions this standard makes beyond the source

- R2's second paragraph — one finding, one identity, settled before implementation — is this
  framework's, recorded because detector-driven ownership is how a single defect quietly acquires two
  rule identities.
- R4's "an absent field and a null field are different claims" is this framework's phrasing of an
  inherited convention.
- R5's legality matrix is this framework's; the source requires assurance levels without constraining
  which are claimable by which validation type.
- R8's freeze requirement is this framework's process decision.

## Relationship to other standards

[Standard 2](02-boundary-with-engineering-standards.md) owns the cross-repository boundary R9
implements. [Standard 34](34-project-policy-applicability-and-exceptions.md) owns the policy half of
R1. [Standard 35](35-evidence-assurance-and-compliance-output.md) owns the evaluator half.
[Standard 38](38-external-source-provenance.md) prevents external sources from becoming a second
rule authority — the same law as R1, applied outward.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1, R2, R3, R4, R5, R9 | — | No rule. Enforced by the catalog loader as load-time errors. |
| R6 | — | Policy validation, exit 2. |
| R7 | — | Enforced by `assertBindings` on every run. |
| R8 | — | Process, enforced by `artifacts/design/rule-catalog-v1.md` and the release-readiness check. |
