# 0012 — The schema validates representable shape; policy.mjs validates cross-field semantics

- **Status:** Accepted
- **Date:** 2026-08-10
- **Deciders:** Project owner

## Context

The `ui` block in `project-policy.yml` carries several requirements that depend on the value of
another field:

```text
applicability: no-ui            → every other ui subkey is forbidden
applicability: anything else    → accessibility.target is required
applicability: multi-platform   → platforms must have at least two entries
applicability: web-ui|mobile-ui → viewportClasses is required and non-empty
localization.required: true     → locales is required and non-empty
designSystem.strategy: none-justified → justification is required
```

In full JSON Schema these are `if`/`then` or `oneOf` constructs. The schema evaluator this
repository vendors ([ADR 0001](0001-vendor-the-neutral-core-rather-than-share-a-package.md)) supports
a closed keyword set and none of those keywords is in it:

```text
$schema $id $ref $defs title description type required properties
additionalProperties propertyNames pattern enum const minLength items minItems format
```

`scripts/jsonschema.mjs` throws on an unsupported keyword rather than ignoring it, which is the
right design — a validator that silently skips what it does not understand reports success it never
established. But it means the conditional requirements cannot be written into the schema document
without first extending the evaluator.

Extending it is the tempting move and the wrong one. Every added construct is more surface in a
hand-written evaluator whose correctness nothing else checks, and the failure mode is severe and
quiet: a schema that *reads* as though it enforces a conditional while the evaluator's
implementation of that conditional is subtly wrong would produce exactly the false green this
framework exists to prevent. The accessibility-target requirement
([ADR 0008](0008-an-applicable-ui-declares-its-accessibility-target.md)) is the most important
single check in the policy layer; it should not be the first customer of a new code path in a
bespoke schema engine.

## Decision

**Validation is split across two layers with an explicit boundary:**

> The schema validates representable shape. `scripts/policy.mjs` owns cross-field semantic
> invariants that the supported schema vocabulary cannot express.

**Layer 1 — JSON Schema.** Structure, types, closed enumerations, patterns, and
`additionalProperties: false` at the root and in every `$defs`. This catches an unknown top-level
key, an unknown `ui` subkey, a misspelled applicability class, a rule id in camelCase, and a
malformed date. Some semantics fall out of the vocabulary for free: `accessibility.target: none` is
rejected because `none` is not in the enum, so it needs no separate check and no separate fixture.

**Layer 2 — `scripts/policy.mjs`.** The six cross-field invariants listed above, evaluated after
the document validates structurally.

**Layer 2 failures are configuration errors: exit 2.** They are not compliance findings and not
exit 1. A policy that is internally inconsistent has not been configured correctly, and the
framework has reached no verdict about the project — the same reasoning that keeps a malformed
policy at exit 2 in EngineeringStandards, where collapsing "the validator could not proceed" into
"the project failed" teaches CI to weaken the check.

This keeps the existing three-way exit contract intact:

```text
0  valid
1  valid, but a compliance condition fails (expired exception, non-exemptible exception, conflicting classification)
2  unreadable, schema-invalid, or semantically invalid configuration
```

**Every cross-field invariant carries a known-negative policy fixture**, and the
accessibility-target invariant additionally carries a mutation test: remove the target from an
otherwise-valid policy and `policy.mjs` must exit 2. An invariant with no fixture that fails against
it proves nothing.

**A meta-test asserts that every keyword used in this repository's schemas is in the evaluator's
supported set.** If the schema ever grows a keyword the evaluator does not implement, the test fails
rather than the keyword being silently ignored.

**Extending `jsonschema.mjs` remains possible, deliberately.** If a future requirement genuinely
needs a construct, the evaluator gains it with its own tests, as an explicit decision. What this ADR
forbids is extending it *incidentally*, to make one policy document typecheck.

## Alternatives considered

**Extend `jsonschema.mjs` with `if`/`then`/`else` and `oneOf`.** Rejected for v1.0.0. It puts the
framework's most important configuration check on new, unproven code in a bespoke evaluator, and the
failure mode — a conditional that appears enforced but is not — is the worst class of bug this
project can ship.

**Adopt a real JSON Schema library.** Rejected. It is a dependency, and the zero-dependency rule is
what lets this framework run at a pinned sha with no install step.

**Express the invariants as compliance rules with catalog ids.** Rejected. A malformed policy is not
a failing project. Worse, a compliance rule is subject to policy applicability and exceptions, so a
project could declare the check that validates its own policy to be not applicable.

**Leave the invariants unenforced and document them.** Rejected. That is how the accessibility
target becomes optional in practice, which reverses ADR 0008 by omission.

**Duplicate each invariant in both layers for defense in depth.** Rejected. Two implementations of
one rule can disagree, and then something has to arbitrate. One owner per concept.

## Consequences

**Makes easier.** The schema stays inside a vocabulary the vendored evaluator provably implements.
Conditional requirements are written in ordinary JavaScript, where they can be read, tested, and
given precise error messages naming the field and the condition.

**Makes harder.** Policy validity is no longer knowable from the schema document alone; a reader
must also read `policy.mjs`. Standard 34 and `INSTRUCTIONS.md` therefore state the cross-field
invariants explicitly rather than pointing at the schema.

**Commits the project to.** Keeping the boundary honest — a semantic invariant belongs in
`policy.mjs`, and the schema never grows keywords to absorb one. Keeping the fixture set complete,
since Layer 2 has no schema to fall back on.

**Known cost accepted.** An external consumer that validates `project-policy.yml` with a standard
JSON Schema tool will accept documents this framework rejects. Their tool is checking shape; only
`policy.mjs` checks the contract.
