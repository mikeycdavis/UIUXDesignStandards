/**
 * The provenance base. Every freshness claim the framework later makes rests on these behaviours, so
 * they are proved here rather than deferred to the general suite.
 *
 * These tests build real throwaway repositories in a temporary directory — git init, commit, mutate,
 * commit again — because the behaviours under test are properties of repository history and are not
 * observable against fixtures. Nothing here depends on this repository's own history.
 *
 * The ten cases map to the M1 stopping criteria recorded in artifacts/prompts/owner-decisions.md,
 * decision 7.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir, readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  computeIdentity,
  freshness,
  workingSubjectClean,
  resolveRevision,
  FRESHNESS,
  UNAVAILABLE,
} from "../scripts/content-identity.mjs";
// The use/mention guard below uses the evaluator's own view splitter, deliberately: the framework's
// source is held to the discipline the framework applies to everyone else's, by the same code.
import { splitSource } from "../scripts/uiux.mjs";

const SELF = path.resolve(import.meta.dirname, "..");

function git(root, ...args) {
  const r = spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout.trim();
}

/** A repository with one commit containing the given files. */
async function makeRepo(files = { "a.css": "a{}", "b.css": "b{}", "unrelated.md": "docs" }) {
  const root = await mkdtemp(path.join(tmpdir(), "uiux-ci-"));
  git(root, "init", "--quiet");
  git(root, "config", "user.email", "test@example.invalid");
  git(root, "config", "user.name", "Test");
  git(root, "config", "commit.gpgsign", "false");
  for (const [name, body] of Object.entries(files)) {
    const full = path.join(root, name);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
  }
  git(root, "add", "-A");
  git(root, "commit", "--quiet", "-m", "initial");
  return root;
}

