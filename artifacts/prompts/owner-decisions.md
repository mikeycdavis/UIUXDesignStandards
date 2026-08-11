# Owner decisions

Decisions made by the repository owner during planning, reproduced verbatim. Every entry is
labeled `CONFIRMED_BY_OWNER (2026-08-10)` per Standard 39 R3 evidence labeling.

This file is a source artifact. It records what was decided and why. Where an implementation
later departs from a decision here, the departure is an ADR supersession or an explicit scope
change — never a silent edit to this file.

Decisions 1–3 answer planning questions. Decisions 4–6 are plan-review rounds; each was raised
against a draft of the implementation plan and is recorded because the reasoning, not just the
outcome, governs later work.

---

## Decision 1 — The UI-applicability classifier ships in v1.0.0

`CONFIRMED_BY_OWNER (2026-08-10)`

**Question asked:** When should the UI-applicability classifier (gate 1:
APPLICABLE/NOT_APPLICABLE/INDETERMINATE) ship? The stated build order placed it at step 7 (after
v1.0.0, dogfooding, and browser evidence), landing as v1.1.0.

**Answer, verbatim:**

> Ship it in **v1.0.0**.
>
> If the two-gate model is part of the architecture, the applicability classifier is not an optional portfolio convenience. It is the thing that determines whether Gate 2 should run at all.
>
> Without it, the first immutable release would effectively encode:
>
> ```text
> consumer decides UIUXDesignStandards applies
>         ↓
> validate UI rules
> ```
>
> Then v1.1.0 changes that to:
>
> ```text
> establish applicability
>         ↓
> APPLICABLE ──────────→ validate UI rules
> NOT_APPLICABLE ──────→ stop honestly
> INDETERMINATE ───────→ surface inability to establish
> ```
>
> That is a meaningful governance-contract change, not just added tooling.
>
> The strongest reason to include it now is that **`NOT_APPLICABLE` is itself an evidence claim**. If v1.0.0 lets projects bypass the framework merely by not invoking it, or by self-declaring that they have no UI without an independent applicability mechanism, the first release has a structural opt-out hole.
>
> Given that the tooling design already fixes the full contract and implementation is only ~1–2 days, I would absorb it into the release criteria.
>
> I would scope the v1 classifier narrowly, though. Do not turn it into a perfect product taxonomy engine.
>
> For v1 it only needs to establish:
>
> ```text
> APPLICABLE
> NOT_APPLICABLE
> INDETERMINATE
> ```
>
> from explicit, reviewable evidence such as:
>
> ```text
> frontend/mobile framework dependencies
> UI source directories
> routes/pages/screens
> HTML/templates/components
> mobile app targets
> Storybook/component catalogs
> CSS/style systems
> browser-facing build targets
> explicit project-policy declarations
> ```
>
> And its epistemic contract should be stricter than its detection sophistication:
>
> ```text
> positive supported evidence
> → APPLICABLE
>
> sufficient negative evidence over a successfully examined declared surface
> → NOT_APPLICABLE
>
> search/evidence incomplete, contradictory, or insufficient
> → INDETERMINATE
> ```
>
> Especially:
>
> ```text
> no React dependency found
> ≠ NOT_APPLICABLE
> ```
>
> A server-rendered app, desktop client, mobile app, static HTML site, or another UI stack could still exist.
>
> So the release architecture becomes:
>
> ```text
> Gate 0
> Framework/version/policy valid?
>
>         ↓
>
> Gate 1
> UI applicability
>
> APPLICABLE
>       ↓
> Gate 2
> UIUXDesignStandards validation
>
> NOT_APPLICABLE
>       ↓
> terminal honest result
>
> INDETERMINATE
>       ↓
> terminal unresolved governance result
> ```
>
> I would also keep **applicability and compliance outputs separate**. Don't make `APPLICABLE` a rule result.
>
> For example:
>
> ```json
> {
>   "applicability": {
>     "status": "APPLICABLE",
>     "evidence": [
>       "package.json: react",
>       "src/pages/",
>       "playwright.config.ts"
>     ]
>   },
>   "compliance": {
>     "status": "NON_COMPLIANT"
>   }
> }
> ```
>
> For `NOT_APPLICABLE`:
>
> ```json
> {
>   "applicability": {
>     "status": "NOT_APPLICABLE",
>     "evidence": [...]
>   },
>   "compliance": null
> }
> ```
>
> And for uncertainty:
>
> ```json
> {
>   "applicability": {
>     "status": "INDETERMINATE",
>     "reason": "repository evidence surface incomplete"
>   },
>   "compliance": null
> }
> ```
>
> That preserves ownership: the classifier decides **whether this standards pack governs the subject**; the evaluator decides **whether governed rules are satisfied**.
>
> I would also make one release requirement explicit:
>
> > **A project must not obtain `NOT_APPLICABLE` solely from an unaudited policy assertion.**
>
> Policy can provide useful evidence or an owner assertion, but the classifier should reconcile it against repository evidence. If the policy says `no-ui` while the repository contains `src/pages`, a web build, and browser tests, that should be a contradiction—probably `INDETERMINATE` or a dedicated applicability failure—not a clean opt-out.
>
> So I'd revise the build order to:
>
> 1. standards/rule catalog/policy model;
> 2. **UI-applicability classifier**;
> 3. static validation;
> 4. manual-review/attestation model;
> 5. release gates/tests;
> 6. immutable `v1.0.0`;
> 7. reusable CI workflow;
> 8. dogfood on a real UI consumer;
> 9. browser evidence expansion;
> 10. organization adoption controller.
>
> Browser evidence can still come later because Gate 1 does not need to prove UX quality. It only needs to establish that a governed UI surface exists.
>
> The short version is: **if applicability is architectural, ship it before the first immutable contract.** Adding it in v1.1.0 would make the first release enforce UI quality without yet reliably establishing who is subject to that enforcement.

