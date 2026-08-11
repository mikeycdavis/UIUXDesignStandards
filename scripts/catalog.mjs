/**
 * VENDORED AND MODIFIED — derived from EngineeringStandards/scripts/catalog.mjs on 2026-08-10.
 * See artifacts/adr/0001-vendor-the-neutral-core-rather-than-share-a-package.md.
 *
 * Modifications, each with its own decision record:
 *   - browser-analysis and visual-analysis validation types              (ADR 0004)
 *   - `full` assurance restricted to enumerable subjects                 (ADR 0005)
 *   - `appliesTo` and `crossReferences` as required fields               (ADR 0003, ADR 0006)
 *   - rule-id grammar admits a hyphen in the domain segment              (ADR 0007)
 *
 * The rule catalog is the single source of machine truth for rule identity and metadata. The
 * architectural rule this module exists to hold, and which the whole compliance system rests on:
 *
 *   The catalog defines rule identity and metadata.
 *   project-policy.yml defines project applicability.
 *   The evaluator produces evidence.
 *   None of the three may redefine the others.
 *
 * So: a level or severity here is the framework's default and a policy may select a different level
 * for a project, but a policy may not invent a rule the catalog does not define, and an evaluator may
 * not report against an id the catalog does not carry. `assertBindings` enforces the last of those
 * mechanically, because a detector reporting an unknown rule id is precisely the dual-vocabulary
 * drift the identity discipline exists to abolish.
 */

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_DIR = path.join(ROOT, "rules");

export const VALIDATION_TYPES = new Set([
  "structural",
  "document",
  "configuration",
  "code-analysis",
  "browser-analysis",
  "visual-analysis",
  "manual-review",
]);
export const ASSURANCE = new Set(["full", "partial", "none"]);
export const LEVELS = new Set(["required", "recommended", "optional", "forbidden"]);
export const SEVERITIES = new Set(["error", "warning", "info"]);

/**
 * Which evidence surface a rule's type implies. Derived rather than authored, so a rule cannot
 * declare a type and a contradicting surface (ADR 0004).
 */
export const EVIDENCE_SURFACE = {
  structural: "static",
  document: "static",
  configuration: "static",
  "code-analysis": "static",
  "browser-analysis": "browser",
  "visual-analysis": "visual",
  "manual-review": "human",
};

/**
 * `full` assurance means the check saw the whole of its subject. That is only possible where the
 * subject is enumerable: a file exists or does not, a config key is present with a legal value, a
 * document contains the sections it must.
 *
 * Source analysis cannot enumerate every instance of its subject. A browser run exercises the routes,
 * viewports, and states it was given and nothing else. A screenshot establishes what rendered and not
 * whether it is good. A human establishes a judgment. None of those is a proof over a whole subject,
 * and a rule claiming otherwise is the false green this framework exists to prevent (ADR 0005).
 */
const FULL_ASSURANCE_TYPES = new Set(["structural", "document", "configuration"]);

/**
 * Applicability classes a rule may declare. `any-ui` means every applicable interface; `process`
 * means the rule governs the project's own process and applies regardless of whether a UI exists
 * (ADR 0003). A rule may not mix `any-ui` with specific classes — that combination has no meaning
 * beyond `any-ui` and would let two spellings say one thing.
 */
export const APPLIES_TO = new Set([
  "any-ui",
  "web-ui",
  "mobile-ui",
  "desktop-ui",
  "embedded-ui",
  "process",
]);

/** How a local rule relates to a rule owned by another standards repository (ADR 0006). */
export const CROSS_REFERENCE_RELATIONSHIPS = new Set(["presentation-of", "complements", "defers-to"]);

// The first segment admits a hyphen so that the mandated `ai-ux.*` domain is spellable (ADR 0007).
// This pattern must stay byte-identical to $defs/ruleId in schemas/project-policy.schema.json: a
// divergence would let a policy key validate against one and fail the other, which is a split
// identity by another route.
const CANONICAL_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*(\.[a-z0-9]+(-[a-z0-9]+)*)+$/;

export class CatalogError extends Error {
  constructor(message) {
    super(message);
    this.name = "CatalogError";
  }
}

/**
 * Load every rules/*.json file into one catalog.
 *
 * Returns { rules: Map<id, rule>, aliases: Map<alias, id>, byCategory: Map<category, rule[]> }.
 * Throws CatalogError on a malformed entry — a catalog that loads partially would silently shrink
 * the denominator every score is computed over.
 */
