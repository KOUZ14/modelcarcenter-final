import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Reviewed in docs/security-hardening-implementation.md. Never exempt runtime
// dependencies, a new advisory, or a different minimatch version automatically.
const reviewedAdvisory = "https://github.com/advisories/GHSA-g3hv-75wg-m249";
const reviewExpires = Date.parse("2026-12-01T00:00:00Z");
const lintPackages = new Set([
  "minimatch", "eslint", "eslint-config-next", "typescript-eslint",
  "@eslint-community/eslint-utils", "@eslint/config-array", "@eslint/eslintrc",
  "@next/eslint-plugin-next", "@typescript-eslint/eslint-plugin",
  "@typescript-eslint/parser", "@typescript-eslint/type-utils",
  "@typescript-eslint/typescript-estree", "@typescript-eslint/utils",
  "eslint-plugin-import", "eslint-plugin-jsx-a11y", "eslint-plugin-react",
]);
const severityRank = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

export function assessDependencyAudit(report, lock, now = Date.now()) {
  if (report?.error || report?.auditReportVersion !== 2 ||
      !report.vulnerabilities || typeof report.vulnerabilities !== "object" ||
      !lock?.packages || !Number.isFinite(now)) {
    throw new Error("A complete npm audit report and package lock are required.");
  }
  const findings = report.vulnerabilities;
  function reviewedLeaves(name, seen = new Set()) {
    if (seen.has(name)) return [];
    const entry = findings[name];
    if (!entry || !lintPackages.has(name) || entry.severity !== "moderate" ||
        !Array.isArray(entry.nodes) || !entry.nodes.length ||
        !entry.nodes.every(path => lock.packages[path]?.dev === true) ||
        !Array.isArray(entry.via) || !entry.via.length) return null;
    if (name === "minimatch" && !entry.nodes.every(path =>
      /(?:^|\/)node_modules\/minimatch$/.test(path) && lock.packages[path]?.version === "3.1.5")) return null;
    const visited = new Set(seen).add(name), leaves = [];
    for (const cause of entry.via) {
      if (typeof cause === "string") {
        const nested = reviewedLeaves(cause, visited);
        if (!nested) return null;
        leaves.push(...nested);
      } else if (name === "minimatch" && cause?.name === "minimatch" &&
          cause.severity === "moderate" && cause.url === reviewedAdvisory) {
        leaves.push(cause);
      } else return null;
    }
    return leaves;
  }
  const blocked = [], reviewed = [];
  for (const [name, entry] of Object.entries(findings)) {
    if (!Object.hasOwn(severityRank, entry?.severity)) throw new Error(`Unknown audit severity for ${name}.`);
    if (severityRank[entry.severity] < severityRank.moderate) continue;
    const leaves = now < reviewExpires ? reviewedLeaves(name) : null;
    (leaves?.length ? reviewed : blocked).push(name);
  }
  return { blocked, reviewed };
}

function main() {
  const command = process.platform === "win32" ? process.env.ComSpec || "cmd.exe" : "npm";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "npm audit --json --offline=false"]
    : ["audit", "--json", "--offline=false"];
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, timeout: 120_000 });
  if (result.error || result.signal || ![0, 1].includes(result.status)) throw new Error("npm audit could not complete.");
  const report = JSON.parse(result.stdout);
  const verdict = assessDependencyAudit(report, JSON.parse(readFileSync("package-lock.json", "utf8")));
  console.log("Raw npm advisory totals:", JSON.stringify(report.metadata?.vulnerabilities));
  if (verdict.reviewed.length) {
    console.log(`Reviewed lint-only minimatch 3.1.5 finding (${verdict.reviewed.length} dependency entries): ${reviewedAdvisory}`);
    console.log("Exception expires 2026-12-01; runtime dependencies and other findings remain blocking.");
  }
  if (verdict.blocked.length) {
    console.error("Unresolved moderate-or-higher findings:", verdict.blocked.join(", "));
    process.exitCode = 1;
  } else console.log("Dependency security gate passed.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
