# Standard 6 — Design Tokens and Design-System Consistency

A project with a UI defines or adopts a design system proportional to its size, and treats its public
tokens as contracts. This standard governs the system's existence, its use, and the versioning of
changes to it.

Source: §4 (Design-system consistency) and §28 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui`. The project declares its
design-system strategy in policy: `adopted`, `custom`, `hybrid`, or `none-justified`. The last
requires a written justification and is a legitimate outcome for a small product.

**Sophistication MUST be proportional to the product.** A tiny project is not required to build a
large design system, and this standard MUST NOT be read as requiring one.

## Requirements

### R1 — A project with a UI MUST declare a design-system strategy

The strategy MUST be one of the four declared values, and `none-justified` MUST carry a
justification. A project that declares nothing is a policy error, not a compliance failure — see
[Standard 34](34-project-policy-applicability-and-exceptions.md).

### R2 — Where a system exists, it MUST define its primitives

A project declaring `adopted`, `custom`, or `hybrid` MUST define or inherit, where the product uses
them: design tokens, a typography scale, a spacing scale, border and radius conventions, color roles,
elevation conventions, iconography rules, component states, responsive breakpoints, and motion
conventions.

"Where the product uses them" is load-bearing. A product with no elevation is not required to invent
elevation tokens.

### R3 — Where a token exists, implementations SHOULD use it

A literal value SHOULD NOT be used where a project token expresses the same intent. This is a
`warning`-severity signal, aggregated per file, and it fires only when a token system has actually
been detected — from CSS custom properties, from policy-declared token paths, or from a token
configuration file.

Absence of a token system means this rule is not applicable, not that it passes. The distinction is
visible in output.

**This requirement MUST NOT become pixel policing.** A one-off value with a reason is not a
violation, and [Standard 10](10-spacing-and-layout.md) states the same limit for spacing.

### R4 — Reusable primitives SHOULD be preferred over repeated page-specific implementations

Where the same visual or interactive concern appears repeatedly, it SHOULD be expressed once. See
[Standard 7](07-component-reuse-and-component-states.md) for the reuse requirements this depends on.

### R5 — A feature MUST NOT locally redefine a canonical token while claiming to use the system

Overriding a token's value in feature-local scope, then reporting design-system adoption, is a false
claim about the interface. A project may fork a token deliberately; it MUST do so by defining a new
token, not by shadowing an existing one.

### R6 — Breaking token changes MUST be versioned

Public tokens are contracts. A change that alters or removes a token other consumers rely on MUST be
versioned as a breaking change, with the affected surface identified. Treating a token rename as a
cosmetic edit is the failure this requirement exists to prevent.

### R7 — Design-system requirements MUST NOT be weakened for implementation convenience

Difficulty of implementation is not a reason to lower a design-system requirement. It may be a reason
to record an exception with an owner, an approval, and a revisit trigger. See
[Standard 29](29-design-integrity-prohibitions.md).

## Additions this standard makes beyond the source

- R3's conditional firing — the token-drift signal only activates when a token system is detected —
  is this framework's mechanism, not a source requirement. It exists because a drift detector with
  no token system to drift from produces findings that mean nothing.
- R5's "define a new token rather than shadow an existing one" remedy is this framework's; the source
  states the prohibition without naming the alternative.
- R1's four-value strategy vocabulary is defined by this framework's policy schema.

## Relationship to other standards

[Standard 7](07-component-reuse-and-component-states.md) owns component reuse.
[Standard 8](08-typography.md), [Standard 9](09-color.md), [Standard 10](10-spacing-and-layout.md),
and [Standard 12](12-motion-and-animation.md) own the individual primitives R2 requires.
[Standard 30](30-design-code-consistency.md) owns detection of divergence between documented tokens
and implemented ones. [Standard 29](29-design-integrity-prohibitions.md) owns R7's prohibition form.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1 | — | Policy validation, exit 2. Not a compliance rule. |
| R2 | `design-system.tokens-defined` | `configuration`, partial. |
| R3 | `design-system.tokens-used` | `code-analysis`, partial, `warning` severity. Static detector in v1.0.0. |
| R4 | `design-system.component-reuse` | See [Standard 7](07-component-reuse-and-component-states.md). |
| R5 | `design-system.tokens-used` | Same rule; the local-redefinition case is a distinct finding under it. |
| R6 | `design-system.breaking-token-changes-versioned` | `document`, partial. |
| R7 | `design-system.not-weakened-for-convenience` | `manual-review`, none. Forbidden, non-exemptible. |
