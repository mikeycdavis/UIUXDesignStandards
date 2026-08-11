# 02 — Standards corpus and external provenance

Forty numbered standards, mapped from the source prompt's 64 sections by
[ADR 0010](../adr/0010-the-corpus-is-forty-standards.md). This is the prose layer: what the framework
requires and why. Rules bind to these documents by number, so the numbering is permanent from the
moment it lands.

Two provenance artifacts accompany the corpus and answer different questions.
`standards-source-inventory.json` records which internal prompt sections each standard realizes —
the same mechanism EngineeringStandards uses to stop a parser change from silently redefining the
series. `external-standards-provenance.json` is new to this repository and records where the
*substance* came from: published accessibility criteria, authoring guidance, usability heuristics,
platform design guidance, and what normative strength each adoption claims
([ADR 0009](../adr/0009-external-source-provenance-is-recorded-and-never-normative.md),
[ADR 0013](../adr/0013-external-claims-in-prose-are-structured-citation-tokens.md)).

This section runs before the catalog because a rule's `standard` field must name a document that
exists, and because writing the requirements first is what makes the rule set defensible rather than
invented.

**Working order within this section**, revised by the owner before work started and followed as
written:

```text
1. External source research + exact provenance records
2. 40-standard source inventory skeleton
3. Write standards 01–40
4. Complete rule/standard provenance mappings
5. Run inventory + provenance falsifiers
```

The reason is epistemic rather than procedural: research must precede prose so that no requirement
is written first and retrofitted with a source that appears to justify wording already chosen. Each
externally informed requirement's normative strength — `directly-adopted`, `interpreted`,
`strengthened`, `recommendation`, or `project-authored` — was decided while the requirement was
written and is visible immediately. That obligation is now Standard 38 R2.

---

### Audit the external sources and record their provenance

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Satisfy the source prompt's §62 research requirement, and make every claim of
  external backing verifiable, so the framework never attributes a requirement to an external
  authority without a citation that supports it.
- **Deliverables:** `artifacts/external-standards-provenance.json` — five source records, three
  retrieved and enumerated (86 success criteria with titles and conformance levels, 30 authoring
  patterns, 10 heuristics), two recorded as retrieval failures. Plus `scripts/provenance.mjs`
  enforcing six checks, and
  [ADR 0013](../adr/0013-external-claims-in-prose-are-structured-citation-tokens.md), which records
  the citation-token mechanism.
- **Acceptance Criteria:**
  - Every standard appears in `mappings` or `projectAuthored`. There is no silent third state.
    (The rule-level form of this binds `accessibility.*` rules and is reported `NOT_EVALUATED` by
    name until section 03 creates the catalog — never as a pass.)
  - Every `directly-adopted` mapping cites a specific criterion with its conformance level, and its
    source's authority is `normative`. Advisory and heuristic sources cannot back direct adoption.
  - Every external source named in `standards/` prose appears inside a citation token whose
    criterion, exact title, and conformance level all match the recorded source. Free prose naming a
    source is a failure.
  - No mapping entry carries `level`, `severity`, requirement text, or applicability — the artifact
    cannot redefine a rule.
  - A source whose retrieval failed backs no claim.
- **Verification:**
  ```bash
  node scripts/provenance.mjs                # → exit 0
  node --test test/provenance.test.mjs       # → 19 pass
  ```
- **Dependencies:** none for standard-keyed mappings. `ruleId`-keyed mappings wait on section 03.

### Write the forty standards documents

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** State what the framework requires, in a form a human can read and a rule can cite,
  with every departure from the source disclosed rather than presented as source text.
- **Deliverables:** `standards/01-*.md` through `standards/40-*.md`, per the ADR 0010 mapping, each
  with `# Standard N — Title`, a two-line abstract, a `Source:` line, `## Scope`, `## Requirements`
  (`### RN — Title`, RFC-2119 keywords inline), `## Additions this standard makes beyond the
  source`, `## Relationship to other standards`, and `## Implementation` (a Requirement → Rule →
  State table). 300 requirements across the series.
  Load-bearing content delivered as specified:
  - **Standard 02 R3** carries the table of EngineeringStandards concerns this repository
    deliberately does not duplicate, including the §29 no-UI-only-business-logic rule.
  - **Standard 34 R3** states the invariant: *failure to establish applicability is `INDETERMINATE`,
    never `NOT_APPLICABLE`*, and R8 tabulates all six cross-field policy invariants.
  - **Standard 35 R4** documents the five-bucket assurance breakdown and discloses the naming
    departure from the source prompt's `visualReview`.
  - **Standard 37 R3** states the manual-review gating semantics as a table, unambiguously,
    including that unestablished required manual-review rules do not individually block in v1.0.0.
  - **Standard 38 R4** states the provenance-never-redefines invariant.
