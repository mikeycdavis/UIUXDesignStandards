# 11 — CI and documentation

CI calls repository commands. It never reimplements standards logic in YAML, and it has no install
step — a step that appears there means the zero-dependency decision changed and needs an ADR.

The documentation has a strict division of labour, inherited from EngineeringStandards because it
works: `README.md` orients, `INSTRUCTIONS.md` instructs an adopter, `PROJECT.md` is the manifest for
anyone working *in* this repository, and `docs/architecture.md` describes the machinery.

The test this documentation has to pass is the source prompt's §53: a fresh human or agent with
repository access and no chat history should be able to determine what exists, what applies, how to
run validation, what requires human review, and what is canonical. If the repository needs tribal
knowledge, the documentation is incomplete.

---

### Write the CI workflow

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Run every gate on every change, using the same commands a developer runs locally.
- **Deliverables:** `.github/workflows/ci.yml` — one job, `ubuntu-latest`, Node 20, `actions/checkout`
  and `actions/setup-node` only. Eleven steps, each a bare `npm run`: `inventory`, `provenance`,
  `rule-identity`, `policy`, `policy:templates`, `diagrams`, `test`, `audit`, `validate`,
  `applicability:self`, `release:readiness` — the last added by plan section 12, so a release
  criterion is never first evaluated on the day of the tag.
  `npm test` is the **full** suite including the falsifier harness. There is deliberately no fast
  variant: a CI path that quietly dropped the architectural mutations would remove the only
  evidence that the rest of the suite can fail at all.
  `validate` is the gate and the only step that produces a verdict. The others are supporting
  evidence about this repository's own consistency, and the workflow does not assemble a compliance
  result out of their exit codes — that would be a second evaluator written in YAML.
  Two comments are load-bearing and must be written, not assumed: one recording that the absence of
  an install step is a decision rather than an oversight, and one recording why `audit` is
  deliberately not `--strict` (that flag fails on warnings, which turns every advisory finding into
  a broken build, and the predictable result is that someone disables the step).
- **Acceptance Criteria:**
  - No `npm ci`, `npm install`, or dependency cache step.
  - `validate` is the gate.
  - Every step name maps to a script that exists in `package.json`.
  - No standards logic is expressed in YAML.
- **Verification:**
  ```bash
  node -e "const fs=require('fs'),p=require('./package.json'),y=fs.readFileSync('.github/workflows/ci.yml','utf8');const runs=[...y.matchAll(/run: npm run ([\w:]+)/g)].map(m=>m[1]);const missing=runs.filter(r=>!(r in p.scripts));console.log(missing.length?missing:'ok', /npm (ci|install)/.test(y)?'INSTALL STEP PRESENT':'no install step')"   # → ok no install step
  ```
- **Dependencies:** sections 01 through 10.

### Write the adoption and orientation documentation

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Let a fresh reader adopt the framework without asking anyone anything.
- **Deliverables:**
  - `README.md` — the charter, including the §64 philosophy: a clean validation result means *for
    the standards and evidence surfaces this project declared and the framework could actually
    evaluate, the recorded evidence supports this result — and everything not evaluated remains
    visible*. Plus the standards table, the ADR list, and an annotated layout tree.
  - `INSTRUCTIONS.md` — numbered sections, minimum adoption recipe first, current tooling
    limitations last. Must cover: declaring the standards version; writing the policy; **the six
    cross-field invariants**, stated explicitly because
    [ADR 0012](../adr/0012-schema-validates-shape-policy-validates-cross-field-semantics.md) puts
    them outside the schema where a reader cannot find them; applicability and the two gates; audit
    versus validate; classifying required / not-applicable / exception; **the manual-review gating
    semantics**, because that is the behavior an adopter is most likely to assume wrongly; browser
    evidence and what remains unestablished without it; `init`; onboarding an existing project;
    reconstruction; upgrading; and what not to do.
    **Carried obligation from section 08:** that section's acceptance criteria include this file
    repeating the required-manual-review behaviour — an unestablished required review is visible and
    does not individually block, while an unestablished forbidden one caps the verdict. Section 08 is
    complete except for this line, which was recorded `BLOCKED` there and is now paid: `INSTRUCTIONS.md`
    §8 states both halves, and a test asserts both by content rather than by presence.
    The same section also added `ui.reviewPaths` / `ui.reviewScopes`, which belong with the
    cross-field invariants above: a policy recording an attestation without a declared review subject
    is a configuration error at exit 2, and `templates/design-review-pack.md` is where the paths come
    from.
  - `PROJECT.md` — the manifest: Purpose, Standards, Stack, Commands, Environments, Integrations,
    Architectural rules, Artifact locations, and a Current state block carrying current status,
    release target, known risks, known blockers, and next recommended work.
