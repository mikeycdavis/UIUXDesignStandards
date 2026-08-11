#!/usr/bin/env node
/**
 * Validate a project policy.
 *
 * VENDORED AND MODIFIED — derived from EngineeringStandards/scripts/policy.mjs on 2026-08-10, and
 * extended with the cross-field semantic layer this framework's `ui` block needs (ADR 0012).
 *
 * There are THREE kinds of failure here, and they are kept mechanically distinct even though two of
 * them share an exit code, because they are different facts about the world:
 *
 *   invalid-shape      the document is not a policy          — exit 2
 *   invalid-semantics  it is a policy, and it is incoherent  — exit 2
 *   findings           it is a coherent policy that declares a governance problem
 *                      (expired exception, exception on a non-exemptible rule, a rule
 *                      declared both not-applicable and excepted)                 — exit 1
 *
 * A malformed configuration is not a failing project. Reporting one as the other teaches a CI system
 * that a broken file and a broken product are the same event, and the cheapest way to make the
 * signal go away becomes weakening the check.
 *
 * Two of the three share exit 2 but never share an output category: `status` distinguishes them, the
 * JSON envelope carries them in separate arrays, and the human output labels them differently. A
 * consumer that needs the distinction has it without parsing prose.
 *
 * WHAT THIS COMMAND DOES NOT DO: it does not establish whether the project actually has a user
 * interface. `ui.applicability: no-ui` is a DECLARATION, and validating it says the declaration is
 * well-formed and coherent — never that the repository has no UI. Only scripts/applicability.mjs,
 * reading repository evidence, may produce NOT_APPLICABLE (ADR 0003). The wording throughout this
 * file is deliberate: "a valid no-ui declaration", never "this project has no UI".
 *
 * Usage: node scripts/policy.mjs [path/to/project-policy.yml] [--json] [--schema <path>]
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseYaml, YamlError } from "./yaml.mjs";
import { validate, assertSchemaSupported, SchemaError } from "./jsonschema.mjs";

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_INVOCATION = 2;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SCHEMA = path.join(ROOT, "schemas/project-policy.schema.json");
const DEFAULT_POLICY = path.join(ROOT, "project-policy.yml");

/** Every `ui` subkey other than the declaration itself. `no-ui` admits none of them. */
const UI_DETAIL_KEYS = [
  "platforms",
  "viewportClasses",
  "evidencePaths",
  "reviewPaths",
  "reviewScopes",
  "accessibility",
  "localization",
  "designSystem",
  "environments",
];

/**
 * The cross-field invariants the schema's keyword set cannot express (ADR 0012).
 *
 * These are CONFIGURATION errors, not compliance findings. A policy declaring `web-ui` with no
 * accessibility target has not failed a rule — it has failed to say what it is being evaluated
 * against, and there is no evaluation to perform until it does. That is why they exit 2 alongside
 * schema failures rather than 1 alongside governance findings.
 *
 * The accessibility-target invariant is the fail-closed decision in ADR 0008: absence is an error
 * and never an implied `framework-baseline`, because inferring a default would fabricate a
 * declaration the project never made. It is also strictly conditional on the declared class — a
 * `no-ui` policy is not made to carry a meaningless accessibility declaration to satisfy a rule
 * about interfaces it says it does not have.
 */
