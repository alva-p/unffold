import { getAddress, isAddress } from 'viem'
import { createClient, getChainConfig } from './rpc.js'
import { resolveProxyChain } from './proxy-detector.js'
import { resolveContract } from './resolver.js'
import { detectStandards } from './standards.js'
import { buildProfileReport, type ProfileKind, type ProfileReport } from './profile-report.js'
import { buildRiskSummary, type RiskSummary } from './risk-summary.js'
import { isGameLike } from './profiles/game-profile.js'
import type { Config, ResolvedContract } from '../types.js'

export interface DetectedProfile {
  profile: ProfileKind
  reason: string
}

export interface GenericAnalyzeResult {
  report: ProfileReport
  contract: {
    name: string
    verified: boolean
  }
  riskSummary: RiskSummary
}

export interface AnalyzeCoreResult {
  detected: DetectedProfile
  generic?: GenericAnalyzeResult
}

export function validateAnalyzeAddress(raw: string): string {
  if (!isAddress(raw)) throw new Error(`Invalid EVM address: ${raw}`)
  return getAddress(raw)
}

export function chooseProfile(
  standards: ReturnType<typeof detectStandards>,
  hasProxy: boolean,
  abi: ResolvedContract['abi'] = [],
  sourceCode?: string | null,
  proxyPattern?: string
): DetectedProfile {
  if (standards.erc4626) return { profile: 'vault', reason: 'ERC-4626 standard detected' }
  if (standards.erc721 || standards.erc1155) return { profile: 'nft', reason: standards.erc721 ? 'ERC-721 standard detected' : 'ERC-1155 standard detected' }
  if (standards.erc20) return { profile: 'token', reason: 'ERC-20 standard detected' }
  if (isGameLike(abi || [], sourceCode)) return { profile: 'game', reason: 'Game-like functions detected' }
  if (hasProxy) return { profile: 'proxy', reason: `${proxyPattern ?? 'Proxy'} detected` }
  return { profile: 'contract', reason: 'No token, NFT, vault, game, or proxy profile matched' }
}

async function analysisContractFor(
  contract: ResolvedContract,
  chainName: string,
  config: Config,
  implementationAddress: string | null
): Promise<ResolvedContract> {
  if (!implementationAddress || implementationAddress === contract.address) return contract
  return await resolveContract(implementationAddress, chainName, config).catch(() => contract)
}

export async function detectProfileForAddress(
  address: string,
  chainName: string,
  config: Config,
  rpcOverride?: string
): Promise<DetectedProfile> {
  const client = createClient(chainName, config, rpcOverride)
  const contract = await resolveContract(address, chainName, config)
  const proxy = await resolveProxyChain(address, contract.abi, client)
  const analysisContract = await analysisContractFor(contract, chainName, config, proxy?.implementationAddress ?? null)
  const standards = detectStandards(analysisContract.abi || [], analysisContract.sourceCode)
  return chooseProfile(standards, Boolean(proxy), analysisContract.abi, analysisContract.sourceCode, proxy?.pattern)
}

export async function buildGenericContractAnalyzeResult(
  address: string,
  chainName: string,
  config: Config,
  rpcOverride?: string
): Promise<GenericAnalyzeResult> {
  const chain = getChainConfig(chainName)
  const client = createClient(chainName, config, rpcOverride)
  const contract = await resolveContract(address, chainName, config)
  const proxy = await resolveProxyChain(address, contract.abi, client)
  const standards = detectStandards(contract.abi || [], contract.sourceCode)
  const riskSummary = buildRiskSummary(contract, proxy, standards)
  const report = buildProfileReport({
    profile: 'contract',
    title: contract.name,
    subtitle: `${chain.name} · generic contract`,
    address,
    chain,
    riskSummary,
    facts: [
      { label: 'Source', value: contract.isVerified ? 'verified' : 'unverified' },
      { label: 'Compiler', value: contract.compilerVersion },
      { label: 'License', value: contract.license },
      { label: 'Functions', value: (contract.abi || []).filter(item => item.type === 'function').length },
      { label: 'Events', value: (contract.abi || []).filter(item => item.type === 'event').length },
      { label: 'Proxy', value: proxy?.pattern ?? 'not detected' },
    ],
  })

  return {
    report,
    contract: {
      name: contract.name,
      verified: contract.isVerified,
    },
    riskSummary,
  }
}

export async function analyzeAddressCore(
  rawAddress: string,
  chainName: string,
  config: Config,
  rpcOverride?: string
): Promise<AnalyzeCoreResult> {
  const address = validateAnalyzeAddress(rawAddress)
  const detected = await detectProfileForAddress(address, chainName, config, rpcOverride)
  if (detected.profile !== 'contract') return { detected }
  return {
    detected,
    generic: await buildGenericContractAnalyzeResult(address, chainName, config, rpcOverride),
  }
}
