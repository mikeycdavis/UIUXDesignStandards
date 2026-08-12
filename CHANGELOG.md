# Changelog

Versions describe the **standards**, not the tooling that checks them. The increment is a statement
about what adopting the new version obliges a consumer to do:

| Change | Increment | Why |
| --- | --- | --- |
| A new `required` or `forbidden` rule | MAJOR | A project that was compliant may no longer be |
| A new `recommended` or `optional` rule | MINOR | Nothing that passed before now fails |
| Removing a rule alias | MAJOR | A policy naming that alias stops resolving |
| Deprecating a rule (lifecycle metadata only) | MINOR | The rule still resolves and still evaluates |
| Strengthening a detector so it finds more instances of the same rule | MINOR | The rule did not change; the coverage of it did |
| A change to what an existing command accepts or refuses | MAJOR | An invocation that produced a verdict may now produce none |
| A new command, flag, or output field that nothing depended on | MINOR | Additive; no existing invocation changes behaviour |
| Prose clarification with no rule change | PATCH | Nothing mechanical moved |

The fifth row was added on 2026-08-11 (ADR 0017) because the table only described rule changes, and
the version-identity guard is a change to what `validate` *does* while every rule stands still. The
test is not whether anything in the catalog moved: it is whether an existing, valid consumer can get
a materially different outcome without changing its project. **A bug fix can still be breaking** — the
argument that the old behaviour never deserved to work is an argument about merit, and the increment
describes the consequence for adopters instead.

The tooling's version is `package.json`; the envelope's is `schemaVersion`. All three travel
independently and are checked for internal consistency by `npm run release:readiness`.

## 1.0.0 — 2026-08-11

The first immutable release: the normative corpus, the rule catalog that owns rule identity, the
policy that owns applicability, and the evaluator that produces evidence.

**MAJOR by definition.** There is no prior version, and the increment law above is stated here so the
next one cannot be argued about after the fact.

### The framework

- **40 numbered standards** covering accessibility, interaction, visual design, content, platform
  conventions, and the framework's own governance — each citing the source sections it derives from,
  with external provenance recorded separately in `artifacts/external-standards-provenance.json`.
- **70 rules in 15 files, 15 of them forbidden**, frozen in `artifacts/design/rule-catalog-v1.md`
  before any detector existed. The catalog defines rule identity; nothing else may.
- **Three gates.** Gate 0 establishes that the policy is valid configuration, Gate 1 whether a UI is
  applicable at all, Gate 2 whether the applicable UI satisfies the standards.
- **A three-block envelope** — `applicability`, `uiCompliance` (null when no UI was established),
  and `frameworkCompliance` (never null). No field changes meaning by context.
- **13 static detectors**, each bound to a frozen rule identity, each reporting instances of its
  subject rather than discussions of it.
- **Four evidence surfaces** — static analysis, ingested browser evidence, visual material, and human
  review — all obeying one rule: a claim can only become stronger when the surface that owns that
  strength was actually established.
- **Committed-content identity** for every freshness claim, resolved from the committed tree at a
  recorded revision. `FRESH`, `STALE`, and `EVIDENCE_UNAVAILABLE` are never collapsed.
- **`init`**, a bootstrapper that scaffolds without ever asserting history.
- **Zero dependencies**, no lockfile, and no install step in CI.

### What this release deliberately does not do

- It does not produce browser evidence. Every `browser-analysis` rule reports `not-evaluated` until a
  producer exists, and that visible gap is the correct output rather than a defect.
- It does not compute contrast, focus order, modal focus trapping, responsive overflow, or touch
  target size. Those are typed to surfaces this version cannot evaluate, and they are named in the
  output rather than omitted from it.
- It has not been run against an external UI project. The detectors are designed, not calibrated.

### Known gap in the release record

The Git chronology showing rule identity frozen before the detectors that bind to it is
`NOT_ESTABLISHED` — see `artifacts/release/release-readiness-v1.0.0.md`. The ordering is true of the
work; it is not, at the time of this entry, demonstrable from history. It is the only gap carried
into this release, and it qualifies only because the evidence cannot now be produced without
rearranging history until it agrees. A gap naming work that could still be done blocks a release
instead, which `scripts/release-readiness.mjs` enforces through `GAP_POLICY` rather than through
wording.

### Amended before release

`artifacts/design/rule-catalog-v1.md` was frozen on 2026-08-10 and amended once, on 2026-08-11, under
ADR 0014. Two forbidden rules were typed `code-analysis` with no detector — a claim about which
evidence surface can establish them that no implementation honoured. Each was decided on whether
static evidence genuinely reaches it: `accessibility.no-inaccessible-custom-controls` gained the
thirteenth detector with no catalog change, and `design-integrity.no-fake-progress` was re-typed
`code-analysis`/`partial` → `manual-review`/`none`, which also makes it attestable.

No semver increment applies. `introducedIn` remains `1.0.0` for both, because 1.0.0 has not been
released — a validation-type change to a *released* rule is a contract change and would be `MAJOR`.
This is the last point at which the correction is free, which is why it was made here rather than
carried. The frozen catalog snapshot `artifacts/release/catalog-v1.0.0.json` was regenerated
deliberately as a consequence, through the one-time `--write-snapshot` path.
