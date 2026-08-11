# Standard 34 — Project Policy, Applicability, and Exceptions

What a project declares, how the framework decides whether UI standards apply at all, and how a rule
is legitimately set aside. This standard carries the framework's central applicability invariant.

Source: §43, §44, and §45 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md),
and the enforcement-architecture prompt at
[`artifacts/prompts/enforcement-architecture-prompt.md`](../artifacts/prompts/enforcement-architecture-prompt.md).

## Scope

Applies to every project adopting this framework, including this repository.

## Requirements

### R1 — Every applicable project MUST have a machine-readable policy

A project policy declares: standards version, project identity, whether a UI exists, application
types, supported platforms, supported viewport classes, per-rule applicability, exceptions,
attestations, accessibility targets, localization expectations, design-system strategy, and
browser/device support.

### R2 — Unknown policy properties MUST fail validation

An unrecognized property MUST NOT be silently ignored. A policy is validated with no additional
properties permitted at any level, so a misspelled key is an error rather than a setting that never
took effect.

### R3 — Applicability is decided by evidence, and failure to establish it is INDETERMINATE

The framework classifies a project into exactly one of:

```text
APPLICABLE        NOT_APPLICABLE        INDETERMINATE
```

**`NOT_APPLICABLE` requires all three of:** an explicit `no-ui` declaration in policy, a complete
scan, and zero contradictory UI signals.

**A complete scan proves that none of the framework's supported UI signals were present. It does not
prove that the repository has no UI.** Zero signals with no declaration is `INDETERMINATE`, never
`NOT_APPLICABLE`.

> **Failure to establish applicability is `INDETERMINATE`, never `NOT_APPLICABLE`.**

`INDETERMINATE` never produces a compliant UI verdict and never exits 0. This is the invariant that
keeps the cheapest path to a clean result from being "make the classifier fail".

**Scan incompleteness constrains claims of absence only.** A truncated or partially unreadable scan
MUST block `NOT_APPLICABLE`, and MUST NOT demote a UI signal that was already witnessed. A signal
found is found; an unrelated unreadable subtree does not un-witness it. The opposite ordering would
mean a repository could shed its UI obligations by containing something the scanner cannot read.

**A UI class MUST NOT be inferred beyond what a signal proves.** Evidence frequently establishes
that an interface exists without establishing which platform it targets — a component file
containing markup is the ordinary case. The classification is then `APPLICABLE` with an unresolved
class, which MUST be reported as unresolved rather than resolved to the most likely platform.

**A class-specific rule MUST NOT be scoped by declaration alone.** Where a rule declares
`appliesTo` naming specific UI classes, it is evaluated when the evidence establishes one of those
classes, and it is set aside only when the evidence corroborates a declaration that excludes them.
An `APPLICABLE` classification whose class is unresolved leaves such a rule **unresolved**: neither
evaluated nor excluded, reported as unresolved, and — where the rule is `forbidden` — capping the
verdict exactly as any other unestablished prohibition does. Reading the declared class as the scope
would return the project's own assertion to authority over the rules it is measured by, one layer
below the gate that exists to prevent it.

### R4 — A declaration contradicted by evidence is a contradiction, not an opt-out

A policy declaring `no-ui` over a repository showing UI evidence yields `INDETERMINATE` with an
`agreement: conflict` record. A declaration is an input to classification, never its output.

### R5 — Applicability is not a rule result

Classification is reported in its own envelope block, separately from compliance. UI compliance is
`null` when applicability is `NOT_APPLICABLE` or `INDETERMINATE`; framework-process compliance is
always reported. The two compliance blocks MUST be produced by separate evaluations over disjoint
rule sets, so that UI rules and process rules cannot share applicability semantics, and **a
satisfied framework-process verdict MUST NOT produce a passing exit for an unresolved UI gate**: the
process rules being met says nothing about whether the UI rules were ever reachable. No field
changes meaning by context; see
[ADR 0003](../artifacts/adr/0003-ui-applicability-is-established-by-evidence-in-this-repository.md).

### R6 — UI rules MUST NOT be forced onto projects without an applicable interface

