/**
 * Reconcile rule identity across the three places it can be stated.
 *
 *   standards/*.md  ## Implementation tables   — the corpus names identities
 *   artifacts/design/rule-catalog-v1.md        — the freeze fixes them
 *   rules/*.json                               — the catalog implements them
 *
 * The direction is one-way: prose → freeze → catalog. This checker exists so that direction is a
 * mechanical fact rather than an intention. It runs before `rules/` exists (that is the point — the
 * freeze has to be checkable before the thing it constrains is written) and keeps running after.
 *
 * What it deliberately does NOT do is repair. A prose id that is absent from the freeze fails; it is
 * never quietly added. An unowned catalog rule fails; it is never quietly attributed. Every fix is a
 * human editing one of the three files, which is what keeps them three statements of one thing
 * rather than three vocabularies.
 *
 * Exit 0 reconciled, 1 a disagreement, 2 the check could not be performed.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FREEZE = path.join(ROOT, "artifacts", "design", "rule-catalog-v1.md");
const STANDARDS = path.join(ROOT, "standards");
const RULES = path.join(ROOT, "rules");
const ES_RULES = "F:/Repos/EngineeringStandards/rules";

const ID = String.raw`[a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+`;
const FULL_ASSURANCE_TYPES = new Set(["structural", "document", "configuration"]);
const APPLIES = { any: "any-ui", web: "web-ui", mobile: "mobile-ui", desktop: "desktop-ui", embedded: "embedded-ui", proc: "process" };

const problems = [];
const fail = (message) => problems.push(message);
const die = (message) => {
  process.stderr.write(`rule-identity: ${message}\n`);
  process.exit(2);
};

// --- Read the freeze ------------------------------------------------------------------------

if (!existsSync(FREEZE)) die(`${path.relative(ROOT, FREEZE)} does not exist — there is no freeze to reconcile against`);
const freezeText = readFileSync(FREEZE, "utf8");

const declaredCounts = /\*\*(\d+) rules\. (\d+) forbidden\. (\d+) static detectors\.\*\*/.exec(freezeText);
if (!declaredCounts) {
  die("the freeze does not state its counts in the form '**N rules. N forbidden. N static detectors.**'");
}

/**
 * Parse the per-domain tables. A row is only a rule when its first cell is a backticked id, so the
 * column-legend table and the cross-reference table cannot be mistaken for rule rows.
 */
const frozen = new Map();
const ROW = new RegExp(
  String.raw`^\|\s*\`(${ID})\`\s*\|([^|]*)\|\s*(\d+)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|\s*(\S+)\s*\|`,
);
for (const line of freezeText.split(/\r?\n/)) {
  const m = ROW.exec(line);
  if (!m) continue;
  const [, id, title, standard, level, severity, validationType, assurance, exemptible, applies, detector] = m;
  if (frozen.has(id)) fail(`the freeze lists ${id} twice — an id has one row`);
  frozen.set(id, {
    id,
    title: title.trim(),
    standard: Number(standard),
    level,
    severity,
    validationType,
    assurance,
    nonExemptible: exemptible === "no",
    appliesTo: applies.split("/").map((a) => APPLIES[a] ?? a),
    detector: detector === "—" ? null : detector,
  });
}

// Anti-vacuity. Every assertion below is trivially satisfied by an empty freeze, so an empty one is
// a broken check rather than a clean run.
if (frozen.size === 0) die("no rule rows parsed from the freeze — nothing to reconcile");

const [, wantRules, wantForbidden, wantDetectors] = declaredCounts.map(Number);
const forbidden = [...frozen.values()].filter((r) => r.level === "forbidden");
const detectors = [...frozen.values()].map((r) => r.detector).filter(Boolean);

if (frozen.size !== wantRules) fail(`the freeze states ${wantRules} rules but its tables carry ${frozen.size}`);
if (forbidden.length !== wantForbidden) {
  fail(`the freeze states ${wantForbidden} forbidden rules but its tables carry ${forbidden.length}`);
}
if (detectors.length !== wantDetectors) {
  fail(`the freeze states ${wantDetectors} detectors but its tables bind ${detectors.length}`);
}

