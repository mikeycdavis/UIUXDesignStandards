/**
 * Attestations — what a recorded human review establishes, and what it does not.
 *
 * A design review is evidence. It is the only evidence some of this framework's most valuable rules
 * can ever have: whether an interface manipulates its user, whether its hierarchy communicates,
 * whether its wording is comprehensible. Nothing mechanical answers those, and a framework that
 * pretended otherwise would be typing them `code-analysis` and passing them on silence.
 *
 * Being evidence, an attestation is subject to the same question every other evidence surface faces:
 * IS IT STILL ABOUT THE THING? This module answers that, on two axes that are deliberately not one:
 *
 *   freshness   does the review describe the material as it stands now?
 *   scope       did the review cover the material the PROJECT said had to be covered?
 *
 * Freshness is the shared primitive (scripts/content-identity.mjs) — the same implementation browser
 * evidence uses, never a second one.
 *
 * Scope is this module's own work, and it exists because of an asymmetry between the two surfaces. A
 * browser producer enumerates the routes it visited and can be checked against the routes the source
 * scan found. A human reviewer writes down what they looked at, and there is no independent record of
 * what they could have looked at. Left there, `reviewedAgainst.paths` would mean "whatever made this
 * review easiest": a reviewer could attest to visual hierarchy having opened one screenshot of one
 * route, and the framework would report the rule established.
 *
 * So the required subject is declared by the project, in the policy, separately from the review and
 * ahead of it — `ui.reviewPaths`, optionally narrowed per rule by `ui.reviewScopes`. A review that
 * does not cover it establishes nothing. This is the same move `ui.evidencePaths` makes for browser
 * evidence, applied to the surface that needs it more: a producer at least reports what it did, while
 * a reviewer reports only what they say they did.
 *
 * What this module does NOT do is judge the review. Whether the hierarchy was actually intentional is
 * the reviewer's call and stays theirs; the framework checks only that a review of the declared
 * subject, of current material, is on record.
 */

import { computeIdentity, freshness, FRESHNESS } from "./content-identity.mjs";

/** Repository-relative, forward-slashed, trailing separator removed. Compared, never read from disk. */
function normalise(p) {
  return String(p).replace(/\\/g, "/").replace(/^\.\//, "").replace(/\/+$/, "");
}

/**
 * The material a review of `ruleId` has to cover, and who said so.
 *
 * Returns null when the policy declared nothing. Null is NOT an empty requirement — a rule with no
 * declared subject cannot be established by review at all, because there is nothing the reviewer's
 * own account can be measured against. policy.mjs rejects that configuration at exit 2; the evaluator
 * still handles the null, because it is reachable by any caller that assembles a policy object
 * without going through policy.mjs.
 */
export function requiredSubject(ruleId, policy) {
  const scoped = policy?.ui?.reviewScopes?.[ruleId];
  if (Array.isArray(scoped) && scoped.length > 0) {
    return { paths: scoped.map(normalise), source: `ui.reviewScopes.${ruleId}` };
  }
  const declared = policy?.ui?.reviewPaths;
  if (Array.isArray(declared) && declared.length > 0) {
    return { paths: declared.map(normalise), source: "ui.reviewPaths" };
  }
  return null;
}

/**
 * Whether the reviewed paths cover the required subject.
 *
 * Coverage is by containment: a required path is covered when the review named it, or named a
 * directory containing it. The direction matters and is easy to get backwards — reviewing
 * `src/Button.tsx` does not cover a requirement of `src/`, while reviewing `src/` covers a
 * requirement of `src/Button.tsx`. Getting it backwards would accept exactly the narrow self-selected
 * review this check exists to reject.
 *
 * Reviewing MORE than was required is not an error. The requirement is a floor.
 */
export function assessScope(reviewedPaths, required) {
  const reviewed = (reviewedPaths ?? []).map(normalise).filter(Boolean);
  if (!required) {
    return {
      covered: false,
      unscoped: true,
      missing: [],
      reason:
        "the policy declares no review subject for this rule, so there is nothing the review's own " +
        "account of its scope can be checked against",
    };
  }

  const missing = required.paths.filter(
    (want) => !reviewed.some((had) => want === had || want.startsWith(`${had}/`)),
  );
  if (missing.length > 0) {
    return {
      covered: false,
      unscoped: false,
      missing,
      required: required.paths,
      source: required.source,
      reason:
        `the review does not cover ${missing.join(", ")}, which ${required.source} requires ` +
        `(reviewed: ${reviewed.join(", ") || "nothing"})`,
    };
  }
  return { covered: true, unscoped: false, missing: [], required: required.paths, source: required.source };
}

/**
 * Resolve every attestation in a policy against the repository as it stands.
 *
 * Returns Map<ruleId, { freshness, scope, currentIdentity }>. The evaluator consumes it; nothing here
 * decides a disposition, because the precedence between contradiction, rejection, expiry, freshness,
 * and scope belongs in one place (scripts/compliance.mjs) and this module is one of its inputs.
 *
 * `currentIdentity` is the identity of the reviewed paths as committed at HEAD, computed whenever the
 * record does not carry one. It exists for the recording workflow: a reviewer writes down what they
 * read, runs the validator, and is told the identity to paste back. An identity the framework
 * computes and stores for them would be a record of nothing — it would say the paths match
 * themselves.
 */
export function resolveAttestations(root, policy) {
  const resolved = new Map();
  for (const [ruleId, attestation] of Object.entries(policy?.attestations ?? {})) {
    const paths = attestation?.reviewedAgainst?.paths ?? [];
    const recorded = {
      paths,
      identity: attestation?.reviewedAgainst?.contentIdentity,
      revision: attestation?.reviewedAgainst?.revision,
    };

    const state = recorded.identity ? freshness(root, recorded) : null;

    // No recorded identity is not a freshness failure to diagnose — it is a record that never made a
    // freshness claim. It still establishes nothing, and it is reported as EVIDENCE_UNAVAILABLE with
    // its own reason so that "nobody wrote the identity down" never reads as "the material changed".
    const unrecorded = {
      state: FRESHNESS.EVIDENCE_UNAVAILABLE,
      reason:
        "the attestation records no contentIdentity, so there is nothing to establish that the reviewed " +
        "material is the material that is here now",
      unrecorded: true,
    };

    const current = recorded.identity ? null : computeIdentity(root, paths, "HEAD");

    resolved.set(ruleId, {
      freshness: state ?? unrecorded,
      scope: assessScope(paths, requiredSubject(ruleId, policy)),
      currentIdentity:
        current?.state === "COMPUTED"
          ? { identity: current.identity, revision: current.revision, paths: paths.map(normalise) }
          : null,
    });
  }
  return resolved;
}
