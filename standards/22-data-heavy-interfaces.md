# Standard 22 — Data-Heavy Interfaces

Tables, grids, charts, dashboards, and dense analytics surfaces. Data-heavy interfaces concentrate
several failure modes at once: semantic structure, color-only encoding, and state ambiguity all
appear here in their hardest form.

Source: §19 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui` and which presents tabular data,
charts, or dashboards.

## Requirements

### R1 — Tables MUST have semantic structure

Tabular data MUST be marked up as a table with header cells associated to their rows and columns. A
grid of positioned elements that looks like a table is not one. Informed by
[WCAG 2.2 SC 1.3.1 "Info and Relationships" (A)] and [APG pattern "Table"].

An interactive grid has a different contract from a static table; see
[APG pattern "Grid (Interactive Tabular Data and Layout Containers)"] and
[Standard 5](05-accessible-component-patterns-and-custom-controls.md).

### R2 — Charts MUST NOT rely solely on color

Series, thresholds, and categories MUST be distinguishable without color perception — through
labels, patterns, shapes, or direct annotation. Informed by
[WCAG 2.2 SC 1.4.1 "Use of Color" (A)].

A legend that maps color to meaning does not satisfy this. It requires the reader to perceive the
color in order to use the legend.

### R3 — Important chart information SHOULD have a textual or tabular equivalent

Where a chart carries information a user needs, an equivalent SHOULD be reachable — a data table, a
summary, or accessible values. Informed by [WCAG 2.2 SC 1.1.1 "Non-text Content" (A)].

### R4 — Data states MUST remain distinguishable

Loading, empty, error, filtered-empty, and partial MUST NOT collapse into one presentation. See
[Standard 16](16-interface-states.md) R6, which owns this requirement; it is repeated here because
dense interfaces are where the collapse most often happens.

### R5 — Sorting, filtering, and pagination MUST report their own state

A user MUST be able to see what sort is applied, what filters are active, and which page of what
total they are viewing. A filtered view that looks identical to an unfiltered one is how users
conclude their data is gone. See [Standard 23](23-search-and-filtering.md).

### R6 — Virtualized lists MUST remain operable

A virtualized collection MUST remain keyboard-navigable and MUST expose its total size where the
total is meaningful. Content that exists only while rendered MUST NOT break find-in-page or assistive
navigation without an alternative. See [APG pattern "Feed"].

### R7 — Density MUST be a decision

Dense presentation is legitimate for expert tools. It MUST be chosen, and where it materially reduces
readability or target size, [Standard 5](05-accessible-component-patterns-and-custom-controls.md) R6
and [Standard 3](03-accessibility-foundations.md) R6 still apply.

## Additions this standard makes beyond the source

- R2's second paragraph — that a color legend does not satisfy the requirement — is this framework's,
  and it is the most common way R2 is thought to be met when it is not.
- R5's failure sentence is this framework's illustration.
- R6 and R7 expand the source's `virtualized lists` and `dense analytics interfaces` bullets into
  requirements. The specific obligations (total size, find-in-page, density as a decision) are this
  framework's.

## Relationship to other standards

[Standard 3](03-accessibility-foundations.md) owns table semantics generally.
[Standard 9](09-color.md) owns color encoding. [Standard 16](16-interface-states.md) owns the state
model R4 references. [Standard 23](23-search-and-filtering.md) owns filtering.
[Standard 13](13-responsive-and-adaptive-design.md) R4 owns small-viewport degradation.
[Standard 19](19-performance-as-ux.md) R5 owns large-collection strategy.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1 | `accessibility.table-semantics` | `code-analysis`, partial. |
| R2, R3 | `accessibility.no-color-only-critical-state`, `accessibility.media-alternatives` | `manual-review` and `code-analysis` respectively. |
| R4 | `interaction.empty-states-differentiated` | See [Standard 16](16-interface-states.md). |
| R5 | `interaction.states-complete` | `browser-analysis`, partial. `not-evaluated` in v1.0.0. |
| R6 | `accessibility.keyboard-operable` | See [Standard 4](04-keyboard-and-focus.md). |
| R7 | — | No rule in v1.0.0. Recorded as a requirement without mechanical support. |
