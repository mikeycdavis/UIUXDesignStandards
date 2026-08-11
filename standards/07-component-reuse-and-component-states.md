# Standard 7 — Component Reuse and Component States

Reusable components, and the states they are required to support. This standard governs both the
prohibition on accidental duplication and the requirement that a reusable component's states be
declared rather than discovered.

Source: §4 (Component reuse and consistency) and §27 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui` and which defines reusable
interface components.

## Requirements

### R1 — Duplicate implementations of the same interaction pattern SHOULD be avoided

A project SHOULD NOT independently implement several modal patterns, button behaviors, form-field
error states, or loading indicators without justification.

"Without justification" is the operative clause. Two modal implementations with different
requirements are not a violation; two that exist because nobody noticed the first one are.

### R2 — Consolidation MUST NOT produce a worse abstraction

A shared component MUST NOT become a large abstraction that is harder to use than the repeated code
it replaced. R1 is a preference, not a mandate, and this requirement is its limit.

### R3 — A reusable interactive component MUST declare its supported states

A component intended for reuse MUST document which states it supports. The source's worked examples:

```text
Button
- default
- hover
- focus-visible
- active
- disabled
- loading

TextField
- empty
- populated
- focused
- disabled
- read-only
- validation-error
- success where applicable
```

Irrelevant states MUST NOT be forced onto a component. A button with no asynchronous behavior does
not need a loading state, and requiring one would be the checklist failure this framework rejects.

### R4 — State ownership SHOULD be explicit

For each piece of interaction state a component participates in, it SHOULD be clear whether the
component owns it or receives it. Ambiguous ownership is the source of the duplicated-state defects
that R1's detector reports as signals rather than facts.

### R5 — Variants SHOULD be designed, not accumulated

A component's variants SHOULD form a deliberate set. A variant added per call site is a signal that
the component's boundary is wrong.

### R6 — Accessibility behavior SHOULD be centralized where appropriate

Where a pattern's accessibility contract is non-trivial — focus management, roles, keyboard handling
— implementing it once in a shared component is preferred to implementing it per usage. See
[Standard 5](05-accessible-component-patterns-and-custom-controls.md) for the contracts themselves.

"Where appropriate" bounds this: centralizing an accessibility behavior into a component too generic
to express it correctly is worse than repeating it.

## Additions this standard makes beyond the source

- R4 and R5 restate the source's "state ownership" and "variant design" bullets as requirements with
  a stated failure signal. The signals — ambiguous ownership, per-call-site variants — are this
  framework's.
- The duplicate-component rule is implemented as an `audit`-only INFERRED signal that never gates
  `validate`. The source asks for a duplication signal; the decision not to let it gate is this
  framework's, taken because structural similarity is weak evidence of unjustified duplication.

## Relationship to other standards

[Standard 6](06-design-tokens-and-design-system-consistency.md) owns the design system these
components draw on. [Standard 5](05-accessible-component-patterns-and-custom-controls.md) owns the
accessibility contracts R6 refers to. [Standard 16](16-interface-states.md) owns interface-level
states, which are a different subject from component-level states: a screen's loading state and a
button's loading state are not the same claim. [Standard 30](30-design-code-consistency.md) owns
divergence between documented variants and implemented ones.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1 | `design-system.component-reuse`, `interaction.duplicate-component-signals` | The second is `audit`-only, INFERRED, and never gates `validate`. |
| R2 | — | No rule. A bound on R1, enforced by R1's `warning` severity and justification clause. |
| R3 | `design-system.component-states-documented` | `document`, partial. |
| R4, R5 | — | No rule in v1.0.0. Recorded as requirements without mechanical support. |
| R6 | `accessibility.no-inaccessible-custom-controls` | See [Standard 5](05-accessible-component-patterns-and-custom-controls.md). |
