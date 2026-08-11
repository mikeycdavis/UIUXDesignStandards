# 06 — Evaluator and static detectors

`scripts/uiux.mjs` is the CLI and the home of every static detector. It follows the
EngineeringStandards split precisely: `audit` discovers evidence and never produces a verdict;
`validate` is policy-aware and authoritative; `init` bootstraps; `applicability` classifies.

Two things in this section were riskier than they looked, and both behaved as predicted.

The first is `splitSource`. The inherited implementation understands C-like, hash, and SQL comment
syntax, and has no entry for CSS or HTML at all — while the most valuable detectors in this domain
read exactly those files. Enabling the wrong comment syntax silently corrupts the split, and a
corrupted split produces confident findings from prose.

The second is detector selection. False positives are the failure mode this family has actually
shipped, four times, and a finding an adopter learns to ignore makes the framework worse than no
framework. Thirteen detectors is a deliberate ceiling, and each one survives both a mutation test and a
fixture that names its subject without being an instance of it.

The gate order is the section's real deliverable:

```text
Gate 0   policy validity      invalid shape or semantics → exit 2, nothing is evaluated
Gate 1   applicability        the classifier, from repository evidence
Gate 2   rule evaluation      over the rules the classification admits — and only then
```

---

### Port the CLI skeleton

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Establish the command surface, exit contract, and scanning discipline before any
  detector exists.
- **Deliverables:** `scripts/uiux.mjs` — **partly built in section 05**, which needed the dispatcher
  to run its own verification commands. Completed here: subcommand dispatch (`audit`, `validate`,
  `init`, `applicability`); usage text; flags `--json`, `--dir=`, `--strict` (audit only),
  `--evidence=` (validate only, and rejected at exit 2 until section 07 implements ingestion),
  `--self` (applicability only); `MAX_READ_BYTES = 400_000`; the search surface reused from
  `applicability.mjs` rather than reimplemented, so one repository has one definition of what was
  looked at; `SELF` as a path set covering the detector file **and its own known-positive suite**,
  recorded in `evidenceSurface.sourceRead.selfExcluded`; findings shaped
  `{ id, rule, category, severity, label, evidence, message, standardRef }`.
  Exit codes: `0` completed and compliant; `1` compliance failures, including a non-empty
  `unestablishedProhibitions`; `2` invocation or configuration error.
- **Acceptance Criteria:**
  - `audit` consults no policy and emits no status or score.
  - An unknown subcommand, a missing directory, and `init` all exit 2, never 1.
  - `assertBindings` runs before any output is produced.
- **Verification:**
  ```bash
  node scripts/uiux.mjs bogus >/dev/null 2>&1; echo $?          # → 2
  node scripts/uiux.mjs audit . --json | grep -c '"status"'     # → 0
  ```
- **Dependencies:** `01-repo-skeleton-and-vendored-core.md`, `03-rule-catalog.md`.

### Generalize the source-view splitter

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Let detectors read CSS, HTML, and single-file components while preserving the
  use/mention distinction — a pattern named in a comment must be invisible to the detector that
  hunts it.
- **Deliverables:** `splitSource(text, ext)` producing the three views, with the comment-syntax entry
  generalized from `{ line, block }` to `{ line?: string[], blocks?: [{ open, close }] }` and the
  state machine handling arbitrary open/close pairs. New entries: `.css` → `/* */` **only**, because
  CSS has no line comments and enabling `//` would corrupt every URL; `.scss`/`.less` → `//` and
  `/* */`; `.html`/`.htm` → `<!-- -->`; `.vue`/`.svelte` → both C-like and `<!-- -->`, approximate by
  design. All three views are index-aligned with the source, so a finding's line number means
  something. Every detector's doc comment declares `VIEW:` and why, and a meta-test reads the source
  to prove it.
- **Acceptance Criteria:**
  - A CSS file whose only `outline: none` is inside `/* … */` produces no finding.
  - An HTML file whose only `<img>` is inside `<!-- … -->` produces no finding.
  - The documented limitation is recorded: a literal `<!--` inside a JavaScript string in a `.vue`
    file mis-splits. Recorded and tested as a known limitation, not silently accepted.
