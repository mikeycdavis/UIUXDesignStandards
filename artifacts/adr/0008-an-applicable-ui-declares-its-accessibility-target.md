# 0008 — An applicable UI declares its accessibility target, and omission is a configuration error

- **Status:** Accepted
- **Date:** 2026-08-10
- **Deciders:** Project owner

## Context

Accessibility rules vary by ambition. A small internal tool and a public regulated service should
both meet a floor, but only one of them is making a WCAG 2.2 AA conformance claim. The policy has
to record which contract the project has adopted, or the evaluator cannot tell which requirements
are in scope.

That leaves the question of what happens when a policy declares a UI and says nothing about
accessibility. Three answers are available and only one of them is honest.

Defaulting to a sensible target creates a provenance problem the owner named precisely:

> Policy says nothing. Framework reports: "Accessibility target: framework-baseline". Now the
> evidence implies the project explicitly adopted a target that nobody actually declared.

Treating it as `INDETERMINATE` misuses that state. `INDETERMINATE` means the framework investigated
and could not establish the truth; here the framework knows exactly what happened — a required
field is absent. And treating it as `NON_COMPLIANT` asserts a violation that has not been
established: nothing about the interface has been examined.

## Decision

**`ui.accessibility.target` is required whenever `ui.applicability` is anything other than
`no-ui`. Omission is a configuration error — exit 2, no compliance verdict.**

The three cases stay separate, and the separation is the decision:

```text
missing required accessibility scope   → configuration error, exit 2
accessibility evidence unavailable     → NOT_EVALUATED / evidence unavailable
accessibility requirement violated     → NON_COMPLIANT
```

**The vocabulary distinguishes the framework's floor from an external conformance target:**

| Value | Meaning |
| --- | --- |
| `framework-baseline` | This framework's universal accessibility floor: focus indication not removed, accessible names where required, keyboard operation for interactive controls, critical state not conveyed by color alone. |
| `wcag-2.1-a`, `wcag-2.1-aa`, `wcag-2.2-aa`, `wcag-2.2-aaa` | The baseline plus the applicable requirements of that external target as represented by this framework. |

`framework-baseline` is the low-friction minimum: a small project declares one line rather than
pretending to a formal conformance program. There is no `none` — the enum does not contain it, so
turning accessibility off is not expressible in a policy for an applicable UI.

**No implicit default.** Absence never becomes `framework-baseline`. `init` may scaffold the value,
but it writes it into the file explicitly, where it becomes the project's own declaration on
adoption rather than a framework assumption reported back as a project fact. For an existing
project, `init` proposes the value without presenting it as historical intent.

**A declared target is a scope declaration, not a conformance claim.** `target: wcag-2.2-aa` means
*evaluate this project against this framework's supported representation of WCAG 2.2 AA*. It does
not mean *this project conforms to WCAG 2.2 AA*, and the output must continue to show the
`notEvaluated` bucket and the evidence surface so the difference stays visible.

**The check lives in `scripts/policy.mjs`, not in the JSON Schema.** The requirement is conditional
on another field's value, which the vendored schema evaluator cannot express; see
[ADR 0012](0012-schema-validates-shape-policy-validates-cross-field-semantics.md). It is one of the
cross-field invariants, and it carries a mutation test: removing the target from a valid policy
must produce exit 2.

## Alternatives considered

**Default to `wcag-2.2-aa` when omitted.** Rejected. It reports a declaration the project never
made, and it holds a project to an external conformance target its owner may never have read.

**Default to `framework-baseline` when omitted.** Rejected for the same provenance reason, even
though the value is modest. A scaffolded-and-committed `framework-baseline` and an
inferred-at-runtime `framework-baseline` are different claims, and the output cannot tell them
apart once the default exists.

**Treat omission as `INDETERMINATE`.** Rejected. That state is reserved for a failed investigation,
and using it here would dilute the one signal that means "the framework could not establish this."

**Treat omission as `NON_COMPLIANT`.** Rejected. Nothing about the interface has been evaluated; the
finding would assert a violation that was never established.

**Allow `target: none` for projects that decline accessibility.** Rejected. An applicable user
interface has users; the floor is not optional. A project that genuinely cannot meet a specific
requirement uses the exception mechanism, which is recorded, owned, and expiring, rather than a
policy field that silently disables a domain.

## Consequences

**Makes easier.** Every applicable UI states its accessibility contract in one greppable place.
Scope is unambiguous before any rule runs, and the three failure classes above never blur.

**Makes harder.** Accessibility scoping fails closed: an adopter cannot get any verdict until they
declare a target. `init` absorbs most of that friction, but a hand-written policy will exit 2 until
the line is added.

**Commits the project to.** Maintaining the target vocabulary as external standards move, and to
keeping every target's meaning "evaluate against our representation of it" rather than "conform to
it."

**Known cost accepted.** One more required field on first adoption, and one more exit-2 an adopter
may meet before their first successful run.