export async function loadCatalog(dir = CATALOG_DIR) {
  const rules = new Map();
  const aliases = new Map();
  const crossReferenced = [];

  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) throw new CatalogError(`no rule files found in ${dir}`);

  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(await readFile(path.join(dir, file), "utf8"));
    } catch (error) {
      throw new CatalogError(`${file}: ${error.message}`);
    }
    if (!Array.isArray(parsed.rules)) throw new CatalogError(`${file}: missing a 'rules' array`);

    for (const rule of parsed.rules) {
      const where = `${file}:${rule.id ?? "(no id)"}`;
      if (typeof rule.id !== "string" || !CANONICAL_ID.test(rule.id)) {
        throw new CatalogError(`${where}: id is not a canonical domain.kebab-case-name`);
      }
      if (rules.has(rule.id)) throw new CatalogError(`${where}: duplicate rule id`);

      for (const [field, allowed] of [
        ["level", LEVELS],
        ["severity", SEVERITIES],
        ["validationType", VALIDATION_TYPES],
        ["assurance", ASSURANCE],
      ]) {
        if (!allowed.has(rule[field])) {
          throw new CatalogError(`${where}: ${field} '${rule[field]}' is not one of ${[...allowed].join(", ")}`);
        }
      }
      if (rule.assurance === "full" && !FULL_ASSURANCE_TYPES.has(rule.validationType)) {
        throw new CatalogError(
          `${where}: assurance 'full' is not claimable by a ${rule.validationType} rule — ` +
            `only ${[...FULL_ASSURANCE_TYPES].join(", ")} rules see the whole of their subject (ADR 0005)`,
        );
      }
      for (const field of ["title", "description", "remediation", "introducedIn"]) {
        if (typeof rule[field] !== "string" || rule[field].trim() === "") {
          throw new CatalogError(`${where}: ${field} is required`);
        }
      }
      if (typeof rule.standard !== "number") throw new CatalogError(`${where}: standard must be a number`);
      if (typeof rule.nonExemptible !== "boolean") {
        throw new CatalogError(`${where}: nonExemptible must be a boolean`);
      }
      // Present from the first release even when empty: adding them later means every existing rule
      // silently lacks them, and consumers treat their absence as meaningful.
      for (const field of ["deprecatedIn", "supersededBy", "removedIn"]) {
        if (!(field in rule)) throw new CatalogError(`${where}: lifecycle field '${field}' must be present`);
      }
      if (!Array.isArray(rule.aliases)) throw new CatalogError(`${where}: aliases must be an array`);

      // appliesTo — which applicability classes this rule governs (ADR 0003).
      if (!Array.isArray(rule.appliesTo) || rule.appliesTo.length === 0) {
        throw new CatalogError(`${where}: appliesTo must be a non-empty array`);
      }
      for (const cls of rule.appliesTo) {
        if (!APPLIES_TO.has(cls)) {
          throw new CatalogError(`${where}: appliesTo '${cls}' is not one of ${[...APPLIES_TO].join(", ")}`);
        }
      }
      if (rule.appliesTo.includes("any-ui") && rule.appliesTo.some((c) => c !== "any-ui")) {
        throw new CatalogError(`${where}: appliesTo may not mix 'any-ui' with specific classes`);
      }
      if (rule.appliesTo.includes("process") && rule.appliesTo.length > 1) {
        throw new CatalogError(`${where}: appliesTo 'process' may not be combined with UI classes`);
      }

      // crossReferences — metadata only. Never resolved, never an alias (ADR 0006).
      if (!Array.isArray(rule.crossReferences)) {
        throw new CatalogError(`${where}: crossReferences must be an array, empty where there are none`);
      }
      for (const ref of rule.crossReferences) {
        if (typeof ref?.repository !== "string" || ref.repository.trim() === "") {
          throw new CatalogError(`${where}: a crossReference is missing 'repository'`);
        }
        if (typeof ref?.ruleId !== "string" || ref.ruleId.trim() === "") {
          throw new CatalogError(`${where}: a crossReference is missing 'ruleId'`);
        }
        if (!CROSS_REFERENCE_RELATIONSHIPS.has(ref.relationship)) {
          throw new CatalogError(
            `${where}: crossReference relationship '${ref.relationship}' is not one of ` +
              `${[...CROSS_REFERENCE_RELATIONSHIPS].join(", ")}`,
          );
        }
        // The key set is closed. A cross-reference states a relationship and nothing else: a `level`
        // or `severity` here would be inert today and an invitation tomorrow to derive a local
        // property from a foreign repository's decision. Local metadata is authored locally or it is
        // not authored at all (ADR 0006).
        const foreign = Object.keys(ref).filter(
          (key) => !["repository", "ruleId", "relationship", "note"].includes(key),
        );
        if (foreign.length > 0) {
          throw new CatalogError(
            `${where}: crossReference carries ${foreign.join(", ")} — a cross-reference may state ` +
              `repository, ruleId, relationship, and note, never a rule property`,
          );
        }
        crossReferenced.push({ where, ruleId: ref.ruleId });
      }

      for (const alias of rule.aliases) {
        if (aliases.has(alias)) throw new CatalogError(`${where}: alias '${alias}' is already claimed`);
        if (rules.has(alias)) throw new CatalogError(`${where}: '${alias}' is both a rule id and an alias`);
        aliases.set(alias, rule.id);
      }
      if ("attestable" in rule && typeof rule.attestable !== "boolean") {
        throw new CatalogError(`${where}: attestable must be a boolean when present`);
      }
      // Defaults to manual-review because those are the rules whose metadata already says a human is
      // the evaluator; anything else must opt in explicitly, so attestation cannot become a universal
      // override. A visual-analysis rule may opt in — a human reviewing captured screenshots is a
      // real evidence path (ADR 0002).
      const attestable = rule.attestable ?? rule.validationType === "manual-review";
      rules.set(
        rule.id,
        Object.freeze({
          ...rule,
          attestable,
          evidenceSurface: EVIDENCE_SURFACE[rule.validationType],
          source: file,
        }),
      );
    }
  }

  // A second pass: an alias must never collide with a rule id defined in a later file.
  for (const alias of aliases.keys()) {
    if (rules.has(alias)) throw new CatalogError(`'${alias}' is both a rule id and an alias`);
  }

  // A cross-referenced foreign id must never also name something here. One string, one rule — the
  // collision check runs after all files load so ordering cannot hide it (ADR 0006).
  for (const { where, ruleId } of crossReferenced) {
    if (rules.has(ruleId)) {
      throw new CatalogError(`${where}: crossReference '${ruleId}' collides with a local rule id`);
    }
    if (aliases.has(ruleId)) {
      throw new CatalogError(`${where}: crossReference '${ruleId}' collides with a local alias`);
    }
  }

  const byCategory = new Map();
  for (const rule of rules.values()) {
    if (!byCategory.has(rule.category)) byCategory.set(rule.category, []);
    byCategory.get(rule.category).push(rule);
  }

  return { rules, aliases, byCategory };
}

