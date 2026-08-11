#!/usr/bin/env node
/**
 * Gate 1 — is this repository subject to the UI rule surface at all?
 *
 * This command answers one question from repository evidence: does a user interface exist here?
 * It is the only component permitted to reach `NOT_APPLICABLE` (ADR 0003). A policy may declare
 * `ui.applicability: no-ui`; a declaration is an input to this classifier and never its output.
 *
 * THE PRECEDENCE TABLE IS EXPLICIT, NOT EMERGENT. Branch order in a function is not a contract, so
 * the ordering below is written down and tested directly through `decide()`:
 *
 *   0. the classifier cannot execute        → no classification, exit 2
 *   1. declared no-ui, and UI evidence      → INDETERMINATE, agreement conflict
 *   2. any positive UI signal               → APPLICABLE
 *   3. no signal, declared no-ui, complete  → NOT_APPLICABLE, agreement match
 *   4. no signal, declared no-ui, partial   → INDETERMINATE, agreement indeterminate
 *   5. no signal, a UI class declared       → INDETERMINATE, agreement indeterminate
 *   6. no signal, nothing declared          → INDETERMINATE, agreement undeclared
 *
 * Rule 2 sits ABOVE scan completeness deliberately, and that is the one ordering decision worth
 * defending. An unreadable subdirectory or a hit file cap does not un-witness a UI that was already
 * found: incompleteness is a threat to claims of ABSENCE, not to claims of presence. Letting an
 * unrelated unreadable path demote APPLICABLE to INDETERMINATE would mean a repository could shed
 * its UI obligations by containing something the scanner cannot read. So incompleteness blocks
 * NOT_APPLICABLE (rule 4) and leaves APPLICABLE alone.
 *
 * The asymmetry that follows from it: one credible positive signal establishes APPLICABLE, while
 * absence requires a declaration, a complete search, and zero contradicting evidence. Presence can
 * be witnessed. Absence has to be justified over a search surface — and this classifier can only
 * ever prove "none of the signals I support were present", which is a smaller claim than "there is
 * no UI here". That gap is why rule 6 exists: zero signals with no declaration is INDETERMINATE.
 *
 * Signals are biased toward presence on purpose. A false APPLICABLE costs an evaluation that
 * reports most rules not-evaluated; a false NOT_APPLICABLE exempts the entire UI rule surface. The
 * two errors are not symmetric, and the heuristics lean the cheap way.
 *
 * CLASSIFICATION AND AGREEMENT ARE SEPARATE AXES. `classification` is what the evidence supports.
 * `agreement` is how the declaration relates to it. A repository with a UI and no policy is
 * APPLICABLE / undeclared — a missing declaration is a governance gap, and it does not erase
 * evidence that a UI exists.
 *
 * Usage: node scripts/applicability.mjs [path] [--json] [--self]
 */

import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { parseYaml } from "./yaml.mjs";

const EXIT_OK = 0;
const EXIT_FINDINGS = 1;
const EXIT_INVOCATION = 2;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const MAX_FILES = 20000;
const MAX_READ_BYTES = 400_000;
/** Content-reading budget for the heuristic families. A cap that is hit is a scan finding. */
const MAX_CONTENT_READS = 400;

/**
 * Directories excluded from the search surface, by relative path or by name.
 *
 * Two different reasons, and they are not interchangeable. Build output, dependencies, and VCS
 * metadata are not this repository's authored content; excluding them cannot hide a first-party
 * interface. Test fixtures are a narrower case: they are synthetic inputs to a test suite, and this
 * framework's own fixtures contain deliberate UI markup that describes nothing about this
 * repository. That exclusion is anchored to a test directory (`test/fixtures`, not any `fixtures`)
 * so a real project's `src/fixtures` is still searched, and every exclusion that was actually
 * encountered is recorded in `scan.excluded` and named in the reasons when the answer is
 * NOT_APPLICABLE. An exemption never gets to be silent about what it did not look at.
 */
