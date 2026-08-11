# Browser-evidence fixtures

Ten records, each isolating one thing that can be true about a browser run. They are templates: the
`revision.gitSha` and `revision.sourceIdentity` of every one is a placeholder of zeroes, and the
suite rewrites them against a real throwaway repository it creates and commits.

That is not a convenience. A committed fixture cannot carry a real content identity — the identity is
a fact about a specific commit in a specific repository, and one baked in here would be a number that
looks like evidence and proves nothing. Rewriting them at test time means the freshness path is
exercised against `scripts/content-identity.mjs` and real git objects rather than against a string
somebody typed.

| File | The single fact it isolates | What it must produce |
| --- | --- | --- |
| `valid-fresh.json` | a completed run, fresh identity, full coverage, conclusive passes | `evidenced` / passed |
| `partial-coverage.json` | mobile is declared and was never tested | `partial-coverage`, unestablished |
| `route-failed.json` | one enumerated route the run never reached | `partial-coverage`, unestablished |
| `run-failed.json` | the producer did not finish | `evidence-unavailable` |
| `inconclusive-only.json` | the producer looked and could not tell | `not-evaluated` |
| `check-failed.json` | one conclusive failure among passes | `failed` — no majority vote |
| `unknown-rule.json` | a rule id the catalog does not define | exit 2 |
| `wrong-surface.json` | a browser claiming a code-analysis rule | exit 2 |
| `contradictory-viewport.json` | a check on a viewport the record never declared | exit 2 |
| `schema-invalid.json` | `revision.sourceIdentity` absent | exit 2 |

The four exit-2 files are defects in a producer, not facts about a project. None of them may ever
become a compliance finding, and none of them may ever become a pass.