**Implemented by:** ADR 0003; Standard 34; `scripts/applicability.mjs`.

---

## Decision 2 — `ui.accessibility.target` is required, with a low-friction minimum

`CONFIRMED_BY_OWNER (2026-08-10)`

**Question asked:** When a project policy declares a UI but omits `ui.accessibility.target`, what
should happen?

**Answer, verbatim:**

> If a project policy **declares an applicable UI**, then `ui.accessibility.target` should be **required**.
>
> If it is omitted, I would treat that as a **policy/configuration error**, not as accessibility non-compliance and not as `INDETERMINATE`.
>
> ```text
> UI declared
> +
> accessibility target missing
> → POLICY_INVALID
> → exit 2
> → no compliance verdict
> ```
>
> The reason is that the framework has enough information to know the policy is incomplete. This is not an evidence-search failure.
>
> The important refinement is: **small projects should have an easy explicit minimum target**, rather than being forced to make a sophisticated WCAG declaration.
>
> For example:
>
> ```yaml
> ui:
>   applicability: web-ui
>
>   accessibility:
>     target: framework-baseline
> ```
>
> Then more mature or regulated projects could declare:
>
> ```yaml
> ui:
>   accessibility:
>     target: wcag-2.2-aa
> ```
>
> or whatever target vocabulary you ultimately support.
>
> I would **not silently default** an omitted field to `framework-baseline`.
>
> That would create this provenance ambiguity:
>
> ```text
> Policy says nothing.
> Framework reports:
> "Accessibility target: framework-baseline"
> ```
>
> Now the evidence implies the project explicitly adopted a target that nobody actually declared.
>
> That is the same family of problem you've been eliminating elsewhere.
>
> ### Separate the framework minimum from the project's declared target
>
> There are actually two concepts here:
>
> ```text
> Framework accessibility floor
> ≠
> Project accessibility conformance target
> ```
>
> The **floor** contains accessibility rules that apply to every applicable UI regardless of project ambition—for example, not deliberately removing focus indication, meaningful accessible names where required, keyboard operation for interactive controls, not relying only on color for critical state, etc.
>
> The **target** determines additional requirements and any external conformance claim.
>
> So:
>
> ```text
> framework-baseline
> → UIUXDesignStandards' universal accessibility floor
>
> wcag-2.2-aa
> → baseline
>   + applicable WCAG 2.2 AA requirements represented by the framework
> ```
>
> This prevents a project from saying:
>
> ```yaml
> accessibility:
>   target: none
> ```
>
> to turn accessibility off.
>
> I would not support `none` for an applicable user interface.
>
> ### Why not make omission `INDETERMINATE`?
>
> Because `INDETERMINATE` should mean something like:
>
> > The framework performed the required investigation but could not establish the truth.
>
> Here, the framework knows exactly what happened:
>
> > The policy author omitted required governance information.
>
> That's deterministic.
>
> Similarly, I would not make it `NON_COMPLIANT`, because you haven't established that the interface violates an accessibility rule. You've established that **validation cannot be configured correctly**.
>
> So the three cases remain clean:
>
> ```text
> Missing required accessibility scope
> → configuration error / exit 2
>
> Accessibility evidence unavailable
> → NOT_EVALUATED / evidence unavailable
>
> Accessibility requirement violated
> → NON_COMPLIANT
> ```
>
> ### Make `init` remove most of the friction
>
> For a small project, `init` can generate:
>
> ```yaml
> ui:
>   accessibility:
>     target: framework-baseline
> ```
>
> but the generated policy should make clear that this is a scaffolded selection that becomes the project's explicit policy once adopted.
>
> For an existing project where `init` is operating conservatively, it could instead propose the value without pretending it was historical intent.
>
> ### One further constraint
>
> A declared target must not automatically imply that the framework has **established conformance** with that external standard.
>
> For example:
>
> ```yaml
> target: wcag-2.2-aa
> ```
>
> means:
>
> > Evaluate this project against the framework's supported representation of that target.
>
> It must not mean:
>
> > This project is WCAG 2.2 AA compliant.
>
> If browser/manual evidence is missing, the output still needs to expose that.
>
> So my v1 contract would be:
>
> ```text
> If UI applicability = APPLICABLE:
>     ui.accessibility.target MUST be present.
>
> Allowed minimum:
>     framework-baseline
>
> Omission:
>     POLICY_INVALID, exit 2
>
> No opt-out:
>     target: none is invalid
>
> No implicit default:
>     absence never silently becomes framework-baseline
> ```
>
> That does make accessibility scoping **fail closed**, but with a deliberately low-friction baseline for small projects. The project has to say what accessibility contract it is adopting; it does not have to pretend it has a formal external conformance program.