export function semanticErrors(document) {
  const errors = [];
  const at = (field, message) => errors.push({ path: field, message });

  const ui = document.ui;
  if (!ui || typeof ui !== "object") return errors; // Shape layer already rejected this.
  const declared = ui.applicability;

  // Review scope is declared by the project, before and apart from any individual review.
  //
  // Checked BEFORE the no-ui return, because a policy that records attestations has recorded them
  // whatever it declared about interfaces, and the error an adopter needs to see is the one about the
  // attestation they wrote — not silence.
  //
  // The invariant is not "reviews must be broad". It is that the reviewer must not be the one who
  // decides how much reviewing is enough. Without a declared subject there is nothing to measure a
  // review against, and an attestation naming its own scope would establish a rule by choosing what
  // to look at (Standard 37 R9).
  const attested = Object.keys(document.attestations ?? {});
  if (attested.length > 0) {
    const scopes = ui.reviewScopes ?? {};
    const unscoped = attested.filter((id) => !(ui.reviewPaths?.length > 0) && !(scopes[id]?.length > 0));
    if (unscoped.length > 0) {
      at(
        "ui.reviewPaths",
        declared === "no-ui"
          ? `is unavailable under 'ui.applicability: no-ui', and this policy attests ${unscoped.length} rule(s): ` +
              `${unscoped.join(", ")}. Every attestable rule in the catalog governs an interface, so a project ` +
              `declaring none has nothing to have reviewed. Remove the attestations, or correct the declaration.`
          : `must declare the material a review has to cover, because this policy records an attestation for ` +
              `${unscoped.join(", ")}. A review whose scope is chosen by the reviewer establishes whatever the ` +
              `reviewer chose to look at; declare the subject here, or narrow it per rule under 'ui.reviewScopes'.`,
      );
    }
  }

  if (declared === "no-ui") {
    for (const key of UI_DETAIL_KEYS) {
      if (key in ui) {
        at(
          `ui.${key}`,
          `is not permitted alongside 'ui.applicability: no-ui'. A project declaring no interface cannot ` +
            `also describe one; if the interface exists, the declaration is what is wrong.`,
        );
      }
    }
    return errors; // Every remaining invariant is conditional on there being a declared interface.
  }

  if (ui.accessibility?.target === undefined) {
    at(
      "ui.accessibility.target",
      `is required when 'ui.applicability' is '${declared}'. There is no default: a project's ` +
        `accessibility target is a declaration it makes, and inferring 'framework-baseline' here would ` +
        `record a decision nobody took (ADR 0008). Add it explicitly, using 'framework-baseline' for ` +
        `this framework's own floor.`,
    );
  }

  if (!Array.isArray(ui.platforms) || ui.platforms.length === 0) {
    at("ui.platforms", `must name at least one platform when 'ui.applicability' is '${declared}'.`);
  } else if (declared === "multi-platform" && ui.platforms.length < 2) {
    at("ui.platforms", "must name at least two platforms when 'ui.applicability' is 'multi-platform'.");
  }

  if ((declared === "web-ui" || declared === "mobile-ui") && !(ui.viewportClasses?.length > 0)) {
    at(
      "ui.viewportClasses",
      `must name at least one viewport class when 'ui.applicability' is '${declared}'. Responsive rules ` +
        `are evaluated per declared class, and a project declaring none would be evaluated against nothing.`,
    );
  }

  if (ui.localization?.status === "required" && !(ui.localization.locales?.length > 0)) {
    at("ui.localization.locales", "must name at least one locale when 'ui.localization.status' is 'required'.");
  }

  if (ui.designSystem?.strategy === "none-justified" && !ui.designSystem.justification) {
    at(
      "ui.designSystem.justification",
      "is required when 'ui.designSystem.strategy' is 'none-justified'. The strategy's whole content is " +
        "that the absence was decided rather than defaulted.",
    );
  }

  return errors;
}

/**
 * Compliance conditions a well-formed, coherent policy can still declare.
 *
 * Every rule id below is resolved through the catalog FIRST, so an accepted legacy alias is
 * normalized to its canonical identity before any semantics are applied. Resolution is one-way: the
 * policy learns the catalog's identity, and the catalog never learns the policy's spelling.
 */
function complianceFindings(document, today, catalog) {
  const findings = [];
  const canonical = (id) => catalog?.rules.get(id) ?? catalog?.rules.get(catalog?.aliases.get(id));
  const exceptions = Array.isArray(document.exceptions) ? document.exceptions : [];

  for (const entry of exceptions) {
    const rule = canonical(entry.rule);
    if (rule?.nonExemptible) {
      findings.push({
        id: "policy.non-exemptible-rule",
        severity: "error",
        message: `'${rule.id}' is non-exemptible; an exception against it is rejected, not recorded`,
        remediation:
          "Remove the exception and satisfy the rule. If it genuinely has no subject here, declare it not-applicable with a reason.",
      });
    }
  }

  for (const entry of exceptions) {
    if (entry.expires && entry.expires < today) {
      findings.push({
        id: "policy.expired-exception",
        severity: "error",
        message: `exception for '${canonical(entry.rule)?.id ?? entry.rule}' expired on ${entry.expires}`,
        remediation: "Renew the exception with a new approval, or satisfy the rule.",
      });
    }
  }

  // An exception says the rule applies and is knowingly unmet; not-applicable says the rule has no
  // subject here. A rule cannot be both, and a policy asserting both is ambiguous rather than
  // strict — there is no safe way to pick one.
  const notApplicable = new Set(
    Object.entries(document.applicability ?? {})
      .filter(([, decl]) => decl?.status === "not-applicable")
      .map(([id]) => canonical(id)?.id ?? id),
  );
  for (const entry of exceptions) {
    const id = canonical(entry.rule)?.id ?? entry.rule;
    if (notApplicable.has(id)) {
      findings.push({
        id: "policy.conflicting-classification",
        severity: "error",
        message: `'${id}' is declared not-applicable and also carries an exception`,
        remediation:
          "Remove one. not-applicable means the rule has no subject; an exception means it applies and is unmet.",
      });
    }
  }

  return findings;
}

