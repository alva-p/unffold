import type { AbiItem, DetectedStandards, ProxyInfo, ResolvedContract } from '../types.js'
import { impersonatedToken, knownBadge, knownToken } from './known-tokens.js'

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
  if (overall === 'medium') return `Review needed: ${mainReason}`
  return 'No red flags found by the quick scan. This is not a safety guarantee.'
}

function badgesFor(standards: string[], proxy: ProxyInfo | null, contract: ResolvedContract): string[] {
  const badges = [...standards]
  badges.push(contract.isVerified ? 'Verified' : 'Unverified')
  if (proxy) badges.push('Upgradeable')
  const known = knownBadge(contract.chainId, contract.address)
  if (known) badges.push(known)
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

// Current on-chain state, to separate what the contract *can* do from what is happening now.
export interface CurrentState {
  owner?: string | null
  paused?: boolean | null
  symbol?: string | null
}

const ISSUER_CONTROLS = new Set(['upgradeable', 'admin-roles', 'mint-controls', 'pause-controls', 'blacklist-controls'])

// Known issuers keep their facts but as trust assumptions; canonical and bridged tokens are named;
// symbol copies at other addresses are flagged.
function applyIssuerContext(signals: SignalInput[], contract: ResolvedContract, symbol?: string | null): void {
  const known = knownToken(contract.chainId, contract.address)
  if (known?.kind === 'issuer') {
    for (const signal of signals) {
      if (!ISSUER_CONTROLS.has(signal.id)) continue
      signal.severity = 'info'
      signal.detail = `Expected issuer control. ${signal.detail}`
    }
    signals.push({
      id: 'known-issuer',
      label: `Official ${known.symbol} by ${known.by}`,
      severity: 'medium',
      detail: `${known.by} can ${known.powers}. This is expected for a regulated stablecoin: holding it means trusting the issuer.`,
      meaning: `This is the official ${known.symbol} contract on this network.`,
      whyItMatters: `${known.by} can ${known.powers}. Expected for a regulated stablecoin, but you are trusting the issuer.`,
      recommendation: `Treat these as issuer powers, not a scam signal. Read ${known.by}'s terms if freezes matter to you.`,
    })
    return
  }
  if (known) {
    const bridgedToken = known.kind === 'bridged'
    signals.push({
      id: 'known-token',
      label: bridgedToken ? `Bridged ${known.symbol} via ${known.by}` : `Official ${known.symbol} (${known.by})`,
      severity: bridgedToken ? 'info' : 'ok',
      detail: bridgedToken
        ? `Backed by the ${known.by}, not issued natively on this network; its value depends on that bridge.`
        : `The canonical ${known.symbol} contract on this network. Its other signals still apply.`,
    })
    return
  }
  const copy = impersonatedToken(contract.chainId, contract.address, symbol)
  if (copy) {
    signals.push({
      id: 'impersonation',
      label: `Not the official ${copy.token.symbol} on this network`,
      severity: 'high',
      detail: `Official ${copy.token.symbol} (${copy.token.by}) here is ${copy.official}.`,
      meaning: `This token uses the ${copy.token.symbol} symbol but is not ${copy.token.by}'s contract.`,
      whyItMatters: `Scam tokens copy well-known symbols to look legitimate. Bridged versions also exist, but they are not ${copy.token.by}'s official token.`,
      recommendation: `Compare with the official address ${copy.official} before accepting or buying it.`,
    })
  }
}

const OWNER_CONTROLS = new Set(['mint-controls', 'pause-controls', 'blacklist-controls', 'tax-controls', 'trading-gates'])
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

function applyCurrentState(signals: SignalInput[], standards: DetectedStandards, state: CurrentState): void {
  // ponytail: assumes the controls are owner-gated; role- or mapping-gated minters stay live after renounce
  const renounced = state.owner === ZERO_ADDRESS && !standards.accessControl
  for (const signal of signals) {
    if (renounced && OWNER_CONTROLS.has(signal.id)) {
      signal.severity = 'info'
      signal.detail += '. The owner is renounced (0x0), so owner-only controls can no longer be used.'
    }
  }
  const pause = signals.find(signal => signal.id === 'pause-controls')
  if (pause && state.paused === true) {
    pause.severity = 'high'
    pause.label = 'Transfers are paused right now'
    pause.detail = `paused() returns true. ${pause.detail}`
  } else if (pause && state.paused === false) {
    pause.detail += '. Not paused right now.'
  }
}

export function buildRiskSummary(
  contract: ResolvedContract,
  proxy: ProxyInfo | null,
  standards: DetectedStandards,
  state?: CurrentState
): RiskSummary {
  const abi = contract.abi ?? []
  const source = contract.sourceCode ?? ''
  const controls = detectTokenControls(abi, source)
  const signals: SignalInput[] = []

  if (!contract.isVerified) {
    signals.push({
      id: 'unverified-source',
      label: 'Source not verified',
      // missing data is "review needed", never red: we could not check, we did not find something bad
      severity: 'medium',
      detail: 'Could not inspect the code: admin and token controls below may be incomplete.',
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
      label: 'Can mint new supply',
      severity: 'high',
      detail: `Functions: ${controls.mint.join(', ')}`,
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
      label: 'Can pause transfers',
      severity: 'medium',
      detail: `Functions: ${controls.pause.join(', ')}`,
    })
  }

  if (controls.blacklist.length > 0) {
    signals.push({
      id: 'blacklist-controls',
      label: 'Can block addresses',
      severity: 'high',
      detail: `Functions: ${controls.blacklist.join(', ')}`,
    })
  }

  if (controls.tax.length > 0) {
    signals.push({
      id: 'tax-controls',
      label: 'Fees can be changed',
      severity: 'medium',
      detail: `Functions: ${controls.tax.join(', ')}`,
    })
  }

  if (controls.tradingGate.length > 0) {
    signals.push({
      id: 'trading-gates',
      label: 'Trading can be limited',
      severity: 'medium',
      detail: `Functions: ${controls.tradingGate.join(', ')}`,
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

  if (state) applyCurrentState(signals, standards, state)
  applyIssuerContext(signals, contract, state?.symbol)
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