- **Acceptance Criteria:**
  - Every path, script, and subcommand named in `INSTRUCTIONS.md` exists — enforced by
    `test/instructions.test.mjs`.
  - `PROJECT.md` states that this repository has no UI, that its UI rules are dogfooded elsewhere,
    and that a `no-ui` self-verdict certifies scope honesty rather than UI quality — the carried
    obligation from section 10, now paid and asserted by content.
  - Every claim a document makes is bound to what would make it true: a named command resolves to a
    declared script, a named envelope field to one a run emits, a named disposition to one the
    evaluator emits, a named rule to a catalog identity, and every relative link to a file.
  - No document claims enforcement that does not exist. The reusable workflow and the org adoption
    controller are described as deferred, with their section files named.
- **Verification:**
  ```bash
  node --test test/instructions.test.mjs    # → 11 pass
  ```
- **Dependencies:** sections 01 through 10.

### Write the architecture documentation and its freshness check

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Describe the machinery accurately, and make the description's staleness mechanically
  detectable rather than a matter of someone noticing.
- **Deliverables:** `docs/architecture.md` opening with the regeneration-warning blockquote —
  regenerate rather than hand-patch, because patching one section leaves the rest quietly wrong.
  Sections that would be empty are omitted rather than filled with "none". `docs/architecture.mmd`
  is the canonical diagram source, embedded in the document; any rendered SVG is a generated
  artifact and is never hand-edited. `docs/integration-contract.md` from
  `05-applicability-classifier.md`. `scripts/diagrams.mjs` checks `.mmd` against the embedded fence
  by text comparison, with no Mermaid toolchain.
- **Acceptance Criteria:**
  - `npm run diagrams` exits 0 when in sync and 1 when the source and the embedded copy differ.
  - The mutation test in section 10 proves the check can fail.
  - The document names each command with its script path.
- **Verification:**
  ```bash
  node scripts/diagrams.mjs    # → exit 0
  ```
- **Dependencies:** sections 01 through 10.

---

## Gotchas this section discovered

**The install-step guard forbade the workflow from explaining itself.** The check searched the raw
`ci.yml` for `npm ci` or `npm install`, and the first draft of the workflow failed it — on the comment
saying that the absence of an install step is a decision rather than an oversight. That comment is the
most valuable line in the file: an absence is invisible, so a reader who does not know it was chosen
will eventually add one. The fix is the same repair section 10 made to `content-identity.mjs`, one
layer out: the guard now strips comment lines before matching, so a `run:` line is an install step and
a comment naming one is not. Both directions are mutation-tested. **This is the third time this exact
shape has appeared** — detectors, the identity primitive, and now CI — which is enough to call it a
property of the framework rather than a coincidence: any check that reads text has to decide whether
it is reading a use or a mention, and defaulting to "any occurrence" makes the subject unexplainable.

**Documentation drift is invisible without bindings, so every claim got one.** Four kinds, each with
its own failure mode: a named command that no longer exists, an envelope field a run does not emit, a
disposition the evaluator never produces, a rule id the catalog does not define. Writing the checks
found real defects immediately — a link to `standards/02-boundary-with-engineeringstandards.md` that
is actually `02-boundary-with-engineering-standards.md`, and a `PROJECT.md` sentence naming an
`npm run init` that deliberately does not exist. Both were in prose that read perfectly well.

**The envelope-field scan had to be narrowed to the JSON fence, not widened to prose.** Backticked
words in the contract's paragraphs include `forbidden` and `proved`, which are English rather than
field names. The tempting fix is an exclusion list, which grows until the check means nothing. The
right fix is to scope the scan to the one place the contract states the envelope's shape formally, and
to check the three block names separately by name.

**`npm run diagrams` needed an anti-vacuity guard of its own.** A document with no fenced diagram
agrees with any source at all, and an empty `.mmd` agrees with any document — both would have exited
0. Both are now exit 2 with a reason, because "could not compare" is not "compared and matched".

**Known in advance: `applicability:self` must exist in `package.json` before CI references it.** An
earlier draft of the plan listed the CI step without the corresponding script, which would have
failed on the first CI run rather than at authoring time. The verification command above checks the
mapping in both directions for exactly this reason.
