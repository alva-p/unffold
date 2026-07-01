import { formatUnits, getAddress, isAddress } from 'viem'
import { createClient, getChainConfig } from '../rpc.js'
import { resolveProxyChain } from '../proxy-detector.js'
import { resolveContract } from '../resolver.js'
import { detectStandards } from '../standards.js'
import { buildProfileReport, type ProfileReport } from '../profile-report.js'
import { buildRiskSummary, type RiskSummary } from '../risk-summary.js'
import type { Config } from '../../types.js'

export interface TokenMetadata {
  name: string | null
  symbol: string | null
  decimals: number | null
  totalSupply: string | null
  rawTotalSupply: string | null
  owner: string | null
}

export interface TokenProfileResult {
  report: ProfileReport
  address: string
  chain: string
  contract: {
    name: string
    verified: boolean
    implementationName: string | null
    implementationVerified: boolean | null
  }
  token: TokenMetadata
  riskSummary: RiskSummary
}

function validateAddress(raw: string): string {
  if (!isAddress(raw)) throw new Error(`Invalid EVM address: ${raw}`)
  return getAddress(raw)
}

function controlNames(summary: RiskSummary): string {
  const found = Object.entries(summary.controls)
    .filter(([, names]) => names.length > 0)
    .map(([key]) => key)
  return found.length > 0 ? found.join(', ') : 'none detected'
}

async function readString(
  client: ReturnType<typeof createClient>,
  address: string,
  functionName: 'name' | 'symbol'
): Promise<string | null> {
  try {
    const value = await client.readContract({
      address: address as `0x${string}`,
      abi: [{ type: 'function', name: functionName, inputs: [], outputs: [{ name: '', type: 'string' }], stateMutability: 'view' }],
      functionName,
    })
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

async function readDecimals(client: ReturnType<typeof createClient>, address: string): Promise<number | null> {
  try {
    const value = await client.readContract({
      address: address as `0x${string}`,
      abi: [{ type: 'function', name: 'decimals', inputs: [], outputs: [{ name: '', type: 'uint8' }], stateMutability: 'view' }],
      functionName: 'decimals',
    })
    return Number(value)
  } catch {
    return null
  }
}

async function readTotalSupply(
  client: ReturnType<typeof createClient>,
  address: string,
  decimals: number | null
): Promise<{ formatted: string | null; raw: string | null }> {
  try {
    const value = await client.readContract({
      address: address as `0x${string}`,
      abi: [{ type: 'function', name: 'totalSupply', inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' }],
      functionName: 'totalSupply',
    }) as bigint
    const formatted = decimals === null ? value.toString() : formatUnits(value, decimals)
    return { formatted, raw: value.toString() }
  } catch {
    return { formatted: null, raw: null }
  }
}

async function readOwner(client: ReturnType<typeof createClient>, address: string): Promise<string | null> {
  try {
    const value = await client.readContract({
      address: address as `0x${string}`,
      abi: [{ type: 'function', name: 'owner', inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' }],
      functionName: 'owner',
    })
    return typeof value === 'string' && isAddress(value) ? getAddress(value) : null
  } catch {
    return null
  }
}

async function readTokenMetadata(client: ReturnType<typeof createClient>, address: string): Promise<TokenMetadata> {
  const [name, symbol, decimals, owner] = await Promise.all([
    readString(client, address, 'name'),
    readString(client, address, 'symbol'),
    readDecimals(client, address),
    readOwner(client, address),
  ])
  const totalSupply = await readTotalSupply(client, address, decimals)
  return {
    name,
    symbol,
    decimals,
    totalSupply: totalSupply.formatted,
    rawTotalSupply: totalSupply.raw,
    owner,
  }
}

export async function analyzeTokenProfile(
  rawAddress: string,
  chainName: string,
  config: Config,
  rpcOverride?: string
): Promise<TokenProfileResult> {
  const address = validateAddress(rawAddress)
  const chain = getChainConfig(chainName)
  const client = createClient(chainName, config, rpcOverride)
  const contract = await resolveContract(address, chainName, config)
  const proxy = await resolveProxyChain(address, contract.abi, client)
  const [metadata, implementation] = await Promise.all([
    readTokenMetadata(client, address),
    proxy && proxy.implementationAddress !== address
      ? resolveContract(proxy.implementationAddress, chainName, config).catch(() => null)
      : Promise.resolve(null),
  ])
  const analysisContract = implementation
    ? {
        ...implementation,
        address: contract.address,
        name: contract.name,
        isProxy: true,
        implementationAddress: implementation.address,
        implementationName: implementation.name,
      }
    : contract
  const standards = detectStandards(analysisContract.abi || [], analysisContract.sourceCode)
  const riskSummary = buildRiskSummary(analysisContract, proxy, standards)
  const title = metadata.name ?? contract.name
  const subtitle = [metadata.symbol, chain.name].filter(Boolean).join(' · ')
  const report = buildProfileReport({
    profile: 'token',
    title,
    subtitle,
    address,
    chain,
    riskSummary,
    facts: [
      { label: 'Symbol', value: metadata.symbol },
      { label: 'Decimals', value: metadata.decimals },
      { label: 'Total supply', value: metadata.totalSupply },
      { label: 'Source', value: contract.isVerified ? 'verified' : 'unverified' },
      { label: 'Implementation', value: implementation?.name ?? null },
      { label: 'Owner', value: metadata.owner },
      { label: 'Proxy', value: riskSummary.proxy.detected ? riskSummary.proxy.pattern : 'not detected' },
      { label: 'Controls', value: controlNames(riskSummary) },
    ],
  })

  return {
    report,
    address,
    chain: chain.name,
    contract: {
      name: contract.name,
      verified: contract.isVerified,
      implementationName: implementation?.name ?? null,
      implementationVerified: implementation?.isVerified ?? null,
    },
    token: metadata,
    riskSummary,
  }
}