**Implemented by:** ADR 0008; ADR 0012 (the check lives in `policy.mjs`, not the schema);
Standard 03; Standard 34.

---

## Decision 3 — The corpus is 40 numbered standards, with no merges

`CONFIRMED_BY_OWNER (2026-08-10)`

**Question asked:** Keep the 40-standard mapping, or apply four proposed merges to reach ~36?

**Answer, verbatim:**

> Keep the **40-standard shape**.
>
> The optional merges save only about four documents, but they collapse boundaries that are useful for applicability, evidence ownership, and future detector evolution. Given the precedent you already have with 53 EngineeringStandards, 40 is not excessive.
>
> I would specifically keep these separate:
>
> * **Keyboard-and-Focus** separate from Accessibility Foundations. It has distinct browser/runtime evidence, distinct failure modes, and will likely accumulate its own detectors.
> * **Onboarding** separate from Interface States. Onboarding is a workflow/product-pattern concern; loading/empty/error/read-only states are lifecycle/state-model concerns.
> * **External-Source-Provenance** separate from Rule Catalog. Provenance governs epistemic authority; catalog governs rule identity/metadata. Combining them weakens the same separation discipline you established elsewhere.
> * **Browser-and-Visual-Evidence** separate from Evidence-and-Assurance. The first defines an evidence acquisition surface; the second defines what conclusions that evidence is allowed to support.
>
> That last pair is especially worth preserving. "How evidence is obtained" and "what assurance follows from it" should not share an owner unless there is a very strong reason.
>
> I'd use a simple rule for the corpus:
>
> > Merge standards when they share the same subject, applicability boundary, evidence source, and likely change cadence. Keep them separate when any of those differ materially.
>
> By that test, the proposed four merges mostly fail.
>
> So: **40 numbered standards for v1.0.0, with no pressure to hit a smaller round number.** Granularity itself is not a defect; accidental overlap is. If two standards later prove to have inseparable requirements and identical evidence semantics, merge them in a later major/minor revision with aliases or supersession metadata rather than pre-compressing the model now.

**Implemented by:** ADR 0010; `standards/01-*.md` … `standards/40-*.md`;
`artifacts/standards-source-inventory.json`.

---

## Decision 4 — Plan review round 1 (seven amendments)

`CONFIRMED_BY_OWNER (2026-08-10)`

Raised against the first complete implementation plan. Summarized here with the owner's reasoning
preserved; each amendment is implemented by the ADR named.

1. **Attestation digest model must not be inherited from EngineeringStandards.** The owner:
   *"That is now known to be unsafe because identical commits can materialize different bytes
   across clean checkouts. UIUXDesignStandards should not inherit a defect we have already
   identified. … If legacy migration does not apply because this repository is greenfield, even
   better: there is no compatibility reason to ship the old mechanism."* Requires deterministic
   repository-backed provenance from the outset with explicit `FRESH / STALE /
   EVIDENCE_UNAVAILABLE` behavior and no working-tree-byte fallback. → ADR 0011.

