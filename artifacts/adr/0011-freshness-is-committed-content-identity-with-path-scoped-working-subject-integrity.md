# 0011 — Freshness is committed-content identity with path-scoped working-subject integrity

- **Status:** Accepted
- **Date:** 2026-08-10
- **Amended:** 2026-08-10, before implementation — two clauses added to the Decision section
  (*Resolved revisions are stored; `HEAD` is never stored* and *Provable change outranks
  unavailability*). Recorded as an amendment rather than a silent edit; nothing implemented this ADR
  at the time, and neither clause reverses the decision.
- **Deciders:** Project owner

## Context

Two mechanisms in this framework establish a rule against material a human or a browser examined at
some point in the past: attestations (Standard 37, written in plan section 02) and
ingested browser evidence ([ADR 0002](0002-browser-evidence-arrives-by-ingestion-contract.md)).
Both are worthless without a freshness check. An attestation that survives arbitrary changes to the
material it reviewed is not evidence; it is a permanent waiver with a reviewer's name on it.

EngineeringStandards solves this with a content digest: SHA-256 over the sorted reviewed paths
interleaved with their **working-tree contents**, truncated to 32 hex characters. That mechanism is
now known to be unsafe. Identical commits can materialize different bytes across clean checkouts —
line-ending normalization, clean/smudge filters, and platform checkout differences all change the
bytes on disk without changing what was committed. A digest computed from those bytes can differ
between two machines that hold exactly the same revision, so an attestation valid on one developer's
machine goes stale in CI for no reason connected to the material.

This repository is greenfield. There is no adopter, no recorded digest anywhere, and therefore no
compatibility argument for inheriting the defect.

The first correction proposed computing identity from git's index (`git ls-files -s`). That
replaced one false-freshness bug with a subtler one, which the owner identified before implementation:

```text
HEAD:         foo.css = A
index:        foo.css = A
working tree: foo.css = B
```

The index still reports A, so an attestation over A stays `FRESH` while the interface actually being
validated is B. The mirror case is as bad: with B staged but never committed, the identity would
represent content that exists in no revision, while the mechanism describes itself as repository-backed.

A third problem was in the sentinel. The draft had an untracked reviewed path contribute the literal
string `"<untracked>"` to the hash. That produces a perfectly reproducible identity for a path that
has no repository content identity at all — a stable digest standing in for the absence of one.

## Decision

**One primitive, `scripts/content-identity.mjs`, owns every freshness claim in the framework.**

**The governing invariant:**

> Freshness is established against committed repository content, and an attestation or evidence
> record may establish the current working subject only when every reviewed path is tracked and the
> working copy of every reviewed path corresponds to that committed content.

**Identity is resolved from the committed tree at a recorded revision.** `computeIdentity(root,
paths, revision = "HEAD")` reads object identities from the tree at `revision` — never from the
index, never by hashing bytes on disk. The result is SHA-256 over the sorted `(path, object id)`
pairs, truncated to 32 hex characters. Because git object ids are what the repository actually
stores, two clean checkouts of one commit produce one identity on any platform.

**Resolved revisions are stored; `HEAD` is never stored.** `HEAD` is an input convenience, not
provenance. `computeIdentity` resolves it and returns the full immutable commit SHA alongside the
identity:

```text
computeIdentity(root, paths, "HEAD")
→ { state: "COMPUTED", revision: "<full 40-char commit SHA>", identity: "…" }
```

Every path that creates an attestation or an evidence record persists that **resolved** SHA, never
the literal string `HEAD`. Storing `HEAD` would destroy the historical anchor the moment the branch
advanced: a later validation would resolve it to a different commit, silently changing what the
review claims to have covered. A recorded `revision` of `HEAD` is therefore not a weak anchor but an
absent one, and the schema and the recording paths reject it.

**Three outcomes, closed:**

| Outcome | Established by |
| --- | --- |
| `FRESH` | Recorded identity matches the current committed identity, and every reviewed path's working copy corresponds to committed content. |
| `STALE` | Change was proved: identity mismatch, a path that existed at the reviewed revision and is now gone, or a staged or unstaged modification to a reviewed path. |
| `EVIDENCE_UNAVAILABLE` | The subject could not be reconstructed or established: an untracked reviewed path with no prior committed subject, git unavailable, not a repository, or an unresolvable revision. |

**Provable change outranks unavailability.** When the historical and current committed comparison
has already established that the subject changed, the outcome is `STALE`, and a subsequent
inability to identify some path does not downgrade it. The case that forces this rule:

```text
reviewed revision: path existed
current HEAD:      path absent
working tree:      the same path reappears, untracked
```

The comparison has proved the repository subject changed, so this is `STALE`. Classifying it
`EVIDENCE_UNAVAILABLE` because an untracked replacement now exists would let an untracked file
convert a proved change into a mere failure to measure — which is the same error as converting an
inability to evaluate into a pass, run in reverse. Stated as a precedence rule:

> If change can be proved, the outcome is `STALE`. `EVIDENCE_UNAVAILABLE` is reserved for the case
> where the required identity cannot be established at all.

`EVIDENCE_UNAVAILABLE` therefore covers an untracked reviewed path only when there is no committed
subject at the reviewed revision to compare against.

**`STALE` and `EVIDENCE_UNAVAILABLE` are never collapsed.** "I proved it changed" and "I could not
reconstruct the historical subject" are different claims about the world, and a consumer that sees
one merged into the other loses the ability to tell a real change from a broken measurement. Both
unestablish the claim — the result becomes `not-evaluated`, never a failure and never a pass — but
they report distinctly.

**Working-subject integrity is path-scoped.** Any staged or unstaged modification to a *reviewed*
path forces `STALE`. Modifications elsewhere in the repository do not: editing `README.md` must not
stale a design review of `src/Button.tsx`. There is deliberately no generic `dirty` flag, which
would make every review fragile against unrelated work.

**An untracked reviewed path is `EVIDENCE_UNAVAILABLE`, with no sentinel value.** Content with no
repository identity does not get a stand-in identity.

**Both consumers use this module and no other.** Attestations record `reviewedAgainst.contentIdentity`;
browser evidence records `revision.sourceIdentity`. A meta-test asserts that no second digest
implementation exists anywhere in `scripts/` — one owner for the concept, not two implementations
that happen to agree today.

**Terminology changes with the mechanism.** The field is `contentIdentity`, not `digest`. In a
greenfield repository there is no reason to carry vocabulary from the mechanism being rejected, and
the name should tell a reader this is a repository object identity rather than an arbitrary
filesystem hash.

**Implementation requirement.** Path resolution must treat "requested path absent from this
revision" as a first-class result rather than hashing whatever subset git returned. Asking for
`[a, b]` and receiving only `a` must never silently produce the identity of `[a]`; the test matrix
covers that case explicitly, alongside path-existed-at-revision-missing-at-HEAD (`STALE`) and
path-unresolvable-at-revision (`EVIDENCE_UNAVAILABLE`).

## Alternatives considered

**Port the EngineeringStandards working-tree-content digest unchanged.** Rejected. It is the known
defect: identical commits can produce different digests across clean checkouts, so freshness varies
with checkout configuration rather than with the material.

**Compute identity from the index (`git ls-files -s`).** Rejected on review. It reads neither the
committed revision nor the working tree, so index-matching-but-working-tree-modified content stays
`FRESH` while a different interface is validated, and staged-but-never-committed content can mint an
identity for a revision that does not exist.

**Normalize working-tree bytes before hashing.** Rejected. It creates a second definition of content
identity that must be kept in agreement with the repository's own, and every normalization rule is a
place the two can drift.

**A generic `dirty: true/false` flag on the record.** Rejected. Unrelated modifications would
invalidate unrelated reviews, which trains adopters to treat staleness as noise.

**Keep a `"<untracked>"` sentinel so an identity can always be produced.** Rejected. Producing a
stable identity for content that has none is the same category of error as converting an inability
to evaluate into a pass.

**Use commit sha alone, with no per-path identity.** Rejected. Every commit anywhere in the
repository would stale every attestation, making the mechanism unusable and its warnings ignorable.

**Store `HEAD` as the revision and resolve it at validation time.** Rejected. It records a moving
reference in place of a historical fact, so the anchor moves with the branch and the record silently
comes to claim coverage of material the reviewer never saw.

**Treat an untracked reviewed path as `EVIDENCE_UNAVAILABLE` unconditionally.** Rejected. Where a
committed subject existed at the reviewed revision and no longer exists at HEAD, the change is
already proved; letting an untracked file at the same path downgrade that to unavailability would
make a proved change reportable as a measurement failure.

## Consequences

**Makes easier.** Reproducible freshness across machines, platforms, and CI. Reviews survive
unrelated commits and unrelated working-tree changes. One place to reason about, test, and fix.

**Makes harder.** Freshness now requires git — the framework cannot establish it in an exported
tarball or a shallow checkout without the reviewed revision, and reports `EVIDENCE_UNAVAILABLE`
there. Evidence produced from uncommitted work cannot be `FRESH`, so producers must commit before
their runs count.

**Commits the project to.** Repository-backed provenance as the only freshness mechanism, and to
`content-identity.mjs` as its single owner. Any future freshness need extends this module rather
than adding another.

**Known cost accepted.** A dependency on the `git` executable at validate time, and
`EVIDENCE_UNAVAILABLE` in environments that lack it or lack history. That is the honest report: in
such an environment the framework genuinely cannot establish freshness, and saying so beats
guessing.
