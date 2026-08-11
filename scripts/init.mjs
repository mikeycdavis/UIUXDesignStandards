/**
 * `uiux-standards init` — scaffold an adopting project.
 *
 * This is the only command in the framework that writes to a repository it does not own, and the only
 * one whose risk is not a false verdict. Its risk is FALSE HISTORY: a bootstrap that writes
 * `target: framework-baseline` into a policy and thereby makes it look like somebody decided that; a
 * report that says a project "uses" a design system because a tailwind config exists; a mode label
 * that reads as a fact about how the project was built.
 *
 * Two contracts hold the command together.
 *
 * THE SAFETY CONTRACT. `plan()` is pure and touches nothing. `apply()` is the only writer — the only
 * `mkdir` and `writeFile` in this file are inside it, and a meta-test asserts that. `--dry-run` is
 * literally `plan()` without `apply()`, so the dry run cannot disagree with the real run because
 * there is no second code path for it to disagree with. An existing file is a conflict, refused at
 * exit 1, and replacing one requires `--force-overwrite=<exact path>` naming that path.
 *
 * THE HONESTY CONTRACT. Every claim in the report carries exactly one epistemic label:
 *
 *   OBSERVED             a file at a path with defined meaning establishes it
 *   INFERRED             a naming or content pattern suggests it
 *   CONFIRMED_BY_OWNER   the operator asserted it, with the date they did
 *   UNKNOWN              it is not knowable from this repository
 *
 * and a third category the labels alone cannot express, which is why the scaffolded policy carries it
 * in prose: SCAFFOLDED. An accessibility target, a viewport class list, a review subject — these are
 * DECLARATIONS THAT ADOPTION CREATES, not findings about the project. Writing them down does not make
 * them discoveries, and the file says so in the file rather than only in this comment.
 *
 * UI presence is not detected here. It is asked of scripts/applicability.mjs, which owns that
 * question for the whole framework. A second signal implementation would be a second answer, and the
 * one an operator happened to run would decide what their project was.
 */

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { classify, scanRepository, ClassifierError } from "./applicability.mjs";

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_INVOCATION = 2;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES = path.join(ROOT, "templates");

export const LABELS = ["OBSERVED", "INFERRED", "CONFIRMED_BY_OWNER", "UNKNOWN"];
export const MODES = ["greenfield", "existing-configured", "reconstruction-required"];

export class InitError extends Error {}

/**
 * What init scaffolds.
 *
 * `satisfiedBy` names conventional alternatives that already answer the same need. A repository with
 * `docs/adr` does not need `artifacts/adr`, and creating one anyway would split its decision record
 * across two directories — the same one-owner rule the rest of the framework runs on.
 */
const ARTIFACTS = [
  { path: "project-policy.yml", kind: "file", source: "project-policy.yml", generated: true },
  { path: "PROJECT.md", kind: "file", source: "PROJECT.md" },
  { path: "AGENTS.md", kind: "file", source: "AGENTS.md" },
  { path: "CLAUDE.md", kind: "file", source: "CLAUDE.md" },
  { path: ".github/copilot-instructions.md", kind: "file", source: "copilot-instructions.md" },
  { path: "artifacts/project-plan-breakdown", kind: "directory" },
  { path: "artifacts/adr", kind: "directory", satisfiedBy: ["docs/adr", "doc/adr"] },
  { path: "docs/design", kind: "directory" },
];

// -------------------------------------------------------------------------------------------------
// Detection — interpretation of Gate 1's signals, never a second implementation of them
// -------------------------------------------------------------------------------------------------

const DESIGN_SYSTEM_HINTS = /(^|\/)(tailwind\.config\.[cm]?[jt]s|tokens?\.(json|ya?ml|css|js|ts)|design-tokens?\.[a-z]+)$/i;
const DESIGN_ARTIFACT_HINTS = /(^|\/)(docs\/design\/|design\/|\.fig$|\.sketch$|\.xd$)/i;
const A11Y_TOOL_PACKAGES = ["axe-core", "@axe-core/playwright", "jest-axe", "eslint-plugin-jsx-a11y", "pa11y", "@storybook/addon-a11y"];

const signalOf = (applicability, id) => applicability.signals.find((s) => s.id === id);
const detectedIds = (applicability) => applicability.signals.filter((s) => s.detected).map((s) => s.id);