- **Verification:**
  ```bash
  node scripts/uiux.mjs audit test/fixtures/never-clean --json | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log(JSON.parse(s).findings.length))"   # → 0
  ```
- **Dependencies:** the CLI skeleton.

### Implement the thirteen static detectors

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Produce honest static evidence for the subset of rules a file scan can genuinely
  establish, and no more.
- **Deliverables:** thirteen detectors, each bound to exactly one frozen rule id from
  `artifacts/design/rule-catalog-v1.md`:
  1. image alt — `structureOf`; skips elements with spread props; lowercase `<img` only.
  2. positive `tabindex` — `structureOf`; both the markup and JSX spellings.
  3. form control label association — `.html`, `.vue`, `.svelte` only; JSX deferred as a documented
     limitation, because `htmlFor` plus component wrappers make per-file analysis dishonest.
  4. `<button>` in a form without an explicit `type`.
  5. heading level skips — full HTML documents only, since fragments legitimately start at h2.
  6. ARIA validity — unknown `role` values and `aria-hidden="true"` on interactive elements.
  7. viewport accessibility disabling — `user-scalable=no`, restrictive `maximum-scale`. Bound to a
     forbidden rule, so its fixture pair is mandatory.
  8. focus-visible removal — `:focus`/`:focus-visible` blocks with `outline: none|0` and no
     compensating declaration; the `:focus:not(:focus-visible)` idiom is whitelisted.
  9. design-token drift — conditional, firing only where a token system is detected; warning
     severity per the source prompt's anti-pixel-policing instruction; aggregated per file at a
     three-literal threshold.
  10. reduced-motion guard — project-wide, because the guard may live in a different stylesheet from
      the animation it guards.
  11. placeholder content — `sourceOf`, because placeholder text lives inside string literals.
  12. duplicate component signals — audit-only, `INFERRED`, absent from the evaluated set on a
      validate run.
  13. custom control semantics — a generic element with a click handler and no `role`, no `tabindex`,
      and no key handler. `INFERRED`, and a spread is skipped rather than guessed at. **Added
      2026-08-11 under ADR 0014**, after plan section 12 found the rule it binds to claiming
      `code-analysis` with nothing implementing it. Bound to a forbidden rule, so its fixture pair is
      mandatory.

  A different thirteenth detector was planned and **dropped during plan section 03**: inline-style
  accumulation had no rule to bind to, and that decision stands — the count arriving back at thirteen
  is arithmetic, not a reversal. The way back in is a requirement first, then a rule, then a detector.
- **Acceptance Criteria:**
  - Every detector's doc comment contains `VIEW:` naming the view it scans and why.
  - Every finding maps to exactly one rule identity. No finding satisfies two rules.
  - No detector claims a rule typed `browser-analysis`, `visual-analysis`, or `manual-review`.
  - A detector reports its rule as examined ONLY when it met an instance of that rule's subject.
- **Verification:**
  ```bash
  node --test test/audit.test.mjs    # → 27 pass
  ```
- **Dependencies:** the source-view splitter; the frozen catalog.

### Assemble the validate pipeline

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Produce the authoritative envelope, in the correct gate order, with the evidence
  surface reported alongside the verdict.
- **Deliverables:** the `validate` path: load catalog → `assertBindings` → Gate 0 policy validity
  (exit 2 on invalid, and a *missing* policy is not an invalid one) → Gate 1 classifier → Gate 2
  static detectors, which do not run at all unless Gate 1 returned `APPLICABLE` → two separate
  `evaluate()` calls over disjoint rule sets → envelope → exit code. Class scoping via
  `scopeOfRule()`, and the two dispositions it produces (`class-unresolved`,
  `not-applicable-by-class`). Human output carries the limitation disclaimers both commands need, and
  names each unestablished prohibition individually with its four resolution paths.