Libraries, backend services, CLI tools, and infrastructure repositories MUST NOT be evaluated against
UI rules unless they expose an applicable interface. A command-line tool may one day have its own
interaction-design rules; web UI standards MUST NOT be pretended to apply to it.

### R7 — An applicable UI MUST declare an accessibility target

Any project whose applicability is not `no-ui` MUST declare `ui.accessibility.target`. Omission is a
**policy error at exit 2** — not a compliance failure, not `INDETERMINATE`.

The minimum value is `framework-baseline`, this framework's universal accessibility floor: focus
indication not removed, accessible names present, keyboard operation, and no color-only critical
state. `none` is not expressible. **There is no silent default**: absence never becomes
`framework-baseline` implicitly, because that would fabricate a declaration the project never made.

A declared target means "evaluate against this framework's supported representation of that target".
It never means "this project conforms to that target". See
[Standard 35](35-evidence-assurance-and-compliance-output.md) and
[ADR 0008](../artifacts/adr/0008-an-applicable-ui-declares-its-accessibility-target.md).

### R8 — Cross-field policy invariants are configuration errors

The policy schema validates representable shape. Six cross-field conditions the schema's vocabulary
cannot express are validated separately and fail at **exit 2**, never as compliance findings, because
a malformed policy is not a failing project. See
[ADR 0012](../artifacts/adr/0012-schema-validates-shape-policy-validates-cross-field-semantics.md).

| Condition | Requirement |
| --- | --- |
| `no-ui` declared | No other `ui` subkey may be present |
| Applicability is not `no-ui` | `accessibility.target` MUST be present (R7) |
| Applicability is not `no-ui` | `platforms` MUST be non-empty |
| `multi-platform` | At least two platforms |
| `web-ui` or `mobile-ui` | `viewportClasses` MUST be non-empty |
| `localization.required: true` | `locales` MUST be non-empty |
| `designSystem.strategy: none-justified` | `justification` MUST be present |

### R9 — Exceptions MUST be explicit, owned, and expiring

An exception carries a rule, a reason, an approver, an approval date, and an expiration or revisit
trigger. Silent rule weakening MUST NOT be used in place of an exception. An expired exception is a
policy compliance finding, not a silently continuing exemption.

### R10 — A non-exemptible rule MUST NOT be made exemptible by policy

Where a prohibition's qualifier already contains its legitimate boundaries, the rule declares itself
non-exemptible and policy cannot override that. See
[Standard 29](29-design-integrity-prohibitions.md).

## Additions this standard makes beyond the source

- R3's three-part `NOT_APPLICABLE` test and the stated invariant are from the enforcement-architecture
  prompt, strengthened here: the requirement that zero signals *without* a declaration yields
  `INDETERMINATE` is this framework's, taken because `NOT_APPLICABLE` exempts the entire UI rule
  surface and must be the hardest state to reach.
- R7's exit-2 treatment and the no-silent-default rule are owner decisions recorded in
  `artifacts/prompts/owner-decisions.md`.
- R8's table and its exit-2 classification are this framework's, recorded in ADR 0012.
- R5's three-block envelope is this framework's; the source does not specify envelope structure.

## Relationship to other standards

[Standard 33](33-rule-catalog-and-rule-identity.md) owns rule identity, which policy may not
redefine. [Standard 35](35-evidence-assurance-and-compliance-output.md) owns what the verdict means.
[Standard 28](28-platform-conventions-and-supported-environments.md) owns the environment
declarations R1 lists. [Standard 37](37-manual-design-review.md) owns attestations.
[Standard 39](39-bootstrap-and-existing-ui-reconstruction.md) governs producing a first policy.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1, R2, R7, R8 | — | Policy validation, exit 2. Not compliance rules. |
| R3, R4, R5, R6 | — | The applicability classifier and the gate ordering in `validate`. Reported in its own envelope block, never as a rule result. Class scoping is reported per rule as the `class-unresolved` and `not-applicable-by-class` dispositions. |
| R9 | — | Policy compliance findings: expired exception, conflicting classification. Exit 1. |
| R10 | — | Policy compliance finding: exception on a non-exemptible rule. Exit 1. |
