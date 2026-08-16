#!/usr/bin/env node
/**
 * Local containerised CI — the authoritative run.
 *
 *     npm run ci
 *
 * Every check `.github/workflows/ci.yml` performs, executed inside an ephemeral Docker environment
 * built from this repository's own commands. It is the same list, in the same order, invoked the same
 * way: `scripts/ci-pipeline.mjs` holds it, and `test/local-ci.test.mjs` fails if the two runners ever
 * stop agreeing about what CI means.
 *
 * WHAT THIS ESTABLISHES, AND WHAT IT DOES NOT.
 *
 * It establishes that the tree in the build context passed every repository check in an environment
 * containing nothing but Node 20 and git. It does NOT establish that GitHub-hosted Actions ran, and
 * nothing it writes says otherwise — `scripts/submit-pr.mjs` labels the evidence it puts in a pull
 * request as local Docker verification, in those words. Local CI is independently usable precisely
 * because it never claims to be the hosted one.
 *
 * EXIT CODES, and they are the framework's own triple rather than a new dialect:
 *
 *   0  every stage passed
 *   1  the pipeline ran and a stage failed — the repository has a problem
 *   2  no verdict was reached: Docker is absent, the image would not build, this is not a git
 *      repository, or the container's HEAD is not the one this working tree is on
 *
 * Collapsing 1 and 2 is how a CI wrapper teaches its caller to accept "it did not run" as "it was
 * fine". `scripts/submit-pr.mjs` refuses on either, and refuses differently.
 *
 * ISOLATION. Every docker command runs under a project name unique to this invocation, so teardown
 * is scoped to what this run created and cannot reach a developer's other containers, volumes, or
 * networks. There is no `docker rm`, no `docker prune`, and no pattern matching over container names
 * anywhere in this file — those are the constructs that eat somebody else's database.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { CI_SERVICE, COMPOSE_FILE, IMAGE_TAG, STAGES, stageCommand } from "./ci-pipeline.mjs";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Where the machine-readable result lands. Ignored by git — see .gitignore and docs/local-ci.md §2. */
export const EVIDENCE_DIR = path.join(ROOT, "artifacts", "local-ci");
export const EVIDENCE_FILE = path.join(EVIDENCE_DIR, "latest.json");

export const EXIT = { PASSED: 0, FAILED: 1, NOT_RUN: 2 };

const USAGE = `Usage: npm run ci [-- <options>]

  --keep-on-failure   Leave the containers and network standing when a stage fails, so the failing
                      container can be inspected. Passing runs always clean up.
  --require-clean     Refuse to run when the working tree has uncommitted changes. What
                      scripts/submit-pr.mjs passes, so that "this commit passed" is true of a commit
                      rather than of a commit plus some edits.
  --verbose           Stream the image build and the container teardown as well as the stages.
  --json              Print the result document instead of the human report.
  --help              This.
`;

/** A usage error is the caller's mistake, not a failing check. It exits 2 with everything else that reached no verdict. */
export class UsageError extends Error {}

export function parseArgs(argv) {
  const options = { keepOnFailure: false, requireClean: false, verbose: false, json: false, help: false };
  for (const arg of argv) {
    switch (arg) {
      case "--keep-on-failure": options.keepOnFailure = true; break;
      case "--require-clean": options.requireClean = true; break;
      case "--verbose": options.verbose = true; break;
      case "--json": options.json = true; break;
      case "--help": case "-h": options.help = true; break;
      default:
        // No silent tolerance of unknown flags. A misspelled `--require-clean` that is ignored is a
        // guard the caller believes is on.
        throw new UsageError(`unknown option: ${arg}`);
    }
  }
  return options;
}

// --- Processes -------------------------------------------------------------------------------------

function run(command, args, { capture = false, cwd = ROOT } = {}) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
  if (result.error) return { code: null, out: "", err: String(result.error.message), spawnFailed: true };
  return { code: result.status, out: result.stdout ?? "", err: result.stderr ?? "", spawnFailed: false };
}

const git = (args) => run("git", args, { capture: true });

/**
 * A compose project name unique to this run and legal to compose.
 *
 * The repository directory name namespaces it so two different repositories using this pattern are
 * visibly distinct in `docker ps`; the pid and clock make it unique so two runs of THIS repository
 * cannot collide. Lowercased and stripped because compose rejects anything else.
 */
export function projectName(root = ROOT, now = Date.now(), pid = process.pid) {
  const base = path.basename(root).toLowerCase().replace(/[^a-z0-9]/g, "") || "repo";
  return `ci-${base}-${now.toString(36)}${pid.toString(36)}`;
}

