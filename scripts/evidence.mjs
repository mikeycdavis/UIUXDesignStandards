/**
 * Ingest browser evidence produced by a tool this repository does not ship (ADR 0002).
 *
 * The hazard here is the opposite of the static layer's. A file scan's failure mode is claiming a
 * pass for something it never looked at; an evidence file's failure mode is OVER-READING — treating
 * a run that completed, over a subject that is fresh, as if it had established every rule its
 * surface could in principle establish.
 *
 * So four axes are kept separate, and none of them implies another:
 *
 *   run completion   did the producer finish?
 *   freshness        does the record describe the source as it stands now?
 *   coverage         was the subject actually exercised — every route, every declared viewport class?
 *   check outcome    what did the producer observe about THIS rule, at THIS route and viewport?
 *
 * A rule is established as passing only when all four hold. A rule is established as FAILING on the
 * strength of one conclusive failure, whatever coverage says — the same asymmetry Gate 1 runs on.
 * Presence can be witnessed; absence has to be justified over a surface.
 *
 * WHAT COUNTS AS A BROKEN CONTRACT (exit 2, never a finding, never a verdict):
 *
 *   unreadable, unparseable, or schema-invalid          the document is not evidence
 *   a rule id the catalog does not define               a producer may not invent an identity
 *   a rule whose evidence surface is not this one       a producer may not establish a code-analysis
 *                                                       or manual-review rule through a browser
 *   a viewport or route reference the document
 *     contradicts elsewhere in itself                   the record disagrees with itself
 *   paths that differ from `ui.evidencePaths`           the producer measured a different subject
 *                                                       than the project declared
 *
 * Each of those is a defect in the record rather than a fact about the project, and reporting one as
 * a compliance result would let a broken producer look like a failing product — or, worse, let a
 * carefully broken producer look like a passing one.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validate, assertSchemaSupported } from "./jsonschema.mjs";
import { freshness } from "./content-identity.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SCHEMA_PATH = path.join(ROOT, "schemas/browser-evidence.schema.json");

/** The evidence surfaces this document is allowed to speak for. */
const INGESTIBLE_TYPES = new Set(["browser-analysis", "visual-analysis"]);

export class EvidenceError extends Error {
  constructor(message) {
    super(message);
    this.name = "EvidenceError";
  }
}

/**
 * Read, validate, and anchor an evidence document.
 *
 * Returns the structure `evaluate()` consumes:
 *
 *   { available, document, run, freshness, coverage, byRule: Map<ruleId, outcome[]> }
 *
 * `available: false` is NEVER produced here. A caller that supplied no `--evidence` passes `null` to
 * `evaluate()`, and the browser rules land on `not-evaluated`. That distinction is load-bearing:
 * `evidence-unavailable` means an attempt was made and established nothing, not that nobody tried.
 */
export async function ingest(evidencePath, { root, catalog, policy, routesDiscovered = [] } = {}) {
  const schema = JSON.parse(await readFile(SCHEMA_PATH, "utf8"));
  assertSchemaSupported(schema);

  let document;
  try {
    document = JSON.parse(await readFile(evidencePath, "utf8"));
  } catch (error) {
    throw new EvidenceError(`${evidencePath} could not be read as JSON: ${error.message}`);
  }

  const schemaErrors = validate(document, schema);
  if (schemaErrors.length > 0) {
    throw new EvidenceError(
      `${evidencePath} is not a browser-evidence document:\n` +
        schemaErrors.map((e) => `  ${e.path || "(document)"}: ${e.message}`).join("\n"),
    );
  }

  assertContract(document, evidencePath, catalog, policy);

  const state = freshness(root, {
    paths: document.revision.paths,
    identity: document.revision.sourceIdentity,
    revision: document.revision.gitSha,
  });

  const byRule = new Map();
  for (const route of document.routes) {
    for (const check of route.checks) {
      if (!byRule.has(check.ruleId)) byRule.set(check.ruleId, []);
      byRule.get(check.ruleId).push({
        outcome: check.outcome,
        route: route.route,
        // Carried so the verdict layer can apply the asymmetry itself rather than inheriting a
        // filtered list: a PASS from a route the run did not finish establishes nothing, while a
        // FAILURE observed there was still observed.
        routeStatus: route.status,
        viewport: check.viewport,
        evidence: check.evidence,
      });
    }
  }

  return {
    available: true,
    document,
    run: document.run,
    freshness: state.state,
    freshnessReason: state.reason ?? null,
    coverage: assessCoverage(document, policy, routesDiscovered),
    byRule,
  };
}

/**
 * The contract checks the schema cannot express. Every one of these throws.
 */