2. **`NOT_APPLICABLE` must not carry a compliance verdict by exception.** The draft set
   `compliance: null` for NOT_APPLICABLE but then made process rules still report under
   `compliance`. The owner: *"I would not use one `compliance` field to mean 'UI compliance unless
   there is no UI, in which case it means framework-process compliance.' That makes downstream
   adapters harder to reason about."* Option A chosen: `applicability` / `uiCompliance` /
   `frameworkCompliance` as three independent blocks. → ADR 0003.

3. **Gate 1's `NOT_APPLICABLE` rule was too permissive.** The owner: *"A complete scan proves
   'none of our supported UI signals were present,' not necessarily 'this repository has no UI.'"*
   Requires an explicit `no-ui` declaration corroborated by a complete scan and zero contradictory
   signals; zero signals without a declaration remains `INDETERMINATE`. *"That makes
   `NOT_APPLICABLE` harder to obtain, which is appropriate because it is the state that exempts
   the entire UI rule surface."* → ADR 0003.

4. **Browser evidence and attestations share one provenance primitive.** *"I would make that an
   explicit shared provenance primitive rather than two implementations that happen to use the
   same algorithm."* → ADR 0011; `scripts/content-identity.mjs`.

5. **Classifier failure and classifier uncertainty are mechanically separate.** Evidence
   insufficient → `INDETERMINATE`, exit 0 from the `applicability` command. Classifier could not
   execute meaningfully → exit 2. → ADR 0003.

6. **Rule identity freezes before implementation.** *"Otherwise M6 detector implementation can
   accidentally influence rule identity, violating the architecture law."* →
   `artifacts/design/rule-catalog-v1.md`, authored before any detector code.

7. **External provenance may never become a second normative authority.** *"A provenance mapping
   may justify the origin or interpretation of a rule, but may never redefine the local rule's
   normative text."* → ADR 0009; Standard 38.

---

## Decision 5 — Plan review round 2 (committed-content identity)

`CONFIRMED_BY_OWNER (2026-08-10)`

The round-1 fix specified identity from `git ls-files -s`. The owner rejected this as replacing
one false-freshness bug with a subtler one:

> `git ls-files -s` reads the **index**, not necessarily the committed revision and not the working tree. Therefore:
>
> ```text
> HEAD:        foo.css = A
> index:       foo.css = A
> working tree foo.css = B
> ```
>
> still produces the identity for A.
>
> An attestation over A could therefore remain `FRESH` while the actual UI being validated is B.

And on the sentinel value:

> the `"<untracked>"` sentinel has another semantic problem: it produces a perfectly reproducible digest for a path for which no repository content identity exists. Earlier we deliberately decided that an untracked reviewed path should be **EVIDENCE_UNAVAILABLE**, not an identity-bearing value.

The governing invariant, verbatim:

> **Freshness is established against committed repository content, and an attestation/evidence record may establish the current working subject only when every reviewed path is tracked and the working copy of every reviewed path corresponds to that committed content.**

Resulting contract:

```text
tracked at revision
→ include path + blob/tree object identity

missing now but existed at reviewed revision
→ identity mismatch → STALE

untracked reviewed path
→ EVIDENCE_UNAVAILABLE

git unavailable
→ EVIDENCE_UNAVAILABLE

not a Git repository
→ EVIDENCE_UNAVAILABLE

revision unavailable
→ EVIDENCE_UNAVAILABLE
```

and separately:

```text
working tree modification to reviewed tracked path
→ STALE

staged modification to reviewed tracked path
→ STALE
```

Path-scoped, deliberately: *"A modification to `README.md` should not stale that review. A
modification to `src/Button.tsx` should."* No generic `dirty` flag.

Distinction to preserve: *"Do not collapse 'I proved it changed' and 'I could not reconstruct the
historical subject.'"*

Terminology: since the repository is greenfield, `digest` is renamed to `contentIdentity`
(attestations) and `sourceIdentity` (browser evidence), *"so the schema itself communicates that
this is not an arbitrary filesystem hash."*

**Implementation caution recorded by the owner** (round 3, carried here because it belongs to this
primitive): `git ls-tree -z <revision> -- <paths>` can be awkward for distinguishing a path absent
at that revision from an otherwise-successful invocation. `content-identity.mjs` must treat
"requested path absent from this revision" as a first-class result rather than hashing only the
subset Git returned. Required test matrix:

```text
reviewed path existed at historical revision,
missing at HEAD
→ STALE

reviewed path cannot be resolved at historical revision
→ EVIDENCE_UNAVAILABLE

requested path list = [a,b],
Git returns only a
→ never silently hash just a
```

**Implemented by:** ADR 0011; `scripts/content-identity.mjs`; Standard 37.

---

## Decision 6 — Plan review round 3 (schema/semantics boundary and detector ownership)