// --- The report ------------------------------------------------------------------------------------

const seconds = (ms) => `${(ms / 1000).toFixed(1)}s`;

function report(evidence) {
  const width = Math.max(...evidence.checks.map((c) => c.id.length));
  const line = "─".repeat(72);
  const out = [];
  out.push(line);
  out.push(`  Local CI — Docker`);
  out.push(line);
  out.push(`  repository   ${evidence.repository}`);
  out.push(`  branch       ${evidence.branch}`);
  out.push(`  commit       ${evidence.commit}`);
  out.push(`  working tree ${evidence.workingTree}`);
  out.push(`  environment  ${evidence.environment.image} (compose project ${evidence.environment.composeProject})`);
  out.push("");
  for (const check of evidence.checks) {
    const mark = check.result === "passed" ? "✔" : check.result === "failed" ? "✖" : "–";
    out.push(`  ${mark}  ${check.id.padEnd(width)}  ${check.result === "not-run" ? "not run" : seconds(check.durationMs)}`);
  }
  out.push("");
  out.push(`  result       ${evidence.result.toUpperCase()}`);
  out.push(`  started      ${evidence.startedAt}`);
  out.push(`  completed    ${evidence.completedAt}`);
  out.push(line);
  return out.join("\n");
}

// --- The run ---------------------------------------------------------------------------------------

