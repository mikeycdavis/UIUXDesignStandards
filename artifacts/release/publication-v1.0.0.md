# Publication record — v1.0.0

> Observed on **2026-08-11**. This records what was published and how it was verified. It is
> deliberately separate from [the readiness report](release-readiness-v1.0.0.md): readiness is a claim
> about whether the release *may* be made, publication is a record that it *was*. Collapsing the two
> would let a document that authorised a release also serve as evidence the release happened.

## What was published

Exactly two objects, to `https://github.com/mikeycdavis/UIUXDesignStandards.git`:

| Ref | Commit |
| --- | --- |
| `refs/heads/main` | `835346909f54301702da57c07ac3f6fbbd81bc56` |
| `refs/tags/v1.0.0` (annotated, peeled) | `835346909f54301702da57c07ac3f6fbbd81bc56` |

Fast-forward from `f9abcec`, the repository's pre-existing baseline commit. No force, no amend, no
release-bookkeeping commit beforehand, no other branches or tags. `git ls-remote` after the push
listed one branch and one tag.

## The commit-identity check that came first

The candidate had been verified in a working tree, and the working tree was not a commit. `f9abcec`
held a single one-line `README.md` and nothing else, so every verified byte was uncommitted and the
release was **not yet taggable**. That was established by inspection rather than assumed:

```bash
git show --stat f9abcec        # → README.md | 1 +
git ls-tree -r --name-only HEAD # → README.md
```

Two commits were then made — `a5a16a4` carrying plan sections 00–12, and `8353469` carrying two
defects found during tag verification — and the tag was created only after a clone of the resulting
tree reproduced the full verification.

## Verification, from the published artifact

The strongest available check is a clone of the **remote** tag, because that is what a consumer
receives. Not the authoring working tree, and not a clone of the local repository.

```bash
git clone --branch v1.0.0 https://github.com/mikeycdavis/UIUXDesignStandards.git
```

| Check | Result |
| --- | --- |
| `HEAD` | `835346909f54301702da57c07ac3f6fbbd81bc56` |
| `git describe --tags` | `v1.0.0` |
| Working tree after checkout | clean |
| Line endings preserved | 0 CRLF sequences in `test/falsifiers.mjs` |
| `npm test` | 370 tests, 0 failures |
| Ten repository gates | all exit 0 |
| `release:readiness` | exit 0 — `RELEASED`, `READY_WITH_RECORDED_GAPS` |

## Why the clone check is load-bearing

It found two defects that a green local run could not have found, both recorded in plan section 12.

The first was line endings. With `core.autocrlf=true` and no `.gitattributes`, the committed blobs
are LF while a fresh Windows checkout materialises CRLF — and three of the falsifier harness's mutation
anchors span more than one line. On a clone they would have matched nothing, and the harness would
have reported its own mutations as uncaught: the false green it exists to detect, arriving through the
checkout rather than through the code.

The second was a chronology check with no subject. `scripts/chronology.mjs` searched history for
`EVALUATED_RULES`, an identifier the plan used and the evaluator never adopted, so it could only ever
report `NO_HISTORY` — which was true while nothing was committed, and would have stayed "true" on a
correctly staged repository forever.

The general rule both establish: **release verification must be reproducible from the materialised
repository artifact, not merely from the working tree in which it was authored.**

## What this release does not claim

The one carried gap is unchanged by publication. `chronology.identity-was-frozen-first` is
`NOT_ESTABLISHED`, because plan sections 00–12 were committed together and Git records no ordering
between two changes in one commit. Publishing did not create that evidence and was never going to.
It was not manufactured by staging commits after the fact.

## After this record

`VERSION` stays at `1.0.0` — it names the last release, not the current tree (ADR 0015). Commits
after `8353469` put this repository in `POST_RELEASE_DEVELOPMENT`: the release is an ancestor of
`HEAD`, `release.current-line-descends-from-latest-release` is satisfied, and
`release.the-tag-agrees-with-this-tree` reports `NOT_APPLICABLE`, because this tree is no longer the
released artifact and should not claim to be.
