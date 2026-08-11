/**
 * Content identity — the single owner of every freshness claim in this framework.
 *
 * Attestations (Standard 37) and ingested browser evidence (Standard 36) both assert that a human or
 * a browser examined some material. Neither is evidence unless the framework can tell whether that
 * material has since changed. This module answers that question, and it is the only place that
 * answers it: a second implementation elsewhere in scripts/ is a test failure, because two
 * definitions of "the same content" drift and then something has to arbitrate.
 *
 * The governing invariant, from
 * artifacts/adr/0011-freshness-is-committed-content-identity-with-path-scoped-working-subject-integrity.md:
 *
 *   Freshness is established against committed repository content, and an attestation or evidence
 *   record may establish the current working subject only when every reviewed path is tracked and
 *   the working copy of every reviewed path corresponds to that committed content.
 *
 * Identity therefore comes from object ids in the committed tree at a named revision. Two
 * alternatives were rejected, and they are named here rather than left to ADR 0011 alone, because an
 * implementer reaching for one of them is reading this file and not that one:
 *
 *   readFile and friends — computing identity from bytes on disk. Two clean checkouts of one commit
 *     can hold different bytes once line-ending normalization or a clean/smudge filter is involved,
 *     and an identity that varies with checkout configuration is not an identity. EngineeringStandards
 *     does this, and it is a known defect rather than a precedent.
 *
 *   git ls-files, --cached, diff-index — asking git about the STAGING AREA. The index reflects
 *     neither the committed revision nor the working tree, so material that is staged but never
 *     committed, and material committed but since modified on disk, would each mint a false-fresh
 *     identity. This is the more tempting mistake of the two, because the command reads like it
 *     answers the question.
 *
 * Naming them costs nothing, because the guard that keeps them out of this module is semantic: the
 * test splits this file into its source and comment views and forbids the tokens in the source view
 * only. A comment may explain a rejected alternative; a string literal handed to a subprocess may
 * not be one. That is the same use/mention discipline every detector in this framework is held to,
 * applied to the framework's own source.
 *
 * Two consumers, one primitive: attestations record `contentIdentity`, browser evidence records
 * `sourceIdentity`, and both call freshness() here.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";

/** Freshness outcomes. Closed: an unrecognised state must never reach a caller. */
export const FRESHNESS = {
  /** Identity matches and every reviewed path's working copy corresponds to committed content. */
  FRESH: "FRESH",
  /** Change was proved. */
  STALE: "STALE",
  /** The required identity could not be established at all. */
  EVIDENCE_UNAVAILABLE: "EVIDENCE_UNAVAILABLE",
};

/**
 * Why an identity could not be computed. These codes exist so that freshness() can apply the
 * precedence rule below; a caller that only needs to know "it failed" can ignore them.
 */
export const UNAVAILABLE = {
  NO_PATHS: "NO_PATHS",
  NO_GIT: "NO_GIT",
  NOT_A_REPOSITORY: "NOT_A_REPOSITORY",
  REVISION_UNRESOLVABLE: "REVISION_UNRESOLVABLE",
  /** One or more requested paths have no committed entry at this revision. */
  PATHS_ABSENT: "PATHS_ABSENT",
};

const FULL_SHA = /^[0-9a-f]{40}$/;
const IDENTITY_LENGTH = 32;

