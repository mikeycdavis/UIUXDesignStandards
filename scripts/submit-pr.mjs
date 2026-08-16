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
 * The exact-commit comparison. Four ways it can fail, and they are reported differently on purpose.
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
  // Naming the right commit is half of it. The container's files must also have BEEN that commit —
  // otherwise the checks ran against a tree that exists nowhere, and the sha agreement above is three
  // pieces of metadata agreeing with each other about something none of them looked at. A result
  // document that does not record this establishes nothing, which is why the test is for the word
  // "clean" rather than for the absence of "dirty".
  if (evidence.environment?.containerWorkingTree !== "clean") {
    return {
      ok: false,
      message:
        `The container's files were not established to match ${before}. Nothing was pushed.\n` +
        `  container working tree: ${evidence.environment?.containerWorkingTree ?? "unrecorded"}`,
    };
  }
  return { ok: true };
}

/**
 * How a submission ended, when it ended successfully.
 *
 * Both are exit 0, and they are still not the same event. A branch that already had a pull request
 * open and now points at a newly verified commit is a SUCCESSFUL submission — the commit is published
 * and proposed — but it is not a creation, and a result artifact that called it one would be lying
 * about which operation happened. Two names, one exit code, no third meaning invented.
 */
export const OUTCOME = { PR_CREATED: "PR_CREATED", PR_UPDATED: "PR_UPDATED" };

/**
 * Whether to reuse an open pull request or open one, decided from repository STATE rather than from
 * the wording of a CLI error.
 *
 * The defect this replaces: `gh pr create` fails when a pull request for the branch already exists,
 * and treating that failure as the submission's failure made a completely successful run — verified
 * commit pushed, pull request pointing at it — exit 1. A command that returns failure on success
 * teaches its callers to disregard its exit code, which for the tool whose job is auditable
 * publication is worse than an ordinary bug.
 *
 * Recognising the state by matching the error text was rejected: it would make correctness depend on
 * the CLI's phrasing, which is not a contract anyone has promised to keep.
 *
 * @param existing open pull requests whose head is this branch, or `null` if discovery itself failed
 */
export function choosePrAction({ existing, branch, base, verifiedSha }) {
  if (!Array.isArray(existing)) {
    return { action: "refuse", message: "Could not determine whether a pull request already exists for this branch. The verified commit is pushed; nothing was opened." };
  }

  const onThisBase = existing.filter((pr) => pr.baseRefName === base);
  const elsewhere = existing.filter((pr) => pr.baseRefName !== base);

  if (onThisBase.length === 0) {
    if (elsewhere.length > 0) {
      // Never silently retarget. An open pull request from this branch onto a DIFFERENT base is a
      // proposal somebody made deliberately; reusing it would move a review to a base its reviewers
      // never agreed to, and opening a second one from the same branch is rarely what was meant.
      const named = elsewhere.map((pr) => `#${pr.number} onto '${pr.baseRefName}'`).join(", ");
      return {
        action: "refuse",
        message:
          `This branch already has an open pull request against a different base: ${named}. ` +
          `The verified commit is pushed and those pull requests now point at it. ` +
          `Re-run with --base to match one of them, or close it first — this command will not retarget a review nobody asked it to.`,
      };
    }
    return { action: "create" };
  }

  if (onThisBase.length > 1) {
    return { action: "refuse", message: `More than one open pull request from '${branch}' onto '${base}': ${onThisBase.map((pr) => `#${pr.number}`).join(", ")}. Resolve that first.` };
  }

  // Which pull request is the target — not yet whether it points at the right commit. That question
  // is asked identically of both paths by `confirmPrHead` below, because a freshly created pull
  // request deserves exactly the scrutiny an existing one gets.
  return { action: "reuse", pr: onThisBase[0], outcome: OUTCOME.PR_UPDATED };
}

/**
 * Confirm a pull request's head is the verified commit, allowing for GitHub to catch up.
 *
 * One read is not enough, and that is not a theoretical worry — it is what happened the first time
 * this path ran. `git push` reported `40dd49c..d33d3f8`, and the API asked immediately afterwards
 * still named the old head. The push had succeeded; the read had not yet seen it, and a correct check
 * refused a correct submission.
 *
 * So the observation is repeated until it converges, and this is a WAIT rather than a
 * retry-until-agreeable. It succeeds only on the verified sha: a head that settles on some other
 * commit — because somebody else pushed — never matches and is refused exactly as before, and so is
 * one that never converges at all. The bound is real, and exhausting it is a refusal, not a shrug.
 *
 * @param read  returns the currently observed head sha, or null if it could not be read
 * @param sleep injected, so the tests do not spend real seconds proving this
 */
export async function confirmPrHead({ read, expected, attempts = 10, waitMs = 3000, sleep }) {
  let observed = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    observed = await read();
    if (observed === expected) return { ok: true, attempts: attempt };
    if (attempt < attempts) await sleep(waitMs);
  }
  return {
    ok: false,
    observed,
    message:
      `The pull request does not point at the verified commit, after ${attempts} attempt(s).\n` +
      `  pull request head: ${observed ?? "unreadable"}\n  verified:          ${expected}`,
  };
}

// --- Process helpers -------------------------------------------------------------------------------

function run(command, args, { capture = true } = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, encoding: "utf8", stdio: capture ? "pipe" : "inherit" });
  if (result.error) return { code: null, out: "", err: String(result.error.message), missing: true };
  return { code: result.status, out: result.stdout ?? "", err: result.stderr ?? "", missing: false };
}

