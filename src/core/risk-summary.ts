import type { AbiItem, DetectedStandards, ProxyInfo, ResolvedContract } from '../types.js'

export type RiskSeverity = 'ok' | 'info' | 'medium' | 'high'
export type OverallRisk = 'low' | 'medium' | 'high'

export interface RiskSignal {
  id: string
  label: string
  severity: RiskSeverity
  detail: string
  meaning: string
  whyItMatters: string
  recommendation: string
}

export interface TokenControls {
  mint: string[]
  burn: string[]
  pause: string[]
  blacklist: string[]
  tax: string[]
  tradingGate: string[]
}

export interface RiskSummary {
  overall: OverallRisk
  score: number
  mainReason: string
  summary: string
  badges: string[]
  verified: boolean
  proxy: {
    detected: boolean
    pattern: string | null
    adminAddress: string | null
    implementationAddress: string | null
  }
  standards: string[]
  controls: TokenControls
  signals: RiskSignal[]
}

type SignalInput = Pick<RiskSignal, 'id' | 'label' | 'severity' | 'detail'> & Partial<Pick<RiskSignal, 'meaning' | 'whyItMatters' | 'recommendation'>>

const CONTROL_PATTERNS: Record<keyof TokenControls, RegExp[]> = {
  mint: [/^mint$/, /^mintTo$/, /^ownerMint$/, /^airdrop$/, /^batchMint$/],
  burn: [/^burn$/, /^burnFrom$/],
  pause: [/^pause$/, /^unpause$/, /^setPaused$/, /^paused$/],
  blacklist: [/blacklist/i, /blocklist/i, /denylist/i, /bot/i],
  tax: [/tax/i, /fee/i, /^setFees?$/i, /^setBuy/i, /^setSell/i, /excludeFromFees/i],
  tradingGate: [/trading/i, /maxWallet/i, /maxTx/i, /limits?/i, /cooldown/i],
}

function abiFunctionNames(abi: AbiItem[]): string[] {
  return abi
    .filter(item => item.type === 'function' && item.name)
    .map(item => item.name!)
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

function matchesAny(name: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(name))
}

function maxRisk(signals: SignalInput[]): OverallRisk {
  if (signals.some(signal => signal.severity === 'high')) return 'high'
  if (signals.some(signal => signal.severity === 'medium')) return 'medium'
  return 'low'
}

function severityPoints(severity: RiskSeverity): number {
  if (severity === 'high') return 70
  if (severity === 'medium') return 25
  if (severity === 'info') return 4
  return 0
}

function riskScore(signals: SignalInput[]): number {
  const raw = signals.reduce((score, signal) => score + severityPoints(signal.severity), 0)
  return Math.min(100, raw)
}