/** Legacy spellings the catalog recognises, reported so an adopter sees the canonical form. */
function detectAliases(document, catalog) {
  if (!catalog) return [];
  const keys = [
    ...Object.keys(document.rules ?? {}),
    ...Object.keys(document.applicability ?? {}),
    ...Object.keys(document.attestations ?? {}),
    ...Object.keys(document.ui?.reviewScopes ?? {}),
    ...(Array.isArray(document.exceptions) ? document.exceptions : []).map((e) => e?.rule).filter(Boolean),
  ];
  const found = [];
  for (const key of new Set(keys)) {
    const canonical = catalog.aliases.get(key);
    if (canonical) found.push({ alias: key, canonical });
  }
  return found;
}

/** Rule ids a policy names that the catalog does not define. A policy may not invent an identity. */
function unknownRules(document, catalog) {
  if (!catalog) return [];
  const keys = [
    ...Object.keys(document.rules ?? {}),
    ...Object.keys(document.applicability ?? {}),
    ...Object.keys(document.attestations ?? {}),
    ...Object.keys(document.ui?.reviewScopes ?? {}),
    ...(Array.isArray(document.exceptions) ? document.exceptions : []).map((e) => e?.rule).filter(Boolean),
  ];
  return [...new Set(keys)].filter((id) => !catalog.rules.has(id) && !catalog.aliases.has(id));
}

function parseArgs(argv) {
  const options = { policy: null, schema: DEFAULT_SCHEMA, json: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") options.json = true;
    else if (arg === "--schema") options.schema = argv[++i];
    else if (arg.startsWith("--dir=")) options.policy = path.join(arg.slice(6), "project-policy.yml");
    else if (arg.startsWith("--")) throw new Error(`unknown flag '${arg}'`);
    else if (options.policy === null) options.policy = arg;
    else throw new Error(`unexpected argument '${arg}'`);
  }
  if (options.policy === null) options.policy = DEFAULT_POLICY;
  if (!options.schema) throw new Error("--schema requires a path");
  return options;
}

/**
 * Returns { status, schemaErrors, semanticErrors, findings, aliases, document }.
 * status is one of: ok | findings | invalid-shape | invalid-semantics.
 */
export async function checkPolicy(policyPath, schemaPath, today, injectedCatalog) {
  const schema = JSON.parse(await readFile(schemaPath, "utf8"));
  assertSchemaSupported(schema);

  const empty = { schemaErrors: [], semanticErrors: [], findings: [], aliases: [] };

  let document;
  try {
    document = parseYaml(await readFile(policyPath, "utf8"));
  } catch (error) {
    if (error instanceof YamlError) {
      return { ...empty, status: "invalid-shape", schemaErrors: [{ path: "", message: error.message }] };
    }
    throw error;
  }

  const schemaErrors = validate(document, schema);
  if (schemaErrors.length > 0) return { ...empty, status: "invalid-shape", schemaErrors, document };

  // The semantic layer runs only on a document the shape layer accepted, so it can read fields
  // without re-checking their types. Ordering matters: reporting semantics for a document that is
  // not a policy would produce errors about a shape nobody claimed.
  const semantic = semanticErrors(document);
  if (semantic.length > 0) return { ...empty, status: "invalid-semantics", semanticErrors: semantic, document };

  const catalog =
    injectedCatalog ??
    (await (async () => {
      try {
        const { loadCatalog } = await import("./catalog.mjs");
        return await loadCatalog();
      } catch {
        return null; // A missing catalog disables the rule-aware checks; it never fakes a pass.
      }
    })());

  const unknown = unknownRules(document, catalog);
  if (unknown.length > 0) {
    return {
      ...empty,
      status: "invalid-semantics",
      semanticErrors: unknown.map((id) => ({
        path: id,
        message: `names a rule the catalog does not define. A policy selects among the catalog's identities; it may not add one.`,
      })),
      document,
    };
  }

  const aliases = detectAliases(document, catalog);
  const findings = complianceFindings(document, today, catalog);
  return {
    status: findings.length > 0 ? "findings" : "ok",
    schemaErrors: [],
    semanticErrors: [],
    findings,
    aliases,
    document,
    catalogLoaded: catalog !== null,
  };
}

