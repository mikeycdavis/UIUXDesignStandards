# Standard 13 — Responsive and Adaptive Design

Every supported interface defines its behavior across the viewport classes the project declares. This
standard replaces the usual blanket prohibition on horizontal scrolling with a requirement that
overflow be intentional.

Source: §4 (Responsive and adaptive design) of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui`. The project declares its
supported viewport classes in policy — `mobile`, `tablet`, `desktop`, `wide-desktop` — and a project
declaring `web-ui` or `mobile-ui` MUST declare at least one. An undeclared viewport class is outside
the evaluation, and [Standard 28](28-platform-conventions-and-supported-environments.md) governs how
unsupported environments are excluded without silently improving a score.

## Requirements

### R1 — Behavior MUST be defined for every declared viewport class

For each declared class, the project MUST be able to say how layout, navigation, and data
presentation behave. "It happens to work" is not a definition.

### R2 — Overflow MUST be intentional

Horizontal scrolling is NOT universally prohibited. Large data grids, timelines, and wide media
legitimately require it.

What is prohibited is *unintentional* overflow: content that escapes its container because a layout
was never tested at that width. A project MUST be able to distinguish the two for any overflowing
surface.

### R3 — Navigation MUST remain operable at every declared class

A navigation pattern that collapses on small viewports MUST remain reachable, operable by keyboard,
and correctly labeled in its collapsed form. See
[Standard 14](14-navigation-and-information-architecture.md).

### R4 — Data presentation MUST degrade deliberately

Tables and dense layouts MUST have a defined small-viewport behavior — horizontal scroll, column
priority, stacked rows, or a distinct view. Silently dropping columns is a defect: the user cannot
tell that data is missing. See [Standard 22](22-data-heavy-interfaces.md).

### R5 — Touch and pointer interaction MUST both be supported where both are declared

A project declaring a touch-capable viewport class MUST NOT depend on hover to reveal essential
functionality, and MUST meet target-size requirements. See
[Standard 5](05-accessible-component-patterns-and-custom-controls.md) R6.

### R6 — Content MUST reflow rather than be lost

Text MUST wrap, long unbroken strings MUST NOT force a page-wide scroll, and media MUST scale within
its container. Informed by [WCAG 2.2 SC 1.4.10 "Reflow" (AA)].

### R7 — Orientation MUST NOT be restricted without cause

Content MUST NOT be locked to a single display orientation unless a specific orientation is
essential. Informed by [WCAG 2.2 SC 1.3.4 "Orientation" (AA)].

## Additions this standard makes beyond the source

- R2's operational test — that the project be able to distinguish intentional from unintentional
  overflow *for any overflowing surface* — is this framework's. The source states the principle; the
  test is what makes it reviewable.
- R4's "silently dropping columns is a defect" is this framework's, and follows from
  [Standard 16](16-interface-states.md)'s requirement that partial data be distinguishable from
  complete data.
- R7 is not in the source's responsive list. It is included because orientation locking is the
  responsive decision most often made by default rather than by choice.

## Relationship to other standards

[Standard 28](28-platform-conventions-and-supported-environments.md) owns the declaration of
supported environments. [Standard 14](14-navigation-and-information-architecture.md) owns
navigation. [Standard 22](22-data-heavy-interfaces.md) owns data presentation.
[Standard 36](36-browser-and-visual-evidence.md) owns the viewport evidence this standard depends on
— almost nothing here is establishable from source.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1 | `responsive.viewport-behavior-defined` | `document`, partial. |
| R2 | `responsive.no-unintentional-overflow` | `browser-analysis`, partial. `not-evaluated` in v1.0.0. |
| R3 | `navigation.current-location-indicated` | See [Standard 14](14-navigation-and-information-architecture.md). |
| R4 | `responsive.viewport-behavior-defined` | Same rule; the degradation must be part of the definition. |
| R5 | `accessibility.pointer-target-size` | See [Standard 5](05-accessible-component-patterns-and-custom-controls.md). |
| R6, R7 | `accessibility.zoom-reflow` | `browser-analysis`, partial. `not-evaluated` in v1.0.0. |