function signalDocs(signal: SignalInput): Pick<RiskSignal, 'meaning' | 'whyItMatters' | 'recommendation'> {
  const docs: Record<string, Pick<RiskSignal, 'meaning' | 'whyItMatters' | 'recommendation'>> = {
    'unverified-source': {
      meaning: 'The contract source code was not available from the configured explorers or Sourcify.',
      whyItMatters: 'Unverified contracts are harder to inspect and can hide admin controls or unusual transfer rules.',
      recommendation: 'Avoid relying on the quick scan alone; require verified source or a manual review before trusting it.',
    },
    'verified-source': {
      meaning: 'Verified source code was available for inspection.',
      whyItMatters: 'This makes ABI, standards, and static control detection more reliable.',
      recommendation: 'Continue reviewing the other signals; verified source does not mean the contract is risk-free.',
    },
    upgradeable: {
      meaning: 'The contract appears to route calls through upgradeable proxy logic.',
      whyItMatters: 'The implementation can change after users buy or deposit, which can change token/NFT behavior.',
      recommendation: 'Check who controls upgrades and whether there is a timelock, multisig, or public governance process.',
    },
    'admin-roles': {
      meaning: 'Ownership or role-management functions are present.',
      whyItMatters: 'Admins may be able to change parameters, grant roles, pause systems, or perform privileged actions.',
      recommendation: 'Inspect the owner/roles and verify whether privileges are renounced, multisig-controlled, or timelocked.',
    },
    'mint-controls': {
      meaning: 'Mint-like functions were detected.',
      whyItMatters: 'Additional supply can dilute holders or change the economics of a token or collection.',
      recommendation: 'Check who can mint, whether minting is capped, and whether mint authority has been renounced.',
    },
    'erc4626-vault': {
      meaning: 'The contract matches ERC-4626 vault behavior.',
      whyItMatters: 'Vault mint/deposit methods are standard and usually represent share issuance for deposited assets.',
      recommendation: 'Review the underlying asset, exchange rate, and any strategy or upgrade controls.',
    },
    'pause-controls': {
      meaning: 'Pause or unpause functions were detected.',
      whyItMatters: 'Transfers, deposits, withdrawals, or other actions may be stopped by privileged accounts.',
      recommendation: 'Check who can pause and under what governance or emergency policy.',
    },
    'blacklist-controls': {
      meaning: 'Blacklist, blocklist, denylist, or bot-control functions were detected.',
      whyItMatters: 'Specific wallets may be prevented from transferring or interacting with the asset.',
      recommendation: 'Review who controls the list and whether this behavior is expected for the asset.',
    },
    'tax-controls': {
      meaning: 'Tax or fee configuration functions were detected.',
      whyItMatters: 'Buy, sell, or transfer fees may change after launch.',
      recommendation: 'Check current fee values, max fee limits, and who can update them.',
    },
    'trading-gates': {
      meaning: 'Trading gates, wallet limits, transaction limits, or cooldown controls were detected.',
      whyItMatters: 'These controls can restrict when or how users transfer tokens.',
      recommendation: 'Check whether limits are temporary launch protections or permanent admin controls.',
    },
    selfdestruct: {
      meaning: 'A selfdestruct marker exists in the source.',
      whyItMatters: 'Selfdestruct-related code can affect contract availability or assumptions about code permanence.',
      recommendation: 'Manually verify whether this path is reachable and who can trigger it.',
    },
    'tx-origin': {
      meaning: 'The source contains tx.origin checks.',
      whyItMatters: 'tx.origin-based authorization is fragile and can be unsafe in composed contract interactions.',
      recommendation: 'Manually review the authorization flow that uses tx.origin.',
    },
    delegatecall: {
      meaning: 'The source contains a delegatecall marker.',
      whyItMatters: 'Delegatecall can execute external logic in this contract storage context, but libraries can also trigger this signal.',
      recommendation: 'Review whether delegatecall is part of proxy/library infrastructure or an externally controllable call path.',
    },
  }

  return docs[signal.id] ?? {
    meaning: signal.label,
    whyItMatters: signal.detail,
    recommendation: 'Review this signal manually.',
  }
}

function enrichSignal(signal: SignalInput): RiskSignal {
  const docs = signalDocs(signal)
  return {
    ...signal,
    meaning: signal.meaning ?? docs.meaning,
    whyItMatters: signal.whyItMatters ?? docs.whyItMatters,
    recommendation: signal.recommendation ?? docs.recommendation,
  }
}

function mainRiskSignal(signals: RiskSignal[]): RiskSignal | null {
  const ranked = signals
    .filter(signal => signal.severity !== 'ok' && signal.severity !== 'info')
    .sort((a, b) => severityPoints(b.severity) - severityPoints(a.severity))
  return ranked[0] ?? null
}

function summaryFor(overall: OverallRisk, mainReason: string): string {
  if (overall === 'high') return `High risk: ${mainReason}`
  if (overall === 'medium') return `Medium risk: ${mainReason}`
  return 'Low risk: no major red flags were detected by the quick scan.'
}

function badgesFor(standards: string[], proxy: ProxyInfo | null, contract: ResolvedContract): string[] {
  const badges = [...standards]
  badges.push(contract.isVerified ? 'Verified' : 'Unverified')
  if (proxy) badges.push('Upgradeable')
  return badges
}

export function detectTokenControls(abi: AbiItem[], _sourceCode?: string | null): TokenControls {
  const names = abiFunctionNames(abi)

  const find = (key: keyof TokenControls): string[] => {
    const patterns = CONTROL_PATTERNS[key]
    return unique(names.filter(name => matchesAny(name, patterns)))
  }

  return {
    mint: find('mint'),
    burn: find('burn'),
    pause: find('pause'),
    blacklist: find('blacklist'),
    tax: find('tax'),
    tradingGate: find('tradingGate'),
  }
}

export function standardsToRiskLabels(standards: DetectedStandards): string[] {
  const labels: string[] = []
  if (standards.erc20) labels.push('ERC-20')
  if (standards.erc721) labels.push('ERC-721')
  if (standards.erc1155) labels.push('ERC-1155')
  if (standards.erc4626) labels.push('ERC-4626')
  if (standards.erc2612) labels.push('ERC-2612')
  if (standards.ownable2Step) labels.push('Ownable2Step')
  else if (standards.ownable) labels.push('Ownable')
  if (standards.accessControl) labels.push('AccessControl')
  if (standards.pausable) labels.push('Pausable')
  return labels
}

