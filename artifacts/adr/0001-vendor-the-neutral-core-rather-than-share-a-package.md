# 0001 — Vendor the neutral core rather than share a package

- **Status:** Accepted
- **Date:** 2026-08-10
- **Deciders:** Project owner

## Context

Four files in [EngineeringStandards](../../../EngineeringStandards) contain no engineering-specific
logic at all: `scripts/catalog.mjs` (189 lines) loads and validates a rule catalog,
`scripts/compliance.mjs` (361 lines) turns catalog plus policy plus findings into a verdict,
`scripts/yaml.mjs` (229 lines) parses a strict YAML subset, and `scripts/jsonschema.mjs` (185 lines)
evaluates a closed subset of JSON Schema. Together they are the machinery every standards pack in
this family needs and none of them mentions a domain.

Eight sibling standards repositories already exist. Every one of them carries its own copy.

The obvious objection is that this is duplication, and that a shared package — `@standards/core`,
vendored once and depended on — would be the disciplined choice. It has to be answered before the
ninth repository repeats the pattern, because answering it later means either living with a
decision nobody made or migrating nine repositories at once.

## Decision

**Each standards repository vendors its own copy of the neutral core. There is no shared package.**

The copies are permitted to diverge, and this repository's copies do diverge: new validation types,
a five-way assurance breakdown, new dispositions, and an evidence input that EngineeringStandards
has no concept of.

Four reasons, in order of weight.

**A shared package would be this repository's first dependency.** The zero-dependency rule is not
an aesthetic preference here; it is what makes `npm test` and `npm run validate` run identically on
a developer's machine, in CI, and inside a consuming project that checked this repository out at a
pinned ref, with no install step and no lockfile to drift. Introducing dependency infrastructure to
solve a duplication problem that costs about 960 lines is a bad trade, and the first dependency is
the expensive one because it brings the resolution machinery with it.

**Pinned immutability and a shared engine are in tension.** A consuming project pins
`UIUXDesignStandards@<sha>` and is entitled to assume that ref evaluates identically forever. If
the evaluator lived in a separate package, the pinned ref would name only half the system and the
other half would carry its own version axis, free to move underneath a supposedly immutable
contract. Vendoring makes the pinned sha name the whole evaluator.

**Divergence is required, not incidental.** This repository needs `browser-analysis` and
`visual-analysis` validation types, an assurance breakdown with five buckets rather than three,
dispositions for evidence that was attempted and failed, and a `compliance.mjs` that accepts
ingested browser evidence. A shared package would need every one of those as configuration or as a
conditional branch that EngineeringStandards never exercises. "Shared" would become "forked with
extra ceremony" on the first real requirement.

**The precedent is established and consistent.** Eight repositories already vendor. A ninth that
does something else creates two architectures in one family, and the burden of proof is on the
departure.

## Alternatives considered

**A shared npm package (`@standards/core`) depended on by every pack.** Rejected. It inverts the
dependency rule the whole family is built on, adds a second version axis under pinned refs, and
would immediately need per-pack extension points for the divergences above. The duplication it
removes is small and stable; the coupling it adds is neither.

**A git submodule or subtree carrying the core.** Rejected. It avoids the npm dependency but keeps
the second version axis and adds a checkout step that consuming CI would have to get right —
`actions/checkout` does not fetch submodules by default, so the failure mode is a pack that appears
to work and silently evaluates nothing.

**Copy the files and forbid divergence, treating drift as a defect.** Rejected. It is the worst of
both: the maintenance burden of a shared component with none of the enforcement, and it forbids
exactly the changes this repository must make. A rule nobody can follow is not a rule.

**Generate the core files from a template at release time.** Rejected. It makes the committed
source a build artifact, which breaks the property that reading `scripts/` tells you what runs.

## Consequences

**Makes easier.** Zero-dependency operation everywhere, including inside consuming repositories at
a pinned sha. Local modification of the evaluator without coordinating across nine repositories.
Reading the whole system from one checkout.

**Makes harder.** A fix to a genuine bug in `yaml.mjs` or `jsonschema.mjs` has to be carried to
nine repositories by hand, and nothing mechanically notices when one is missed. Improvements to
`compliance.mjs` made here do not reach EngineeringStandards.

**Commits the project to.** Treating the vendored files as this repository's own source from the
moment they land — reviewed, tested, and modified here, not tracked upstream. The provenance is
recorded once, in this ADR and in each file's header comment, and never becomes a claim that the
copies stay identical.

**Known cost accepted.** Roughly 960 lines duplicated per repository, and a class of bug that must
be fixed nine times. This is the price of the dependency rule, and it is paid deliberately rather
than discovered.
