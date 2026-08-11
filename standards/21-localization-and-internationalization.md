# Standard 21 — Localization and Internationalization

Interfaces that will be translated, and interfaces that will not. This standard is conditional by
design: localization MUST NOT be mandatory for a project whose declared scope does not require it.

Source: §18 of [`artifacts/prompts/original_prompt.md`](../artifacts/prompts/original_prompt.md).

## Scope

Applies to any project whose declared applicability is not `no-ui` and which declares
`localization.required: true` in policy, with one exception: R1 applies to every project with a UI,
because string concatenation is a defect regardless of whether translation is currently planned.

A project declaring `localization.required: true` MUST declare at least one locale. That is a policy
validity condition, not a compliance failure; see
[Standard 34](34-project-policy-applicability-and-exceptions.md).

## Requirements

### R1 — Translated fragments MUST NOT be concatenated

Sentences MUST NOT be assembled from separately translated pieces in a way that assumes English
grammar. Word order, gender agreement, and pluralization differ across languages, and a concatenated
sentence is untranslatable regardless of how good the translations of its parts are.

Use whole-message templates with named placeholders instead.

### R2 — Layout MUST tolerate string expansion

Translated strings are frequently longer than their source. Containers, buttons, and labels MUST NOT
break, clip, or overlap when text grows.

### R3 — Right-to-left MUST be supported where declared

A project declaring RTL support MUST mirror layout direction, not merely the text. Icons indicating
direction, progress, and navigation MUST be mirrored; icons representing objects MUST NOT be.

### R4 — Formatted values MUST be locale-aware

Dates, times, numbers, currencies, and units MUST be formatted for the user's locale rather than the
developer's. Sorting MUST use locale-aware collation where order is meaningful to the user.

### R5 — Pluralization MUST use the locale's plural rules

An interface MUST NOT assume two plural forms. Languages with one form, and languages with more than
two, both break the `n === 1 ? singular : plural` pattern.

### R6 — Language MUST be declared programmatically

The document's language MUST be identified, and passages in another language MUST be marked.
Informed by [WCAG 2.2 SC 3.1.1 "Language of Page" (A)] and
[WCAG 2.2 SC 3.1.2 "Language of Parts" (AA)].

R6 applies to every project with a UI, translated or not: a single-language interface still has a
language, and assistive technology needs to know which one.

### R7 — Language switching MUST be reachable where multiple languages exist

Where an interface offers more than one language, the control to change it MUST be findable without
already reading the current language.

## Additions this standard makes beyond the source

- R1's remedy — whole-message templates with named placeholders — is this framework's; the source
  states the prohibition only.
- R3's distinction between directional and object icons is this framework's.
- R6's second paragraph extends the requirement to untranslated projects. The source scopes its
  localization list to "where applicable"; declaring document language is not conditional on
  translation, and stating it here prevents a project from reading R6 as opt-in.
- R7 restates the source's "language switching" bullet with its failure mode.

## Relationship to other standards

[Standard 20](20-content-design.md) owns the copy this standard translates.
[Standard 13](13-responsive-and-adaptive-design.md) owns the layout behavior R2 stresses.
[Standard 34](34-project-policy-applicability-and-exceptions.md) owns the localization declaration
and its validity conditions.

## Implementation

Rule identities named below are proposed; plan section 03 freezes them and `rules/*.json` is
authoritative thereafter. A meta-test asserts every identity named in prose exists in the catalog.

| Requirement | Rule | State |
| --- | --- | --- |
| R1 | `localization.no-string-concatenation` | `code-analysis`, partial. |
| R2 | `responsive.no-unintentional-overflow` | See [Standard 13](13-responsive-and-adaptive-design.md). |
| R3, R4, R5, R7 | — | No rule in v1.0.0. Recorded as requirements without mechanical support. |
| R6 | `accessibility.aria-valid-usage` | `code-analysis`, partial. Language declaration is checked with document semantics. |
