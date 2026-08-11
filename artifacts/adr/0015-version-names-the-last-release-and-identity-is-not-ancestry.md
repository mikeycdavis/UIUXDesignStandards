# 0015 — Kept VERSION at the last release, and split release identity from historical continuity

- **Status:** Accepted
- **Date:** 2026-08-11
- **Deciders:** repository owner

## Context

v1.0.0 was tagged at `8353469` and published. The release-readiness checker gained a criterion,
`release.the-tag-agrees-with-this-tree`, which requires `HEAD == v1.0.0^{commit}` exactly. That was
correct for verifying the release artifact, and it created a problem for the day after: the moment any
commit lands on top of the tag, the criterion fails.

The obvious answer — bump `VERSION` to something like `1.1.0-dev` so the tree stops claiming to be
1.0.0 — was checked against the rest of the standards family before being adopted, and the family
turned out to have a settled convention that contradicts it:

| Repository | `VERSION` | Latest tag | Commits past the tag |
| --- | --- | --- | --- |
| MathematicsStandards | `1.0.1` | `v1.0.1` | 14 |
| MachineLearningStandards | `1.5.0` | `v1.5.0` | 2 |
| FinancialStandards | `1.1.0` | `v1.1.0` | 0 |
| HealthAndFitnessAndNutritionStandards | `1.0.0-dev` | *none* | — |

`VERSION` names the **last released** version and stays there while development continues; it moves
when the next release is cut. The `-dev` suffix exists, but it means "working toward a first release
that has not happened yet", which is why the only repository using it has no tags at all. Adopting
`1.1.0-dev` after v1.0.0 would have invented a convention in conflict with three siblings.

That leaves the real defect where it always was: not in the version, but in what the criterion was
asking. It was answering two questions with one comparison.

The tempting repair was to accept an ancestor tag as agreement — `merge-base --is-ancestor` is true
for every ordinary post-release commit, so the criterion would go quiet. It was rejected on the
grounds that decided the whole design: **ancestry does not establish tree identity.** It proves the
release is somewhere behind us. It is equally true of a tree that has rewritten every file since the
tag, so a documentation commit, a plan-status edit, and a total rewrite would all report "this is the
v1.0.0 tree".

## Decision

**`VERSION` identifies the latest released standards version, not the current development tree.**
After a release, development advances while `VERSION` stays put. No `-dev` suffix post-release.

**Two propositions, two git relations, no substitution.**

| Proposition | Relation | Criterion |
| --- | --- | --- |
| Is this tree the released artifact? | equality — `HEAD == tag^{commit}` | `release.the-tag-agrees-with-this-tree` |
| Does this line still contain the release? | ancestry — `merge-base --is-ancestor` | `release.current-line-descends-from-latest-release` |

`resolveRelease` resolves the tag into two independent facts. `release` — `RELEASED`,
`NOT_RELEASED`, `UNKNOWN` — is a property of the *version* and does not change with what is checked
out: v1.0.0 is released regardless. `tree` is a property of *this checkout*:

```text
tag absent                        → UNRELEASED_CANDIDATE       both criteria satisfied
HEAD == tag^{commit}              → RELEASE_TREE               both criteria satisfied
tag is an ancestor of HEAD        → POST_RELEASE_DEVELOPMENT   identity NOT_APPLICABLE, continuity satisfied
tag exists, is not an ancestor    → RELEASE_HISTORY_DIVERGED   both criteria FAILED
git could not answer              → UNKNOWN                    both criteria FAILED
```

`POST_RELEASE_DEVELOPMENT` reports the identity criterion `NOT_APPLICABLE` rather than `SATISFIED`,
because the tree is not the artifact and saying otherwise is the falsehood the split exists to
prevent. `UNRELEASED_CANDIDATE` satisfies rather than fails: demanding the tag in order to permit the
tag is a circular gate, and the predictable consequence of one is that somebody tags first and runs
the gate afterwards.

**`NOT_APPLICABLE` is governed by a recorded condition,** in an `APPLICABILITY_POLICY` table with the
same fail-closed shape as `GAP_POLICY`. A criterion not listed there that reports `NOT_APPLICABLE`
gets `NOT_EVALUATED`, which never satisfies. "This does not apply to us" is the oldest way to pass a
check without meeting it, and an ungoverned inapplicability is a waiver wearing a technical name.

**Equality establishes artifact identity. Ancestry establishes historical continuity. Neither may
substitute for the other.**

## Alternatives considered

**Post-release `x.y.z-dev` versions.** Rejected: it contradicts the established standards-family
convention, where `VERSION` names the last release and three sibling repositories are already living
in that state. `-dev` in this family means "no release yet", and reusing it for "released, now
working on the next" would give one marker two meanings.

**Treat an ancestor tag as agreement with HEAD.** Rejected: ancestry does not establish tree
identity. It would pass a tree with every file rewritten since the release, which is precisely the
false green the checker exists to catch, arriving through a weakened comparison. This is now a
registered falsifier — substituting the ancestor test for the equality test must be caught by the
suite.

**Require HEAD to remain at the release tag while `VERSION` is unchanged.** Rejected: it makes
ordinary post-release development fail the gate permanently. A warning that always fires is one
people stop reading, and the first thing anybody would do about it is delete the criterion.

**Fix it inside v1.0.0 before publishing.** Rejected: the defect does not exist in `8353469`. That
implementation already requires exact equality and already fails on a descendant commit, which is
the property that protected the release. This is a post-release model improvement prompted by the
first real release lifecycle, and it belongs after the tag rather than retroactively inside it.

**One criterion with a compound condition.** Rejected: the name
`release.the-tag-agrees-with-this-tree` states a proposition about identity, and a criterion whose
name says one thing while its implementation checks another is how the original defect arose.

## Consequences

**Makes easier.** Ordinary development after a release is a first-class state with a name, so the
gate stays green without anyone weakening it. All four statements a post-release repository needs to
make — latest release, commits ahead, history preserved, this tree is not the release tree — are
simultaneously reportable and simultaneously true. The bookkeeping commit that closes a release no
longer needs a version invention to be legal.

**Makes harder.** There are now two release criteria to reason about rather than one, and a reader
must hold the distinction between equality and ancestry to understand why both exist. `NOT_APPLICABLE`
is a fourth thing a criterion can report, and every new criterion that wants it must argue for it in
`APPLICABILITY_POLICY`.

**Commits the project to.** Answering each proposition with the relation that can actually establish
it. `VERSION` moving only at a release. Chronology continues to use ordering and ancestry for the
question those genuinely answer — *did A precede B?* — and release identity continues to use equality
for *is A exactly B?*; reusing one relation for both propositions is the type error this decision
exists to prevent, and the two live in separate modules so the mistake has to be made deliberately.

**Known cost accepted.** Between a release and the next version bump, `release.the-tag-agrees-with-this-tree`
reports `NOT_APPLICABLE` and therefore establishes nothing about HEAD. That is honest and it is also a
reduction in coverage: the only tree the identity check ever verifies is the release tree itself,
which is exactly when someone would think to run it and exactly when they might not.