- **Acceptance Criteria:**
  - Exactly forty files, `NN-kebab-title.md`, zero-padded, no gaps.
  - Every file has all five required sections.
  - Every `### RN` heading is numbered consecutively from R1 within its document.
  - Every relative link resolves.
  - No file claims text is reproduced verbatim from an external source.
- **Verification:**
  ```bash
  node --test test/corpus.test.mjs      # → 6 pass
  node scripts/inventory.mjs            # → exit 0
  ```
- **Dependencies:** ADR 0010 for the mapping; ADR 0013 for the citation grammar.

### Write the source inventory and its checker

- **Status:** `COMPLETE` — 2026-08-10
- **Purpose:** Make the shape of the standards series a reviewed human judgment rather than a
  parser's output, so a change to extraction cannot silently redefine what standards exist.
- **Deliverables:** `artifacts/standards-source-inventory.json` and `scripts/inventory.mjs`, which
  extracts from the sources and compares *against* the file, never writing it.
- **Acceptance Criteria:**
  - `expectedCount` is 40 and `standards[]` has 40 entries, numbered 1–40 with no gaps.
  - Every `implementedBy` path exists and its first line matches the recorded number and title.
  - Every section of every source has exactly one recorded destination: a standard, a declared
    split, or a non-standard record naming where it went instead.
  - `inventory.mjs` never writes the inventory file.
- **Verification:**
  ```bash
  node scripts/inventory.mjs           # → exit 0, 75 references reconciled
  node --test test/inventory.test.mjs  # → 16 pass
  ```
- **Dependencies:** the forty standards documents.

---

## Gotchas this section discovered

**A provenance check that asks "is there a mapping?" cannot detect a false citation.** This was the
defect the section was nearly built around. A standard writes *"WCAG 2.2 requires X"*, a mapping
records that the standard cites that source, and the check passes — then the prose is edited to
attribute something the source does not say, and the check still passes. The mapping documents that
*a citation was made*, not that it is *true*. The fix was to make the claim itself structured and
verifiable: every external claim is a token carrying the criterion, its exact title, and its
conformance level, checked against facts enumerated from the retrieved document. Recorded as
[ADR 0013](../adr/0013-external-claims-in-prose-are-structured-citation-tokens.md) and defended by
eight mutation tests, one per way a citation can be made false.

**Two of the five planned sources could not be retrieved at all.** Apple's Human Interface Guidelines
and Material Design 3 serve their documentation from client-rendered applications; fetching them
returns a title and no citable body. This was discovered during step 1, which is exactly why step 1
comes first — discovering it during step 4 would have meant forty documents already written around
sources that back nothing. Both are recorded in `sources[]` with `retrieval.status: not-retrieved`,
their reason, and their consequence; `provenance.mjs` rejects any mapping citing them. Standard 28's
platform-convention requirements are `project-authored` as a result, and say so.

**A section can legitimately feed several standards, and the checker's first version forbade it.**
`§4 › Accessibility` is realized by Standards 3, 4, and 5 — a split ADR 0010 decided deliberately,
on the grounds that structural accessibility, keyboard and focus, and component patterns have
different evidence sources. The first `inventory.mjs` enforced one-destination-per-section and
failed on it. Relaxing the rule to "at least one" would have removed the check's value, so the
resolution was a `splitSections` declaration: a split is permitted when it is *recorded with its
reason*, and an undeclared second owner is still a failure. Three of the sixteen inventory tests
defend that distinction.

**`extraction` must be `reviewed-sections`, not `numbered-items`.** Anticipated before the section
started and confirmed: the mapping from prompt sections to standards is many-to-one, thirteen
sections across two sources map to no standard, and one subsection maps to three standards. An
item-counting extraction would disagree with the corpus by construction. EngineeringStandards uses
`numbered-items` for its primary spec because that spec's items *are* its standards; this one's are
not.

**The prose guard has to be a list of source names, not the word "ARIA".** `ARIA` names a technology
as well as a document — `aria-label`, ARIA roles, ARIA attributes — and accessibility prose needs the
technology constantly. Guarding the bare string would have made Standards 3, 5, and 21 unwritable.
The guard lists document names (`WCAG`, `ARIA Authoring Practices`, `APG`, `Human Interface
Guidelines`, `Material Design`, `Nielsen`, `NN/g`, `W3C`, `WAI-ARIA`) and leaves the technology
alone. Matching is case-insensitive, which is safe here because "human-interface guidance" as a
common noun does not collide with the guarded document title.

**One standard's implementation table names rules that do not exist yet.** Every `## Implementation`
table cites rule identities that plan section 03 will create, and each carries a sentence saying so.
This is a deliberate forward reference, not decoration: the direction of the eventual meta-test is
prose → catalog, so the catalog must contain every identity the prose names, and section 03's freeze
has to reconcile against these tables. The reverse direction is not asserted — a rule may exist
without being named in prose.
