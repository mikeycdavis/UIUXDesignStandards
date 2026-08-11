# 09 — Bootstrap and existing-UI reconstruction

`uiux-standards init` scaffolds an adopting project: a policy, the agent routing documents, and the
canonical design-artifact locations. Its safety contract matters more than its convenience — it is
the only command in the framework that writes to a repository it does not own.

The contract is inherited from EngineeringStandards and is not negotiable: `plan()` is pure and
touches nothing, `apply()` is the only writer, `--dry-run` is literally `plan()` without `apply()`
so the dry run cannot disagree with the real run, and replacing an existing file requires
`--force-overwrite=<exact path>` naming each path individually.

The second half of this section is the honesty constraint. `init` detects things and reports what it
found, and every claim it makes carries an epistemic label. Tool-generated scaffolding is never
evidence that a project's design satisfies anything, and a detected mode is an inference rather than
a fact about history.

---

### Implement the init safety contract

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Make bootstrapping incapable of destroying work, and make the dry run trustworthy by
  construction rather than by parallel implementation.
- **Deliverables:** `scripts/init.mjs` with `plan()` / `apply()` / `render()`. The artifacts table:
  `project-policy.yml`, `PROJECT.md`, `AGENTS.md`, `CLAUDE.md`,
  `.github/copilot-instructions.md`, and the directories `artifacts/project-plan-breakdown/`,
  `artifacts/adr/` (satisfied by an existing `docs/adr` or `doc/adr`), and `docs/design/`.
  `VERSION` stamping into the scaffolded policy uses a regex that is not `$`-anchored, so a CRLF
  checkout does not silently no-op. There is no `VERSION` file yet, and the stamp returns the text
  unchanged rather than inventing one.
  `plan()` returns the full contents of every intended write, so `apply()` decides nothing — that is
  what makes the dry run a preview rather than a parallel implementation of one.
  There is deliberately no `npm run init` script: every other script targets this repository, and one
  that scaffolded over the framework's own policy is a footgun with no use.
- **Acceptance Criteria:**
  - `plan()` performs no writes. `writeFile` and `mkdir` appear only inside `apply()`.
  - `--dry-run` calls `plan()` and not `apply()`; there is no second code path.
  - An existing file is a conflict, reported and refused, exiting 1 — never overwritten by default.
  - `--force-overwrite` names one path and approves only that path.
- **Verification:**
  ```bash
  node --test test/init.test.mjs    # → 21 pass
  ```
- **Dependencies:** `04-policy-schema-and-templates.md`.

### Implement detection and the three modes

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Scaffold something appropriate to what the project already is, without fabricating a
  history it does not have.
- **Deliverables:** detection reusing `scripts/applicability.mjs` for UI presence — one owner for
  that logic, never a second signal implementation — plus detection of UI technologies, design
  system, accessibility tooling, Storybook, browser automation, existing design artifacts, and an
  existing policy. Three modes: `greenfield`, `existing-configured`, `reconstruction-required`.
  Mode detection is reported `INFERRED`; a `--mode` override is reported
  `CONFIRMED_BY_OWNER` with the date. `reconstruction-required` points at Standard 39.
  Mode ordering fails toward uncertainty: an interface with no policy is `reconstruction-required`
  whether or not design artifacts exist, because artifacts are a starting point for a reconstruction
  and not a substitute for a declaration nobody made.
  The scaffolded policy proposes `ui.evidencePaths` and `ui.reviewPaths` **only** from paths init
  actually saw, and omits both fields with a visible `TODO — UNKNOWN` where it can establish none.
- **Acceptance Criteria:**
  - Every claim in init's report carries exactly one of `OBSERVED`, `INFERRED`,
    `CONFIRMED_BY_OWNER`, `UNKNOWN`.
  - Every `CONFIRMED_BY_OWNER` label carries a `(YYYY-MM-DD)` date.
  - No output asserts what a project's design "was intended" to be.
  - The scaffolded `accessibility.target: framework-baseline` is written explicitly into the file
    with a comment marking it a scaffolded selection
    ([ADR 0008](../adr/0008-an-applicable-ui-declares-its-accessibility-target.md)).
  - UI-presence detection calls into `applicability.mjs` rather than reimplementing signals.
- **Verification:**
  ```bash
  node scripts/uiux.mjs init "$(mktemp -d)" --dry-run --json | grep -o '"label": "[A-Z_]*"' | sort -u   # → only OBSERVED/INFERRED/UNKNOWN
  ```
- **Dependencies:** the safety contract; `05-applicability-classifier.md`.

---

## Gotchas this section discovered

**init fixtures cannot be committed** (known in advance, and confirmed). Every one of them is defined
by what it does *not* contain, and git does not preserve an empty directory. They are built in a
temporary directory at test time, as EngineeringStandards does for the same reason.

**"Wrote no files" and "changed nothing" are different claims, and only the second one is the dry-run
contract.** A `mkdir` satisfies the first and breaks the second, and this command creates three
directories. The test hashes the whole tree — every path and every file's bytes — before and after
`plan()`, so an incidental directory fails it. The weaker assertion would have passed a bug.

**The banned phrasing showed up in the disclaimer, not in a claim.** The test that forbids "was
intended" over init's entire output caught the sentence saying init does not tell you what a design
was intended to be — a mention rather than a use, and exactly the distinction the detectors are held
to. The right fix was the prose, not the test: a disclaimer that has to name the thing it disclaims is
usually a worse disclaimer than one that states the rule. It now says design intent is not in a
repository and nothing here reconstructs it, which is the same content with nothing to misread.

**A detected design system is a fact about files, not about a project.** A `tailwind.config.js` says
somebody installed Tailwind. It does not say the project has adopted a design system, and its absence
certainly does not say the project decided to go without one — `none-justified` is a decision, and
scaffolding it from silence would have manufactured the one field in the block whose entire content is
that the absence was deliberate. So the strategy is never written, and the detection reads "whether
this project has adopted a design system is a decision, not a file".

**The declared class had to be scaffolded without ever scaffolding `no-ui`.** Where Gate 1 proved
exactly one class, init proposes it and says on what evidence. Where it proved none, the template's
`web-ui` stands with a comment marking it a starting point — never `no-ui`, which is a claim about a
repository that only a complete scan with zero signals can support and that init is in no position to
make on an operator's behalf. The visible cost is that a genuinely no-UI project gets a policy that
`validate` reports as INDETERMINATE until they correct it. That is the survivable error: it exits 1
and names itself, where the reverse would hand out a silent exemption.

**`--mode` had to change what is scaffolded without touching what was detected.** The override is
recorded as `CONFIRMED_BY_OWNER (date)` on the mode alone; the detection facts keep their own labels,
and a test asserts the fact list is byte-identical between an overridden run and an inferred one. It
is also never written anywhere, so re-running without the flag returns the inferred mode — an override
that persisted would be an assertion quietly promoted to evidence.
