# 0005 — Full assurance requires an enumerable subject

- **Status:** Accepted
- **Date:** 2026-08-10
- **Deciders:** Project owner

## Context

`assurance` records what the *current implementation* of a check can establish, as distinct from
what the rule requires. EngineeringStandards uses three values — `full`, `partial`, `none` — and
enforces one constraint mechanically: a rule may not claim `full` assurance while being typed
`code-analysis` or `manual-review`. The reasoning is that pattern matching over source cannot
enumerate every instance of its subject, and a human review establishes a judgment rather than a
proof.

This repository adds two validation types ([ADR 0004](0004-add-browser-and-visual-validation-types-and-keep-not-evaluated-a-disposition.md)),
and the constraint has to be extended before any rule is authored, because `full` on a browser or
visual rule would be the single most damaging false claim the framework could make.

## Decision

**`full` assurance is claimable only by `structural`, `document`, and `configuration` rules.**

The full matrix, enforced imperatively in the catalog loader as a `CatalogError` at load time and
re-asserted by a meta-test over the whole catalog:

| validationType | `full` | `partial` | `none` |
| --- | --- | --- | --- |
| `structural` | legal | legal | legal |
| `document` | legal | legal | legal |
| `configuration` | legal | legal | legal |
| `code-analysis` | **illegal** | legal | legal |
| `browser-analysis` | **illegal** | legal | legal |
| `visual-analysis` | **illegal** | legal | legal |
| `manual-review` | **illegal** | legal (discouraged) | legal (conventional) |

The two new prohibitions each have their own reason.

**Browser evidence is sampling.** A browser run exercises the routes it was given, at the viewports
it was configured with, in the engines that were installed, in the states it managed to reach. A
rule established that way is established *for what was exercised*. The interface is not enumerable
— routes are discovered, states are combinatorial, and a run that visited eight of nine routes
looks identical in shape to one that visited all nine. `partial` is the honest ceiling, and the
`evidenceSurface` block ([ADR 0002](0002-browser-evidence-arrives-by-ingestion-contract.md))
carries the detail of what was actually covered.

**Visual evidence has a stated assurance boundary.** The source prompt (§42) draws it explicitly: a
screenshot can establish what rendered, whether something changed, whether content overlaps, and
whether expected UI is visible. It cannot establish whether hierarchy is good, whether a workflow
is intuitive, whether language is understandable, or whether the design manipulates the user. A
`visual-analysis` rule claiming `full` would assert that the second list had been settled by the
first, and preserving that boundary mechanically — rather than as prose someone must remember — is
what §42 asks for.

`full` survives only where the check's subject is completely enumerable: a file exists or does not,
a configuration key is present with a legal value, a document contains the sections it must. In
those cases the check sees the whole subject, and there is nothing outside its view to be wrong
about.

**Every rule with assurance below `full` carries a `$assuranceNote` explaining what the gap is.**
The constraint above stops dishonest claims; the note is what makes the honest ones legible.

## Alternatives considered

**Permit `full` on `browser-analysis` when the project declares complete route coverage.**
Rejected. It would make a rule's assurance depend on a project's own claim about its routes, which
inverts the architecture: the catalog defines the rule, the policy defines applicability, and
neither may redefine the other. It also converts an unverifiable declaration into a stronger
verdict, which is the family's core prohibition.

**Add a fourth assurance value (`sampled`) for browser evidence.** Rejected as a distinction
without a difference. `partial` already means "establishes some of its subject", and the specifics
of what was sampled belong in `evidenceSurface`, where they can be reported per run rather than
frozen per rule.

**Leave the constraint as documentation for rule authors.** Rejected. EngineeringStandards already
learned that an unenforced authoring convention drifts; the existing `code-analysis`/`manual-review`
constraint is enforced at load for exactly that reason, and the two new types are more tempting to
overclaim, not less.

**Allow `full` on `manual-review` when an attestation is fresh.** Rejected. Freshness is a property
of the attestation on a run, not of the rule; conflating them would make the catalog's assurance
field vary by repository.

## Consequences

**Makes easier.** A reader can trust that `full` means the check saw its whole subject. Overclaim
becomes a load-time error rather than a review comment somebody might miss.

**Makes harder.** Rules that intuitively feel fully checked — "we test focus order on every route"
— cannot say so in the catalog. The detail goes to `evidenceSurface` and `$assuranceNote` instead,
which is more writing.

**Commits the project to.** Never letting sampling or judgment present itself as proof. Any future
validation type must declare its assurance ceiling in this matrix before rules may use it.

**Known cost accepted.** The catalog will show a large `partial` population and few `full` rules,
which reads as a weak framework to anyone who assumes `full` is the target. It is not the target;
it is a claim most honest checks are not entitled to make.