function assertContract(document, where, catalog, policy) {
  const viewportNames = new Set(document.viewports.map((viewport) => viewport.name));

  const unknownRules = [];
  const wrongSurface = [];
  const unknownViewports = [];

  for (const route of document.routes) {
    for (const name of route.viewportsTested) {
      if (!viewportNames.has(name)) unknownViewports.push(`${route.route}: '${name}'`);
    }
    for (const check of route.checks) {
      const rule = catalog?.rules.get(check.ruleId);
      if (!rule) {
        unknownRules.push(check.ruleId);
        continue;
      }
      if (!INGESTIBLE_TYPES.has(rule.validationType)) {
        wrongSurface.push(`${check.ruleId} (${rule.validationType})`);
      }
      if (!viewportNames.has(check.viewport)) {
        unknownViewports.push(`${check.ruleId}: '${check.viewport}'`);
      }
    }
  }

  if (unknownRules.length > 0) {
    throw new EvidenceError(
      `${where} reports against rule id(s) the catalog does not define: ${[...new Set(unknownRules)].join(", ")}. ` +
        `An evidence producer selects among the catalog's identities; it may not add one.`,
    );
  }

  if (wrongSurface.length > 0) {
    throw new EvidenceError(
      `${where} claims outcomes for rule(s) whose evidence surface is not a browser: ` +
        `${[...new Set(wrongSurface)].join(", ")}. A rule is established through the surface its ` +
        `validationType names and no other — otherwise a producer could satisfy a static or ` +
        `human-reviewed rule simply by asserting it, which is the identity discipline defeated one ` +
        `layer out.`,
    );
  }

  if (unknownViewports.length > 0) {
    throw new EvidenceError(
      `${where} references viewport(s) it does not declare: ${[...new Set(unknownViewports)].join(", ")}. ` +
        `A record that disagrees with itself cannot anchor anything.`,
    );
  }

  const declaredPaths = policy?.ui?.evidencePaths;
  if (Array.isArray(declaredPaths) && declaredPaths.length > 0) {
    const declared = [...declaredPaths].sort().join("\n");
    const recorded = [...document.revision.paths].sort().join("\n");
    if (declared !== recorded) {
      throw new EvidenceError(
        `${where} records an identity over paths the project did not declare. The policy declares ` +
          `ui.evidencePaths: ${declaredPaths.join(", ")}; the record covers ` +
          `${document.revision.paths.join(", ")}. A producer that measures a narrower subject than ` +
          `the project declared would be able to widen its own claim by looking at less.`,
      );
    }
  }
}

/**
 * Was the subject actually exercised?
 *
 * Coverage is assessed against declarations and observations that exist independently of the
 * producer, so that narrowing the run cannot widen the claim:
 *
 *   every enumerated route reached `tested`      — a route the run failed or skipped was not exercised
 *   every DECLARED viewport class was tested     — `ui.viewportClasses` is the project's declaration
 *   at least as many routes as the static scan   — the file scan witnessed route modules; a run that
 *     discovered                                   mentions fewer has not covered the interface
 *
 * The last is a lower bound rather than a mapping: route modules and URL routes do not correspond
 * one-to-one, so it is INFERRED, it is recorded with both numbers, and it can only ever make
 * coverage incomplete. It never turns an incomplete run into a complete one.
 */
export function assessCoverage(document, policy, routesDiscovered = []) {
  const reasons = [];
  const enumerated = document.routes.map((route) => route.route);
  const tested = document.routes.filter((route) => route.status === "tested").map((route) => route.route);
  const notTested = document.routes
    .filter((route) => route.status !== "tested")
    .map((route) => `${route.route} (${route.status})`);

  const classOf = new Map(document.viewports.map((viewport) => [viewport.name, viewport.class]));
  const classesTested = new Set();
  for (const route of document.routes) {
    if (route.status !== "tested") continue;
    for (const name of route.viewportsTested) {
      const cls = classOf.get(name);
      if (cls) classesTested.add(cls);
    }
  }

  const declaredClasses = policy?.ui?.viewportClasses ?? [];
  const missingClasses = declaredClasses.filter((cls) => !classesTested.has(cls));

  if (enumerated.length === 0) reasons.push("the run enumerated no routes at all");
  if (notTested.length > 0) reasons.push(`route(s) not exercised: ${notTested.join(", ")}`);
  if (missingClasses.length > 0) {
    reasons.push(
      `declared viewport class(es) never tested: ${missingClasses.join(", ")}`,
    );
  }
  if (routesDiscovered.length > enumerated.length) {
    reasons.push(
      `the source scan found ${routesDiscovered.length} route module(s) and the run enumerated ` +
        `${enumerated.length} route(s) — INFERRED, since route modules and routes do not correspond ` +
        `one to one, and recorded because it can only narrow what this run covered`,
    );
  }

  return {
    complete: reasons.length === 0,
    routesEnumerated: enumerated,
    routesTested: tested,
    routesNotTested: notTested,
    viewportClassesDeclared: declaredClasses,
    viewportClassesTested: [...classesTested].sort(),
    viewportClassesMissing: missingClasses,
    routesDiscoveredStatically: routesDiscovered.length,
    reasons,
  };
}

/**
 * The `browserRun` sub-block of the evidence surface, filled from an ingested document.
 *
 * Reported whether or not the run established anything: Standard 35 R8 requires a run to say what it
 * exercised, and a failed run that reported nothing would be indistinguishable from no run at all.
 */
export function browserSurface(evidence) {
  if (!evidence?.available) {
    return {
      status: "not-attempted",
      runAt: null,
      viewportsTested: [],
      routesTested: [],
      routesFailed: [],
      accessibilityTree: "not-obtained",
      screenshotsCaptured: 0,
      evidenceFreshness: "n/a",
    };
  }

  const document = evidence.document;
  const viewports = new Set();
  let screenshots = 0;
  let treeObtained = false;
  for (const route of document.routes) {
    if (route.status === "tested") for (const name of route.viewportsTested) viewports.add(name);
    if (route.accessibilityTree === "obtained") treeObtained = true;
    screenshots += route.screenshots?.length ?? 0;
  }

  return {
    status: document.run.status,
    runAt: document.runAt,
    viewportsTested: [...viewports].sort(),
    routesTested: evidence.coverage.routesTested,
    routesFailed: evidence.coverage.routesNotTested,
    accessibilityTree: treeObtained ? "obtained" : "not-obtained",
    screenshotsCaptured: screenshots,
    evidenceFreshness: evidence.freshness,
    coverage: evidence.coverage,
    producedBy: document.producedBy,
  };
}
