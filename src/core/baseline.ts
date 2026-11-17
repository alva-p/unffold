import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { fingerprint, type Finding, type SecurityScan } from './security-checks.js'

// Triage baseline: reviewed findings to hide on later runs (inline suppression comments are not an
// option, since the analyzed source belongs to someone else). Keyed by the stable fingerprint, so a
// finding comes back if the code changes, e.g. after an upgrade to a new implementation.

export interface BaselineEntry {
  fingerprint: string
  id: string
  title: string
  address: string
  reason: string
}

export interface Baseline {
  version: 1
  ignored: BaselineEntry[]
}

export function loadBaseline(path: string): Baseline {
  if (!existsSync(path)) return { version: 1, ignored: [] }
  const data = JSON.parse(readFileSync(path, 'utf8')) as Baseline
  if (data.version !== 1 || !Array.isArray(data.ignored)) throw new Error(`Not an unffold baseline file: ${path}`)
  return data
}

function printOf(scan: SecurityScan, finding: Finding): string {
  return fingerprint(finding, scan.chain.chainId, scan.target.address)
}

export function applyBaseline(scan: SecurityScan, baseline: Baseline): { scan: SecurityScan; ignored: number } {
  const hidden = new Set(baseline.ignored.map(entry => entry.fingerprint))
  const findings = scan.findings.filter(finding => !hidden.has(printOf(scan, finding)))
  return { scan: { ...scan, findings }, ignored: scan.findings.length - findings.length }
}

// Adds every current finding (except info) that is not in the baseline yet; existing reasons are kept.
export function updateBaseline(path: string, scan: SecurityScan, baseline: Baseline, reason = 'reviewed: edit this reason'): number {
  const known = new Set(baseline.ignored.map(entry => entry.fingerprint))
  const added = scan.findings
    .filter(finding => finding.severity !== 'info')
    .map(finding => ({ fingerprint: printOf(scan, finding), id: finding.id, title: finding.title, address: scan.target.address, reason }))
    .filter(entry => !known.has(entry.fingerprint))
  writeFileSync(path, JSON.stringify({ version: 1, ignored: [...baseline.ignored, ...added] }, null, 2) + '\n')
  return added.length
}
