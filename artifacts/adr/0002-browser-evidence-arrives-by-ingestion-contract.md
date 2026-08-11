# 0002 — Browser evidence arrives by ingestion contract, not bundled automation

- **Status:** Accepted
- **Date:** 2026-08-10
- **Deciders:** Project owner

## Context

A large share of the properties this framework governs cannot be established from source code.
Whether focus order is logical, whether a modal traps focus, whether a layout overflows at 375px,
whether an accessible name is what a screen reader will actually announce, whether contrast is met
after cascade and inheritance resolve — each requires a rendered document in a real engine. The
source prompt says so directly (§41) and warns in the same breath: *"Do not make the initial
version depend on a huge browser automation stack unless justified."*

The two obvious paths are in direct conflict with each other. Bundling Playwright makes browser
rules work out of the box and destroys the zero-dependency rule ([ADR 0001](0001-vendor-the-neutral-core-rather-than-share-a-package.md))
along with roughly 100–400MB of browser binaries in every consumer's CI. Shipping nothing keeps the
repository clean and leaves every browser-establishable rule with no path to being established,
which invites the worse outcome of quietly retyping those rules as `code-analysis` and pretending a
regex settles them.

## Decision

**This repository defines and verifies a browser-evidence contract. It never produces browser
evidence.**

v1.0.0 ships the complete ingestion half:

- `schemas/browser-evidence.schema.json` — the document a runner must emit.
- `scripts/evidence.mjs` — loading, schema validation, rule-identity binding, and freshness
  verification against [ADR 0011](0011-freshness-is-committed-content-identity-with-path-scoped-working-subject-integrity.md).
- `validate --evidence=<file>` — the ingestion path, exercised end to end by fixtures.
- Rules typed `browser-analysis` and `visual-analysis` in the catalog from day one, which report
  `skipped / not-evaluated` when no evidence is supplied.

The producer — a Playwright suite, a Cypress run, a hand-driven session, or a future companion
repository — lives outside this repository's dependency graph. Any tool that emits a conforming
document participates.

The verification rules are the point of the contract, and each is tested:

- An unreadable or schema-invalid evidence file is exit 2, not a failure. A malformed input is a
  configuration problem, never a statement about the project.
- A `checks[].ruleId` the catalog does not define is exit 2, naming the id. An evidence producer
  must not be able to invent rule identities; that is the same architectural law that governs the
  evaluator.
- `run.status: "failed"` yields disposition `evidence-unavailable` for every browser rule. A run
  that crashed establishes nothing, and it must not look like a run that was never attempted.
- A stale or unreconstructable content identity degrades every browser-established result rather
  than carrying it forward.
- `inconclusive` establishes nothing. Only `passed` establishes a pass, and only when the identity
  is `FRESH`.

## Alternatives considered

**Bundle Playwright as a dependency.** Rejected. It breaks the dependency rule that makes this
family's packs runnable at a pinned sha with no install; it imports browser-download weight and
flakiness into the authority itself, so a Playwright regression would become a standards-framework
outage; and it forces one runner on every adopter regardless of what their project already uses.

**Declare it an `optionalDependency` and use it when present.** Rejected, and it is the most
dangerous option because it looks reasonable. Gate behavior would then depend on whether an install
succeeded on a particular machine, which means the same commit can pass in one environment and be
unestablished in another with nothing in the output explaining why. Nondeterministic enforcement is
worse than no enforcement.

**Ship no browser rules until a runner exists.** Rejected. The catalog would then either omit the
rules — leaving the standards prose describing requirements with no identity, so no project could
ever be measured against them — or type them dishonestly as something a static scan can settle. The
`not-evaluated` disposition exists precisely so a rule can be real and unestablished at the same
time.

**Have `validate` shell out to a browser if one happens to be on PATH.** Rejected for the same
reason as optional dependencies, plus it makes the evidence surface undocumented: nothing in the
output would record which engine ran or at what viewport.

## Consequences

**Makes easier.** Honest v1.0.0 verdicts, because a browser rule reports exactly what it is —
unestablished — rather than being omitted or faked. A fully tested ingestion path with no browser
in CI. Runner independence, so an adopter with an existing Cypress suite emits the document from
what they already run.

**Makes harder.** Adoption is not turnkey. A project wanting browser-established rules must wire a
producer, and until it does its `notEvaluated` bucket will be large and visible.

**Commits the project to.** Semver stability of `browser-evidence.schema.json`, since external
producers encode it. Keeping ingestion strict — every relaxation of the verification rules above is
a route to a false green.

**Known cost accepted.** Until a producer exists, every `browser-analysis` and `visual-analysis`
rule reports `notEvaluated`, and dashboards built on this framework will show that plainly. That is
the intended reading: the framework does not yet establish those properties, and saying so is the
product.