// One finding satisfies exactly one identity. A detector name against two rules breaks that before
// any detector is written.
const seenDetector = new Map();
for (const rule of frozen.values()) {
  if (!rule.detector) continue;
  if (seenDetector.has(rule.detector)) {
    fail(`detector '${rule.detector}' is bound to both ${seenDetector.get(rule.detector)} and ${rule.id} — one finding, one identity`);
  }
  seenDetector.set(rule.detector, rule.id);
}

// Field legality, checked here rather than only at catalog load, so an illegal combination cannot be
// frozen and then discovered later when changing it has become a MAJOR version event.
for (const rule of frozen.values()) {
  if (rule.assurance === "full" && !FULL_ASSURANCE_TYPES.has(rule.validationType)) {
    fail(`${rule.id}: assurance 'full' is not claimable by a ${rule.validationType} rule (ADR 0005)`);
  }
  if (rule.level === "forbidden" && !rule.nonExemptible) {
    fail(`${rule.id}: a forbidden rule that a policy may except is a prohibition in name only`);
  }
  if (rule.validationType === "manual-review" && rule.assurance !== "none") {
    fail(`${rule.id}: a manual-review rule claims ${rule.assurance} assurance — a human judgment is not partial coverage of an enumerable subject`);
  }
}

// --- Read the corpus ------------------------------------------------------------------------

const standardFiles = readdirSync(STANDARDS).filter((f) => f.endsWith(".md")).sort();
if (standardFiles.length === 0) die("no standards found — nothing to reconcile the freeze against");

/** id → [{ standard, requirements }] as named by ## Implementation tables. */
const named = new Map();
const CITE = new RegExp(String.raw`\`(${ID})\``, "g");
let rowsRead = 0;
for (const file of standardFiles) {
  const body = readFileSync(path.join(STANDARDS, file), "utf8").split("## Implementation")[1];
  if (body === undefined) {
    fail(`${file} has no ## Implementation section, so the identities it relies on are unstated`);
    continue;
  }
  const standard = Number(file.slice(0, 2));
  for (const line of body.split(/\r?\n/)) {
    const cells = line.split("|");
    if (cells.length < 4) continue;
    const requirements = cells[1].trim();
    if (!/^R\d+(\s*,\s*R\d+)*$/.test(requirements)) continue;
    rowsRead += 1;
    for (const [, id] of cells[2].matchAll(CITE)) {
      if (!named.has(id)) named.set(id, []);
      named.get(id).push({ standard, requirements });
    }
  }
}
if (rowsRead === 0) die("no requirement rows parsed from any ## Implementation table — the corpus reader is broken");

// The falsifier this checker was built for: prose names an identity the freeze does not carry.
// Presence of *some* mapping is not the claim; the claim is that prose and freeze name one set.
for (const [id, sites] of named) {
  if (!frozen.has(id)) {
    const where = sites.map((s) => `Standard ${s.standard} ${s.requirements}`).join(", ");
    fail(`${where} names rule '${id}', which the freeze does not define. Identity comes from the freeze; prose may not introduce one.`);
  }
}

// --- Ownership ------------------------------------------------------------------------------

// A rule with no owning requirement was created by something other than the corpus — usually a
// detector that was convenient to write. The one legal exception is a declared framework rule.
const DECLARED = new RegExp(String.raw`^- DECLARED: \`(${ID})\` — (\S.*)$`);
const frameworkOrigin = new Map();
for (const line of freezeText.split(/\r?\n/)) {
  const m = DECLARED.exec(line.trim());
  if (m) frameworkOrigin.set(m[1], m[2]);
}

