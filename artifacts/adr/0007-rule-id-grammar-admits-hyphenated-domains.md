# 0007 — The rule-id grammar admits hyphenated domains, and two domains join the mandated set

- **Status:** Accepted
- **Date:** 2026-08-10
- **Deciders:** Project owner

## Context

The source prompt (§46) mandates domain prefixes for rule identities:

```text
accessibility.*  interaction.*  responsive.*  navigation.*  forms.*  content.*
design-system.*  visual.*  motion.*  performance.*  privacy.*  ai-ux.*  design-integrity.*
```

and prohibits a catch-all `ui.*` where a specific domain owns the rule.

EngineeringStandards enforces rule identity with one regex, written identically in
`scripts/catalog.mjs` and in the policy schema's `$defs/ruleId`:

```text
^[a-z][a-z0-9]*(\.[a-z0-9]+(-[a-z0-9]+)*)+$
```

The first segment permits letters and digits only. `design-system` and `design-integrity` are fine
— hyphens are legal after the first dot — but `ai-ux.no-generated-as-verified` cannot validate,
because the hyphen falls in the domain segment. A mandated prefix is unrepresentable in the
inherited grammar.

Two further gaps appeared while mapping the prompt's requirements onto domains. Localization (§18)
has no home in the mandated list; forcing it into `content.*` would put string expansion, RTL
layout, and locale-aware sorting under a domain about copy quality. And the framework needs a small
number of rules about its own evidence discipline — declaring the surfaces a project supports —
which belong to no product domain at all. EngineeringStandards has the same shape: its `meta.*`
category appears in no project-facing domain list either.

## Decision

**Extend the first segment of the grammar to permit hyphens:**

```text
^[a-z][a-z0-9]*(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)+$
```

The change is local to this repository and must appear byte-identically in two places —
`scripts/catalog.mjs` and `schemas/project-policy.schema.json` — following the EngineeringStandards
practice of writing the identity pattern twice and testing that both accept and reject the same
strings. A policy key and a rule id remain the same grammar; camelCase remains unrepresentable.

**Add two domains beyond the mandated thirteen:**

- `localization.*` — the §18 requirements (string expansion, RTL, date/time/number/currency
  formats, pluralization, locale-aware sorting, language switching).
- `evidence.*` — rules about the project's declaration of its own evidence surfaces.

§46 introduces its list with "such as", and its actual prohibition is against an ambiguous
catch-all. Neither addition is a catch-all: each names a specific subject, and neither absorbs a
rule that a mandated domain owns.

**Fifteen domains, one `rules/*.json` file each.**

## Alternatives considered

**Spell the prefix `aiux` and leave the grammar alone.** Rejected. The prompt names `ai-ux.*`, and
silently respelling a mandated identity is the kind of drift the identity discipline exists to
prevent. The grammar is ours to extend; the mandate is not ours to edit.

**Use `ai.ux.*` as a two-level domain.** Rejected. It would make `ai` a domain in this repository
while `ai.*` is already a domain in EngineeringStandards, inviting exactly the cross-repository
identity confusion [ADR 0006](0006-cross-repository-concerns-reference-rather-than-duplicate.md)
works to avoid.

**Put localization rules under `content.*`.** Rejected. The subjects differ — one is about whether
copy is clear, the other about whether the interface survives translation — and they have different
applicability: localization rules are scoped by a policy declaration (`ui.localization.required`)
that has no bearing on content quality.

**Put the evidence-declaration rules under `design-integrity.*`.** Rejected. `design-integrity` is
the must-never layer about honest interfaces; a rule about whether a project declared its supported
viewports is process hygiene, not a prohibition, and mixing them would blur what the forbidden
level means.

**Relax the grammar generally (allow underscores, uppercase, arbitrary depth).** Rejected. Each
additional freedom is another way for two spellings of one rule to both validate. The extension
here is the minimum that makes a mandated identity expressible.

## Consequences

**Makes easier.** Every §46-mandated prefix is spellable exactly as mandated. Localization and
evidence rules get honest homes instead of being filed under a domain that does not describe them.

**Makes harder.** The grammar now differs from EngineeringStandards', so an id valid here may be
invalid there. Any future shared tooling must read each pack's pattern rather than assume one.

**Commits the project to.** Keeping the two copies of the pattern in lockstep — a divergence
between loader and schema would let a policy key validate against one and fail the other, which is
a split identity by another route. A test asserts both accept and reject identically.

**Known cost accepted.** Fifteen domains is more than the mandated thirteen, and every addition
invites the next one. The bar for a sixteenth is that no existing domain owns the subject and the
new name is not a catch-all.
