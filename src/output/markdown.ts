import { COVERAGE, docsUrl, type SecurityScan } from '../core/security-checks.js'

// Audit-notes friendly report: one checkbox per finding, with everything needed to verify it.
export function toMarkdown(scan: SecurityScan, ignored = 0): string {
  const explorer = (address: string) => scan.chain.explorerUrl ? `[\`${address}\`](${scan.chain.explorerUrl}${address})` : `\`${address}\``
  const counted = scan.findings.filter(finding => finding.severity !== 'info')
  const lines = [
    `# Security triage: ${scan.target.name}`,
    '',
    '| | |',
    '|---|---|',
    `| Network | ${scan.chain.name} (${scan.chain.chainId}) |`,
    `| Address | ${explorer(scan.address)} |`,
    ...(scan.proxy ? [
      `| Proxy | ${scan.proxy.pattern} |`,
      `| Implementation | ${scan.target.name} ${explorer(scan.target.address)} |`,
    ] : []),
    `| Source | ${scan.target.verified ? 'verified' : 'not verified (static checks skipped)'} |`,
    `| Snapshot | block ${scan.block}, ${scan.scannedAt} |`,
    '',
  ]

  if (scan.control.length > 0) {
    lines.push('## Who controls', '')
    for (const path of scan.control) lines.push(`- **${path.role === 'upgrades' ? 'Upgrades' : 'Owner'}:** ${path.summary}`)
    lines.push('')
  }

  lines.push(`## Findings (${counted.length})`, '', '_Triage signals to verify, not confirmed vulnerabilities._', '')
  for (const finding of scan.findings) {
    const where = finding.file ? ` \`${finding.file}${finding.line ? `:${finding.line}` : ''}\`` : ''
    lines.push(`- [ ] **${finding.severity.toUpperCase()}** ${finding.title} (${finding.confidence} confidence)${where}`)
    if (finding.code) lines.push(`  \`${finding.code}\``)
    lines.push(`  ${finding.detail}`)
    lines.push(`  **Verify:** ${finding.recommendation} **False positive if:** ${finding.falsePositives} ([docs](${docsUrl(finding.id)}))`)
    for (const evidence of finding.evidence ?? []) lines.push(`  - on-chain: \`${evidence}\``)
  }
  if (scan.findings.length === 0) lines.push(`${ignored > 0 ? 'No new signals since the baseline.' : `No signals from ${COVERAGE.checked.length} checks.`} This is not a safety guarantee.`)
  if (ignored > 0) lines.push('', `_${ignored} finding(s) hidden by the triage baseline._`)

  lines.push('', '## Not checked', '', COVERAGE.notChecked.map(item => `- ${item}`).join('\n'), '')
  return lines.join('\n')
}
