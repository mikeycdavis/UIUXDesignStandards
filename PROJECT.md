# PROJECT — UIUXDesignStandards

The manifest for anyone working *in* this repository. If you are adopting the framework in your own
project, [INSTRUCTIONS.md](INSTRUCTIONS.md) is the document you want.

## Purpose

A standalone, versioned, machine-readable standards framework governing user interface, user
experience, interaction design, visual design, accessibility, responsive behaviour, design-system
usage, and design implementation quality. A sibling of EngineeringStandards, independently versioned
and independently applicable.

The architectural law it inherits:

> The catalog defines rule identity and metadata. The project policy defines project applicability.
> The evaluator produces evidence. None of the three may redefine the others.

## Standards this repository is itself held to

**This repository has no user interface, and its own UI rules are therefore not applicable to it.**
That is not an assertion in this file — it is a verdict `npm run applicability:self` produces from
repository evidence, and it fails the moment a UI appears here without the policy being updated.

What that self-verdict certifies is **scope honesty, not UI quality**. It says this repository
correctly reports that it is out of scope for the UI rules. It says nothing whatever about whether
the UI rules are any good, because nothing here exercises them against a real interface. That
validation is [section 14](artifacts/project-plan-breakdown/14-real-project-dogfood.md), and it has
not happened.

The rules that **do** apply here are the process rules — `appliesTo: [process]` — and they are
evaluated on every run and reported in `frameworkCompliance`, which is never null. Declaring no
interface exempts this repository from the UI rule surface and from nothing else. There is a test
that proves exactly that: a `no-ui` project with a failing process verdict still exits 1.

This repository is also governed by EngineeringStandards for the concerns that framework owns;
[Standard 02](standards/02-boundary-with-engineering-standards.md) records the boundary and names the
rules deliberately not duplicated here.

## Stack

Node ≥ 18, ESM (`.mjs`), `node:test`. **Zero dependencies** — no `dependencies`, no
`devDependencies`, no lockfile, no `node_modules`, no install step in CI. Four files
(`yaml.mjs`, `jsonschema.mjs`, `catalog.mjs`, `compliance.mjs`) are vendored from EngineeringStandards
and record their provenance in their headers (ADR 0001).

## Commands

```bash
npm test                    # the full suite, including 20 architectural falsifiers (~85s)
```

| | |
| --- | --- |
| `npm run validate` | **the gate** — Gate 0, Gate 1, Gate 2, and the exit code |
| `npm run audit` | evidence discovery: no policy, no status, no verdict |
| `npm run applicability` / `:self` | Gate 1 alone; `:self` asserts this repository's own answer |
| `npm run policy` / `:templates` | that a policy is well-formed and coherent |
| `npm run inventory` | the corpus against its recorded source inventory |
| `npm run provenance` | that every external claim in prose has a citation that resolves |
| `npm run rule-identity` | that prose, freeze, catalog, and provenance name one set of identities |
| `npm run diagrams` | that the architecture diagrams match their canonical source |
| `npm run release:readiness` | the v1.0.0 gate: aggregates every criterion above and reports recorded gaps |

There is deliberately **no** `init` npm script: every other script targets this repository, and one that
scaffolded over the framework's own policy is a footgun with no use. Run
`node scripts/uiux.mjs init <path>` against the project you mean.

## Architectural rules for work here

- **Zero dependencies.** If one appears, the decision changed and needs an ADR.
- **The passing set is closed.** An unrecognised state falls to a non-zero exit, never to success.
- **Rule identity freezes before implementation.** `artifacts/design/rule-catalog-v1.md` is the
  authority; detectors bind to frozen ids and never move them.
- **Detectors report instances, not mentions.** Every must-never detector declares the source view it
  reads and is proved against a fixture that names its subject without being one.
- **Never fabricate history or evidence**, in this repository's own documents as much as in its
  output. An inability to establish something is reported as such.
- **Release-critical invariants are registered and falsified**
  ([Standard 40](standards/40-detector-and-testing-integrity.md) R11): on record in a normative or
  plan file, defended by named tests, and — where a failure would convert an inability into a pass —
  broken on purpose by `test/falsifiers.mjs` with the suite required to notice.
- **Nothing is committed without the owner asking.** The working tree is the current state.

## Artifact locations

| | |
| --- | --- |
| Decisions | `artifacts/adr/` — four-digit, never rewritten or reused |
| Frozen rule identity | `artifacts/design/rule-catalog-v1.md` |
| Source prompts and owner decisions | `artifacts/prompts/` |
| What is built and what each section discovered | `artifacts/project-plan-breakdown/` |
| External source provenance | `artifacts/external-standards-provenance.json` |
| Standards source inventory | `artifacts/standards-source-inventory.json` |

Repository artifacts are canonical over conversation history. Where this file and a chat log
disagree, this file governs.

## Current state

- **Status:** `IN_PROGRESS`
- **Release target:** v1.0.0, gated by
  [section 12](artifacts/project-plan-breakdown/12-release-readiness-and-v1.md)
- **Built:** the standards corpus, the rule catalog, the policy schema and its cross-field semantic
  layer, the Gate 1 classifier, the `audit` and `validate` pipelines with 13 static detectors,
  browser-evidence ingestion, the attestation model, the `init` bootstrap, the test suite and its
  falsifier harness, CI, and this documentation.
- **Not built:** the release-readiness checker and the v1.0.0 tag (section 12); the browser-evidence
  producer (15); the reusable consumer workflow (13); the real-project dogfood (14); portfolio
  integration (16). Each is recorded in its own plan section rather than omitted.
- **Known risks:** the detector set is the least certain part of the framework. False positives are
  the failure mode this family has shipped most often, and **no external UI project has exercised
  these detectors yet**.
- **Known blockers:** none.
- **Next recommended work:**
  [section 12](artifacts/project-plan-breakdown/12-release-readiness-and-v1.md).