for (const rule of frozen.values()) {
  const sites = named.get(rule.id);
  if (!sites) {
    if (!frameworkOrigin.has(rule.id)) {
      fail(
        `${rule.id} is frozen but no standard requirement states it, and it is not declared under ` +
          `'Framework-origin rules'. A rule that exists because an evaluator wanted it inverts the catalog's authority.`,
      );
    }
    continue;
  }
  if (frameworkOrigin.has(rule.id)) {
    fail(`${rule.id} is declared framework-origin but Standard ${sites[0].standard} states it — the declaration is false`);
  }
  if (!sites.some((s) => s.standard === rule.standard)) {
    const where = [...new Set(sites.map((s) => s.standard))].join(", ");
    fail(`${rule.id} names Standard ${rule.standard} as its owner, but only Standard(s) ${where} state it`);
  }
  if (!existsSync(path.join(STANDARDS, standardFiles[rule.standard - 1] ?? ""))) {
    fail(`${rule.id} names Standard ${rule.standard}, which does not exist`);
  }
}

// --- Cross-references are inert ----------------------------------------------------------------

const crossRefs = [];
const XREF = new RegExp(String.raw`^\|\s*\`(${ID})\`\s*\|\s*\`(${ID})\`\s*\|\s*(\S+)\s*\|`);
for (const line of freezeText.split(/\r?\n/)) {
  const m = XREF.exec(line);
  if (m) crossRefs.push({ local: m[1], foreign: m[2], relationship: m[3] });
}
for (const ref of crossRefs) {
  if (!frozen.has(ref.local)) fail(`cross-reference names local rule '${ref.local}', which is not frozen`);
  if (frozen.has(ref.foreign)) {
    fail(`cross-reference target '${ref.foreign}' is also a local rule id — one string may not name two rules`);
  }
}

/**
 * Standard 02 R3 lists concerns EngineeringStandards owns and this repository does not duplicate.
 * The concerns are prose; these are the ids that carry them. A local rule taking one of these
 * identities would be the boundary failing quietly, so it is checked rather than trusted.
 */
const NOT_DUPLICATED = [
  "architecture.no-boundary-bypass",
  "errors.no-swallowed-exceptions",
  "audit.actor-attribution",
  "ai.provider-neutral",
  "scm.no-shared-history-rewrite",
  "scm.no-committed-env-files",
];
for (const foreign of NOT_DUPLICATED) {
  if (frozen.has(foreign)) {
    fail(`'${foreign}' is a local rule id, but Standard 2 R3 records that concern as owned by EngineeringStandards`);
  }
}

let esCoverage;
if (existsSync(ES_RULES)) {
  const esIds = new Set(
    readdirSync(ES_RULES)
      .filter((f) => f.endsWith(".json"))
      .flatMap((f) => JSON.parse(readFileSync(path.join(ES_RULES, f), "utf8")).rules.map((r) => r.id)),
  );
  for (const ref of crossRefs) {
    if (!esIds.has(ref.foreign)) {
      fail(`cross-reference ${ref.local} → ${ref.foreign} does not resolve in the EngineeringStandards catalog`);
    }
  }
  esCoverage = `${crossRefs.length} cross-references resolved against ${esIds.size} EngineeringStandards rules`;
} else {
  // Reporting this as passing would be the framework converting "could not look" into "looked and
  // found nothing wrong" — the exact conversion it exists to prevent.
  esCoverage = "NOT_EVALUATED — the EngineeringStandards catalog is not present on this machine";
}

// --- The catalog, once it exists ---------------------------------------------------------------

