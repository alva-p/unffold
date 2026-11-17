import ora from 'ora'
import { atLeast, COVERAGE, scanSecurity, type Finding, type SecurityScan, type Severity } from '../core/security-checks.js'
import { findingLocation } from '../core/security-report.js'
import { c } from '../output/colors.js'
import { addressLink } from '../output/links.js'
import { toSarif } from '../output/sarif.js'
import type { Config } from '../types.js'

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

const SEVERITY_COLOR: Record<Severity, (text: string) => string> = {
  high: c.danger,
  medium: c.warn,
  low: c.muted,
  info: c.dim,
}

const INDENT = ' '.repeat(10)

function severityTag(severity: Severity): string {
  return SEVERITY_COLOR[severity](severity.toUpperCase().padEnd(8))
}

function whereLine(finding: Finding): string {
  const location = findingLocation(finding)
  if (!location) return ''
  return `${INDENT}${c.address(location)}${finding.code ? `  ${c.dim(finding.code)}` : ''}`
}

function explain(finding: Finding): void {
  console.log(`${INDENT}${finding.detail}`)
  console.log(`${INDENT}${c.muted('verify: ' + finding.recommendation)}`)
  console.log(`${INDENT}${c.dim('false positive if: ' + finding.falsePositives)}`)
}

// Consecutive findings with the same id share one header (findings are sorted by severity).
function groups(findings: Finding[]): Finding[][] {
  const out: Finding[][] = []
  for (const finding of findings) {
    const last = out[out.length - 1]
    if (last && last[0].id === finding.id) last.push(finding)
    else out.push([finding])
  }
  return out
}

function printFindings(findings: Finding[], verbose: boolean): void {
  for (const group of groups(findings)) {
    const first = group[0]
    const title = group.length === 1 ? first.title : `${first.id.replace(/-/g, ' ')} ×${group.length}`
    console.log(`  ${severityTag(first.severity)}${c.bold(title)}  ${c.dim(first.confidence + ' confidence')}`)
    for (const finding of group) {
      if (group.length > 1 && verbose) console.log(`${INDENT}${c.muted(finding.title)}`)
      const where = whereLine(finding)
      if (where) console.log(where)
    }
    if (verbose) explain(first)
    if (verbose || group.length > 1) console.log()
  }
}

function printSummary(counted: Finding[]): void {
  if (counted.length === 0) {
    console.log(`  ${c.bold('RESULT')}  ${c.success(`No signals from ${COVERAGE.checked.length} checks.`)} ${c.muted('This is not a safety guarantee.')}`)
    return
  }
  const counts = (['high', 'medium', 'low'] as Severity[])
    .map(severity => [severity, counted.filter(finding => finding.severity === severity).length] as const)
    .filter(([, count]) => count > 0)
    .map(([severity, count]) => SEVERITY_COLOR[severity](`${count} ${severity}`))
    .join(c.dim(' · '))
  const top = counted[0]
  const location = findingLocation(top)
  console.log(`  ${c.bold('RESULT')}  ${counts}  ${c.dim('triage signals to verify, not confirmed bugs')}`)
  console.log(`  ${c.muted('start with')}  ${top.title}${location ? c.dim(`  (${location})`) : ''}`)
}

function printCoverage(scan: SecurityScan): void {
  if (scan.findings.some(finding => finding.id === 'no-source')) {
    console.log(`  ${c.warn('⚠ Source not verified: only on-chain checks ran. A clean result here means little.')}`)
  }
  console.log(`  ${c.dim('not checked: ' + COVERAGE.notChecked.join(', '))}`)
}

export async function runSecurity(
  rawAddress: string,
  chainName: string,
  config: Config,
  rpcOverride?: string,
  format: 'text' | 'json' | 'sarif' = 'text',
  failOn?: Severity,
  verbose = false
): Promise<void> {
  const spinner = format !== 'text' ? null : ora({ text: `  Scanning security surface for ${shortAddr(rawAddress)}...`, spinner: 'arc' }).start()

  try {
    const scan = await scanSecurity(rawAddress, chainName, config, rpcOverride)
    spinner?.stop()
    const failing = failOn ? scan.findings.filter(finding => atLeast(finding.severity, failOn)) : []
    if (failing.length > 0) {
      // CI gate: exit non-zero, but still print the report below
      process.exitCode = 1
      console.error(`unffold: ${failing.length} finding(s) at or above --fail-on ${failOn}`)
    }

    if (format !== 'text') {
      console.log(JSON.stringify(format === 'sarif' ? toSarif(scan) : { ...scan, coverage: COVERAGE }, null, 2))
      return
    }

    const explorer = scan.chain.explorerUrl
    const link = (addr: string) => c.address(addressLink(shortAddr(addr), addr, explorer))
    const counted = scan.findings.filter(finding => finding.severity !== 'info')
    const info = scan.findings.filter(finding => finding.severity === 'info')

    console.log()
    console.log(`  ${c.bold('SECURITY SURFACE')}  ${link(scan.address)}  ${c.muted('[' + chainName + ']')}`)
    console.log(c.dim('  ──────────────────────────────────────────────────'))
    if (scan.proxy) {
      console.log(`  ${c.muted('proxy'.padEnd(10))}${scan.proxy.pattern}${scan.proxy.adminAddress ? `  admin ${link(scan.proxy.adminAddress)}` : ''}`)
      console.log(`  ${c.muted('analyzed'.padEnd(10))}${scan.target.name}  ${link(scan.target.address)}  ${c.dim('(implementation)')}`)
    }
    console.log(`  ${c.muted('source'.padEnd(10))}${scan.target.verified ? c.success('verified') : c.warn('unverified')}  ${c.dim(`${scan.stats.stateChanging} state-changing fns, ${scan.stats.privilegedLooking} privileged-looking`)}`)
    console.log()

    printSummary(counted)
    console.log()
    printFindings(counted, verbose)
    if (info.length > 0) {
      console.log()
      for (const finding of info) console.log(`  ${severityTag('info')}${c.muted(finding.title)}`)
    }
    console.log()
    printCoverage(scan)
    if (!verbose && counted.length > 0) console.log(`  ${c.dim('add --verbose for why each finding matters, how to verify it, and when it is a false positive')}`)
    console.log()
  } catch (err) {
    spinner?.fail()
    throw err
  }
}