/**
 * Evidence entries that are real repository paths.
 *
 * A signal's evidence may be a path (`src/App.tsx`) or a dependency (`package.json: react`). Only the
 * first kind can ever become a declared evidence or review subject: a path that exists was observed,
 * while a dependency name is a fact about a manifest and not about where this project's interface
 * lives.
 */
function observedPaths(applicability) {
  const seen = new Set();
  const paths = [];
  for (const signal of applicability.signals) {
    if (!signal.detected) continue;
    for (const entry of signal.evidence) {
      if (entry.includes(": ")) continue; // a dependency, not a path
      if (seen.has(entry)) continue;
      seen.add(entry);
      paths.push(entry);
    }
  }
  return paths;
}

/**
 * A subject the project could declare, derived only from paths that were actually seen.
 *
 * Top-level containers, so the declaration covers the interface rather than the handful of files that
 * happened to carry a signal. Where nothing can be established, this returns an EMPTY list and the
 * caller omits the field: manufacturing `src/` for a repository with no `src/` would create coverage
 * out of a guess, and a declared subject that does not exist is worse than an absent one — freshness
 * would resolve against nothing while the policy looked complete.
 */
export function subjectFrom(applicability) {
  const containers = new Set();
  for (const entry of observedPaths(applicability)) {
    const [head] = entry.split("/");
    // A file at the repository root is named as itself; a nested file contributes its container.
    containers.add(entry.includes("/") ? head : entry);
  }
  return [...containers].sort();
}

/**
 * @param files the repository's file list, from `scanRepository` — the classifier's own walker. The
 *              classification envelope carries counts rather than the list, so init asks the same
 *              function for it rather than walking the tree a second way.
 */
export async function detect(target, applicability, files = []) {
  const facts = [];
  const fact = (id, question, finding, label, evidence = []) =>
    facts.push({ id, question, finding, label, evidence: evidence.slice(0, 8) });

  // 1. Is there an interface? Asked of Gate 1, whose answer is already labelled and already carries
  //    its own reasoning. Init does not get a second opinion.
  const uiSignals = applicability.signals.filter((s) => s.detected);
  fact(
    "ui-present",
    "Does this repository contain a user interface?",
    applicability.classification === "APPLICABLE"
      ? "yes — Gate 1 established one"
      : applicability.classification === "NOT_APPLICABLE"
        ? "no — Gate 1 established a valid no-ui declaration over a complete scan"
        : "not established — Gate 1 returned INDETERMINATE",
    applicability.classification === "INDETERMINATE" ? "UNKNOWN" : "OBSERVED",
    uiSignals.flatMap((s) => s.evidence).slice(0, 8),
  );

  // 2. Which technologies. The label follows the signal's own label, because that is where the
  //    distinction between a defined path and a naming pattern was already made.
  for (const id of ["frontend-framework-dependency", "mobile-project", "desktop-shell", "component-files"]) {
    const signal = signalOf(applicability, id);
    if (signal?.detected) {
      fact(`technology:${id}`, `Which interface technology does ${id} indicate?`, signal.evidence.join(", "), signal.label, signal.evidence);
    }
  }

  // 3. A design system. Detected as FILES THAT LOOK LIKE ONE, which is not the same as a project
  //    having adopted one — so this never becomes a `designSystem.strategy`, and its absence never
  //    becomes `none-justified`. `none-justified` is a decision, and nobody has made it here.
  const designSystemFiles = files.filter((f) => DESIGN_SYSTEM_HINTS.test(f));
  fact(
    "design-system",
    "Is there a design-system or token definition?",
    designSystemFiles.length > 0
      ? `files consistent with one are present; whether this project has adopted a design system is a decision, not a file`
      : "no token or design-system definition was found; whether one is used cannot be established from this repository",
    designSystemFiles.length > 0 ? "INFERRED" : "UNKNOWN",
    designSystemFiles,
  );

  // 4. Accessibility tooling. Presence of a linter is not accessibility; it is a linter.
  const manifest = await readManifest(target, files);
  const a11yTools = A11Y_TOOL_PACKAGES.filter((name) => name in manifest);
  fact(
    "accessibility-tooling",
    "Is accessibility tooling configured?",
    a11yTools.length > 0
      ? `${a11yTools.join(", ")} present — tooling exists; whether it runs, and what it covers, is not established here`
      : "none found in the package manifest",
    a11yTools.length > 0 ? "OBSERVED" : "UNKNOWN",
    a11yTools.map((name) => `package.json: ${name}`),
  );

  // 5–6. Storybook and browser automation, straight from Gate 1's signals.
  for (const [id, question] of [
    ["storybook", "Is there a component catalog?"],
    ["browser-test-configuration", "Is browser automation configured?"],
  ]) {
    const signal = signalOf(applicability, id);
    fact(
      id,
      question,
      signal?.detected ? "yes" : "none found",
      signal?.detected ? signal.label : "UNKNOWN",
      signal?.evidence ?? [],
    );
  }

  // 7. Design artifacts. The input to reconstruction: a repository with an interface and no design
  //    record is the case Standard 39 exists for.
  const artifacts = files.filter((f) => DESIGN_ARTIFACT_HINTS.test(f));
  fact(
    "design-artifacts",
    "Is there a design record?",
    artifacts.length > 0 ? `${artifacts.length} candidate artifact(s) found` : "none found",
    artifacts.length > 0 ? "INFERRED" : "UNKNOWN",
    artifacts,
  );

  // 8. An existing policy — the one fact that distinguishes a project that has already adopted
  //    something from one that has not.
  fact(
    "existing-policy",
    "Has this project already adopted the framework?",
    applicability.declaredPolicy.present
      ? `yes — project-policy.yml declares '${applicability.declaredPolicy.class}'`
      : "no project-policy.yml at the target root",
    "OBSERVED",
    applicability.declaredPolicy.present ? ["project-policy.yml"] : [],
  );

  return facts;
}