const git = (...args) => run("git", args);

/** `ref: refs/heads/<branch>\tHEAD` — what the remote itself says its default branch is, right now. */
export function parseSymrefHead(out) {
  const named = /^ref:\s+refs\/heads\/(\S+)\s+HEAD$/m.exec(out ?? "");
  return named ? named[1] : null;
}

/**
 * Which branch the pull request is opened against, and on whose authority.
 *
 * The order is the point. An explicit `--base` decides alone and no discovery runs at all. Otherwise
 * the REMOTE decides, because it is the only thing that knows its own default branch. The local
 * `refs/remotes/origin/HEAD` is a cache written at clone time and refreshed by nothing — after a
 * default-branch rename it keeps naming the old branch indefinitely, and `git remote set-head --auto`
 * exists precisely because that ref does not maintain itself. It is kept here only as a last resort
 * ahead of a bare guess, and labelled so the caller can see the claim is unverified.
 */
export function chooseBase({ explicit, remote, cached }) {
  if (explicit) return { base: explicit, source: "explicit" };
  if (remote) return { base: remote, source: "remote" };
  if (cached) return { base: cached, source: "cached-unverified" };
  return { base: "main", source: "fallback" };
}

/** The remote's default branch, asked of the remote rather than of a local cache of it. */
export function defaultBranch() {
  const remote = parseSymrefHead(git("ls-remote", "--symref", "origin", "HEAD").out);
  const symbolic = git("symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD");
  const cached = symbolic.code === 0 ? symbolic.out.trim().replace(/^origin\//, "") : null;
  return chooseBase({ explicit: null, remote, cached });
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
  // Discovery is skipped entirely when the caller named a base — `defaultBranch` reaches the network,
  // and a command told where to open its pull request has no question to ask.
  const chosen = options.base ? { base: options.base, source: "explicit" } : defaultBranch();
  const base = chosen.base;
  if (chosen.source === "cached-unverified") {
    process.stderr.write(
      `Warning: the remote did not report a default branch, so '${base}' comes from the local ` +
        `refs/remotes/origin/HEAD cache, which is not refreshed after a rename. Pass --base to be certain.\n`,
    );
  }

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

  // 6. Does a pull request for this branch already exist? Asked of the repository BEFORE creating one,
  //    because "it already exists" is a state, and reading it off the wording of a `gh pr create`
  //    failure would make this command's exit code depend on the CLI's phrasing.
  const listed = run("gh", ["pr", "list", "--head", branch, "--state", "open", "--json", "number,url,baseRefName,headRefOid"]);
  let existing = null;
  if (listed.code === 0) {
    try {
      existing = JSON.parse(listed.out || "[]");
    } catch {
      existing = null;
    }
  }

  const decision = choosePrAction({ existing, branch, base, verifiedSha: before });
  if (decision.action === "refuse") return refuse(decision.message, EXIT.FAILED);

  const recordSubmission = (outcome, pr) => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(
      path.join(EVIDENCE_DIR, "submission.json"),
      `${JSON.stringify({ outcome, commit: before, branch, base, pullRequest: pr ? { number: pr.number, url: pr.url } : null }, null, 2)}\n`,
    );
  };

  const readHead = (number) => {
    const seen = run("gh", ["pr", "view", String(number), "--json", "headRefOid"]);
    if (seen.code !== 0) return null;
    try {
      return JSON.parse(seen.out || "null")?.headRefOid ?? null;
    } catch {
      return null;
    }
  };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  if (decision.action === "reuse") {
    // A successful submission, and not a creation. The commit is published and the open pull request
    // points at it — which is exactly what was asked for — so this exits 0 and says which of the two
    // things happened rather than inventing a third meaning for the exit code.
    const confirmed = await confirmPrHead({ read: () => readHead(decision.pr.number), expected: before, sleep });
    if (!confirmed.ok) return refuse(`Pull request #${decision.pr.number}: ${confirmed.message}`, EXIT.FAILED);
    recordSubmission(decision.outcome, decision.pr);
    say(
      `\nSubmitted (${decision.outcome}). Verified commit ${before}, verified locally in Docker, pushed to '${branch}'.\n` +
        `Pull request #${decision.pr.number} against '${base}' already existed and now points at it: ${decision.pr.url}`,
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

  // Read the created pull request back rather than trusting that it points where it should. The same
  // standard the reuse path is held to: a submission is only successful if what reviewers will see is
  // the commit that passed.
  const opened = run("gh", ["pr", "view", "--json", "number,url,headRefOid"]);
  let head = null;
  try {
    head = JSON.parse(opened.out || "null");
  } catch {
    head = null;
  }
  if (opened.code !== 0 || !head) {
    return refuse("The pull request was created but could not be read back, so nothing confirms which commit it proposes.", EXIT.FAILED);
  }

  const confirmed = await confirmPrHead({ read: () => readHead(head.number), expected: before, sleep });
  if (!confirmed.ok) return refuse(`Pull request #${head.number} was created, but ${confirmed.message}`, EXIT.FAILED);

  recordSubmission(OUTCOME.PR_CREATED, head);
  say(`\nSubmitted (${OUTCOME.PR_CREATED}). Verified commit ${before}, verified locally in Docker, pushed and proposed against '${base}': ${head.url}`);
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
