# 0006 — Cross-repository concerns reference the owning rule rather than duplicating it

- **Status:** Accepted
- **Date:** 2026-08-10
- **Deciders:** Project owner

## Context

This repository and [EngineeringStandards](../../../EngineeringStandards) govern overlapping
territory. The source prompt draws the boundary (§55): EngineeringStandards owns application
capabilities, auditability, structured errors, API contracts, security architecture, and general
engineering quality; this repository owns presentation, interaction, usability, accessibility,
responsive behavior, design-system consistency, interface states, content design, and design/code
consistency.

The overlap is not hypothetical. "The UI must not falsely report success when the underlying
operation failed" is a UI honesty requirement — and EngineeringStandards already owns
`errors.no-false-success`. "Business logic must not exist only inside the UI" is stated in the
prompt (§29) as something this repository should cross-reference rather than redefine. "AI proposal
versus execution" needs a presentation rule here and an authorization rule there.

The prompt is explicit about the failure mode (§32): *"Do not duplicate rule identities across
standards repositories."* Two ids for one requirement means two places to fix it, two verdicts that
can disagree, and no answer to which one governs.

## Decision

**Two tiers, chosen by what the requirement is actually about.**

**Tier 1 — the subject is the underlying capability. This repository mints no rule.**

Where the requirement belongs to the application rather than its presentation, there is no local
rule id at all. Standard 02 names the EngineeringStandards rule and states that this repository
deliberately does not define one. Prompt §29 is the canonical case: whether business logic lives
only in the UI is a question about where code lives, not about how an interface behaves.

This is enforced, not merely stated. Standard 02 carries an explicit list of
deliberately-not-duplicated rules, and a meta-test asserts that no rule in this catalog shadows any
id on that list.

**Tier 2 — the subject is the presentation of a capability the other repository governs. A local
rule exists, carrying an explicit reference.**

A new always-present catalog field:

```json
"crossReferences": [
  { "repository": "EngineeringStandards",
    "ruleId": "errors.no-false-success",
    "relationship": "presentation-of" }
]
```

`relationship` is closed: `presentation-of` (this rule governs how the other rule's subject is
surfaced to a user), `complements` (the two rules address the same concern from different sides),
`defers-to` (this rule's boundary is set by the other's).

The field is metadata and nothing else. Three loader invariants keep it that way:

- A `crossReferences` entry never participates in `resolve()`. Looking up a foreign id in this
  catalog fails, exactly as looking up any unknown id fails.
- It never creates an alias. Aliases are how one canonical id absorbs a former spelling of
  *itself*; a foreign rule is not a former spelling.
- The loader rejects any `crossReferences.ruleId` that collides with a local canonical id or a
  local alias, in both directions and after all files load. One string never names two rules.

The array is present on every rule, empty where there is no reference — the same
present-and-empty discipline the lifecycle fields use, so a consumer can distinguish "no cross
reference" from "a catalog too old to have the field."

**Where the exact foreign id cannot be pinned**, the reference degrades to a standard-number
citation in Standard 02's prose and `crossReferences` stays empty. A reference to an id that does
not exist would be worse than a prose pointer that does.

## Alternatives considered

**Copy the rule with a local id and note the origin in the description.** Rejected — this is the
duplication the prompt prohibits. Two ids drift, two verdicts can disagree, and CI gates on
whichever one it happens to run.

**Import the EngineeringStandards catalog and evaluate its rules here.** Rejected. It makes this
repository a second evaluator for someone else's rules, so a project could be told it fails
`errors.no-false-success` by a framework that does not own that rule and may be pinned to a
different version of it. Composition across packs is
[StandardsOrchestrator](../../../StandardsOrchestrator)'s job.

**Use a free-text `seeAlso` string.** Rejected. Unparseable references cannot be checked, so
nothing would notice when a referenced rule is renamed or removed. The structured form is what
makes the collision invariants possible.

**Let `resolve()` fall through to cross-referenced ids.** Rejected, and it is the tempting mistake.
It would make a foreign id work as a policy key here, which is precisely how a second canonical
identity gets created one layer down.

## Consequences

**Makes easier.** A reader of any rule can see what governs the other side of the boundary. The
prompt's "reference the owning standard rather than copying it" becomes a mechanical property
rather than an editorial intention.

**Makes harder.** Cross-references must be pinned against a real catalog at authoring time and
revisited when EngineeringStandards renames a rule — this repository has no mechanical link to that
catalog and will not notice on its own.

**Commits the project to.** Standard 02 as the single place recording what this repository
deliberately does not own, kept current as the boundary moves.

**Known cost accepted.** A stale `crossReferences` entry is possible and undetectable from inside
this repository. It is metadata, so a stale one misleads a reader without changing a verdict —
which is why the field is barred from `resolve()`.