async function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`uiux-standards policy: ${error.message}\n`);
    process.exit(EXIT_INVOCATION);
  }

  const today = new Date().toISOString().slice(0, 10);
  let result;
  try {
    result = await checkPolicy(options.policy, options.schema, today);
  } catch (error) {
    const detail = error instanceof SchemaError ? `schema: ${error.message}` : error.message;
    process.stderr.write(`uiux-standards policy: ${detail}\n`);
    process.exit(EXIT_INVOCATION);
  }

  const relative = path.relative(ROOT, options.policy).replace(/\\/g, "/") || options.policy;
  const declared = result.document?.ui?.applicability;

  if (options.json) {
    process.stdout.write(
      JSON.stringify(
        {
          schemaVersion: "1.0",
          policy: relative,
          status: result.status,
          declaredUiApplicability: declared ?? null,
          // Never `applicability` or `classification`: this command validates a declaration and does
          // not classify anything. The field name says which of the two it is (ADR 0003).
          schemaErrors: result.schemaErrors,
          semanticErrors: result.semanticErrors,
          findings: result.findings,
          legacyAliases: result.aliases,
        },
        null,
        2,
      ) + "\n",
    );
  } else {
    process.stdout.write(`Policy: ${relative}\n\n`);
    for (const alias of result.aliases) {
      process.stdout.write(`  legacy key '${alias.alias}' — canonical form is '${alias.canonical}'\n`);
    }
    if (result.aliases.length > 0) process.stdout.write("\n");
    for (const error of result.schemaErrors) {
      process.stdout.write(`  SHAPE     ${error.path || "(document)"}: ${error.message}\n`);
    }
    for (const error of result.semanticErrors) {
      process.stdout.write(`  SEMANTICS ${error.path}: ${error.message}\n`);
    }
    for (const finding of result.findings) {
      process.stdout.write(`  ${finding.severity.toUpperCase()} ${finding.id}: ${finding.message}\n`);
      process.stdout.write(`        ${finding.remediation}\n`);
    }

    if (result.status === "ok") {
      process.stdout.write(`Valid, and coherent: a valid '${declared}' declaration.\n\n`);
      process.stdout.write(
        "This says the policy is well-formed and internally consistent. It says nothing about\n" +
          "whether the project satisfies the rules it declares — that is a validation run.\n",
      );
      if (declared === "no-ui") {
        process.stdout.write(
          "\nIt also does not establish that this repository has no user interface. That is a\n" +
            "claim about the repository, not about this file, and only `uiux-standards applicability`\n" +
            "can reach it — from evidence, and only alongside a complete scan with no contradicting\n" +
            "signals.\n",
        );
      }
    } else if (result.status === "invalid-shape") {
      process.stdout.write(`\n${result.schemaErrors.length} schema error(s). This document is not a policy.\n`);
    } else if (result.status === "invalid-semantics") {
      process.stdout.write(
        `\n${result.semanticErrors.length} semantic error(s). This is a policy, and it is incoherent:\n` +
          "the declarations it makes contradict each other or leave a required one unmade. That is a\n" +
          "configuration error, not a compliance failure.\n",
      );
    } else {
      process.stdout.write(`\n${result.findings.length} compliance finding(s) in a well-formed policy.\n`);
    }
  }

  if (result.status === "invalid-shape" || result.status === "invalid-semantics") process.exit(EXIT_INVOCATION);
  if (result.status === "findings") process.exit(EXIT_FINDINGS);
  process.exit(EXIT_OK);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  await main();
}