async function readManifest(target, files) {
  if (!files.includes("package.json")) return {};
  try {
    const parsed = JSON.parse(await readFile(path.join(target, "package.json"), "utf8"));
    return { ...(parsed.dependencies ?? {}), ...(parsed.devDependencies ?? {}), ...(parsed.peerDependencies ?? {}) };
  } catch {
    return {};
  }
}

/**
 * Which mode this repository is in.
 *
 * The ordering fails toward uncertainty on purpose. An interface with no policy is
 * `reconstruction-required` WHETHER OR NOT design artifacts were found: artifacts are a starting
 * point for a reconstruction, not a substitute for one, and treating their presence as
 * "existing-configured" would let a stale mockup stand in for a declaration nobody made.
 *
 * A `--mode` override is the operator asserting something, and is labelled as such with the date. It
 * changes what init scaffolds. It does NOT change what was detected: the facts above keep their own
 * labels, and re-running without the flag returns the inferred mode, because the override was never
 * written anywhere.
 */
export function modeOf(applicability, facts, { override = null, today } = {}) {
  if (override) {
    if (!MODES.includes(override)) throw new InitError(`unknown mode '${override}' — one of: ${MODES.join(", ")}`);
    return {
      value: override,
      label: `CONFIRMED_BY_OWNER (${today})`,
      reason: "asserted with --mode. Detection still ran, and its findings below keep their own labels.",
    };
  }

  if (applicability.declaredPolicy.present) {
    return {
      value: "existing-configured",
      label: "INFERRED",
      reason: `a project-policy.yml is present declaring '${applicability.declaredPolicy.class}'`,
    };
  }

  const uiFound = applicability.signals.some((s) => s.detected);
  if (uiFound) {
    const artifacts = facts.find((f) => f.id === "design-artifacts");
    return {
      value: "reconstruction-required",
      label: "INFERRED",
      reason:
        artifacts?.evidence.length > 0
          ? "existing UI evidence found, design intent not established — candidate design artifacts exist and have not been shown to describe what is built"
          : "existing UI evidence found, design intent not established",
    };
  }

  return {
    value: "greenfield",
    label: "INFERRED",
    reason: "no interface evidence and no policy were found. This is the absence of a signal, not evidence of absence",
  };
}

// -------------------------------------------------------------------------------------------------
// Rendering the scaffolded policy
// -------------------------------------------------------------------------------------------------

/**
 * Stamp the framework version into a scaffolded policy.
 *
 * The pattern is deliberately NOT anchored with `$`: on a CRLF checkout the line ends with `\r`, an
 * anchored pattern silently matches nothing, and the scaffold would ship the template's version
 * forever without anyone seeing an error.
 */
