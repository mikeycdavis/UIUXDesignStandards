# This backlog now lives in GitHub Issues

The item files that were here were migrated into GitHub Issues and removed. Issues are the only
home for this repository's work items; nothing here is maintained.

- **The work:** https://github.com/mikeycdavis/UIUXDesignStandards/issues
- **The mapping:** [`github-mapping.json`](./github-mapping.json) records every item id against the
  issue number and id it became, so existing references still resolve. It also records which store
  is authoritative, and how to recover the files if that is ever needed.

## Reading it

| The old way | Now |
| --- | --- |
| `status:` frontmatter | The issue's open/closed state, plus a `status:` label |
| `parent:` frontmatter | A GitHub sub-issue link |
| `type:` frontmatter | A `level:` label |
| `evidence:` frontmatter | An **Evidence** heading in the issue body, and `Closes #N` from a pull request |
| The generated tracker | GitHub's own issue views |

**An open issue does not mean actionable.** `BLOCKED`, `DEFERRED` and `IN_REVIEW` are all open, so
the `status:` label is what separates open work from executable work.

This repository's default branch is `main`, so a pull request saying `Closes #N` closes its issue
when it merges. A pull request aimed anywhere else creates no link at all.

The full contract is in the ClaudeSkills repository, as `GITHUB-SCHEMA.md`.
