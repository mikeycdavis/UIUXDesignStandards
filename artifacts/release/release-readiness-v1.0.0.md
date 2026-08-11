# Release readiness — v1.0.0

> Observed on **2026-08-11** by `npm run release:readiness`. This document records what was
> demonstrated, what was not, and the difference between the two. It is not a summary of the checker's
> output — it is the release record the checker reads back, which is why the gaps below are load-bearing
> rather than commentary: remove one and the checker stops reporting the corresponding criterion as a
> recorded gap and reports it as a failure instead.

## The three release states

These are kept distinct throughout. Collapsing them is how a checklist starts lying.

| State | Means | v1.0.0 |
| --- | --- | --- |
| `IMPLEMENTED` | The artifact or the code exists | Yes |
| `VERIFIED` | The acceptance claim was demonstrated | Yes, with the one gap below |
| `RELEASED` | An immutable tag exists | Read from git, not from this document |

At the time of this observation the tag did not exist, and the checker printed:

```
v1.0.0 implementation: VERIFIED
v1.0.0 release:        NOT_RELEASED
```

**That line is not a claim this document makes.** `scripts/release-readiness.mjs` resolves the release
state by looking the tag up — `RELEASED` when it points at the commit being assessed, `NOT_RELEASED`
when no such tag exists, `RELEASED_AT_ANOTHER_COMMIT` when it exists but points elsewhere, and
`UNKNOWN` when git could not answer, which is deliberately not the same as "no tag". So the way to
find out whether v1.0.0 is released is to run the checker, not to read this line. Any document that
records a release state as a constant is telling you what was true when it was written.

An absent tag **satisfies** that criterion. Requiring the tag in order to say the tag may be created
would be circular, and the predictable consequence of a circular gate is that someone tags first and
runs the gate afterwards. The criterion fails only on a tag that exists and disagrees with this tree —
which would mean the artifacts here are not the ones v1.0.0 released.

Tagging changes nothing else. It moves no rule, no snapshot, no attestation, and no readiness
exception; a test asserts the verdict is the same either side of the tag.

## Criteria

Every row is produced by `scripts/release-readiness.mjs`, which consumes evidence rather than
manufacturing it. `NOT_EVALUATED` never satisfies a criterion.

| Criterion | Command | State |
| --- | --- | --- |
| The catalog loads and holds exactly the identities the freeze authorises | `npm run release:readiness` | `SATISFIED` |
| The released catalog snapshot still describes the catalog | `npm run release:readiness` | `SATISFIED` |
| Every forbidden rule is fixture-proved or visibly typed to an unbuilt surface | `npm run release:readiness` | `SATISFIED` |
| This repository's own policy is valid configuration | `npm run policy` | `SATISFIED` |
| Gate 1 classifies this repository `NOT_APPLICABLE` from evidence | `npm run applicability:self` | `SATISFIED` |
| The framework's own process rules pass under its own evaluator | `npm run validate` | `SATISFIED` |
| The full suite, falsifiers included, runs and passes | `npm test` | `SATISFIED` |
| Every registered invariant names a record and a defending test | `npm run release:readiness` | `SATISFIED` |
| `VERSION`, `package.json`, and the changelog's top entry name one version | `npm run release:readiness` | `SATISFIED` |
| No plan item is still recorded `BLOCKED` | `npm run release:readiness` | `SATISFIED` |
| Git history shows rule identity frozen before the detectors that bind to it | `npm run release:readiness` | `RECORDED_GAP` |

## The recorded gap

A gap is not a failure and it is not a pass. It is a claim this release does not make, written down
so that nobody later assumes it was made. There is one, and it is the only kind that may be carried
into a release: evidence that cannot now be recovered honestly. The section after it records a second
candidate that was resolved instead of recorded, and why the distinction is enforced mechanically.

### Chronology — `NOT_ESTABLISHED`

**The claim that is not established:** that Git history shows
`artifacts/design/rule-catalog-v1.md` entering the repository before the first commit introducing
detector bindings.

**Why it is not established:** sections 00–12 were built in one uncommitted working tree and are
committed together as the release candidate. `scripts/chronology.mjs` therefore resolves `SAME_COMMIT`
— both anchors enter history in the same commit, and **Git records no ordering between two changes in
one commit**. There is nothing to read, and a naive `freeze <= detectors` timestamp comparison would
report this as satisfied off two equal timestamps, which is exactly why `SAME_COMMIT` is not treated
as a pass.

Before that commit the state was `NO_HISTORY`, and the gap was the same gap. Committing did not
create the evidence and was never going to.

**What is true instead.** The work was genuinely performed in that order — the freeze was written and
reviewed before any detector existed, and `scripts/rule-identity.mjs` enforces the property the
ordering was a proxy for, reconciling prose → freeze → catalog and failing on any identity that
originated outside the corpus. That is enforcement by content, and it holds today. It is not the same
evidence as history, and this record does not pretend it is.