export function stampVersion(text, version) {
  if (!version) return text;
  return text.replace(/^(standardVersion:\s*)\S+/m, `$1${version}`);
}

const SCAFFOLD_HEADER = (today, mode) => `# SCAFFOLDED BY \`uiux-standards init\` ON ${today}.
#
# Every value in this file is a DECLARATION THIS FILE CREATES. None of it is a finding about your
# project: init read your repository to decide what to offer, and writing an offer down does not turn
# it into something anybody discovered or decided. The accessibility target, the viewport classes, and
# the review subject below are all in this category.
#
# Adopting this file — keeping it, committing it — is what makes these your project's declarations.
# Until then it is a proposal with your repository's paths in it.
#
# Detected mode: ${mode.value} (${mode.label})
#   ${mode.reason}
#
# Delete this header once you have read it and made the file yours.

`;

/**
 * The scaffolded policy: the teaching template, with the few values init can responsibly propose.
 *
 * Built from `templates/project-policy.yml` rather than generated from scratch, so the teaching
 * comments have one owner. Every substitution below leaves a marker saying it was scaffolded.
 */
export async function renderPolicy(applicability, mode, { today, version = null } = {}) {
  let text = await readFile(path.join(TEMPLATES, "project-policy.yml"), "utf8");
  text = stampVersion(text, version);

  // The declared class. Where the evidence proved exactly one, init proposes it and says on what.
  // Where it proved none, the template's default stands with a comment saying it is a default —
  // never `no-ui`, which is a claim about the repository that only a complete scan with zero signals
  // can support, and which this file is in no position to make on the operator's behalf.
  const proven = applicability.applicabilityClasses ?? [];
  const declared = proven.length === 1 ? proven[0] : "web-ui";
  const note =
    proven.length === 1
      ? `  # SCAFFOLDED. Gate 1 proved the class '${declared}' from repository evidence; declaring it is still\n` +
        `  # your project's statement, not the classifier's.\n`
      : `  # SCAFFOLDED DEFAULT — the evidence did not establish a single interface class, so this line is a\n` +
        `  # starting point rather than a finding. If this project has no interface, change it to 'no-ui' and\n` +
        `  # delete every other key under 'ui:'.\n`;
  text = text.replace(/^  applicability: .*$/m, `${note}  applicability: ${declared}`);

  // The evidence and review subjects, from observed paths only. Where none can be established the
  // fields are omitted and a visible TODO is left in their place: an absent declaration is a gap
  // anyone can see, while an invented one looks like coverage.
  const subject = subjectFrom(applicability);
  const block =
    subject.length > 0
      ? [
          "",
          "  # SCAFFOLDED from paths init actually saw in this repository, listed below. Narrow or widen them",
          "  # to whatever your interface really is — this is a declaration, and init has only seen files.",
          "  evidencePaths:",
          ...subject.map((p) => `    - ${p}`),
          "  reviewPaths:",
          ...subject.map((p) => `    - ${p}`),
        ].join("\n")
      : [
          "",
          "  # TODO — UNKNOWN. init could not establish which paths constitute this project's interface, so it",
          "  # has declared nothing rather than guessing. Until 'reviewPaths' is declared, no attestation can",
          "  # establish a rule; until 'evidencePaths' is declared, a browser producer chooses its own subject.",
          "  # evidencePaths:",
          "  #   - src",
          "  # reviewPaths:",
          "  #   - src",
        ].join("\n");
  text = text.replace(/^(  applicability: .*)$/m, `$1\n${block}`);

  return SCAFFOLD_HEADER(today, mode) + text;
}

// -------------------------------------------------------------------------------------------------
// plan — PURE. Nothing in this half of the file writes anything.
// -------------------------------------------------------------------------------------------------

async function exists(at) {
  try {
    await stat(at);
    return true;
  } catch {
    return false;
  }
}

/**
 * Decide what would be written, and read nothing back afterwards to confirm it.
 *
 * Returns a plan whose `writes` carry their full contents, so that `apply()` performs no decisions of
 * its own. That is what makes `--dry-run` trustworthy: the dry run is this function, and the real run
 * is this function plus a writer that only does what the plan says.
 */
