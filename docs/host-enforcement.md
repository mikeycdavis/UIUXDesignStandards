# Host enforcement, and what "governed" is allowed to mean

Whether this repository's rules are *enforced* is a fact about GitHub, not about any file here. This
document defines what would have to be true for that claim to be established, what each control's
evidence is, and — the part that matters most — what must be reported when the evidence cannot be
read at all.

Nothing here changes a repository setting. This is the contract; collecting against it and turning
controls on are later, separately authorized steps. See
[artifacts/project-plan-breakdown/17-host-enforcement.md](../artifacts/project-plan-breakdown/17-host-enforcement.md).

---

## 1. What is already established, and what is not

The submission workflow has been demonstrated on three surfaces, each of which found defects the
other two could not (see [docs/local-ci.md](local-ci.md) §9). None of that is evidence of enforcement.
The distinction the whole milestone rests on:

```text
workflow file exists      ≠  hosted check executed
hosted check executed     ≠  hosted check required
hosted check required     ≠  bypass prevented
```

The first two are established on real evidence. The last two are not, and this document owns them.

Stated plainly, and left visible rather than resolved by optimism:

> Submission discipline is established; host enforcement is not.

The tooling refuses to publish an unverified commit and refuses to touch the default branch. That is
evidence about this tooling's behaviour. It is not evidence that GitHub would stop a different actor,
a different tool, or the same maintainer in a hurry.

---

## 2. The seven controls

Each is defined in [scripts/governance.mjs](../scripts/governance.mjs) as data, so the collector reads
the contract rather than reimplementing it.

| Control | Requires | Evidence source |
| --- | --- | --- |
| `main.pr_required` | Changes to `main` arrive by pull request | branch protection or ruleset |
| `main.standards_check_required` | The hosted `standards` check is required, on the commit being merged | branch protection or ruleset |
| `main.force_push_prohibited` | Force pushes to `main` are prohibited | branch protection or ruleset |
| `main.deletion_prohibited` | Deletion of `main` is prohibited | branch protection or ruleset |
| `tags.v_star_immutable` | Published `v*` tags cannot be updated or deleted | tag ruleset |
| `bypass.policy` | No routine bypass; emergency bypass is observable | ruleset bypass actors |
| `main.review_required` | At least one approving review before merge | branch protection or ruleset |

Two of these deserve their exact wording defended.

**`main.standards_check_required` says "on the commit being merged" deliberately.** A required check
that passed on some earlier commit of the branch is not a required check on the merge; it is a green
tick inherited from a tree that is no longer the one being merged. This is the same substitution the
`submit-pr` invariant already refuses locally, appearing again one layer up.

**`bypass.policy` is about observability, not only about prohibition.** A control that every merge
bypasses is not a control. Worse, a bypass that leaves no visible trace produces a record claiming an
enforcement that did not occur — a false green of exactly the kind this framework exists to prevent.
If GitHub's model requires an emergency bypass path, it must be visible, and a consumer must treat a
merge that used it as a governance event rather than as an ordinary enforced merge.

---

## 3. The state machine

Three states, and the aggregate is **derived** from control-level results rather than asserted
alongside them:

```text
GOVERNED        every required control was read, and every one is established
UNGOVERNED      every required control was read, and at least one is absent
INDETERMINATE   host state could not be established well enough to decide
```

Per-control, also a closed set: `SATISFIED`, `ABSENT`, `UNREADABLE`. Every observation carries its
evidence source and whether that source was actually read.

The prohibition that produces the third state, inherited from the source enforcement architecture:

```text
API call failed → assume required → GOVERNED     ← manufactures evidence
API call failed → assume missing  → UNGOVERNED   ← also manufactures evidence
```

Both are forbidden. `UNREADABLE` is therefore a first-class result rather than an error discarded at
the edge.

### Four refusals

1. **A conclusion drawn from a source that was not read is not a conclusion.** An observation claiming
   `SATISFIED` while reporting that its evidence was not read is downgraded to `UNREADABLE`. It is
   cheaper to refuse this centrally than to trust every future collector to be honest.
2. **Silence must not shrink the conjunction.** A required control that no observation mentions is
   `UNREADABLE`, not skipped. Otherwise a collector that learned to omit what it could not read would
   turn every failure into a pass, and the aggregate would improve as the evidence got worse.
3. **Unreadability outranks absence.** If one control is absent and another could not be read, the
   answer is `INDETERMINATE`, not `UNGOVERNED`. Reporting `UNGOVERNED` would claim to know the full
   set of what is missing, and it does not. `UNGOVERNED` is a positive finding about a fully read
   host, not a shrug.
4. **An unrecognised control id cannot satisfy the contract**, and neither can an unrecognised result
   value. Both become `UNREADABLE` rather than being counted favourably.

Every one of these, plus the positive control — without which "never says `GOVERNED`" would satisfy
all of them — is asserted in [test/governance.test.mjs](../test/governance.test.mjs).

---

## 4. What a consumer does with each state

`INDETERMINATE` is not a failure and not a pass. For StandardsEnforcer it must never enter the closed
passing set, and must remain distinguishable from `UNGOVERNED`: the first says the host could not be
inspected, the second says the host was inspected and lacks controls. Collapsing them would lose the
only signal that distinguishes a broken collector from an unprotected repository.

---

## 5. One open decision: `main.review_required`

Every other control follows fairly directly from the governance goal. Review count is a policy choice,
and this repository's circumstances make it non-obvious.

**The recommendation on record is one approving review**, on the reasoning that a repository defining
governance which downstream projects trust should separate author from merger — and not two, absent a
real two-reviewer operating model to support it.

**The obstacle is mechanical.** This repository has a single collaborator, and GitHub does not permit
approving your own pull request. Requiring one approval would make every pull request authored by the
sole maintainer mergeable *only* by admin bypass. That does not merely inconvenience the workflow: it
makes bypass the routine path, which directly contradicts `bypass.policy` and destroys the value of a
bypass signal by making it fire on every merge. A control that forces a second control to be violated
is not a strengthening.

Three resolutions, and the choice is the owner's:

| Option | Effect |
| --- | --- |
| **A — defer** (current) | `review_required` is modelled, collected, and reported, but outside the conjunction, with the reason recorded. `GOVERNED` remains reachable today. The gap stays visible rather than being quietly dropped. |
| **B — require, and add a second maintainer** | The policy is honoured as written. Blocked on a real second reviewer existing; requiring it before that would be requiring a bypass. |
| **C — require, and accept admin bypass** | Not recommended. It buys the appearance of review while making the bypass record meaningless. |

The module currently implements **A**, with the reason recorded in the control itself rather than as a
comment. Deferring a control is a decision with a reason attached; it is never a silent omission, and
the deferred control is still read and still reported.

---

## 6. What this document does not establish

It defines the contract. It does not collect evidence, and it does not change any setting. The
collector, the dogfood run against this repository as it stands today — which should report
`UNGOVERNED` with the missing controls enumerated, since that is currently the truth — the authorized
settings change, the re-read, and the drift controls are all later steps in
[artifacts/project-plan-breakdown/17-host-enforcement.md](../artifacts/project-plan-breakdown/17-host-enforcement.md).
