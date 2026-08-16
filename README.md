# UIUXDesignStandards

Numbered UI/UX/design standards, the rule catalog they bind to, and the commands that establish
whether they apply to a repository and whether that repository satisfies them.

> A clean validation result means: for the standards and evidence surfaces this project declared and
> the framework could actually evaluate, the recorded evidence supports this result — and everything
> not evaluated remains visible.

That sentence is the charter. Every mechanism in this repository exists to keep the second half of it
true, because the failure this framework is built against is not a missed defect. It is a green result
that means less than a reader thinks it does.

## Two things make this pack different from its siblings

**It must answer a question before it can evaluate anything: does this repository have a user
interface at all?** Most repositories in a portfolio do not. So there are two gates — applicability,
then compliance — and the first is established from repository evidence rather than accepted from a
declaration. Failure to establish applicability is `INDETERMINATE`, never `NOT_APPLICABLE`; an
exemption is the hardest state to reach, not the easiest.

**Most of its highest-value rules cannot be settled by reading source.** Whether focus order is
logical, whether contrast holds after the cascade resolves, whether an interface manipulates its user
— these need a browser, a screenshot, or a person. The framework carries four evidence surfaces and
reports which ones actually ran, so a rule nobody could check reads as unchecked rather than as
satisfied.

## Start here

| You want to | Read |
| --- | --- |
| Adopt this in your project | [INSTRUCTIONS.md](INSTRUCTIONS.md) |
| Understand how a run works | [docs/architecture.md](docs/architecture.md) |
| Consume the JSON output | [docs/integration-contract.md](docs/integration-contract.md) |
| Work *in* this repository | [PROJECT.md](PROJECT.md) |
| Run CI, or open a verified pull request | [docs/local-ci.md](docs/local-ci.md) |
| Know why something is the way it is | [artifacts/adr/](artifacts/adr/) |
| Know what is built and what is not | [artifacts/project-plan-breakdown/00-overview.md](artifacts/project-plan-breakdown/00-overview.md) |

```bash
node scripts/uiux.mjs applicability .    # is this repository subject to these standards?
```

```bash
node scripts/uiux.mjs validate .         # the full gate
```

## The standards

Forty documents in [`standards/`](standards/). Each carries numbered RFC-2119 requirements, an
`## Implementation` table binding requirements to rule identities, and a record of what it adds beyond
its source.

| # | | # | | # | | # | |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | Interface Operability for Humans and AI Agents | 11 | Visual Hierarchy and Progressive Disclosure | 21 | Localization and Internationalization | 31 | Design Artifacts and Documentation |
| 02 | Boundary with EngineeringStandards | 12 | Motion and Animation | 22 | Data-Heavy Interfaces | 32 | UI Definition of Done |
| 03 | Accessibility Foundations | 13 | Responsive and Adaptive Design | 23 | Search and Filtering | 33 | Rule Catalog and Rule Identity |
| 04 | Keyboard and Focus | 14 | Navigation and Information Architecture | 24 | Authentication and Authorization UX | 34 | Project Policy, Applicability, and Exceptions |
| 05 | Accessible Component Patterns | 15 | Forms and Data Entry | 25 | Privacy UX | 35 | Evidence, Assurance, and Compliance Output |
| 06 | Design Tokens and Design-System Consistency | 16 | Interface States | 26 | AI User Experience | 36 | Browser and Visual Evidence |
| 07 | Component Reuse and Component States | 17 | Error Presentation and Feedback | 27 | First-Use and Onboarding | 37 | Manual Design Review |
| 08 | Typography | 18 | Destructive Actions and Recovery | 28 | Platform Conventions and Environments | 38 | External Source Provenance |
| 09 | Color | 19 | Performance as UX | 29 | Design Integrity Prohibitions | 39 | Bootstrap and Existing-UI Reconstruction |
| 10 | Spacing and Layout | 20 | Content Design | 30 | Design/Code Consistency | 40 | Detector and Testing Integrity |

**70 rules** in 15 files under [`rules/`](rules/), of which **15 are forbidden** and non-exemptible —
`design-integrity.no-dark-patterns` and `accessibility.no-removed-focus-indicators` among them.
**13** have a static detector. The rest are typed `browser-analysis`, `visual-analysis`, or
`manual-review` and cannot pass from a file scan — which is enforced in the evaluator rather than left
to rule authoring, because metadata is one mistake away from a false pass.

## Decisions on record

Eighteen ADRs in [`artifacts/adr/`](artifacts/adr/), all accepted. The ones that constrain the most:

- [0002](artifacts/adr/0002-browser-evidence-arrives-by-ingestion-contract.md) — browser evidence
  arrives by an ingestion contract. This repository defines and verifies it and produces none.
- [0003](artifacts/adr/0003-ui-applicability-is-established-by-evidence-in-this-repository.md) —
  two-gate applicability, the classifier lives here, and the envelope carries three independent blocks.
- [0005](artifacts/adr/0005-full-assurance-requires-an-enumerable-subject.md) — `full` assurance is
  impossible for browser, visual, code-analysis, and manual-review rules.
- [0011](artifacts/adr/0011-freshness-is-committed-content-identity-with-path-scoped-working-subject-integrity.md)
  — freshness is committed-content identity with path-scoped working-subject integrity.
- [0012](artifacts/adr/0012-schema-validates-shape-policy-validates-cross-field-semantics.md) — the
  schema validates shape; `policy.mjs` owns cross-field semantics, at exit 2.
- [0018](artifacts/adr/0018-local-containerised-ci-gates-pull-request-submission.md) — CI runs
  locally in Docker and gates submission; the commit pushed is exactly the commit that passed.

## CI, and pull requests

The complete pipeline runs in a container before anything is pushed. GitHub-hosted Actions remain
enabled and remain useful, but are not required to prove a branch.

```bash
npm run ci                               # every check, in an ephemeral Docker environment
```

```bash
npm run submit-pr                        # verify, then push the verified commit and open the PR
```

The invariant `submit-pr` enforces: **the commit pushed for a pull request is exactly the commit that
passed the complete local Docker pipeline** — checked three ways, including against the sha reported
from inside the container that ran the checks. Full details, including what local CI deliberately does
not reproduce, are in [docs/local-ci.md](docs/local-ci.md).

## Layout

```text
standards/       40 numbered standards — the normative text
rules/           15 catalog files — rule identity and metadata
schemas/         project-policy and browser-evidence JSON Schemas
scripts/         the tooling; zero dependencies, Node ≥ 18
templates/       what `init` scaffolds, plus the design-review evidence pack
docs/            architecture, the integration contract for consumers, and local CI
docker/          the CI image — node 20 and git, and nothing from the developer's machine
compose.ci.yml   the ephemeral CI environment
artifacts/
  adr/           decisions, never rewritten
  design/        the frozen rule catalog — identity, fixed before implementation
  prompts/       the source prompts and the owner's recorded decisions
  project-plan-breakdown/   what is built, what is not, and what each section discovered
test/            the suite, including 24 architectural falsifiers
```

## Exit codes

```text
0  the checked condition holds
1  the tool ran and the project has problems
2  no verdict was reached — an invocation or configuration error
```

These are never collapsed. Collapsing 1 and 2 teaches a consumer to treat a broken run as a failing
project, or worse, to weaken the check until it stops distinguishing them.

## Zero dependencies

No `dependencies`, no `devDependencies`, no lockfile, no `node_modules`, no install step in CI. Node
≥ 18 and `node:test`. Four files are vendored from EngineeringStandards and record it in their
headers.

## Licence

UNLICENSED, private.
