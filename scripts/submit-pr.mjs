#!/usr/bin/env node
/**
 * Verified pull-request submission.
 *
 *     npm run submit-pr
 *
 * THE INVARIANT THIS FILE EXISTS TO ENFORCE:
 *
 *     The commit pushed for a pull request is exactly the commit that passed the complete local
 *     Docker CI pipeline.
 *
 * Not "a commit on the branch that passed". Not "the branch, which was green earlier". The forty
 * characters that were verified are the forty characters that get pushed, and the push is by explicit
 * refspec on that sha rather than by branch name, so the two cannot come apart between the check and
 * the write.
 *
 * The failure this guards against is mundane and common: CI takes minutes, minutes are long enough to
 * amend a commit or stage a fix, and a branch-name push then publishes something no pipeline ever
 * saw. The guard is three comparisons in `verifyCommitIdentity` below, and it is deliberately a pure
 * function so that `test/local-ci.test.mjs` can prove it refuses without anyone rewriting history to
 * demonstrate it.
 *
 * WHAT GETS CLAIMED IN THE PULL REQUEST. Local Docker verification, in those words. This repository
 * does not put "CI passed" in a pull-request body when what happened is that a container on somebody's
 * laptop passed — the whole framework is arranged against evidence that overstates its own surface,
 * and a pull-request body is not the place it starts.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { EVIDENCE_DIR, EXIT, runCi } from "./ci.mjs";
import { IMAGE_TAG } from "./ci-pipeline.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Branches a pull request may never be opened FROM, whatever else is true. */
export const PROTECTED_BRANCHES = new Set(["main", "master", "HEAD"]);

const USAGE = `Usage: npm run submit-pr [-- <options>]

  --base <branch>   Branch to open the pull request against. Defaults to the remote's default branch.
  --draft           Open the pull request as a draft.
  --title <text>    Pull-request title. Defaults to the subject of the verified commit.
  --body <text>     Pull-request body. The local-CI verification block is appended to it, never over it.
  --verbose         Stream the image build and teardown as well as the stages.
  --help            This.
`;

export class UsageError extends Error {}

export function parseArgs(argv) {
  const options = { base: null, draft: false, title: null, body: null, verbose: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) throw new UsageError(`${arg} needs a value`);
      i += 1;
      return next;
    };
    switch (arg) {
      case "--base": options.base = value(); break;
      case "--title": options.title = value(); break;
      case "--body": options.body = value(); break;
      case "--draft": options.draft = true; break;
      case "--verbose": options.verbose = true; break;
      case "--help": case "-h": options.help = true; break;
      default: throw new UsageError(`unknown option: ${arg}`);
    }
  }
  return options;
}

// --- The guards, as pure functions --------------------------------------------------------------
//
// Each returns `{ ok }` or `{ ok: false, message }`. They are separated from the process they guard
// so the refusals can be tested directly. A guard that can only be exercised by actually pushing to
// GitHub is a guard nobody tests, and therefore a guard nobody knows works.

/** A pull request is opened from a topic branch onto a base. Never from the base, never detached. */
export function checkBranch(branch, base) {
  if (!branch || branch === "HEAD") {
    return { ok: false, message: "HEAD is detached. Check out a branch before submitting a pull request." };
  }
  if (branch === base) {
    return { ok: false, message: `The current branch is '${branch}', which is the base. A pull request needs somewhere to come from.` };
  }
  if (PROTECTED_BRANCHES.has(branch)) {
    return { ok: false, message: `Refusing to open a pull request from '${branch}'. Work on a topic branch; the default branch is never pushed directly by this command.` };
  }
  return { ok: true };
}

/**
 * A dirty tree is refused outright, with no override.
 *
 * The invariant is about a commit. Uncommitted edits mean the thing CI examined is not a commit — it
 * is a commit plus some changes that will not travel with the push, and the verification would be
 * about a tree that never existed anywhere else. An `--allow-dirty` escape here would be the same
 * shape of hole this repository refuses everywhere else, so there is not one.
 */
export function checkTree(porcelain) {
  if (porcelain.trim() === "") return { ok: true };
  return {
    ok: false,
    message: `The working tree has uncommitted changes. Commit or stash them first — a pull request is a claim about a commit.\n\n${porcelain.trim()}`,
  };
}

/**
 * The exact-commit comparison. Three ways it can fail, and they are reported differently on purpose.
 *
 * @param before   HEAD as resolved BEFORE the pipeline ran
 * @param after    HEAD as resolved AFTER it finished
 * @param evidence the result document the pipeline wrote
 */
export function verifyCommitIdentity(before, after, evidence) {
  if (!evidence || evidence.result !== "passed") {
    return { ok: false, message: "CI failed. No branch was pushed and no PR was created." };
  }
  if (after !== before) {
    return {
      ok: false,
      message:
        `HEAD changed after CI verification. The current commit has not been verified. Re-run CI before submitting.\n` +
        `  verified: ${before}\n  current:  ${after}`,
    };
  }
  // The pipeline's own record of what it examined, and the container's report of what it held. Both
  // must name the same commit as the one about to be pushed; otherwise something was verified, but
  // not this.
  for (const [label, sha] of [["the pipeline examined", evidence.commit], ["the container held", evidence.environment?.verifiedCommit]]) {
    if (sha !== before) {
      return {
        ok: false,
        message:
          `The verified commit does not match the commit that would be pushed. Nothing was pushed.\n` +
          `  ${label}: ${sha ?? "unrecorded"}\n  would push:            ${before}`,
      };
    }
  }
  return { ok: true };
}

