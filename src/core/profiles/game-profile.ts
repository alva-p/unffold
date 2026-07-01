import { getAddress, isAddress } from 'viem'
import { createClient, getChainConfig } from '../rpc.js'
import { resolveProxyChain } from '../proxy-detector.js'
import { resolveContract } from '../resolver.js'
import { detectStandards } from '../standards.js'
import { buildProfileReport, type ProfileReport } from '../profile-report.js'
import { buildRiskSummary, type RiskSummary } from '../risk-summary.js'
import type { AbiItem, Config } from '../../types.js'

export interface GameControls {
  roles: string[]
  pause: string[]
  mintBurn: string[]
  economy: string[]
  gameplay: string[]
  externalCalls: string[]
}

export interface GameProfileResult {
  report: ProfileReport
  address: string
  chain: string
  contract: {
    name: string
    verified: boolean
  }
  game: {
    controls: GameControls
  }
  riskSummary: RiskSummary
}

const GAME_PATTERNS: Record<keyof GameControls, RegExp[]> = {
  roles: [/owner/i, /role/i, /admin/i, /operator/i],
  pause: [/pause/i, /emergency/i],
  mintBurn: [/mint/i, /burn/i, /spawn/i, /craft/i, /forge/i],
  economy: [/reward/i, /claim/i, /stake/i, /unstake/i, /shop/i, /price/i, /fee/i, /treasury/i],
  gameplay: [/battle/i, /quest/i, /mission/i, /level/i, /xp/i, /breed/i, /land/i, /^game/i],
  externalCalls: [/oracle/i, /random/i, /vrf/i, /router/i, /market/i],
}

function validateAddress(raw: string): string {
  if (!isAddress(raw)) throw new Error(`Invalid EVM address: ${raw}`)
  return getAddress(raw)
}

function fnNames(abi: AbiItem[]): string[] {
  return abi.filter(item => item.type === 'function' && item.name).map(item => item.name!)
}

function unique(values: string[]): string[] {
  return [...new Set(values)]
}

export function detectGameControls(abi: AbiItem[], sourceCode = ''): GameControls {
  const names = fnNames(abi)
  const find = (key: keyof GameControls) => unique(names.filter(name => GAME_PATTERNS[key].some(pattern => pattern.test(name))))
  const controls = {
    roles: find('roles'),
    pause: find('pause'),
    mintBurn: find('mintBurn'),
    economy: find('economy'),
    gameplay: find('gameplay'),
    externalCalls: find('externalCalls'),
  }

  if (/delegatecall|call\{|\.call\(/.test(sourceCode)) controls.externalCalls.push('low-level call')
  return controls
}

export function isGameLike(abi: AbiItem[], sourceCode?: string | null): boolean {
  const controls = detectGameControls(abi, sourceCode ?? '')
  return controls.gameplay.length > 0 || (controls.mintBurn.length > 0 && controls.economy.length > 0)
}

export function gameControlsLine(controls: GameControls): string {
  const found = Object.entries(controls)
    .filter(([, names]) => names.length > 0)
    .map(([key]) => key)
  return found.length > 0 ? found.join(', ') : 'none detected'
}

export async function analyzeGameProfile(
  rawAddress: string,
  chainName: string,
  config: Config,
  rpcOverride?: string
): Promise<GameProfileResult> {
  const address = validateAddress(rawAddress)
  const chain = getChainConfig(chainName)
  const client = createClient(chainName, config, rpcOverride)
  const contract = await resolveContract(address, chainName, config)
  const proxy = await resolveProxyChain(address, contract.abi, client)
  const implementation = proxy && proxy.implementationAddress !== address
    ? await resolveContract(proxy.implementationAddress, chainName, config).catch(() => null)
    : null
  const analysisContract = implementation
    ? { ...implementation, address: contract.address, name: contract.name, isProxy: true, implementationAddress: implementation.address, implementationName: implementation.name }
    : contract

  const standards = detectStandards(analysisContract.abi || [], analysisContract.sourceCode)
  const riskSummary = buildRiskSummary(analysisContract, proxy, standards)
  const controls = detectGameControls(analysisContract.abi || [], analysisContract.sourceCode ?? '')
  const report = buildProfileReport({
    profile: 'game',
    title: contract.name,
    subtitle: `${chain.name} · game / on-chain app`,
    address,
    chain,
    riskSummary,
    facts: [
      { label: 'Source', value: contract.isVerified ? 'verified' : 'unverified' },
      { label: 'Standards', value: riskSummary.standards.join(', ') || 'unknown' },
      { label: 'Proxy', value: riskSummary.proxy.detected ? riskSummary.proxy.pattern : 'not detected' },
      { label: 'Game controls', value: gameControlsLine(controls) },
      { label: 'External calls', value: controls.externalCalls.join(', ') || 'none detected' },
    ],
  })

  return {
    report,
    address,
    chain: chain.name,
    contract: {
      name: contract.name,
      verified: contract.isVerified,
    },
    game: { controls },
    riskSummary,
  }
}
