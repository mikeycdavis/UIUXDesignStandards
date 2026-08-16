/**
 * The CI pipeline — one list, two runners.
 *
 * This file is data. It names the checks that constitute "CI passed" for this repository, in the
 * order they run, and nothing else. Two things consume it: `scripts/ci.mjs`, which executes the list
 * inside a container on a developer's machine, and `test/local-ci.test.mjs`, which holds
 * `.github/workflows/ci.yml` to the same list in both directions.
 *
 * WHY THE LIST IS HERE AND THE WORKFLOW STILL SPELLS ITS STEPS OUT.
 *
 * The obvious move is to collapse the GitHub workflow into a single `npm run ci` step so there is
 * literally one definition. This repository forbids that, and the forbidding is older than this file:
 * `test/package.test.mjs` asserts that the workflow runs `npm test`, `npm run validate`, and
 * `npm run applicability:self` as named steps, because a workflow that hides the gate inside an
 * opaque wrapper is a workflow nobody can read the gate out of. It also would not work — the hosted
 * runner has no Docker-in-Docker budget for this, and the point of local CI is that hosted Actions
 * are not required to prove a branch.
 *
 * So the two runners stay separate and the DIVERGENCE is what gets forbidden instead. The stage list
 * below is authoritative; `test/local-ci.test.mjs` fails if the workflow gains a check the container
 * does not run, or drops one the container still runs. Adding a check means editing this list and the
 * workflow together, which is the outcome the "one definition" rule is actually after.
 *
 * REUSE. Nothing in this file is specific to Docker or to this repository beyond the stage list
 * itself. A sibling repository adopts the pattern by rewriting STAGES and its compose file; the
 * runner and the submission guard do not change.
 */

/** The compose file that defines the CI environment, relative to the repository root. */
export const COMPOSE_FILE = "compose.ci.yml";

/**
 * The service in that file which executes checks.
 *
 * Any OTHER service in the compose file is treated as a dependency: `scripts/ci.mjs` brings those up
 * and waits on their declared health checks before the first stage runs. There are none today —
 * this repository has no database and no services (see docs/local-ci.md §5) — and the code path is
 * kept because that is the part a sibling repository needs and the part that is easy to get wrong.
 */
export const CI_SERVICE = "ci";

/**
 * A stable image tag, deliberately not unique per run.
 *
 * The compose PROJECT is unique per run so concurrent runs cannot collide on containers or networks.
 * The IMAGE is shared so a second run reuses the layer cache instead of rebuilding a Debian package
 * install. Cleanup never removes it: an ephemeral image would make "run it again from clean state"
 * mean "download the internet again", and repeatability is a property of the result, not of the cache.
 */
export const IMAGE_TAG = "uiux-standards-ci:local";

/**
 * The checks. `id` is the npm script; `title` is the name the GitHub workflow gives the same step.
 *
 * `npm test` is invoked as `npm test` rather than `npm run test` in both runners, which is npm's own
 * spelling for the lifecycle script and the spelling `test/package.test.mjs` looks for.
 */
export const STAGES = [
  { id: "inventory", title: "Source inventory" },
  { id: "provenance", title: "External source provenance" },
  { id: "rule-identity", title: "Rule identity — prose, freeze, catalog, provenance" },
  { id: "policy", title: "Own policy" },
  { id: "policy:templates", title: "Adoption template policy" },
  { id: "diagrams", title: "Architecture diagrams are in sync" },
  { id: "test", title: "Tests" },
  { id: "audit", title: "Audit" },
  { id: "validate", title: "Validate — the gate" },
  { id: "applicability:self", title: "Applicability self-check" },
  { id: "release:readiness", title: "Release readiness" },
];

/** The argv a stage is run with. `test` is a lifecycle script; the rest are `run` targets. */
export const stageCommand = (stage) => (stage.id === "test" ? ["npm", "test"] : ["npm", "run", stage.id]);

/**
 * How the same stage appears in GitHub workflow YAML, for the parity check.
 *
 * Kept next to `stageCommand` on purpose: the two spellings of one stage are the thing that drifts,
 * and putting them in different files is how they would drift unnoticed.
 */
export const stageWorkflowStep = (stage) => (stage.id === "test" ? "npm test" : `npm run ${stage.id}`);