// --- Process helpers -------------------------------------------------------------------------------

function run(command, args, { capture = true } = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
  if (result.error) return { code: null, out: "", err: String(result.error.message), missing: true };
  return { code: result.status, out: result.stdout ?? "", err: result.stderr ?? "", missing: false };
}

const git = (...args) => run("git", args);

/** The remote's default branch, asked of the remote rather than assumed to be `main`. */
export function defaultBranch() {
  const symbolic = git("symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD");
  if (symbolic.code === 0) return symbolic.out.trim().replace(/^origin\//, "");
  const remote = git("remote", "show", "origin");
  const named = /HEAD branch:\s*(\S+)/.exec(remote.out ?? "");
  return named ? named[1] : "main";
}

/**
 * The verification block appended to whatever body the developer supplied.
 *
 * Appended, never substituted: a developer's description of their change is the useful part of a
 * pull request, and a tool that overwrites it to make room for its own receipt has its priorities
 * backwards.
 */
export function verificationBlock(evidence) {
  const checks = evidence.checks.filter((c) => c.result === "passed").map((c) => c.id);
  return [
    "---",
    "",
    "## Local CI",
    "",
    "| | |",
    "| --- | --- |",
    `| Verified commit | \`${evidence.commit}\` |`,
    "| Result | **PASS** |",
    `| Environment | Docker — \`${IMAGE_TAG}\`, node 20 |`,
    `| Completed | ${evidence.completedAt} |`,
    "",
    `Checks executed: ${checks.map((c) => `\`${c}\``).join(", ")}.`,
    "",
    "This was verified by the repository's containerised pipeline (`npm run ci`) against the exact commit",
    "above, on a developer machine. It is **not** a GitHub-hosted Actions result, and it does not report",
    "on any commit other than the one named.",
  ].join("\n");
}

// --- The submission ----------------------------------------------------------------------------------

export async function submit(options) {
  const say = (text) => process.stdout.write(`${text}\n`);
  const refuse = (message, code = EXIT.FAILED) => {
    process.stderr.write(`\n${message}\n`);
    return code;
  };

  if (git("rev-parse", "--git-dir").code !== 0) return refuse("Not a git repository.", EXIT.NOT_RUN);

  const branch = git("rev-parse", "--abbrev-ref", "HEAD").out.trim();
  const base = options.base ?? defaultBranch();

  const branchCheck = checkBranch(branch, base);
  if (!branchCheck.ok) return refuse(branchCheck.message, EXIT.NOT_RUN);

  const treeCheck = checkTree(git("status", "--porcelain").out);
  if (!treeCheck.ok) return refuse(treeCheck.message, EXIT.NOT_RUN);

  // 1. The sha, before anything runs.
  const before = git("rev-parse", "HEAD").out.trim();
  if (!/^[0-9a-f]{40}$/.test(before)) return refuse("HEAD does not resolve to a commit.", EXIT.NOT_RUN);

  say(`Verifying ${before} on '${branch}' before pushing to origin and opening a pull request against '${base}'.`);

  // 2. The authoritative pipeline — the same function `npm run ci` calls, not a copy of it.
  const { code, evidence } = await runCi({ requireClean: true, verbose: options.verbose });

  // 3. The sha, after. Resolved fresh rather than remembered.
  const after = git("rev-parse", "HEAD").out.trim();

  const verified = verifyCommitIdentity(before, after, code === EXIT.PASSED ? evidence : null);
  if (!verified.ok) return refuse(verified.message, code === EXIT.NOT_RUN ? EXIT.NOT_RUN : EXIT.FAILED);

  // 4. Push the sha, by refspec. Not `git push origin <branch>`, which pushes whatever the branch
  //    points at when the command runs — the very substitution the verification just ruled out.
  say(`\nCI passed. Pushing ${before} to origin/${branch}.`);
  const push = run("git", ["push", "origin", `${before}:refs/heads/${branch}`], { capture: false });
  if (push.code !== 0) return refuse("The push failed. No pull request was created.", EXIT.FAILED);
  // Best effort, and its failure is not the submission's failure: the commit is published either way.
  git("branch", `--set-upstream-to=origin/${branch}`, branch);

  // 5. The pull request, if the GitHub CLI is here and already authenticated. No token is read,
  //    stored, or written by this script; `gh` uses the session the developer already has.
  const gh = run("gh", ["auth", "status"]);
  if (gh.missing || gh.code !== 0) {
    say(
      `\nPushed, but no pull request was created: the GitHub CLI is ${gh.missing ? "not installed" : "not authenticated"}.\n` +
        `The verified commit is published. Open the pull request manually, or authenticate gh and re-run.`,
    );
    return EXIT.PASSED;
  }

  const title = options.title ?? git("log", "-1", "--pretty=%s", before).out.trim();
  const body = [options.body?.trim(), verificationBlock(evidence)].filter(Boolean).join("\n\n");
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const bodyFile = path.join(EVIDENCE_DIR, "pr-body.md");
  writeFileSync(bodyFile, `${body}\n`);

  const args = ["pr", "create", "--base", base, "--head", branch, "--title", title, "--body-file", bodyFile];
  if (options.draft) args.push("--draft");
  const created = run("gh", args, { capture: false });
  if (created.code !== 0) return refuse("The push succeeded but `gh pr create` failed. The verified commit is published; open the pull request manually.", EXIT.FAILED);

  say(`\nSubmitted. Verified commit ${before}, verified locally in Docker, pushed and proposed against '${base}'.`);
  return EXIT.PASSED;
}

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
  return submit(options);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = await main();
}
