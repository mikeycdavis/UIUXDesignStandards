# Standard 19 — Performance as UX

Perceived and actual responsiveness are user-experience properties. This standard deliberately
prescribes no universal thresholds, and instead requires that where a project defines budgets, those
budgets are testable.

Source: §16 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui`.

## Requirements

### R1 — Universal millisecond thresholds MUST NOT be prescribed

This framework defines no numeric performance requirement. A threshold appropriate to a document
site is wrong for a data-analysis tool, and a number chosen to look rigorous would be a fabricated
precision.

### R2 — Where budgets exist, they MUST be testable

A project MAY define performance budgets. Where it does, each budget MUST name what is measured, how,
and under what conditions. A budget nobody can evaluate is a statement of intent, not a standard.

### R3 — Layout MUST be stable during load

Content MUST NOT shift under the user after it becomes visible. Reserving space for late-arriving
content is the general remedy; injecting content above the current viewport position is the general
cause.

### R4 — Interaction MUST acknowledge input

A control that has received input MUST show it has, even when the resulting work is slow. See
[Standard 16](16-interface-states.md) R2.

### R5 — Large collections SHOULD degrade deliberately

Long lists, large tables, and unbounded result sets SHOULD have a defined strategy — pagination,
virtualization, or a cap with a stated limit. An unbounded render is a decision that was not made.

### R6 — Optimistic updates MUST be reconciled

An interface that shows a result before the operation completes MUST correct itself when the
operation fails. An optimistic update that is never reverted is a false success; see
[Standard 29](29-design-integrity-prohibitions.md).

### R7 — Media and bundle weight SHOULD be proportional to value

Images and media SHOULD be sized and formatted for their display context. Client bundle growth SHOULD
be a considered cost where it affects the user.

## Additions this standard makes beyond the source

- R1 is stated as a requirement rather than a caveat. The source says not to prescribe thresholds
  without context; making that a numbered requirement is this framework's choice, so that a reader
  looking for numbers finds the reason there are none.
- R3's cause-and-remedy sentence is explanatory.
- R6 is not in the source's performance list. It is placed here because the optimistic-update pattern
  is a performance technique whose failure mode is an honesty defect, and locating it under
  performance is where an implementer will look for it.

## Relationship to other standards

[Standard 16](16-interface-states.md) owns loading and partial-data states.
[Standard 12](12-motion-and-animation.md) owns motion, which can cause the instability R3 prohibits.
[Standard 22](22-data-heavy-interfaces.md) owns the large-collection surfaces R5 refers to.
[Standard 29](29-design-integrity-prohibitions.md) owns the false-success prohibition R6 invokes.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1 | — | No rule. A constraint on this framework's own authoring. |
| R2 | `performance.budgets-testable` | `configuration`, partial. Applicable only when budgets are declared. |
| R3 | `performance.layout-stability` | `browser-analysis`, partial. `not-evaluated` in v1.0.0. |
| R4 | `interaction.states-complete` | See [Standard 16](16-interface-states.md). |
| R5, R7 | — | No rule in v1.0.0. Recorded as requirements without mechanical support. |
| R6 | `design-integrity.no-fake-success` | See [Standard 29](29-design-integrity-prohibitions.md). |