export async function plan(target, { mode = null, force = [], today = new Date().toISOString().slice(0, 10), maxFiles } = {}) {
  if (!(await exists(target))) throw new InitError(`${target} does not exist`);

  let applicability;
  try {
    applicability = await classify(target, maxFiles ? { maxFiles } : {});
  } catch (error) {
    if (error instanceof ClassifierError) {
      throw new InitError(
        `Gate 1 could not read ${target}: ${error.message}. Nothing was scaffolded — init proposes a policy ` +
          `for a repository it has read, and it has not read this one.`,
      );
    }
    throw error;
  }

  const scan = await scanRepository(target, maxFiles ? { maxFiles } : {});
  const facts = await detect(target, applicability, scan.files);
  const resolvedMode = modeOf(applicability, facts, { override: mode, today });
  const forced = new Set(force);

  const entries = [];
  for (const artifact of ARTIFACTS) {
    const full = path.join(target, artifact.path);
    const satisfier = artifact.satisfiedBy
      ? (await Promise.all(artifact.satisfiedBy.map(async (alt) => ((await exists(path.join(target, alt))) ? alt : null)))).find(Boolean)
      : null;

    if (satisfier) {
      entries.push({ ...artifact, action: "satisfied-by", satisfiedBy: satisfier, reason: `${satisfier} already answers this` });
      continue;
    }
    if (await exists(full)) {
      entries.push({
        ...artifact,
        action: forced.has(artifact.path) ? "overwrite" : artifact.kind === "directory" ? "present" : "conflict",
        reason:
          artifact.kind === "directory"
            ? "already present"
            : forced.has(artifact.path)
              ? "replaced, because --force-overwrite named this path"
              : "already exists — init will not replace it",
      });
      continue;
    }
    entries.push({ ...artifact, action: artifact.kind === "directory" ? "create-directory" : "create", reason: "absent" });
  }

  const writes = [];
  for (const entry of entries) {
    if (entry.action !== "create" && entry.action !== "overwrite") continue;
    const contents = entry.generated
      ? await renderPolicy(applicability, resolvedMode, { today, version: await frameworkVersion() })
      : await readFile(path.join(TEMPLATES, entry.source), "utf8");
    writes.push({ path: entry.path, contents });
  }

  // A path named in --force-overwrite that init would not have written is an instruction about
  // nothing, and honouring it silently would let a typo look like permission for the file it meant.
  const unusedForce = [...forced].filter((p) => !entries.some((e) => e.path === p && e.action === "overwrite"));

  return {
    schemaVersion: "1.0",
    target,
    plannedAt: today,
    mode: resolvedMode,
    detection: facts,
    artifacts: entries,
    writes,
    directories: entries.filter((e) => e.action === "create-directory").map((e) => e.path),
    conflicts: entries.filter((e) => e.action === "conflict").map((e) => e.path),
    unusedForce,
    applicability: {
      classification: applicability.classification,
      agreement: applicability.agreement,
      applicabilityClasses: applicability.applicabilityClasses,
      scanComplete: applicability.scan.complete,
    },
  };
}

// -------------------------------------------------------------------------------------------------
// apply — THE ONLY WRITER IN THIS FILE
// -------------------------------------------------------------------------------------------------

/**
 * Carry out a plan, and decide nothing.
 *
 * Every path and every byte was settled by `plan()`. If this function ever needs to consult the
 * repository to know what to do, the dry run has stopped being a preview of the real run.
 */
export async function apply(planned) {
  if (planned.conflicts.length > 0) {
    throw new InitError(
      `refusing to write: ${planned.conflicts.join(", ")} already exist. Re-run with ` +
        `--force-overwrite=<path> for each file you intend to replace.`,
    );
  }

  const written = [];
  for (const relative of planned.directories) {
    await mkdir(path.join(planned.target, relative), { recursive: true });
    written.push(`${relative}/`);
  }
  for (const write of planned.writes) {
    const full = path.join(planned.target, write.path);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, write.contents);
    written.push(write.path);
  }
  return { written };
}

// -------------------------------------------------------------------------------------------------
// Output
// -------------------------------------------------------------------------------------------------