export async function runCi(options = {}) {
  const startedAt = new Date();
  const project = projectName();
  const compose = (args, opts = {}) =>
    run("docker", ["compose", "--file", COMPOSE_FILE, "--project-name", project, ...args], opts);

  /**
   * One-off containers are removed as they exit, unless the caller asked to keep a failing one.
   *
   * `compose down` at teardown would also remove them, but only if it runs — and the case where a
   * developer interrupts a long stage with Ctrl-C is exactly the case where it does not. `--rm` makes
   * the common path self-cleaning rather than cleanup-dependent.
   */
  const ephemeral = options.keepOnFailure ? [] : ["--rm"];

  const evidence = {
    schemaVersion: "1.0",
    tool: { name: "local-ci", pipeline: COMPOSE_FILE },
    repository: null,
    branch: null,
    commit: null,
    workingTree: "unknown",
    environment: { runner: "docker", image: IMAGE_TAG, composeProject: project, verifiedCommit: null },
    result: "not-run",
    reason: null,
    startedAt: startedAt.toISOString(),
    completedAt: null,
    durationMs: null,
    checks: STAGES.map((s) => ({ id: s.id, title: s.title, command: stageCommand(s).join(" "), result: "not-run", exitCode: null, durationMs: null })),
  };

  const finish = (code, reason = null) => {
    const completedAt = new Date();
    evidence.result = code === EXIT.PASSED ? "passed" : code === EXIT.FAILED ? "failed" : "not-run";
    evidence.reason = reason;
    evidence.completedAt = completedAt.toISOString();
    evidence.durationMs = completedAt - startedAt;
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(EVIDENCE_FILE, `${JSON.stringify(evidence, null, 2)}\n`);
    return { code, evidence };
  };

  // --- Preflight: the host facts, and whether we can run at all ---

  if (git(["rev-parse", "--git-dir"]).code !== 0) {
    return finish(EXIT.NOT_RUN, "not a git repository");
  }
  const head = git(["rev-parse", "HEAD"]);
  if (head.code !== 0) return finish(EXIT.NOT_RUN, "HEAD does not resolve — an empty repository has nothing to verify");
  evidence.commit = head.out.trim();
  evidence.branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).out.trim();
  const remote = git(["remote", "get-url", "origin"]);
  evidence.repository = remote.code === 0 ? remote.out.trim() : path.basename(ROOT);

  const porcelain = git(["status", "--porcelain"]).out.trim();
  evidence.workingTree = porcelain === "" ? "clean" : "dirty";
  if (options.requireClean && porcelain !== "") {
    return finish(EXIT.NOT_RUN, `the working tree has uncommitted changes:\n${porcelain}`);
  }

  const docker = run("docker", ["version", "--format", "{{.Server.Version}}"], { capture: true });
  if (docker.spawnFailed || docker.code !== 0) {
    return finish(EXIT.NOT_RUN, "Docker is not available. Local CI needs a running Docker engine; see docs/local-ci.md §1.");
  }
  evidence.environment.dockerVersion = docker.out.trim();

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    // Scoped to this project. Not `--rmi`: the image is the layer cache that makes a second run fast,
    // and removing it would make "repeatable" mean "slow".
    compose(["down", "--volumes", "--remove-orphans", "--timeout", "5"], { capture: !options.verbose });
  };

  try {
    // --- Build ---

    const build = compose(["build", CI_SERVICE], { capture: !options.verbose });
    if (build.code !== 0) {
      if (!options.verbose) process.stderr.write(`${build.out}${build.err}`);
      return finish(EXIT.NOT_RUN, "the CI image would not build");
    }

    // --- Dependencies ---
    //
    // Anything in the compose file that is not the runner is a service the checks depend on. They are
    // started with `--wait`, which blocks on each service's declared healthcheck rather than on a
    // sleep: a fixed sleep is either longer than it needs to be on every run or shorter than it needs
    // to be on the run that matters. There are none in this repository today (docs/local-ci.md §5).

    const services = compose(["config", "--services"], { capture: true });
    const dependencies = services.code === 0 ? services.out.split("\n").map((s) => s.trim()).filter((s) => s && s !== CI_SERVICE) : [];
    if (dependencies.length > 0) {
      const up = compose(["up", "--detach", "--wait", ...dependencies], { capture: !options.verbose });
      if (up.code !== 0) {
        if (!options.verbose) process.stderr.write(`${up.out}${up.err}`);
        return finish(EXIT.NOT_RUN, `a CI dependency never became healthy: ${dependencies.join(", ")}`);
      }
    }

    // --- The commit the container actually holds ---
    //
    // Asked of the container rather than assumed from the host. This is the load-bearing half of the
    // exact-commit invariant: submit-pr compares the sha it is about to push against the sha reported
    // from INSIDE the environment that ran the checks, so a build context that silently disagreed
    // with the working tree would be caught here rather than believed.

    const inside = compose(["run", "--rm", "--no-TTY", CI_SERVICE, "git", "rev-parse", "HEAD"], { capture: true });
    const sha = /\b[0-9a-f]{40}\b/.exec(inside.out ?? "");
    if (inside.code !== 0 || !sha) {
      if (!options.verbose) process.stderr.write(`${inside.out}${inside.err}`);
      return finish(EXIT.NOT_RUN, "the container could not resolve HEAD — the build context carries no usable git history");
    }
    evidence.environment.verifiedCommit = sha[0];
    if (sha[0] !== evidence.commit) {
      return finish(
        EXIT.NOT_RUN,
        `the container is on ${sha[0]} and this working tree is on ${evidence.commit}. ` +
          `Nothing was verified about either.`,
      );
    }

    // --- The stages ---

    let failed = null;
    for (const [index, stage] of STAGES.entries()) {
      const check = evidence.checks[index];
      process.stdout.write(`\n──▶ ${stage.id} — ${stage.title}\n`);
      const began = Date.now();
      const result = compose(["run", ...ephemeral, "--no-TTY", CI_SERVICE, ...stageCommand(stage)]);
      check.durationMs = Date.now() - began;
      check.exitCode = result.code;
      check.result = result.code === 0 ? "passed" : "failed";
      if (result.code !== 0) {
        failed = stage;
        // Fail fast. Running the remaining stages after a failure produces a longer report about the
        // same broken tree, and the first failure is the one being fixed.
        break;
      }
    }

    if (failed) {
      if (options.keepOnFailure) {
        process.stderr.write(
          `\nContainers left standing for inspection (compose project ${project}).\n` +
            `  docker compose --file ${COMPOSE_FILE} --project-name ${project} run --no-TTY ${CI_SERVICE} bash\n` +
            `  docker compose --file ${COMPOSE_FILE} --project-name ${project} down --volumes\n`,
        );
      }
      return finish(EXIT.FAILED, `stage '${failed.id}' failed`);
    }
    return finish(EXIT.PASSED);
  } finally {
    // Cleanup runs on success, on failure, and on a throw. The one case it is skipped is an explicit
    // request to keep a FAILED environment for inspection, which is why the flag is not just `--keep`.
    if (!(options.keepOnFailure && evidence.result !== "passed")) cleanup();
  }
}

// --- Entry point -------------------------------------------------------------------------------------

export async function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`${error.message}\n\n${USAGE}`);
    return EXIT.NOT_RUN;
  }
  if (options.help) {
    process.stdout.write(USAGE);
    return EXIT.PASSED;
  }

  const { code, evidence } = await runCi(options);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  } else {
    process.stdout.write(`\n${report(evidence)}\n`);
    if (evidence.reason) process.stderr.write(`\n${evidence.reason}\n`);
    process.stdout.write(`\nresult document: ${path.relative(ROOT, EVIDENCE_FILE).replace(/\\/g, "/")}\n`);
  }
  return code;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await main();
}
