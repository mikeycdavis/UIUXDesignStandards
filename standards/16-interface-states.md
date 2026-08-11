# Standard 16 — Interface States

A UI is not complete when only its happy path is designed. This standard enumerates the states a
data-driven surface may need, requires that applicable ones exist, and requires that they stay
distinguishable from one another.

Source: §5, §6, and §7 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui`, for every meaningful asynchronous
or data-driven surface.

**Applicability MUST be explicit.** Irrelevant states MUST NOT be required merely to satisfy a
checklist. A surface that cannot be empty does not need an empty state, and a project is not
penalized for its absence.

## Requirements

### R1 — Applicable states MUST exist

For each meaningful surface, the project MUST consider and, where applicable, implement:

```text
initial            loading              progressive loading
empty              partial data         success
validation error   recoverable error    unrecoverable error
permission denied  authentication required
offline/degraded   stale data           destructive confirmation
disabled           read-only
```

### R2 — Loading MUST communicate that work is occurring

A surface awaiting data MUST show that it is doing so, MUST avoid unnecessary layout shift, and
SHOULD preserve existing data during a refresh where that is useful. Skeletons SHOULD be used only
where they aid comprehension.

Blocking unrelated interaction during a load MUST be deliberate rather than incidental.

### R3 — Indeterminate and measured progress MUST be distinguishable

They MUST differ visually and semantically. A progress indicator that animates toward a completion it
cannot measure is prohibited; see [Standard 29](29-design-integrity-prohibitions.md).

### R4 — Long-running operations MUST be communicated honestly

A long operation MUST NOT be represented as nearly complete, and its indicator MUST NOT be reset to
create an impression of progress.

### R5 — Empty states MUST explain themselves

Where relevant, an empty state MUST convey why nothing is present, whether that is expected, how to
obtain content, and what the user can do next.

### R6 — Five kinds of emptiness MUST stay distinguishable

```text
genuinely empty data      no search results      no filtered results
unavailable data          failed data retrieval
```

They MUST NOT collapse into one visual state. A retrieval failure shown as "No results" is a false
statement about the data, and it sends the user to fix a query that was never the problem.

### R7 — Partial data MUST be identifiable as partial

A surface showing some of the data MUST say so. See
[Standard 13](13-responsive-and-adaptive-design.md) R4 for the responsive form of this.

### R8 — Stale data MUST be marked

Where a surface may display data known to be out of date, it MUST indicate that. Informed by
[NN/g heuristic 1 "Visibility of System Status"].

### R9 — Disabled and read-only MUST be distinguishable, and disablement MUST be explainable

A disabled control MUST NOT be indistinguishable from a read-only one, and a user MUST be able to
learn why a control is disabled. See
[Standard 18](18-destructive-actions-error-prevention-and-recovery.md) R2.

An inert control that appears actionable and offers no explanation is prohibited; see
[Standard 29](29-design-integrity-prohibitions.md).

## Additions this standard makes beyond the source

- R6's worked failure — a retrieval failure presented as "No results" — is this framework's
  illustration of the source's prohibition on collapsing empty states.
- R2's final sentence, distinguishing deliberate from incidental interaction blocking, is this
  framework's.
- R9 merges §5's `disabled` and `read-only` states with §33's explainable-disablement requirement.
  The source keeps them apart; combining them here avoids a rule whose subject spans two standards.

## Relationship to other standards

[Standard 7](07-component-reuse-and-component-states.md) owns component-level states, a different
subject: a button's loading state is not a screen's loading state.
[Standard 17](17-error-presentation-and-feedback.md) owns the error states R1 lists.
[Standard 22](22-data-heavy-interfaces.md) and [Standard 23](23-search-and-filtering.md) apply R6 to
their surfaces. [Standard 32](32-ui-definition-of-done.md) makes applicable states part of
completion. [Standard 29](29-design-integrity-prohibitions.md) owns the prohibitions R3 and R9 refer
to.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1, R2, R7, R8 | `interaction.states-complete` | `browser-analysis`, partial. `not-evaluated` in v1.0.0. |
| R3, R4 | `design-integrity.no-fake-progress` | `manual-review`, none. Forbidden, non-exemptible. Attestable. |
| R5, R6 | `interaction.empty-states-differentiated` | `manual-review`, none. Attestable. |
| R9 | `interaction.states-complete`, `design-integrity.no-inert-controls` | The second is `browser-analysis`, forbidden. |
