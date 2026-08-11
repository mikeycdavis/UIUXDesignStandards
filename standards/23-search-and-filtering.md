# Standard 23 — Search and Filtering

Users MUST NOT have to guess why results disappeared. Every requirement in this standard follows from
that one sentence.

Source: §20 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui` and which offers search or
filtering.

## Requirements

### R1 — Execution timing MUST be defined and evident

The interface MUST make clear whether search runs as the user types, on submission, or after a delay.
A search that runs on an unclear trigger produces results the user cannot attribute to their input.

Where debouncing is used, the interface MUST NOT appear idle while a query is pending. See
[Standard 16](16-interface-states.md) R2.

### R2 — Active filters MUST be visible

Every applied filter MUST be visible from the results surface, not only from the panel that set it. A
filter applied on a previous visit and persisted MUST be visible on arrival.

### R3 — Clearing MUST be available and complete

A user MUST be able to return to the unfiltered state. A "clear" affordance MUST clear everything it
appears to clear; a partial reset that leaves a hidden filter applied is worse than none.

### R4 — No-results MUST be distinguishable from empty and from failure

A zero-result search, an empty data set, and a failed query MUST NOT share a presentation. See
[Standard 16](16-interface-states.md) R6, which owns this.

A no-results state SHOULD say which query or filters produced it, and SHOULD offer a way back.

### R5 — Result counts SHOULD be shown where useful

Where the count informs the user's next action — whether to refine, whether to paginate, whether the
filter did anything — it SHOULD be shown.

### R6 — Stale results MUST NOT be presented as current

When a query is superseded, its results MUST NOT be rendered as the answer to the newer query.
Out-of-order responses are the mechanism; the user sees results that match nothing they typed.

### R7 — Search MUST be keyboard-operable

Entering, submitting, clearing, and navigating results MUST all work from the keyboard. Where results
appear in a listbox or combobox, they MUST follow that pattern's interaction contract; see
[APG pattern "Combobox"] and [APG pattern "Listbox"].

### R8 — Query persistence SHOULD follow user expectation

Where a user would expect to return to their query — via back navigation, a shared link, or a
reload — it SHOULD be preserved. See [Standard 14](14-navigation-and-information-architecture.md) R5.

## Additions this standard makes beyond the source

- R1's second paragraph, R2's second sentence, and R3's "worse than none" are this framework's
  operationalizations of the source's bullets.
- R6 names out-of-order responses as the mechanism behind stale-query behavior; the source lists
  `stale-query behavior` without the cause.
- R4's second paragraph is this framework's addition to the state requirement it inherits.

## Relationship to other standards

[Standard 16](16-interface-states.md) owns the state model this standard applies.
[Standard 22](22-data-heavy-interfaces.md) owns the result surfaces.
[Standard 14](14-navigation-and-information-architecture.md) owns addressability and back behavior.
[Standard 5](05-accessible-component-patterns-and-custom-controls.md) owns the combobox and listbox
contracts R7 refers to.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1, R2, R3, R5, R6, R8 | `interaction.states-complete` | `browser-analysis`, partial. `not-evaluated` in v1.0.0. |
| R4 | `interaction.empty-states-differentiated` | See [Standard 16](16-interface-states.md). |
| R7 | `accessibility.keyboard-operable` | See [Standard 4](04-keyboard-and-focus.md). |