const SKIP_NAMES = new Set([
  "node_modules",
  ".git",
  ".hg",
  ".svn",
  "dist",
  "build",
  "out",
  "coverage",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".output",
  ".cache",
  "vendor",
]);
const SKIP_PATHS = /^(test|tests|spec|__tests__)\/fixtures$/;

const UI_CLASSES = ["web-ui", "mobile-ui", "desktop-ui", "embedded-ui"];

/** Package names that establish a class on sight, versus ones that establish only "a UI exists". */
const WEB_FRAMEWORK_PACKAGES = [
  "react-dom",
  "vue",
  "svelte",
  "@angular/core",
  "next",
  "nuxt",
  "solid-js",
  "lit",
  "preact",
  "ember-source",
  "@sveltejs/kit",
];
const CLASSLESS_FRAMEWORK_PACKAGES = ["react"]; // React alone may be React Native.
const MOBILE_PACKAGES = ["react-native", "expo", "@ionic/core", "nativescript"];
const DESKTOP_PACKAGES = ["electron", "@tauri-apps/api", "@electron/remote"];
const BROWSER_TEST_PACKAGES = ["@playwright/test", "playwright", "cypress", "puppeteer", "webdriverio"];
const BUNDLER_CONFIG = /^(vite|webpack|rollup|parcel|rspack|esbuild)\.config\.[cm]?[jt]s$/;

// -------------------------------------------------------------------------------------------------
// Scan
// -------------------------------------------------------------------------------------------------

/**
 * Walk the target, collecting relative POSIX paths.
 *
 * Every way this can fall short is recorded rather than smoothed over: an unreadable directory
 * lands in `unreadable`, a hit cap sets `capHit`, and both make `complete` false. `complete: false`
 * is what stands between an incomplete search and an exemption.
 */
export async function scanRepository(root, { maxFiles = MAX_FILES } = {}) {
  const files = [];
  const unreadable = [];
  const excluded = [];
  let capHit = false;

  const walk = async (dir, relative) => {
    if (capHit) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      unreadable.push(relative || ".");
      return;
    }
    for (const entry of entries) {
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (SKIP_NAMES.has(entry.name) || SKIP_PATHS.test(childRelative)) {
          excluded.push(childRelative);
          continue;
        }
        await walk(path.join(dir, entry.name), childRelative);
        if (capHit) return;
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        if (files.length >= maxFiles) {
          capHit = true;
          return;
        }
        files.push(childRelative);
      }
    }
  };

  await walk(root, "");

  return {
    files,
    complete: !capHit && unreadable.length === 0,
    filesExamined: files.length,
    capHit,
    unreadable,
    excluded,
  };
}

// -------------------------------------------------------------------------------------------------
// Signals
// -------------------------------------------------------------------------------------------------

/**
 * A signal is `{ id, detected, label, evidence[], implies[] }`.
 *
 * `label` is OBSERVED when a file at a path with defined meaning establishes the signal, and
 * INFERRED when a naming or content pattern does. A heuristic is never labeled OBSERVED.
 *
 * `implies` is the set of UI classes the signal PROVES, which is frequently empty. A `.tsx` file
 * containing markup proves that a component tree exists; it does not prove the platform it renders
 * on, and inventing `web-ui` from it would fabricate a class. An empty `implies` on a detected
 * signal is the honest state, and it produces `classResolution: unresolved` downstream rather than
 * a guess.
 *
 * No signal is ever negatively weighted. The absence of a signal is the absence of evidence, and
 * this function has no way to express "evidence of absence" because there is no such observation.
 */
