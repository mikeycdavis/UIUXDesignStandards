# 0003 — UI applicability is established by evidence, in this repository, before compliance runs

- **Status:** Accepted
- **Date:** 2026-08-10
- **Deciders:** Project owner

## Context

Every other standards pack in this family answers one question: does this repository satisfy the
rules? This one has to answer a prior question first, because most repositories in the portfolio
have no user interface at all. A backend API, a CLI, a library, and an infrastructure repository
are all legitimately outside the scope of UI/UX standards. Applying UI rules to them would produce
noise that teaches everyone to ignore the framework.

The naive solution is to let each project declare `no-ui` in its policy and skip. The owner
rejected that in the source prompt, in one sentence that defines this ADR:

> A backend service with no frontend is legitimately not applicable. A React app claiming `no-ui`
> because the UI standards are inconvenient is an adoption failure.

So applicability must be *established*, not asserted. And establishment can fail: a scan can hit a
file cap, a directory can be unreadable, a manifest can be corrupt. The family's validated-search
principle says failure to establish is its own state, never the convenient answer.

Two further questions follow. Where does the classifier live? [StandardsOrchestrator](../../../StandardsOrchestrator)
composes standards authorities and its `design/authority-boundary.md` forbids domain applicability
logic from living there; [StandardsEnforcer](../../../StandardsEnforcer) decides governance and
contains no standards. Neither may own the question of what counts as a UI. And when does it ship?
The original build order placed it after v1.0.0.

## Decision

**The classifier lives in this repository, ships in v1.0.0, and its output is not a rule result.**

**Three classifications, and the rule for reaching each:**

| Classification | Established when |
| --- | --- |
| `APPLICABLE` | At least one positive UI signal is detected. The applicability classes follow from which signal families fired. |
| `NOT_APPLICABLE` | All three hold: the policy explicitly declares `ui.applicability: no-ui`; the scan completed (no file cap hit, no unreadable paths, manifest parseable); and zero contradictory UI signals were found. |
| `INDETERMINATE` | Anything else — an incomplete scan, a declaration contradicted by evidence in either direction, or zero signals with no declaration at all. |

The `NOT_APPLICABLE` conditions are deliberately the strictest thing in the framework, because it
is the state that exempts the entire UI rule surface. A complete scan with zero signals proves
*none of our supported signals were present*, which is not the same claim as *this repository has
no UI* — a server-rendered application, a static HTML site, or a UI stack the classifier does not
recognize would all look identical to it. So absence of signals alone yields `INDETERMINATE`; an
owner must also have said `no-ui`, and the evidence must corroborate rather than contradict them.

**Applicability is never a rule result.** The envelope carries three independent blocks:

```text
applicability        the classification, its signals, and the declared/observed agreement
uiCompliance         Gate 2 over UI-class rules; null when applicability is not APPLICABLE
frameworkCompliance  the evaluation of process rules; always present
```

One field never changes meaning by context. An earlier draft used a single `compliance` field that
carried UI results when a UI existed and process results when it did not; that was rejected because
a downstream adapter would have to know the applicability state to interpret the field it just
read.

**Classifier uncertainty and classifier failure are mechanically separate.** The `applicability`
command exits 0 whenever it produced a classification — including `INDETERMINATE`, because
producing that classification is a successful act of measurement. It exits 2 only when it could not
execute meaningfully. Consumers read the JSON for the classification and never infer it from the
exit code.

**`INDETERMINATE` never yields a compliant UI verdict and never exits 0 from `validate`.**

## Alternatives considered

**Let the policy declaration stand alone.** Rejected by the source prompt. It leaves the framework
with a one-line opt-out and no way to tell a legitimate backend from an inconvenienced frontend.

**Treat zero signals over a complete scan as `NOT_APPLICABLE`.** Rejected on review. It confuses
the limits of the detector with a property of the repository, and it hands out the
whole-surface exemption to any project using a stack the classifier does not yet recognize.

**Put the classifier in StandardsOrchestrator or StandardsEnforcer.** Rejected, and structurally
forbidden. Both repositories are explicitly free of domain knowledge; "what counts as a user
interface" is domain knowledge of exactly the kind their boundary documents exclude. They consume
this classifier's JSON through an adapter instead.

**Ship it in v1.1.0, per the original build order.** Rejected by the owner on review: *"if
applicability is architectural, ship it before the first immutable contract."* A v1.0.0 without it
would encode a governance contract where the consumer decides whether the framework applies, and
changing that in a later release would be a contract change rather than an addition.

**Make applicability a rule (`evidence.ui-applicability-established`).** Rejected. A rule result is
subject to policy applicability, exceptions, and attestations — every one of which is a route to
declaring the applicability check itself not applicable. The gate must sit outside the machinery it
gates.

## Consequences

**Makes easier.** An honest portfolio inventory: every repository lands in a state that reflects
what was actually established. Downstream adapters read three stable fields. A backend repository
is exempted without ceremony once its owner says so and the evidence agrees.

**Makes harder.** `NOT_APPLICABLE` now requires a policy file even for repositories with no UI, so
the exemption costs one deliberate declaration. Projects using an unrecognized UI stack will land
in `INDETERMINATE` until a signal family covers them or their owner declares.

**Commits the project to.** Maintaining the signal families as the ecosystem moves, since a missing
family now produces `INDETERMINATE` rather than a wrong answer. Keeping the three envelope blocks
stable, because external adapters bind to them.

**Known cost accepted.** `INDETERMINATE` will be common early, and it blocks. That is the intended
behavior — an unresolved governance state is visible and someone must resolve it — but it means
adoption starts with work rather than with a green check.