`CONFIRMED_BY_OWNER (2026-08-10)`

1. **Cross-field policy invariants leave the JSON Schema.** The vendored schema evaluator has a
   closed keyword set with no `if`/`then`/`oneOf`/`anyOf`. The owner: *"Do **not** casually extend
   `jsonschema.mjs` just to make the document fit. The cleaner family-consistent design is: Schema
   validates representable shape; `policy.mjs` owns cross-field semantic invariants that the
   supported schema vocabulary cannot express."* These are configuration errors at exit 2, never
   compliance findings. Every cross-field invariant gets a known-negative fixture; the
   accessibility-target one additionally gets a mutation test. → ADR 0012.

2. **`applicability:self` must exist in the package contract, and the assertion belongs in the
   tool.** *"make `--self` actually assert: classification == NOT_APPLICABLE, agreement == match,
   scan.complete == true — instead of merely printing the normal classifier result and relying on
   CI shell logic."*

3. **Detector ownership resolves before the M3 freeze.** One finding must satisfy exactly one rule
   identity. `aria-hidden` on an interactive element is generic ARIA misuse and belongs to
   `accessibility.aria-valid-usage`; viewport accessibility disabling (`user-scalable=no`,
   restrictive `maximum-scale`) is the deliberate-disable pattern owned by
   `accessibility.not-deliberately-disabled` and gets its own detector and fixture pair. *"Don't
   have one finding implicitly satisfy two rule identities."*

4. **Terminology cleanup.** `stale digest` → `STALE` / `stale content identity`; fixture
   `stale-digest` → `stale-identity`. *"Keeping the old terminology in a greenfield framework will
   eventually make someone think `digest` is still part of the contract."*

**Decision on process, verbatim:**

> I would freeze the plan at this point rather than continue polishing it. Any new issue discovered during implementation should now become a gotcha, test, ADR amendment/supersession, or explicit scope change—not another pre-build rewrite cycle.

**Implemented by:** ADR 0012; `scripts/policy.mjs`; `artifacts/design/rule-catalog-v1.md`.

---

## Decision 7 — Pre-M1 refinements to the provenance primitive

`CONFIRMED_BY_OWNER (2026-08-10)`

Raised after M0 completed and before `scripts/content-identity.mjs` was written. Two clauses, both
amendments to [ADR 0011](../adr/0011-freshness-is-committed-content-identity-with-path-scoped-working-subject-integrity.md)
rather than reversals of it.

**1. `HEAD` may be an input convenience, but it must never become stored provenance.** The owner:

> If this is recorded:
>
> ```yaml
> reviewedAgainst:
>   revision: HEAD
>   contentIdentity: abc123...
> ```
>
> then a later validation resolves `HEAD` to a different commit and destroys the historical anchor.

The primitive must therefore return the resolved immutable SHA, and every creation path must persist
it:

```text
computeIdentity(root, paths, "HEAD")
→ {
    state: "COMPUTED",
    revision: "<full immutable commit SHA>",
    identity: "..."
  }
```

Required M1 test, stated by the owner:

```text
record identity using revision="HEAD"
advance repository by one commit
stored resolved revision remains old SHA
historical identity still reconstructs from old SHA
current HEAD identity differs when reviewed content changed
→ STALE
```

**2. Provable change outranks unavailability.** The precedence case:

```text
reviewed revision: path existed
current HEAD:      path absent
working tree:      same path reappears untracked
```

The owner: *"The historical/current committed comparison has already proved the repository subject
changed, so I would classify that STALE, not downgrade it to `EVIDENCE_UNAVAILABLE` merely because
an untracked replacement now exists."* Stated as a rule:

```text
If change can be proved → STALE.
Only use EVIDENCE_UNAVAILABLE when the required identity cannot be established.
```

**M1 stopping criteria**, as stated by the owner — the milestone ends when these are green:

- package contract and zero-dependency invariant;
- vendored neutral core loads unchanged where promised;
- `content-identity.mjs` resolves committed tree identity only;
- requested-path completeness is enforced;
- resolved revision is immutable;
- staged/unstaged reviewed-path changes stale;
- unrelated dirt does not;
- absence-at-current after presence-at-review is stale;
- genuinely untracked/unresolvable review subjects are evidence-unavailable;
- no index or working-tree bytes participate in identity.

**Implemented by:** ADR 0011 (amended 2026-08-10); `scripts/content-identity.mjs`;
`test/content-identity.test.mjs`.

**Note on commit granularity**, recorded because it governs later work: the plan does not mandate one
commit per milestone, and no such convention is assumed. Commit boundaries follow the plan, and
commits are made when the owner asks for them.