let catalogCoverage = "NOT_EVALUATED — rules/ does not exist yet (plan section 03, second item)";
if (existsSync(RULES)) {
  const files = readdirSync(RULES).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) die("rules/ exists but contains no rule files");
  const catalogued = new Map();
  for (const file of files) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(path.join(RULES, file), "utf8"));
    } catch (error) {
      die(`rules/${file}: ${error.message}`);
    }
    for (const rule of parsed.rules ?? []) catalogued.set(rule.id, { ...rule, file });
  }

  for (const id of catalogued.keys()) {
    if (!frozen.has(id)) fail(`rules/ defines '${id}', which the freeze does not. The catalog implements the freeze; it does not extend it.`);
  }
  for (const [id, rule] of frozen) {
    const actual = catalogued.get(id);
    if (!actual) {
      fail(`the freeze defines '${id}' but no catalog file carries it`);
      continue;
    }
    for (const field of ["standard", "level", "severity", "validationType", "assurance", "nonExemptible"]) {
      if (actual[field] !== rule[field]) {
        fail(`${id}: freeze says ${field} '${rule[field]}', rules/${actual.file} says '${actual[field]}'`);
      }
    }
    const want = rule.appliesTo.join(",");
    const got = (actual.appliesTo ?? []).join(",");
    if (want !== got) fail(`${id}: freeze says appliesTo [${want}], rules/${actual.file} says [${got}]`);

    // The constraint that makes crossReferences inert: an entry may carry nothing that could be read
    // as a local property. A `level` on a cross-reference is not merely unused — it is an invitation
    // to infer one.
    for (const ref of actual.crossReferences ?? []) {
      const extra = Object.keys(ref).filter((k) => !["repository", "ruleId", "relationship", "note"].includes(k));
      if (extra.length > 0) {
        fail(`${id}: crossReference carries ${extra.join(", ")} — a cross-reference states relationship only, never a rule property`);
      }
    }
  }
  catalogCoverage = `${catalogued.size} catalogued rules match the freeze field-for-field`;
}

// --- External provenance, reconciled against the freeze rather than the catalog -------------------

/**
 * The fourth edge.
 *
 * `provenance.mjs` already reconciles the provenance record against the CATALOG. That check is
 * necessary and it is not independent: both sides are generated from the same rule files, so a rule
 * added to `rules/` with a provenance entry written at the same time satisfies it, whatever the
 * freeze says. Reconciling against the freeze closes that: the freeze is the one artifact no
 * generator writes.
 *
 * The claim checked here is narrow and is the one Standard 38 R9 makes — every frozen `accessibility`
 * rule has a recorded origin, and provenance names no identity the freeze does not define.
 */
const PROVENANCE = path.join(ROOT, "artifacts", "external-standards-provenance.json");
let provenanceCoverage = "NOT_EVALUATED — the provenance record does not exist yet (plan section 02)";
if (existsSync(PROVENANCE)) {
  let record;
  try {
    record = JSON.parse(readFileSync(PROVENANCE, "utf8"));
  } catch (error) {
    die(`artifacts/external-standards-provenance.json: ${error.message}`);
  }
  // `mappings[]` is standard-keyed and belongs to the prose checker; `ruleMappings[]` is the
  // rule-keyed array, and it plus the ruleId entries of `projectAuthored[]` are the two states a
  // rule's origin can be in. There is deliberately no third.
  const recorded = new Set([
    ...(record.ruleMappings ?? []).map((m) => m.ruleId).filter(Boolean),
    ...(record.projectAuthored ?? []).map((p) => p.ruleId).filter(Boolean),
  ]);

  const accessibility = [...frozen.keys()].filter((id) => id.startsWith("accessibility."));
  if (accessibility.length === 0) die("the freeze defines no accessibility rules — the provenance edge would be vacuous");
  for (const id of accessibility) {
    if (!recorded.has(id)) {
      fail(`${id} is frozen and has no provenance record. An accessibility rule states where its substance came from, or declares itself project-authored (Standard 38 R9).`);
    }
  }
  for (const id of recorded) {
    if (!frozen.has(id)) {
      fail(`provenance records rule '${id}', which the freeze does not define. Provenance describes identities; it does not create them.`);
    }
  }
  provenanceCoverage = `${accessibility.length} frozen accessibility rules carry a recorded origin`;
}

// --- Report -------------------------------------------------------------------------------------

if (problems.length > 0) {
  for (const problem of problems) process.stderr.write(`  ${problem}\n`);
  process.stderr.write(`\nrule-identity: ${problems.length} disagreement(s) between the corpus, the freeze, and the catalog.\n`);
  process.exit(1);
}

process.stdout.write(
  `rule-identity: ${frozen.size} frozen rules (${forbidden.length} forbidden, ${detectors.length} detectors) ` +
    `reconciled against ${standardFiles.length} standards and ${named.size} identities named in prose.\n` +
    `     cross-references: ${esCoverage}\n` +
    `     catalog: ${catalogCoverage}\n` +
    `     provenance: ${provenanceCoverage}\n`,
);
