# Standard 2 — Boundary with EngineeringStandards

Two standards frameworks govern the same codebases, and a concern that crosses between them must be
referenced rather than copied. This standard states the boundary and names the rules this repository
deliberately does not own.

Source: §29 and §55 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to every rule in this catalog and to every project adopting both frameworks. It also binds
this repository's own authoring: a rule may not be added here if the concern it governs appears in
the not-duplicated list below.

## Requirements

### R1 — Ownership MUST follow the stated division

EngineeringStandards owns: application capabilities, auditability, security architecture, AI
provider neutrality, structured errors, API and tool contracts, implementation verification,
source-control integrity, and general engineering quality.

This framework owns: presentation, interaction, usability, accessibility, responsive behavior,
design-system consistency, interface states, content design, visual design, and design/code
consistency.

### R2 — A crossing concern MUST reference the owning standard

Where a concern crosses the boundary, the non-owning framework MUST reference the owning rule and
MUST NOT restate its requirement. The worked cases:

```text
UI error presentation              → this framework
structured application error contract → EngineeringStandards
AI proposal/execution UX           → this framework (presentation)
                                   + EngineeringStandards (authorization, auditability)
no UI-only business logic          → EngineeringStandards owns the rule
                                   → this framework cross-references it
```

A reference is expressed in catalog metadata as a `crossReferences` entry with an explicit
relationship (`presentation-of`, `complements`, `defers-to`). A cross-reference never resolves to a
local rule identity and never creates an alias —
[Standard 33](33-rule-catalog-and-rule-identity.md) owns that mechanism.

### R3 — This repository MUST NOT shadow the listed EngineeringStandards rules

The following concerns are owned there. No rule in this catalog may carry an identity, an alias, or a
requirement that restates one of them. A meta-test binds to this list.

| EngineeringStandards concern | Why not duplicated here |
| --- | --- |
| Business logic must not exist only in the UI (§29) | The rule is about where domain behavior lives, not how it is presented. |
| Structured application error contract | This framework governs how a structured error is *shown*; the contract's shape is engineering. |
| Actor and audit attribution for AI actions | An AI action's attribution model is one system, not two. |
| AI provider neutrality | No presentation consequence; wholly an engineering concern. |
| Source-control integrity | Outside the interface entirely. |
| API and tool contract design | The capability surface, not its presentation. |

### R4 — A UI MAY own presentation and interaction-state logic

The boundary is not "no logic in the UI". Presentation logic and interaction-state logic legitimately
belong to the interface. What MUST NOT happen is the interface becoming the only implementation of
consequential domain behavior.

## Additions this standard makes beyond the source

- The `crossReferences` relationship vocabulary in R2 is this framework's mechanism, recorded in
  [ADR 0006](../artifacts/adr/0006-cross-repository-concerns-reference-rather-than-duplicate.md).
  The source requires referencing rather than copying; it does not specify how.
- The R3 table's last four rows are inferred from §55's ownership list. Only the first two are named
  as crossing cases in the source.

## Relationship to other standards

[Standard 33](33-rule-catalog-and-rule-identity.md) enforces the one-identity law that makes R3
mechanically checkable. [Standard 17](17-error-presentation-and-feedback.md) and
[Standard 26](26-ai-user-experience.md) are the two standards that most often need R2's referencing
mechanism.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1 | — | No rule. A scoping constraint on the catalog. |
| R2 | — | Enforced by the catalog loader's `crossReferences` validation. |
| R3 | — | Enforced by a meta-test reading this table against the catalog. |
| R4 | — | No rule. A clarification that bounds R3. |
