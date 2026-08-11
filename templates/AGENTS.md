# AGENTS.md

Instructions for an AI agent working in this repository.

This file is a **router**, not a copy of the standards. It tells you what to read and in what order.
It should get shorter as the standards grow, never longer — anything restated here is a second copy
that will drift from the first.

## Load order

1. **`PROJECT.md`** — what this project is, and its current state. Read first; it is the only file
   that tells you where the work actually stands.
2. **`project-policy.yml`** — what applies *here*. Read `ui.applicability` before anything else: if
   it declares `no-ui`, none of the interface standards apply to this repository and reading them
   is wasted effort. Read the `rules`, `applicability`, and `exceptions` blocks before proposing any
   change that touches the interface.
3. **`standardVersion`** in that policy — the framework version this project is evaluated against.
   Standards are versioned; reading a different version's requirements is reading the wrong rules.
4. **The standards themselves, on demand.** Do not read all forty. Find the one that governs what
   you are changing — the `## Implementation` table in each maps requirements to rule ids, and the
   rule ids appear in validator output. Work backwards from the finding.
5. **`artifacts/project-plan-breakdown/`** — the plan, one file per section, with per-item status.
   Read before starting work that might already be planned or already done.
6. **`artifacts/adr/`** — why the consequential decisions are what they are. Read before proposing
   to change one. An ADR is superseded by a new ADR, never edited away.

## What the tooling can and cannot tell you

Run `uiux-standards validate .` before claiming an interface change is complete. Then read the
output carefully, because most of what it says is about what it did **not** establish:

- `assurance.notEvaluated` lists rules nothing looked at. It is not a list of passes.
- A `browser-analysis`, `visual-analysis`, or `manual-review` rule **cannot** pass from a static
  run. If one shows as satisfied without browser evidence or an attestation, that is a bug in the
  tool, not a fact about the project.
- `applicability.classification: INDETERMINATE` means the framework could not establish whether
  these rules apply. It never means they do not.

A clean result means: for the standards and evidence surfaces this project declared, and that the
framework could actually evaluate, the recorded evidence supports this result — and everything not
evaluated remains visible. It does not mean the interface is good.

## Rules that apply to you specifically

- **Do not weaken a check to make it pass.** Not a threshold, not a baseline, not a test, not a
  policy declaration. If a rule is unmet, the outcomes are to fix it or to record it — never to
  adjust the thing measuring it. Several rules in this framework exist precisely to catch that.
- **Do not declare a rule not-applicable to avoid satisfying it.** `not-applicable` means the
  rule's subject does not exist here. If it exists and is unmet, that is an exception, and an
  exception needs a reason and an approver.
- **Never report a proposal as an executed action**, and never present generated content with the
  visual authority of verified content. Both are forbidden rules in this framework, and both are
  things an agent does by default unless it decides not to.
- **Say what you did not check.** "I could not establish X" is a complete and acceptable answer.
  Converting it into "X is fine" is the single failure mode this entire framework exists to
  prevent.