- **Acceptance Criteria:**
  - Rules outside the evaluated set report `skipped / not-evaluated`, never `passed`.
  - Not-applicable rules stay visible in output with their recorded reason.
  - `unestablishedProhibitions` is present and empty rather than absent when there are none.
  - `INDETERMINATE` exits 1 even when `frameworkCompliance` is `COMPLIANT`.
- **Verification:**
  ```bash
  node scripts/uiux.mjs validate . ; echo $?    # → 0
  node --test test/validate.test.mjs            # → 23 pass
  ```
- **Dependencies:** the detectors; `05-applicability-classifier.md`.

---

## Gotchas this section discovered

**CSS has no line comments** (known in advance, and confirmed). Adding `//` to the `.css` entry would
blank the remainder of every line containing `https://`, corrupting `url()` values and every
declaration after them. The `never-clean` fixture's stylesheet carries a URL inside its comment block
for exactly this reason.

**`structureOf` cannot blank strings everywhere, because in markup an attribute value IS the
structure.** Blanking string literals in `.jsx`/`.tsx` would make `alt=""` and `alt="A chart"`
indistinguishable and every attribute-reading detector blind. So string tracking (which keeps
`"https://x"` from being read as a comment) and string blanking became two different sets. The cost —
a markup pattern quoted inside a string literal in a `.jsx` file is visible to the detector hunting
it — is recorded in `LIMITATIONS` and printed by both commands rather than left for an adopter to
discover.

**A detector that met no instance of its subject must not report a pass.** The first draft passed a
static rule whenever no finding was produced, which meant a project with no images "satisfied" the
alt-text rule and a project with no animation "satisfied" the reduced-motion rule. Vacuous truth is
still a false green when the reader is a dashboard. Detectors now return `examined`, and a rule
enters the evaluated set only when its subject was actually met — with the reason recorded, so
`not-evaluated` can distinguish "there is no detector for this" from "the detector found nothing to
look at".

**The declared UI class must not scope the rules.** The obvious implementation reads
`ui.applicability: web-ui` and evaluates the `web-ui` rules. That hands the project's own assertion
authority over the rules it is measured by, one layer below the gate built to prevent exactly that.
Scoping is therefore matched against the classes Gate 1 *proved*, and a declaration participates only
where the evidence corroborates it — the same warrant shape `NOT_APPLICABLE` requires. The
consequence is real and deliberate: a project declaring `web-ui` whose only evidence is `.tsx`
components has its `web-ui` rules reported `class-unresolved`, and the forbidden one among them caps
the verdict. Resolving it costs evidence of the class, which is the honest price.

**`class-unresolved` had to stay inside the applicable denominator.** Folding it in with
`not-applicable` would have been one line and would have quietly converted "we do not know whether
this rule applies" into "this rule does not apply" — an unproven exclusion, which is the shape of
every false exemption this framework exists to refuse.

**A missing policy is not a broken policy.** The first draft exited 2 when `project-policy.yml` was
absent, which made deleting the file and corrupting it the same event. Absence now runs all three
gates and reports `NOT_EVALUATED` at exit 1; exit 2 is kept for a policy that exists and cannot be
believed.

**`evidence.surfaces-declared` is evaluated, and it is not one of the thirteen.** The freeze records no
static detector against it, correctly: its subject is this framework's own output, not the project's
source. It is checked here by an output-structure assertion over the `evidenceSurface` block, which
is genuinely enumerable and so genuinely `structural`/`full`. The freeze's "thirteen static detectors"
count is unaffected — an assertion over the emitted envelope is not a file scan — but without it the
`frameworkCompliance` block of every run would have been a verdict over one rule that nobody ever
evaluated.

**The detector suite needed the same exclusion the detector file does.** `test/audit.test.mjs` must
quote `lorem ipsum` and `outline: none` to assert that the detectors fire on them, and the
repository's own audit duly reported its own test suite. `SELF` became a two-path set, and both paths
are reported in `evidenceSurface.sourceRead.selfExcluded` — an exclusion does not get to be silent.