**What would have established it, and why it was not done.** Committing the work in intentional
stages — the freeze and the corpus in an earlier commit than the detector bindings. That option was
considered and **declined by the owner on 2026-08-11**, on the grounds that arranging commits after
the fact to produce a favourable history would blur *development happened in this order* with *Git
proves it happened in this order*. The second is the claim the invariant is about, and it cannot be
manufactured by staging commits retroactively without becoming the first claim wearing the second's
clothes.

**Status:** `NOT_ESTABLISHED`, permanently, for this development history. It is not `VERIFIED`, v1.0.0
does not claim it, and it will not be retrofitted. A future repository built commit-by-commit will
resolve `ORDERED` and the criterion will be `SATISFIED` on its own evidence; this one will not, and
`GAP_POLICY` records that as an accepted limitation rather than letting it pass quietly.

## Resolved before release, not carried into it

### Two forbidden rules claimed an evidence surface no implementation could reach

The checker's first run reported `design-integrity.no-fake-progress` and
`accessibility.no-inaccessible-custom-controls` as `forbidden`, typed `code-analysis`, with no
detector. That was initially written into this record as a second recorded gap. **It was rejected on
review and resolved instead**, and the reasoning is worth keeping, because it is what a recorded gap
is for.

A gap is appropriate where the missing evidence cannot now be recovered honestly. The chronology
above qualifies: the only way to produce that evidence would be to rearrange history until it agrees.
These two rules did not qualify. Nothing false was being produced — both reported `not-evaluated` and
capped the verdict — but the catalog was claiming an evidence surface that no implementation
honoured, and that is a present-tense contract defect somebody could still fix. Recording it
accurately would have turned `RECORDED_GAP` into a general-purpose release waiver.

Each rule was decided on the epistemic question separately, and the answers differed:

| Rule | Can repository-static evidence establish it? | Resolution |
| --- | --- | --- |
| `accessibility.no-inaccessible-custom-controls` | Yes — role, focusability, and key handling are all attributes on the element | A thirteenth detector, with its `never-violations`/`never-clean` fixture pair. No catalog change. |
| `design-integrity.no-fake-progress` | No — whether a number is a measurement is a question about the work, not about the code that renders it | Re-typed `code-analysis`/`partial` → `manual-review`/`none`. It becomes attestable. |

ADR 0014 records both decisions and why neither was taken for the release's convenience. The checker
now reports `forbidden.every-rule-is-accounted-for` as `SATISFIED`, and would report `BLOCKING_GAP` —
not `RECORDED_GAP` — if either regressed.

### Why a frozen artifact changed before the release it describes

`artifacts/design/rule-catalog-v1.md` was frozen on 2026-08-10 and amended on 2026-08-11. That needs
explaining rather than absorbing, because a freeze that moves quietly is not a freeze.

*Frozen* here means an identity may not change without a decision recorded in writing. It does not
mean an error found before the first release must ship in order to preserve the appearance of
stability. A released rule's validation type is a published contract that adopters pin against, so
this is the last moment at which the correction is free. The amendment is recorded in the freeze
itself with its date and its ADR; `scripts/rule-identity.mjs` reconciles prose → freeze → catalog and
would have rejected an edit to either side alone; and the frozen catalog snapshot
`artifacts/release/catalog-v1.0.0.json` was regenerated deliberately as a consequence — deleted and
rewritten through the one-time `--write-snapshot` path, never by a validation run. Its digest is
`441636ab6456…` over 70 rules.

### The two kinds of gap are now mechanical

`GAP_POLICY` in `scripts/release-readiness.mjs` names the criteria permitted to carry an accepted
limitation, with the reason each one qualifies. Every other criterion reporting a gap gets
`BLOCKING_GAP`, and a `BLOCKING_GAP` makes the release `NOT_READY` however accurately it is written
down. Adding a criterion therefore cannot grant it a waiver by accident, and the mutation that lets
any criterion grant itself one is a registered falsifier.

## What v1.0.0 does not claim

Beyond the two gaps above, and stated here because a release record that only lists successes is a
marketing document:

- **No external UI project has exercised these detectors.** Their false-positive thresholds are
  designed, not calibrated. Plan section 14 is that work.
- **No browser evidence has ever been ingested from a real producer.** The contract is verified against
  fixtures; the producer is plan section 15.
- **A clean self-verdict certifies scope honesty, not UI quality.** This repository has no UI, so its UI
  rules are `not-applicable` with the reason recorded, and only its process rules are actually
  evaluated.

## The tag

`v1.0.0` is not created by this checker, by `npm test`, or by CI. It is a separate, explicit,
owner-performed Git operation, taken after reading this record and accepting the recorded gap above.
