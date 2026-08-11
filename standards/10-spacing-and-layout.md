# Standard 10 — Spacing and Layout

An intentional spacing system, predictable alignment, readable density, and clear grouping — held to
the limit that spacing compliance is not pixel policing and visual judgment still matters.

Source: §14 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui`.

## Requirements

### R1 — A spacing scale SHOULD be defined and used

Spacing values SHOULD come from a defined scale. Arbitrary one-off values SHOULD have a reason.

### R2 — Grouping MUST be expressed by spacing consistent with meaning

Elements that belong together SHOULD be closer to one another than to elements that do not. Spacing
that contradicts the information architecture is a hierarchy defect, owned by
[Standard 11](11-visual-hierarchy-and-progressive-disclosure.md).

Where grouping carries meaning a user must perceive, it MUST also exist semantically — see
[Standard 3](03-accessibility-foundations.md) R2. Visual proximity alone is not a relationship.

### R3 — Alignment SHOULD be predictable

Content SHOULD align to a consistent structure rather than being positioned per instance.

### R4 — Containers SHOULD behave consistently

The same class of container SHOULD have the same padding, the same maximum width behavior, and the
same overflow behavior across the product. See
[Standard 13](13-responsive-and-adaptive-design.md) for overflow requirements.

### R5 — This standard MUST NOT be enforced as pixel policing

A spacing value outside the scale is a signal, not a verdict. The token-drift detector reports at
`warning` severity, aggregates per file, and does not fail a build on its own.

Visual judgment remains the authority for whether a layout is correct. This framework can establish
that a value is off-scale; it cannot establish that the layout is wrong, and it does not claim to.

## Additions this standard makes beyond the source

- R2's second paragraph connects visual grouping to semantic grouping. The source treats them
  separately; the connection is this framework's, and it exists because a purely visual group is
  invisible to a user who is not looking at it.
- R5's operational statement — `warning` severity, per-file aggregation, never build-failing alone —
  is this framework's implementation of the source's "do not turn spacing-token compliance into pixel
  policing."

## Relationship to other standards

[Standard 6](06-design-tokens-and-design-system-consistency.md) owns the spacing scale as a token
system. [Standard 11](11-visual-hierarchy-and-progressive-disclosure.md) owns hierarchy, which
spacing is one instrument of. [Standard 13](13-responsive-and-adaptive-design.md) owns layout
behavior across viewport classes.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1 | `visual.spacing-system` | `configuration`, partial. |
| R2 | `accessibility.landmarks`, `accessibility.heading-structure` | The semantic half; see [Standard 3](03-accessibility-foundations.md). |
| R3, R4 | — | No rule in v1.0.0. Manual-review candidates recorded for a later release. |
| R5 | `design-system.tokens-used` | `warning` severity is the mechanism; see [Standard 6](06-design-tokens-and-design-system-consistency.md). |
