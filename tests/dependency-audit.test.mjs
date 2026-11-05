import assert from "node:assert/strict";
import test from "node:test";
import { assessDependencyAudit } from "../scripts/audit-dependencies.mjs";

const now = Date.parse("2026-11-01T00:00:00Z");
function fixture() {
  return {
    report: { auditReportVersion: 2, vulnerabilities: {
      minimatch: { severity: "moderate", nodes: ["node_modules/minimatch"], via: [{
        name: "minimatch", severity: "moderate", url: "https://github.com/advisories/GHSA-g3hv-75wg-m249",
      }] },
      eslint: { severity: "moderate", nodes: ["node_modules/eslint"], via: ["minimatch", "@eslint-community/eslint-utils"] },
      "@eslint-community/eslint-utils": { severity: "moderate", nodes: ["node_modules/@eslint-community/eslint-utils"], via: ["eslint"] },
    } },
    lock: { packages: {
      "node_modules/minimatch": { version: "3.1.5", dev: true },
      "node_modules/eslint": { version: "9.39.4", dev: true },
      "node_modules/@eslint-community/eslint-utils": { version: "4.9.1", dev: true },
    } },
  };
}

test("audit gate reports the reviewed development finding through cyclic npm metadata", () => {
  const { report, lock } = fixture();
  const result = assessDependencyAudit(report, lock, now);
  assert.deepEqual(result.blocked, []);
  assert.equal(result.reviewed.length, 3);
});

test("audit gate blocks runtime dependencies, missing lock entries and newly affected versions", () => {
  for (const change of [p => { p.dev = false; }, p => { p.version = "10.2.6"; }]) {
    const { report, lock } = fixture(); change(lock.packages["node_modules/minimatch"]);
    assert.equal(assessDependencyAudit(report, lock, now).blocked.length, 3);
  }
  const { report, lock } = fixture(); delete lock.packages["node_modules/minimatch"];
  assert.equal(assessDependencyAudit(report, lock, now).blocked.length, 3);
});

test("audit gate blocks new advisories and raised severity even inside the reviewed lint chain", () => {
  for (const change of [
    v => { v.via.push({ name: "minimatch", severity: "moderate", url: "https://example.test/new-advisory" }); },
    v => { v.severity = "high"; },
    v => { v.via[0].severity = "critical"; },
  ]) {
    const { report, lock } = fixture(); change(report.vulnerabilities.minimatch);
    assert.equal(assessDependencyAudit(report, lock, now).blocked.length, 3);
  }
});

test("audit gate does not exempt application tooling merely because npm marks it development-only", () => {
  const { report, lock } = fixture();
  report.vulnerabilities.vinext = { severity: "moderate", nodes: ["node_modules/vinext"], via: ["minimatch"] };
  lock.packages["node_modules/vinext"] = { version: "1.0.0", dev: true };
  assert.deepEqual(assessDependencyAudit(report, lock, now).blocked, ["vinext"]);
});

test("audit exception expires and malformed or unavailable reports fail closed", () => {
  const { report, lock } = fixture();
  assert.equal(assessDependencyAudit(report, lock, Date.parse("2026-12-01T00:00:00Z")).blocked.length, 3);
  for (const value of [null, {}, { ...report, error: { code: "NETWORK" } }]) {
    assert.throws(() => assessDependencyAudit(value, lock, now), /complete npm audit/);
  }
  report.vulnerabilities.minimatch.severity = "unknown";
  assert.throws(() => assessDependencyAudit(report, lock, now), /Unknown audit severity/);
});