function git(root, args) {
  const result = spawnSync("git", ["-C", root, ...args], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  // spawnSync sets `error` when the binary itself could not be run. A non-zero status with no error
  // is git declining to answer, which is a different thing and is reported by the caller.
  if (result.error) return { ok: false, code: UNAVAILABLE.NO_GIT, message: result.error.message };
  if (result.status !== 0) return { ok: false, status: result.status, message: (result.stderr || "").trim() };
  return { ok: true, stdout: result.stdout };
}

/** Repository-root-relative, forward-slashed, de-duplicated, sorted. Git speaks this dialect. */
function normalisePaths(paths) {
  const seen = new Set();
  for (const raw of paths) {
    const p = String(raw).replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
    if (p) seen.add(p);
  }
  return [...seen].sort();
}

/**
 * Resolve a revision to its full, immutable commit SHA.
 *
 * `HEAD` is an input convenience and never provenance: a record that stored the literal string would
 * lose its historical anchor the moment the branch advanced, and a later validation would silently
 * re-point it at material the reviewer never saw. Everything downstream stores what this returns.
 */
export function resolveRevision(root, revision = "HEAD") {
  const result = git(root, ["rev-parse", "--verify", "--quiet", `${revision}^{commit}`]);
  if (!result.ok) {
    if (result.code === UNAVAILABLE.NO_GIT) return { ok: false, code: UNAVAILABLE.NO_GIT, reason: result.message };
    const inside = git(root, ["rev-parse", "--is-inside-work-tree"]);
    if (!inside.ok) {
      return {
        ok: false,
        code: inside.code === UNAVAILABLE.NO_GIT ? UNAVAILABLE.NO_GIT : UNAVAILABLE.NOT_A_REPOSITORY,
        reason: inside.message || `${root} is not a git repository`,
      };
    }
    return { ok: false, code: UNAVAILABLE.REVISION_UNRESOLVABLE, reason: `revision '${revision}' does not resolve to a commit` };
  }
  const sha = result.stdout.trim();
  if (!FULL_SHA.test(sha)) {
    return { ok: false, code: UNAVAILABLE.REVISION_UNRESOLVABLE, reason: `revision '${revision}' did not resolve to a full commit SHA` };
  }
  return { ok: true, revision: sha };
}

/**
 * Object ids for each requested path in the committed tree at `revision`.
 *
 * Requested-path completeness is enforced here rather than assumed. Asking for two paths and being
 * told about one is a successful invocation that answers a different question, and hashing whatever
 * came back would silently produce the identity of a smaller subject. So the requested list is
 * reconciled against the returned list, and any shortfall is a first-class result.
 */
function committedEntries(root, paths, revision) {
  // -z: NUL-separated records, so a path containing a newline cannot forge a record boundary.
  const result = git(root, ["ls-tree", "-z", revision, "--", ...paths]);
  if (!result.ok) {
    return { ok: false, code: result.code || UNAVAILABLE.REVISION_UNRESOLVABLE, reason: result.message };
  }

  const found = new Map();
  for (const record of result.stdout.split("\0")) {
    if (!record) continue;
    // "<mode> <type> <oid>\t<path>" — a tree entry for a directory, a blob entry for a file.
    const tab = record.indexOf("\t");
    if (tab < 0) continue;
    const meta = record.slice(0, tab).split(/\s+/);
    const oid = meta[2];
    const path = record.slice(tab + 1);
    if (oid) found.set(path, oid);
  }

  const missing = paths.filter((p) => !found.has(p));
  if (missing.length > 0) {
    return {
      ok: false,
      code: UNAVAILABLE.PATHS_ABSENT,
      missing,
      reason: `no committed entry at ${revision.slice(0, 12)} for: ${missing.join(", ")}`,
    };
  }
  return { ok: true, entries: paths.map((p) => ({ path: p, oid: found.get(p) })) };
}

/**
 * The identity of a set of paths as committed at a revision.
 *
 * Returns the resolved full SHA alongside the identity, so callers persist an immutable anchor even
 * when they passed `HEAD`.
 */
export function computeIdentity(root, paths, revision = "HEAD") {
  const wanted = normalisePaths(paths || []);
  if (wanted.length === 0) {
    return { state: "UNAVAILABLE", code: UNAVAILABLE.NO_PATHS, reason: "no paths were named" };
  }

  const resolved = resolveRevision(root, revision);
  if (!resolved.ok) return { state: "UNAVAILABLE", code: resolved.code, reason: resolved.reason };

  const listed = committedEntries(root, wanted, resolved.revision);
  if (!listed.ok) {
    return {
      state: "UNAVAILABLE",
      code: listed.code,
      reason: listed.reason,
      revision: resolved.revision,
      ...(listed.missing ? { missing: listed.missing } : {}),
    };
  }

  const hash = createHash("sha256");
  for (const { path, oid } of listed.entries) {
    hash.update(path);
    hash.update("\0");
    hash.update(oid);
    hash.update("\0");
  }

  return {
    state: "COMPUTED",
    revision: resolved.revision,
    identity: hash.digest("hex").slice(0, IDENTITY_LENGTH),
    entries: listed.entries,
  };
}

/**
 * Whether every named path's working copy corresponds to its committed content.
 *
 * Path-scoped on purpose. A design review of src/Button.tsx is not invalidated by an edit to
 * README.md, and a mechanism that said otherwise would train adopters to treat staleness as noise.
 * Staged and unstaged modifications both count: content that is staged has still not been committed,
 * so it is not part of any committed subject.
 */
export function workingSubjectClean(root, paths) {
  const wanted = normalisePaths(paths || []);
  if (wanted.length === 0) return { ok: false, reason: "no paths were named" };
  const result = git(root, ["status", "--porcelain", "--", ...wanted]);
  if (!result.ok) return { ok: false, reason: result.message || "working tree state could not be read" };
  return { ok: true, clean: result.stdout.trim() === "" };
}

/**
 * Establish the freshness of a record against the repository as it stands now.
 *
 * `recorded` is { paths: string[], identity: string, revision: string } — the caller maps its own
 * field names (`contentIdentity` for attestations, `sourceIdentity` for browser evidence) onto these.
 *
 * The precedence rule, which the ordering below implements:
 *
 *   If change can be proved, the outcome is STALE. EVIDENCE_UNAVAILABLE is reserved for the case
 *   where the required identity cannot be established at all.
 *
 * The case that forces it: a reviewed path existed at the recorded revision, is absent at HEAD, and
 * the same path has reappeared untracked in the working tree. The historical-to-current comparison
 * has already proved the subject changed, so an untracked replacement must not downgrade that to a
 * failure to measure — which would be an inability-to-evaluate laundered into an inability-to-blame.
 */
export function freshness(root, recorded) {
  const paths = normalisePaths(recorded?.paths || []);
  if (paths.length === 0) {
    return { state: FRESHNESS.EVIDENCE_UNAVAILABLE, reason: "the record names no paths" };
  }
  if (!recorded?.identity) {
    return { state: FRESHNESS.EVIDENCE_UNAVAILABLE, reason: "the record carries no content identity" };
  }
  // A stored revision must be an immutable anchor. `HEAD`, a branch name, or a tag would all re-point
  // over time, so a record carrying one has no historical subject to reconstruct.
  if (!FULL_SHA.test(String(recorded.revision || ""))) {
    return {
      state: FRESHNESS.EVIDENCE_UNAVAILABLE,
      reason: `the record's revision '${recorded.revision ?? "(absent)"}' is not a full commit SHA, so its historical subject cannot be reconstructed`,
    };
  }

  const historical = computeIdentity(root, paths, recorded.revision);
  if (historical.state !== "COMPUTED") {
    // Nothing can be proved without the historical subject — including that it changed.
    return { state: FRESHNESS.EVIDENCE_UNAVAILABLE, reason: historical.reason, code: historical.code };
  }

  if (historical.identity !== recorded.identity) {
    return {
      state: FRESHNESS.STALE,
      reason: "the recorded identity does not match the paths as committed at the recorded revision",
      recordedIdentity: recorded.identity,
      historicalIdentity: historical.identity,
    };
  }

  const current = computeIdentity(root, paths, "HEAD");
  if (current.state !== "COMPUTED") {
    // Precedence: paths that existed at the recorded revision and have no committed entry now are a
    // proved change, not a measurement failure. Every other cause is genuine unavailability.
    if (current.code === UNAVAILABLE.PATHS_ABSENT) {
      return {
        state: FRESHNESS.STALE,
        reason: `reviewed ${current.missing.length === 1 ? "path is" : "paths are"} no longer committed: ${current.missing.join(", ")}`,
        missing: current.missing,
      };
    }
    return { state: FRESHNESS.EVIDENCE_UNAVAILABLE, reason: current.reason, code: current.code };
  }

  if (current.identity !== historical.identity) {
    return {
      state: FRESHNESS.STALE,
      reason: "the reviewed paths have changed since the recorded revision",
      recordedIdentity: recorded.identity,
      currentIdentity: current.identity,
      currentRevision: current.revision,
    };
  }

  const working = workingSubjectClean(root, paths);
  if (!working.ok) {
    return { state: FRESHNESS.EVIDENCE_UNAVAILABLE, reason: working.reason };
  }
  if (!working.clean) {
    return {
      state: FRESHNESS.STALE,
      reason: "a reviewed path is modified in the working tree or staging area, so the current subject is not the committed one",
    };
  }

  return { state: FRESHNESS.FRESH, revision: recorded.revision, identity: recorded.identity };
}
