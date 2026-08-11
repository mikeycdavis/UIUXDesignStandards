# Design review pack — `<rule.id>`

<!--
  Copy this file per rule under review, fill it in, and keep it in the repository. The attestation in
  project-policy.yml points at it with `reference:`.

  The pack exists so that a design review is a REVIEWABLE ARTIFACT rather than a checkbox. An
  attestation is one line of YAML asserting that a human looked; this is the record a second reader
  can use to check what they looked at and whether they were in a position to decide.

  The path table below is not decoration. It is the same set that goes into
  `attestations.<rule.id>.reviewedAgainst.paths`, and the framework computes the review's content
  identity over exactly those paths — so the material reviewed and the material whose freshness is
  tracked are one set, not two.
-->

- **Rule:** `<rule.id>`
- **Standard:** [Standard NN](../standards/NN-....md)
- **Reviewer:**
- **Review date:**
- **Revision reviewed:** <full 40-character commit SHA>

## The rule

> <Quote the requirement text from the standard, verbatim. Not a paraphrase: the reviewer decides
> against the words that will be enforced, and a summary is where a review starts drifting from the
> rule it claims to establish.>

## What the reviewer must decide

<One or two sentences, phrased as a question with a yes/no answer. "Does the primary action on each
screen below read as the primary action without relying on colour alone?" — not "review the visual
hierarchy".>

The decision is the reviewer's. The framework does not second-guess it; it only records that a review
of this material, at this revision, is on file.

## Material to review, in full

<!--
  Every path the review covers. This table must cover the subject the policy declares in
  `ui.reviewPaths`, or in `ui.reviewScopes.<rule.id>` where the project has narrowed it for this rule
  — a review narrower than the declared subject is reported `partial-review` and establishes nothing.

  Naming a directory covers everything inside it. Naming a file inside a required directory does not
  cover the directory.
-->

| Path | What it contributes to the decision |
| --- | --- |
| `src/...` | |
| `docs/design/...` | |

## What this review did NOT cover

<!--
  Required. Scope is a claim, and an unstated boundary reads as "everything". Name what was out of
  scope and why — a route behind a feature flag, a surface that has its own pack, material that did
  not exist at this revision.
-->

-

## Findings

<!-- What the reviewer saw. Present whether or not the outcome is `approved`: a review that found
     nothing worth writing down is indistinguishable from one that did not happen. -->

-

## The reviewer's commitments

By recording this review as `approved`, the reviewer states:

- They examined every path in the table above, at the revision named above.
- The decision is about what that material does, not about what it was intended to do.
- Nothing in the material contradicts the rule as quoted.
- They are willing to have this pack read by someone who disagrees.

Recording it as `rejected` states that the reviewer examined the same material and found the rule
unmet. That is a finding, not silence — the framework reports it as a failure.

## Recording the attestation

```yaml
attestations:
  <rule.id>:
    status: approved            # or: rejected
    reviewedBy: <name>
    reviewedAt: <YYYY-MM-DD>
    evidence: <what was examined, in one line>
    reference: artifacts/design-review/<rule-id>.md
    expires: <YYYY-MM-DD>       # optional; expiry returns the rule to unreviewed, never to failed
    reviewedAgainst:
      paths:                    # exactly the table above
        - <path>
      revision: <full commit SHA>
      contentIdentity: <32 hex characters>
```

Run `uiux-standards validate` with the paths recorded and no `contentIdentity`; the validator prints
the identity of that material as committed, to paste back. It is never written for you — an identity
the framework computed and stored on the reviewer's behalf would say only that the paths match
themselves.