export function render(planned, { dryRun, applied = null }) {
  const lines = [`init: ${planned.target}`, ""];
  lines.push(`  mode   ${planned.mode.value}   ${planned.mode.label}`);
  lines.push(`         ${planned.mode.reason}`);
  lines.push("");
  lines.push("What was detected:");
  for (const fact of planned.detection) {
    lines.push(`  ${fact.label.padEnd(20)} ${fact.question}`);
    lines.push(`  ${" ".repeat(20)} ${fact.finding}`);
  }
  lines.push("");

  lines.push(dryRun ? "What a real run would do:" : applied ? "What was written:" : "What this run planned:");
  for (const entry of planned.artifacts) {
    lines.push(`  ${entry.action.padEnd(16)} ${entry.path}${entry.kind === "directory" ? "/" : ""}   ${entry.reason}`);
  }
  lines.push("");

  if (planned.unusedForce.length > 0) {
    lines.push(`  --force-overwrite named ${planned.unusedForce.join(", ")}, which init would not have written.`);
    lines.push("");
  }

  if (planned.conflicts.length > 0) {
    lines.push(
      `${planned.conflicts.length} file(s) already exist and were not touched. init never replaces work it did\n` +
        "not write. Name each one in --force-overwrite=<path> if you intend to replace it.",
    );
    lines.push("");
  }

  if (dryRun) {
    lines.push("Nothing was written. This is the same function the real run uses to decide what to write.");
    lines.push("");
  }

  if (planned.mode.value === "reconstruction-required") {
    lines.push(
      "This repository has an interface, and no declaration of what that interface is. Standard 39\n" +
        "covers the case: rebuild the declaration from what is here — screens, routes, components,\n" +
        "tokens, styles, tests, screenshots — and record everything you could not establish as unknown.\n" +
        "This run reports what is in the repository. Design intent is not in a repository, and nothing\n" +
        "here reconstructs it for you.",
    );
    lines.push("");
  }

  lines.push(
    "Scaffolding is not evidence. A written policy is a declaration this bootstrap created, not a\n" +
      "finding about your project, and none of it means any rule is satisfied. Run `validate` for that.",
  );
  return lines.join("\n") + "\n";
}

// -------------------------------------------------------------------------------------------------
// CLI
// -------------------------------------------------------------------------------------------------

export function parseArgs(argv) {
  const options = { target: null, json: false, dryRun: false, mode: null, force: [] };
  for (const arg of argv) {
    if (arg === "--json") options.json = true;
    else if (arg === "--dry-run") options.dryRun = true;
    else if (arg.startsWith("--mode=")) options.mode = arg.slice("--mode=".length);
    else if (arg.startsWith("--force-overwrite=")) options.force.push(arg.slice("--force-overwrite=".length));
    else if (arg.startsWith("--dir=")) options.target = arg.slice("--dir=".length);
    else if (arg.startsWith("--")) throw new Error(`unknown flag '${arg}'`);
    else if (options.target === null) options.target = arg;
    else throw new Error(`unexpected argument '${arg}'`);
  }
  if (options.target === null) options.target = ".";
  return options;
}

async function frameworkVersion() {
  try {
    return (await readFile(path.join(ROOT, "VERSION"), "utf8")).trim();
  } catch {
    return null; // Pre-release: the template's pinned version stands rather than a fabricated one.
  }
}

export async function runCli(argv, { write = (s) => process.stdout.write(s), fail = (s) => process.stderr.write(s) } = {}) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    fail(`uiux-standards init: ${error.message}\n`);
    return EXIT_INVOCATION;
  }

  let planned;
  try {
    planned = await plan(options.target, { mode: options.mode, force: options.force });
  } catch (error) {
    fail(`uiux-standards init: ${error.message}\n`);
    return EXIT_INVOCATION;
  }

  // Conflicts stop the write and exit 1: the tool ran correctly and found a condition the operator
  // has to resolve. That is not exit 2 — nothing about the invocation was wrong.
  if (!options.dryRun && planned.conflicts.length === 0) {
    try {
      await apply(planned);
    } catch (error) {
      fail(`uiux-standards init: ${error.message}\n`);
      return EXIT_FINDINGS;
    }
  }

  write(options.json ? JSON.stringify(planned, null, 2) + "\n" : render(planned, { dryRun: options.dryRun, applied: !options.dryRun }));
  return planned.conflicts.length > 0 ? EXIT_FINDINGS : EXIT_OK;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exit(await runCli(process.argv.slice(2)));
}