/**
 * Resolve an id or a legacy alias to a canonical rule. Returns undefined if neither.
 *
 * Cross-references are deliberately absent from this path. Letting a foreign id resolve here would
 * make it usable as a policy key, which is how a second canonical identity gets created one layer
 * down (ADR 0006).
 */
export function resolve(catalog, id) {
  return catalog.rules.get(id) ?? catalog.rules.get(catalog.aliases.get(id));
}

/**
 * Assert every rule id an evaluator reports against exists in the catalog.
 *
 * This is the mechanical guard on the architectural rule. Without it an evaluator can grow its own
 * vocabulary one detector at a time. It applies equally to ingested browser evidence, which is
 * external input authored by a tool this repository does not control (ADR 0002).
 */
export function assertBindings(catalog, ids) {
  const unknown = [...new Set(ids)].filter((id) => !catalog.rules.has(id));
  if (unknown.length > 0) {
    throw new CatalogError(
      `evaluator reports against rule id(s) the catalog does not define: ${unknown.join(", ")}`,
    );
  }
}

/**
 * Framework maturity metadata — NOT part of the compliance score, and deliberately separate from it.
 *
 * The hazard this exists to counter: someone reads `COMPLIANT` and forgets that the catalog covers a
 * subset of the framework. A verdict is a statement about the rules that exist as rules; this is a
 * statement about how much of the framework has been turned into rules at all. Mixing the two would
 * make a coverage improvement look like a compliance improvement.
 *
 * `fullyMachineRepresented` is deliberately strict: a standard counts only when every one of its
 * catalogued rules is both evaluated by the validator AND carries assurance better than `none`.
 * A standard whose rules are all catalogued but all unevaluated is represented on paper, not in
 * practice, and a looser definition would let the number rise without the tooling improving.
 */
export function coverage(catalog, { evaluated = [], totalStandards = null } = {}) {
  const examined = new Set(evaluated);
  const byStandard = new Map();
  for (const rule of catalog.rules.values()) {
    if (!byStandard.has(rule.standard)) byStandard.set(rule.standard, []);
    byStandard.get(rule.standard).push(rule);
  }

  let fullyMachineRepresented = 0;
  for (const rules of byStandard.values()) {
    const complete = rules.every((r) => examined.has(r.id) && r.assurance !== "none");
    if (complete) fullyMachineRepresented++;
  }

  return {
    cataloguedRules: catalog.rules.size,
    evaluatedRules: [...catalog.rules.keys()].filter((id) => examined.has(id)).length,
    standards: totalStandards,
    standardsWithRules: byStandard.size,
    fullyMachineRepresentedStandards: fullyMachineRepresented,
    note: "Framework maturity, not compliance. A standard counts as fully machine-represented only when every rule it contributes is evaluated and carries assurance above none.",
  };
}