async function withRepo(files, fn) {
  const root = await makeRepo(files);
  try {
    return await fn(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

/** Record a review of `paths` as they stand now — the shape a caller persists. */
function record(root, paths) {
  const computed = computeIdentity(root, paths, "HEAD");
  assert.equal(computed.state, "COMPUTED", computed.reason);
  return { paths, identity: computed.identity, revision: computed.revision };
}

// --- Known-positive: identity is computed and reproducible ---

test("identity is computed from the committed tree and is reproducible", async () => {
  await withRepo(undefined, (root) => {
    const first = computeIdentity(root, ["a.css"], "HEAD");
    const second = computeIdentity(root, ["a.css"], "HEAD");
    assert.equal(first.state, "COMPUTED");
    assert.equal(first.identity.length, 32);
    assert.equal(first.identity, second.identity, "the same subject produced two identities");
  });
});

test("two clean checkouts of one commit produce the same identity", async () => {
  await withRepo(undefined, async (origin) => {
    const clone = await mkdtemp(path.join(tmpdir(), "uiux-ci-clone-"));
    try {
      spawnSync("git", ["clone", "--quiet", origin, clone], { encoding: "utf8" });
      const here = computeIdentity(origin, ["a.css", "b.css"], "HEAD");
      const there = computeIdentity(clone, ["a.css", "b.css"], "HEAD");
      assert.equal(there.state, "COMPUTED", there.reason);
      assert.equal(
        there.identity,
        here.identity,
        "identity varied across clean checkouts of one commit — the defect ADR 0011 exists to prevent",
      );
    } finally {
      await rm(clone, { recursive: true, force: true });
    }
  });
});

test("path order does not affect identity", async () => {
  await withRepo(undefined, (root) => {
    const a = computeIdentity(root, ["a.css", "b.css"], "HEAD");
    const b = computeIdentity(root, ["b.css", "a.css"], "HEAD");
    assert.equal(a.identity, b.identity);
  });
});

// --- Case 4: requested-path completeness ---

test("requesting [a,b] where only a resolves never yields the identity of [a]", async () => {
  await withRepo(undefined, (root) => {
    const alone = computeIdentity(root, ["a.css"], "HEAD");
    const withGhost = computeIdentity(root, ["a.css", "ghost.css"], "HEAD");

    assert.equal(alone.state, "COMPUTED");
    assert.equal(withGhost.state, "UNAVAILABLE", "an absent path was silently dropped from the subject");
    assert.equal(withGhost.code, UNAVAILABLE.PATHS_ABSENT);
    assert.deepEqual(withGhost.missing, ["ghost.css"]);
    assert.equal(withGhost.identity, undefined, "an identity was produced for an incomplete subject");
  });
});

// --- Case 5: the resolved revision is immutable ---

test("computeIdentity resolves HEAD to a full SHA and never returns the literal HEAD", async () => {
  await withRepo(undefined, (root) => {
    const computed = computeIdentity(root, ["a.css"], "HEAD");
    assert.match(computed.revision, /^[0-9a-f]{40}$/);
    assert.notEqual(computed.revision, "HEAD");
  });
});

test("a stored resolved revision survives the branch advancing, and change is proved against it", async () => {
  await withRepo(undefined, async (root) => {
    const stored = record(root, ["a.css"]);
    const originalSha = stored.revision;

    // Advance the repository by one commit, changing the reviewed content.
    await writeFile(path.join(root, "a.css"), "a{color:red}");
    git(root, "add", "-A");
    git(root, "commit", "--quiet", "-m", "second");

    assert.equal(stored.revision, originalSha, "the stored revision moved with the branch");
    assert.notEqual(git(root, "rev-parse", "HEAD"), originalSha, "the test did not actually advance HEAD");

    // The historical subject still reconstructs from the stored SHA...
    const historical = computeIdentity(root, ["a.css"], originalSha);
    assert.equal(historical.state, "COMPUTED");
    assert.equal(historical.identity, stored.identity);

    // ...and the current subject differs, so the record is stale rather than silently re-anchored.
    const current = computeIdentity(root, ["a.css"], "HEAD");
    assert.notEqual(current.identity, stored.identity);
    assert.equal(freshness(root, stored).state, FRESHNESS.STALE);
  });
});

test("a record storing the literal HEAD is evidence-unavailable, not fresh", async () => {
  await withRepo(undefined, (root) => {
    const stored = record(root, ["a.css"]);
    const result = freshness(root, { ...stored, revision: "HEAD" });
    assert.equal(
      result.state,
      FRESHNESS.EVIDENCE_UNAVAILABLE,
      "a moving reference was accepted as a historical anchor",
    );
    assert.match(result.reason, /not a full commit SHA/);
  });
});

// --- Cases 6 and 7: reviewed-path modification stales ---

test("an unstaged modification to a reviewed path is STALE", async () => {
  await withRepo(undefined, async (root) => {
    const stored = record(root, ["a.css"]);
    await writeFile(path.join(root, "a.css"), "a{color:blue}");
    assert.equal(freshness(root, stored).state, FRESHNESS.STALE);
  });
});

test("a staged-only modification to a reviewed path is STALE", async () => {
  await withRepo(undefined, async (root) => {
    const stored = record(root, ["a.css"]);
    await writeFile(path.join(root, "a.css"), "a{color:green}");
    git(root, "add", "a.css");
    // The index now matches the working tree, and neither matches HEAD. An index-derived identity
    // would call this fresh; this is the uncommitted-change false-freshness case ADR 0011 rejects.
    assert.equal(freshness(root, stored).state, FRESHNESS.STALE);
  });
});

// --- Case 8: unrelated dirt does not stale ---

test("a modification to an unrelated path leaves the record FRESH", async () => {
  await withRepo(undefined, async (root) => {
    const stored = record(root, ["a.css"]);
    await writeFile(path.join(root, "unrelated.md"), "docs, rewritten");
    await writeFile(path.join(root, "untracked-note.txt"), "scratch");
    assert.equal(
      freshness(root, stored).state,
      FRESHNESS.FRESH,
      "an unrelated edit invalidated a review — freshness is not path-scoped",
    );
  });
});

test("workingSubjectClean is path-scoped in both directions", async () => {
  await withRepo(undefined, async (root) => {
    await writeFile(path.join(root, "unrelated.md"), "changed");
    assert.equal(workingSubjectClean(root, ["a.css"]).clean, true);
    assert.equal(workingSubjectClean(root, ["unrelated.md"]).clean, false);
  });
});

// --- Case 9: absence-at-current after presence-at-review is STALE ---

test("a reviewed path present at the recorded revision and absent at HEAD is STALE", async () => {
  await withRepo(undefined, (root) => {
    const stored = record(root, ["a.css"]);
    git(root, "rm", "--quiet", "a.css");
    git(root, "commit", "--quiet", "-m", "remove a");

    const result = freshness(root, stored);
    assert.equal(result.state, FRESHNESS.STALE);
    assert.deepEqual(result.missing, ["a.css"]);
  });
});

test("an untracked replacement does not downgrade a proved change to EVIDENCE_UNAVAILABLE", async () => {
  await withRepo(undefined, async (root) => {
    const stored = record(root, ["a.css"]);
    git(root, "rm", "--quiet", "a.css");
    git(root, "commit", "--quiet", "-m", "remove a");
    // The same path reappears, untracked. The historical-to-current comparison has already proved
    // the subject changed; an untracked file must not convert that into a failure to measure.
    await writeFile(path.join(root, "a.css"), "a{}");

    const result = freshness(root, stored);
    assert.equal(
      result.state,
      FRESHNESS.STALE,
      "an untracked replacement laundered a proved change into unavailability",
    );
  });
});

// --- Case 10: genuine unavailability, and no index or working-tree bytes ---

test("an untracked reviewed path with no committed subject is EVIDENCE_UNAVAILABLE", async () => {
  await withRepo(undefined, async (root) => {
    await writeFile(path.join(root, "never-committed.css"), "x{}");
    const computed = computeIdentity(root, ["never-committed.css"], "HEAD");
    assert.equal(computed.state, "UNAVAILABLE");
    assert.equal(computed.code, UNAVAILABLE.PATHS_ABSENT);

    const result = freshness(root, {
      paths: ["never-committed.css"],
      identity: "0".repeat(32),
      revision: git(root, "rev-parse", "HEAD"),
    });
    assert.equal(result.state, FRESHNESS.EVIDENCE_UNAVAILABLE);
  });
});

test("an unresolvable revision is EVIDENCE_UNAVAILABLE, not STALE", async () => {
  await withRepo(undefined, (root) => {
    const result = freshness(root, {
      paths: ["a.css"],
      identity: "0".repeat(32),
      revision: "d".repeat(40),
    });
    assert.equal(result.state, FRESHNESS.EVIDENCE_UNAVAILABLE);
    assert.equal(result.code, UNAVAILABLE.REVISION_UNRESOLVABLE);
  });
});

test("a directory that is not a repository is EVIDENCE_UNAVAILABLE", async () => {
  const plain = await mkdtemp(path.join(tmpdir(), "uiux-ci-plain-"));
  try {
    await writeFile(path.join(plain, "a.css"), "a{}");
    const computed = computeIdentity(plain, ["a.css"], "HEAD");
    assert.equal(computed.state, "UNAVAILABLE");
    assert.ok(
      [UNAVAILABLE.NOT_A_REPOSITORY, UNAVAILABLE.REVISION_UNRESOLVABLE].includes(computed.code),
      `unexpected code ${computed.code}`,
    );
  } finally {
    await rm(plain, { recursive: true, force: true });
  }
});

test("identity ignores working-tree bytes entirely", async () => {
  await withRepo(undefined, async (root) => {
    const before = computeIdentity(root, ["a.css"], "HEAD").identity;
    await writeFile(path.join(root, "a.css"), "completely different bytes on disk");
    const after = computeIdentity(root, ["a.css"], "HEAD").identity;
    assert.equal(after, before, "identity changed when only the working tree changed");
  });
});

test("identity ignores the staging area entirely", async () => {
  await withRepo(undefined, async (root) => {
    const before = computeIdentity(root, ["a.css"], "HEAD").identity;
    await writeFile(path.join(root, "a.css"), "staged but never committed");
    git(root, "add", "a.css");
    const after = computeIdentity(root, ["a.css"], "HEAD").identity;
    assert.equal(after, before, "identity changed when only the index changed");
  });
});

// --- Source-shape guards ---

/**
 * The rejected alternatives, by the exact token that would appear if one were used.
 *
 * `ls-files` and `--cached` are how a program asks git about the INDEX; `diff-index` compares against
 * it. Reading file contents is the other rejected alternative — two clean checkouts of one commit can
 * hold different bytes once a filter or line-ending normalisation is involved, so bytes are not an
 * identity.
 */
const REJECTED = [
  { token: "ls-files", why: "would compute identity from the staging area" },
  { token: "--cached", why: "would ask git about the index rather than the commit" },
  { token: "diff-index", why: "would compare against the index rather than the committed tree" },
  { token: "readFile", why: "would compute identity from bytes on disk" },
];

test("the primitive does not USE the rejected alternatives, and is free to EXPLAIN them", async () => {
  const source = await readFile(path.join(SELF, "scripts/content-identity.mjs"), "utf8");
  const { sourceOf, commentsOf } = splitSource(source, ".mjs");

  // The distinction the detectors are held to, applied to this repository's own source. `sourceOf`
  // is the file with comments removed and string literals INTACT — which is the right view, because
  // a git subcommand is used by appearing inside a string. The earlier version of this guard
  // searched the raw text, which forbade the module from naming what it had rejected: an
  // architectural decision was unexplainable in the one file that implements it.
  for (const { token, why } of REJECTED) {
    assert.equal(
      sourceOf.includes(token),
      false,
      `content-identity.mjs executes '${token}', which ${why} (ADR 0011)`,
    );
  }

  // And the positive half. A guard that merely happened to pass because nobody mentioned these would
  // be indistinguishable from one that works, so the module is required to have paid the explanation
  // back — the M1 debt this replaces.
  for (const { token } of REJECTED) {
    assert.ok(commentsOf.includes(token), `content-identity.mjs never explains why '${token}' is rejected`);
  }
});

test("the use/mention guard fails on a use and passes a mention — both directions", async () => {
  const source = await readFile(path.join(SELF, "scripts/content-identity.mjs"), "utf8");
  const uses = (text) => splitSource(text, ".mjs").sourceOf.includes("ls-files");

  // Mutation 1: the token added as an executable argument. The guard must see it.
  assert.equal(uses(source.replace('["status", "--porcelain"', '["ls-files", "--porcelain"')), true, "a use went unnoticed");

  // Mutation 2: the same token added as prose. The guard must not see it.
  assert.equal(uses(`${source}\n// A note about ls-files and why it is not used here.\n`), false, "a mention was read as a use");

  // Mutation 3: restored. This is the assertion that makes the two above mean something.
  assert.equal(uses(source), false);
});

test("content-identity.mjs is the only identity implementation in scripts/", async () => {
  const { readdir } = await import("node:fs/promises");
  const files = (await readdir(path.join(SELF, "scripts"))).filter((f) => f.endsWith(".mjs"));
  assert.ok(files.length > 0, "no scripts found — the guard would pass vacuously");
  const offenders = [];
  const scoped = [];
  for (const f of files) {
    if (f === "content-identity.mjs") continue;
    const source = await readFile(path.join(SELF, "scripts", f), "utf8");
    if (!/createHash\(\s*["'`]sha256/.test(source)) continue;
    // Not every hash is an identity claim. A file may hash something that is demonstrably not
    // content identity — the release snapshot digests an in-memory projection of rule ids — but it
    // has to SAY SO, in the same spirit as the `VIEW:` doc-comment every detector carries. A bare
    // hash is an offender; a declared and disclaimed one is a different thing with a different name.
    const scope = source.match(/DIGEST-SCOPE:[\s\S]{0,900}?\*\//);
    if (!scope) offenders.push(f);
    else scoped.push([f, scope[0]]);
  }
  assert.deepEqual(offenders, [], "a second content-identity implementation exists, undeclared");

  for (const [f, scope] of scoped) {
    assert.match(
      scope,
      /NOT a content identity/i,
      `${f} declares a DIGEST-SCOPE but never disclaims being a content identity — the declaration has to deny the thing the guard is about, or it is just a comment`,
    );
    assert.match(
      scope,
      /freshness/i,
      `${f} declares a DIGEST-SCOPE without saying what it does to freshness, which is the only question the one-owner rule asks`,
    );
  }
});

// --- Anti-vacuity ---

test("resolveRevision returns a full SHA for HEAD", async () => {
  await withRepo(undefined, (root) => {
    const resolved = resolveRevision(root, "HEAD");
    assert.equal(resolved.ok, true);
    assert.match(resolved.revision, /^[0-9a-f]{40}$/);
    assert.equal(resolved.revision, git(root, "rev-parse", "HEAD"));
  });
});
