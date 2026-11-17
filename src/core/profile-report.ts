import type { ChainConfig } from '../types.js'
import type { RiskSignal, RiskSummary } from './risk-summary.js'
import type { ControlPath } from './control.js'

export type ProfileKind = 'token' | 'nft' | 'vault' | 'proxy' | 'game' | 'security' | 'trace' | 'contract'

export interface ProfileFact {
  label: string
  value: string | number | boolean | null
}

export interface ProfileWarning {
  id: string
  title: string
  severity: RiskSignal['severity'] | 'low'
  confidence?: 'low' | 'medium' | 'high'
  body: string  // what it means
  recommendation: string  // what to do
  falsePositive?: string
  evidence?: string[]  // on-chain reads backing the warning
  location?: string  // file:line
  docsUrl?: string
}

export interface ProfileControl {
  role: 'upgrades' | 'owner'
  summary: string
  singleKey: boolean
}

export interface ProfileLink {
  label: string
  url: string
}

export interface ProfileReport {
  profile: ProfileKind
  title: string
  subtitle: string
  address: string
  chain: {
    name: string
    id: number
  }
  badges: string[]
  risk: {
    level: RiskSummary['overall']
    score: number
    summary: string
    mainReason: string
  }
  facts: ProfileFact[]
  warnings: ProfileWarning[]
  links: ProfileLink[]
  control?: ProfileControl[]  // who can upgrade / administer, in one line each
}

interface BuildProfileReportInput {
  profile: ProfileKind
  title: string
  subtitle?: string
  address: string
  chain: ChainConfig
  riskSummary: RiskSummary
  facts: ProfileFact[]
  extraLinks?: ProfileLink[]
  control?: ProfileControl[]
}

export function toProfileControl(paths: ControlPath[]): ProfileControl[] {
  return paths.map(path => ({ role: path.role, summary: path.summary, singleKey: path.singleKeyNoDelay }))
}

function warningsFromRisk(summary: RiskSummary): ProfileWarning[] {
  return summary.signals
    .filter(signal => signal.severity === 'high' || signal.severity === 'medium')
    .map(signal => ({
      id: signal.id,
      title: signal.label,
      severity: signal.severity,
      body: signal.whyItMatters,
      recommendation: signal.recommendation,
    }))
}

export function buildProfileReport(input: BuildProfileReportInput): ProfileReport {
  return {
    profile: input.profile,
    title: input.title,
    subtitle: input.subtitle ?? `${input.address} · ${input.chain.name}`,
    address: input.address,
    chain: {
      name: input.chain.name,
      id: input.chain.chainId,
    },
    badges: input.riskSummary.badges,
    risk: {
      level: input.riskSummary.overall,
      score: input.riskSummary.score,
      summary: input.riskSummary.summary,
      mainReason: input.riskSummary.mainReason,
    },
    facts: input.facts,
    ...(input.control ? { control: input.control } : {}),
    warnings: warningsFromRisk(input.riskSummary),
    links: [
      { label: 'Explorer', url: `${input.chain.explorerUrl}${input.address}` },
      ...(input.extraLinks ?? []),
    ],
  }
}