export async function detectSignals(root, scan) {
  const files = scan.files;
  const has = (predicate) => files.filter(predicate);
  const signals = [];
  const notes = [];
  let contentReads = 0;

  const readCapped = async (relative) => {
    if (contentReads >= MAX_CONTENT_READS) return null;
    contentReads += 1;
    try {
      const full = path.join(root, relative);
      const info = await stat(full);
      if (info.size > MAX_READ_BYTES) return null;
      return await readFile(full, "utf8");
    } catch {
      return null;
    }
  };

  const add = (id, evidence, label, implies) =>
    signals.push({ id, detected: evidence.length > 0, label, evidence: evidence.slice(0, 12), implies });

  // --- the package manifest, read once and shared -------------------------------------------------
  let manifest = null;
  let manifestParsed = true;
  if (files.includes("package.json")) {
    const raw = await readCapped("package.json");
    try {
      manifest = JSON.parse(raw ?? "");
    } catch {
      manifestParsed = false;
      notes.push("package.json could not be parsed; dependency signals could not be read from it");
    }
  }
  const dependencies = manifest
    ? { ...(manifest.dependencies ?? {}), ...(manifest.devDependencies ?? {}), ...(manifest.peerDependencies ?? {}) }
    : {};
  const dependsOn = (names) => names.filter((name) => name in dependencies);

  // --- 1. frontend framework dependencies ---------------------------------------------------------
  const webPackages = dependsOn(WEB_FRAMEWORK_PACKAGES);
  const classlessPackages = dependsOn(CLASSLESS_FRAMEWORK_PACKAGES);
  const mobilePackages = dependsOn(MOBILE_PACKAGES);
  const frameworkPackages = [...webPackages, ...classlessPackages];
  add(
    "frontend-framework-dependency",
    frameworkPackages.map((name) => `package.json: ${name}`),
    "OBSERVED",
    // `react` beside a React Native dependency is not evidence of a web UI, so it contributes no
    // class of its own; the mobile family carries the class in that case.
    webPackages.length > 0 && mobilePackages.length === 0 ? ["web-ui"] : [],
  );

  // --- 2. route and page conventions --------------------------------------------------------------
  add(
    "route-conventions",
    has((f) => /(^|\/)pages\/[^/]+\.[jt]sx?$/.test(f) || /(^|\/)app\/.*\/page\.[jt]sx?$/.test(f) || /(^|\/)src\/routes\//.test(f)),
    "INFERRED",
    [], // A route tree proves navigable surfaces exist; it does not name the platform.
  );

  // --- 3. HTML documents ---------------------------------------------------------------------------
  const html = has((f) => /\.html?$/i.test(f));
  add("html-documents", html, "OBSERVED", ["web-ui"]);

  // --- 4. component files --------------------------------------------------------------------------
  const webComponents = has((f) => /\.(vue|svelte)$/i.test(f));
  const markupCandidates = has((f) => /\.[jt]sx$/.test(f));
  const markupComponents = [];
  for (const candidate of markupCandidates) {
    const text = await readCapped(candidate);
    // A deliberate limitation: this reads raw text, so markup named inside a string or a comment
    // counts. The use/mention split (`splitSource`) arrives with the detectors in section 06, and
    // this family is INFERRED partly because of it. Over-detection here produces APPLICABLE, which
    // is the survivable error.
    if (text && /<[A-Za-z][\w.:-]*(\s[^<>]*)?\/?>/.test(text)) markupComponents.push(candidate);
  }
  add(
    "component-files",
    [...webComponents, ...markupComponents],
    webComponents.length > 0 ? "OBSERVED" : "INFERRED",
    webComponents.length > 0 ? ["web-ui"] : [],
  );

  // --- 5. mobile projects --------------------------------------------------------------------------
  const androidManifest = has((f) => /(^|\/)AndroidManifest\.xml$/.test(f));
  const androidLayouts = has((f) => /(^|\/)res\/layout\/.*\.xml$/.test(f));
  const applePlist = has((f) => /(^|\/)Info\.plist$/.test(f));
  const appleUi = has((f) => /\.(storyboard|xib)$/.test(f));
  const flutter = has((f) => /(^|\/)pubspec\.yaml$/.test(f));
  const mobileEvidence = [
    ...(androidManifest.length > 0 && androidLayouts.length > 0 ? [...androidManifest, ...androidLayouts] : []),
    ...(applePlist.length > 0 && appleUi.length > 0 ? [...applePlist, ...appleUi] : []),
    ...mobilePackages.map((name) => `package.json: ${name}`),
    ...flutter,
  ];
  add(
    "mobile-project",
    mobileEvidence,
    androidManifest.length > 0 || applePlist.length > 0 ? "OBSERVED" : "INFERRED",
    ["mobile-ui"],
  );

  // --- 6. desktop shells ---------------------------------------------------------------------------
  const desktopPackages = dependsOn(DESKTOP_PACKAGES);
  const tauri = has((f) => /(^|\/)src-tauri\//.test(f));
  add(
    "desktop-shell",
    [...desktopPackages.map((name) => `package.json: ${name}`), ...tauri],
    tauri.length > 0 ? "OBSERVED" : "INFERRED",
    ["desktop-ui"],
  );

  // --- 7. Storybook --------------------------------------------------------------------------------
  add(
    "storybook",
    has((f) => /(^|\/)\.storybook\//.test(f)),
    "OBSERVED",
    [], // Storybook hosts components for any renderer it has an adapter for.
  );

  // --- 8. style systems ----------------------------------------------------------------------------
  add(
    "style-system",
    has((f) => /\.(css|scss|sass|less|styl)$/i.test(f) || /(^|\/)tailwind\.config\.[cm]?[jt]s$/.test(f)),
    "INFERRED",
    [],
  );

  // --- 9. browser test configuration ---------------------------------------------------------------
  add(
    "browser-test-configuration",
    [
      ...has((f) => /(^|\/)(playwright|cypress)\.config\.[cm]?[jt]s$/.test(f) || /(^|\/)cypress\//.test(f)),
      ...dependsOn(BROWSER_TEST_PACKAGES).map((name) => `package.json: ${name}`),
    ],
    "INFERRED",
    // A browser harness in a repository is frequently pointed at that repository's own UI, but it
    // can equally be pointed at somebody else's. It witnesses a UI concern, not a platform.
    [],
  );

  // --- 10. browser build targets --------------------------------------------------------------------
  const bundler = has((f) => BUNDLER_CONFIG.test(path.posix.basename(f)));
  add("browser-build-target", html.length > 0 && bundler.length > 0 ? [...html.slice(0, 3), ...bundler] : [], "INFERRED", [
    "web-ui",
  ]);

  return { signals, manifestParsed, notes, contentCapHit: contentReads >= MAX_CONTENT_READS };
}

// -------------------------------------------------------------------------------------------------
// Declaration
// -------------------------------------------------------------------------------------------------

const DECLARED_CLASSES = new Set(["no-ui", ...UI_CLASSES, "multi-platform"]);

/**
 * Read `ui.applicability` from the target's policy, if it has one.
 *
 * This deliberately does NOT validate the policy — that is Gate 0's job, and a classifier that
 * exited 2 on a malformed policy would collapse a configuration error into a measurement failure.
 * A policy this function cannot read yields `present: false` with a reason, which routes to
 * `agreement: undeclared`, which cannot produce NOT_APPLICABLE. Unreadable never becomes exempt.
 */
export async function readDeclaration(root) {
  let raw;
  try {
    raw = await readFile(path.join(root, "project-policy.yml"), "utf8");
  } catch {
    return { present: false, class: null, reason: "no project-policy.yml at the target root" };
  }
  let document;
  try {
    document = parseYaml(raw);
  } catch (error) {
    return { present: false, class: null, reason: `project-policy.yml could not be parsed: ${error.message}` };
  }
  const declared = document?.ui?.applicability;
  if (!DECLARED_CLASSES.has(declared)) {
    return {
      present: false,
      class: null,
      reason: `project-policy.yml declares no recognised 'ui.applicability' value${declared ? ` (found '${declared}')` : ""}`,
    };
  }
  return { present: true, class: declared, reason: null };
}

// -------------------------------------------------------------------------------------------------
// Decision
// -------------------------------------------------------------------------------------------------

/**
 * The precedence table from the file header, as a pure function of evidence and declaration.
 *
 * Pure and exported so the ordering can be tested directly rather than inferred from end-to-end
 * runs. A test that can only reach this logic through a filesystem fixture cannot prove which
 * branch won.
 */
export function decide({ signals, scan, declaredPolicy }) {
  const detected = signals.filter((signal) => signal.detected);
  const classes = [...new Set(detected.flatMap((signal) => signal.implies))].sort();
  const declared = declaredPolicy.present ? declaredPolicy.class : null;
  const reasons = [];

  const scanNote = () => {
    if (scan.capHit) reasons.push(`the file cap of ${scan.filesExamined} was reached, so the search was truncated`);
    for (const dir of scan.unreadable) reasons.push(`'${dir}' could not be read, so it was not searched`);
    if (scan.manifestParsed === false) reasons.push("package.json could not be parsed, so dependency evidence is missing");
  };

  // Rule 1 — a declaration of no interface, contradicted by evidence of one.
  if (declared === "no-ui" && detected.length > 0) {
    reasons.push(
      `the policy declares 'no-ui', and ${detected.length} UI signal(s) were found: ` +
        `${detected.map((s) => s.id).join(", ")}. A contradiction is not an exemption, and the ` +
        `classifier does not choose a side: either the declaration or the repository is wrong.`,
    );
    scanNote();
    return { classification: "INDETERMINATE", agreement: "conflict", applicabilityClasses: classes, reasons };
  }

  // Rule 2 — a witnessed interface. Above scan completeness on purpose: see the file header.
  if (detected.length > 0) {
    reasons.push(`${detected.length} UI signal(s) establish that an interface exists: ${detected.map((s) => s.id).join(", ")}`);
    if (classes.length === 0) {
      reasons.push(
        "no signal proved a platform, so the class is unresolved. That an interface exists is " +
          "established; which kind it is, is not — and it is not guessed.",
      );
    }
    if (!scan.complete) {
      reasons.push(
        "the scan was incomplete, which does not affect this result: incompleteness threatens a " +
          "claim of absence, never a signal already witnessed.",
      );
      scanNote();
    }
    let agreement = "undeclared";
    if (declared !== null) {
      // A resolved class set that excludes the declared class contradicts it. An unresolved class
      // set contradicts nothing, so the declaration stands uncorroborated rather than refuted.
      const contradicted =
        classes.length > 0 &&
        declared !== "multi-platform" &&
        UI_CLASSES.includes(declared) &&
        !classes.includes(declared);
      agreement = contradicted ? "conflict" : "match";
      if (contradicted) {
        reasons.push(
          `the policy declares '${declared}', and the evidence resolves to ${classes.join(", ")}. The ` +
            `interface is established either way; the declared class is what disagrees.`,
        );
      }
    } else {
      reasons.push(
        `no usable declaration was found — ${declaredPolicy.reason}. That is a governance gap, not ` +
          `a reason to discount the evidence above.`,
      );
    }
    return { classification: "APPLICABLE", agreement, applicabilityClasses: classes, reasons };
  }

  // Rules 3 and 4 — the only route to an exemption, and the strictest test in the framework.
  if (declared === "no-ui") {
    if (scan.complete) {
      reasons.push(
        "the policy declares 'no-ui', the search completed, and no supported UI signal was found. " +
          "This establishes that none of the signals this classifier supports are present — a " +
          "smaller claim than 'there is no interface here', and the declaration is what carries " +
          "the rest.",
      );
      if (scan.excluded.length > 0) {
        reasons.push(`excluded from the search: ${[...new Set(scan.excluded)].join(", ")}`);
      }
      return { classification: "NOT_APPLICABLE", agreement: "match", applicabilityClasses: [], reasons };
    }
    reasons.push(
      "the policy declares 'no-ui' and no signal was found, but the search did not complete. An " +
        "absence established over a partial search is not an absence, so this is not an exemption.",
    );
    scanNote();
    return { classification: "INDETERMINATE", agreement: "indeterminate", applicabilityClasses: [], reasons };
  }

  // Rule 5 — an interface is declared and nothing corroborates it. Not called a conflict: failing
  // to find something is not proof it is absent, so the declaration is uncorroborated, not refuted.
  if (declared !== null) {
    reasons.push(
      `the policy declares '${declared}' and no supported UI signal was found to corroborate it. ` +
        `The declaration is not refuted — absence of evidence is not evidence of absence — but ` +
        `nothing establishes the interface either, and a declaration alone may not (ADR 0003).`,
    );
    scanNote();
    return { classification: "INDETERMINATE", agreement: "indeterminate", applicabilityClasses: [], reasons };
  }

  // Rule 6 — the case that would be most convenient to call NOT_APPLICABLE, and must not be.
  reasons.push(
    `no supported UI signal was found and no declaration was made — ${declaredPolicy.reason}. A ` +
      `complete search proves only that the signals this classifier supports were absent; the ` +
      `exemption additionally requires the project to declare it has no interface.`,
  );
  scanNote();
  return { classification: "INDETERMINATE", agreement: "undeclared", applicabilityClasses: [], reasons };
}

// -------------------------------------------------------------------------------------------------
// Envelope
// -------------------------------------------------------------------------------------------------

async function toolVersion() {
  try {
    return JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8")).version;
  } catch {
    return "unknown";
  }
}

/**
 * Classify a target. Throws only when the classifier cannot execute — see `ClassifierError`.
 */
export async function classify(target, { maxFiles = MAX_FILES, now = new Date() } = {}) {
  let info;
  try {
    info = await stat(target);
  } catch {
    throw new ClassifierError(`target path '${target}' does not exist or cannot be read`);
  }
  if (!info.isDirectory()) throw new ClassifierError(`target path '${target}' is not a directory`);

  const scan = await scanRepository(target, { maxFiles });
  if (scan.unreadable.includes(".")) {
    // The root itself being unreadable is non-execution, not a scan finding: there was no search.
    throw new ClassifierError(`target path '${target}' could not be listed`);
  }

  const { signals, manifestParsed, notes, contentCapHit } = await detectSignals(target, scan);
  const declaredPolicy = await readDeclaration(target);

  const fullScan = {
    complete: scan.complete && manifestParsed,
    filesExamined: scan.filesExamined,
    capHit: scan.capHit,
    unreadable: scan.unreadable,
    excluded: [...new Set(scan.excluded)].sort(),
    manifestParsed,
  };

  const decision = decide({ signals, scan: fullScan, declaredPolicy });
  if (contentCapHit) notes.push(`the content-read budget of ${MAX_CONTENT_READS} files was reached`);

  return {
    schemaVersion: "1.0",
    tool: { name: "uiux-standards", version: await toolVersion() },
    classifiedAt: now.toISOString(),
    target: path.resolve(target),
    classification: decision.classification,
    applicabilityClasses: decision.applicabilityClasses,
    // Whether the evidence resolved a platform, kept separate from whether it established a UI.
    // `unresolved` is a real state: APPLICABLE with no proven class is honest, and fabricating
    // `web-ui` from generic component evidence would not be.
    classResolution:
      decision.classification !== "APPLICABLE"
        ? "not-established"
        : decision.applicabilityClasses.length > 0
          ? "resolved"
          : "unresolved",
    scan: fullScan,
    signals,
    declaredPolicy,
    agreement: decision.agreement,
    reasons: [...decision.reasons, ...notes],
  };
}

export class ClassifierError extends Error {}

// -------------------------------------------------------------------------------------------------
// CLI
// -------------------------------------------------------------------------------------------------

function parseArgs(argv) {
  const options = { target: null, json: false, self: false };
  for (const arg of argv) {
    if (arg === "--json") options.json = true;
    else if (arg === "--self") options.self = true;
    else if (arg.startsWith("--")) throw new Error(`unknown flag '${arg}'`);
    else if (options.target === null) options.target = arg;
    else throw new Error(`unexpected argument '${arg}'`);
  }
  if (options.target === null) options.target = ".";
  return options;
}

function human(result) {
  const lines = [];
  lines.push(`Target: ${result.target}`);
  lines.push("");
  lines.push(`  classification  ${result.classification}`);
  lines.push(
    `  classes         ${result.applicabilityClasses.join(", ") || "(none)"} — ${result.classResolution}`,
  );
  lines.push(`  agreement       ${result.agreement}`);
  lines.push(
    `  declared        ${result.declaredPolicy.present ? result.declaredPolicy.class : `(none) — ${result.declaredPolicy.reason}`}`,
  );
  lines.push(
    `  scan            ${result.scan.complete ? "complete" : "INCOMPLETE"}, ${result.scan.filesExamined} files examined`,
  );
  lines.push("");

  const detected = result.signals.filter((signal) => signal.detected);
  if (detected.length > 0) {
    lines.push("Signals detected:");
    for (const signal of detected) {
      lines.push(`  ${signal.label.padEnd(8)} ${signal.id}${signal.implies.length > 0 ? ` → ${signal.implies.join(", ")}` : ""}`);
      for (const evidence of signal.evidence.slice(0, 4)) lines.push(`           ${evidence}`);
    }
    lines.push("");
  }

  lines.push("Why:");
  for (const reason of result.reasons) lines.push(`  - ${reason}`);
  lines.push("");

  if (result.classification === "INDETERMINATE") {
    lines.push(
      "INDETERMINATE is a classification, not a failure to classify. The scan ran and its evidence\n" +
        "is recorded above. It never means the UI rules do not apply — only that whether they apply\n" +
        "was not established.",
    );
  } else if (result.classification === "NOT_APPLICABLE") {
    lines.push(
      "NOT_APPLICABLE exempts the entire UI rule surface. It required all three of: a declaration,\n" +
        "a complete search, and zero contradicting signals. Adding an interface to this repository\n" +
        "without updating the declaration turns this into a conflict, not a quiet pass.",
    );
  }
  return lines.join("\n") + "\n";
}

export async function runCli(argv, { write = (s) => process.stdout.write(s), fail = (s) => process.stderr.write(s) } = {}) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    fail(`uiux-standards applicability: ${error.message}\n`);
    return EXIT_INVOCATION;
  }

  let result;
  try {
    result = await classify(options.target);
  } catch (error) {
    // Non-execution. The envelope carries an `error` and NO `classification` key, so a consumer
    // cannot mistake "I could not measure" for "I measured and could not establish it".
    if (options.json) {
      write(
        JSON.stringify(
          { schemaVersion: "1.0", tool: { name: "uiux-standards", version: await toolVersion() }, target: options.target, error: { code: "CLASSIFIER_DID_NOT_EXECUTE", message: error.message } },
          null,
          2,
        ) + "\n",
      );
    }
    fail(`uiux-standards applicability: ${error.message}\n`);
    return EXIT_INVOCATION;
  }

  write(options.json ? JSON.stringify(result, null, 2) + "\n" : human(result));

  if (options.self) {
    // The self-assertion lives in the tool rather than in CI shell logic, so it cannot drift from
    // the classifier it is asserting about, and so it fails identically for everyone who runs it.
    const deviations = [];
    if (result.classification !== "NOT_APPLICABLE") deviations.push(`classification is ${result.classification}`);
    if (result.agreement !== "match") deviations.push(`agreement is ${result.agreement}`);
    if (!result.scan.complete) deviations.push("the scan did not complete");
    if (deviations.length > 0) {
      fail(
        `uiux-standards applicability --self: ${deviations.join("; ")}.\n` +
          `This repository declares it has no user interface. If that is no longer true, the policy\n` +
          `is what has to change — not this assertion.\n`,
      );
      return EXIT_FINDINGS;
    }
    write("\n--self: NOT_APPLICABLE, agreement match, complete scan.\n");
  }

  return EXIT_OK;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exit(await runCli(process.argv.slice(2)));
}