export function buildRiskSummary(
  contract: ResolvedContract,
  proxy: ProxyInfo | null,
  standards: DetectedStandards
): RiskSummary {
  const abi = contract.abi ?? []
  const source = contract.sourceCode ?? ''
  const controls = detectTokenControls(abi, source)
  const signals: SignalInput[] = []

  if (!contract.isVerified) {
    signals.push({
      id: 'unverified-source',
      label: 'Source not verified',
      severity: 'high',
      detail: 'ABI/source may be incomplete, so admin and token controls are harder to inspect.',
    })
  } else {
    signals.push({
      id: 'verified-source',
      label: 'Source verified',
      severity: 'ok',
      detail: 'Verified source was available for static inspection.',
    })
  }

  if (proxy) {
    signals.push({
      id: 'upgradeable',
      label: 'Upgradeable contract',
      severity: proxy.adminAddress ? 'high' : 'medium',
      detail: proxy.adminAddress
        ? `${proxy.pattern} with admin ${proxy.adminAddress}. Logic can change through upgrades.`
        : `${proxy.pattern}. Logic can change through upgrades.`,
    })
  }

  if (standards.ownable || standards.ownable2Step || standards.accessControl) {
    signals.push({
      id: 'admin-roles',
      label: 'Admin roles detected',
      severity: 'medium',
      detail: standards.accessControl ? 'AccessControl functions are present.' : 'Ownership functions are present.',
    })
  }

  if (controls.mint.length > 0 && !standards.erc4626) {
    signals.push({
      id: 'mint-controls',
      label: 'Mint controls',
      severity: 'high',
      detail: `Detected: ${controls.mint.join(', ')}`,
    })
  }

  if (standards.erc4626) {
    signals.push({
      id: 'erc4626-vault',
      label: 'ERC-4626 vault',
      severity: 'info',
      detail: 'Vault mint/deposit methods are part of the ERC-4626 standard.',
    })
  }

  if (controls.pause.length > 0) {
    signals.push({
      id: 'pause-controls',
      label: 'Pause controls',
      severity: 'medium',
      detail: `Detected: ${controls.pause.join(', ')}`,
    })
  }

  if (controls.blacklist.length > 0) {
    signals.push({
      id: 'blacklist-controls',
      label: 'Blacklist / denylist controls',
      severity: 'high',
      detail: `Detected: ${controls.blacklist.join(', ')}`,
    })
  }

  if (controls.tax.length > 0) {
    signals.push({
      id: 'tax-controls',
      label: 'Tax / fee controls',
      severity: 'medium',
      detail: `Detected: ${controls.tax.join(', ')}`,
    })
  }

  if (controls.tradingGate.length > 0) {
    signals.push({
      id: 'trading-gates',
      label: 'Trading gates / limits',
      severity: 'medium',
      detail: `Detected: ${controls.tradingGate.join(', ')}`,
    })
  }

  if (source.includes('selfdestruct')) {
    signals.push({
      id: 'selfdestruct',
      label: 'selfdestruct marker',
      severity: 'high',
      detail: 'Source contains selfdestruct.',
    })
  }

  if (source.includes('tx.origin')) {
    signals.push({
      id: 'tx-origin',
      label: 'tx.origin marker',
      severity: 'medium',
      detail: 'Source contains tx.origin checks.',
    })
  }

  if (source.includes('delegatecall')) {
    signals.push({
      id: 'delegatecall',
      label: 'delegatecall marker',
      severity: 'info',
      detail: 'Source contains a delegatecall marker; review manually because libraries can trigger this signal.',
    })
  }

  const enrichedSignals = signals.map(enrichSignal)
  const overall = maxRisk(enrichedSignals)
  const score = riskScore(enrichedSignals)
  const primarySignal = mainRiskSignal(enrichedSignals)
  const mainReason = primarySignal?.whyItMatters ?? 'No major red flags were detected by the quick scan.'
  const standardsLabels = standardsToRiskLabels(standards)

  return {
    overall,
    score,
    mainReason,
    summary: summaryFor(overall, mainReason),
    badges: badgesFor(standardsLabels, proxy, contract),
    verified: contract.isVerified,
    proxy: {
      detected: Boolean(proxy),
      pattern: proxy?.pattern ?? null,
      adminAddress: proxy?.adminAddress ?? null,
      implementationAddress: proxy?.implementationAddress ?? null,
    },
    standards: standardsLabels,
    controls,
    signals: enrichedSignals,
  }
}
