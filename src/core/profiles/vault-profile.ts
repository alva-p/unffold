import { formatUnits, getAddress, isAddress, parseUnits } from 'viem'
import { createClient, getChainConfig } from '../rpc.js'
import { resolveProxyChain } from '../proxy-detector.js'
import { resolveContract } from '../resolver.js'
import { detectStandards } from '../standards.js'
import { buildProfileReport, type ProfileReport } from '../profile-report.js'
import { buildRiskSummary, type RiskSummary } from '../risk-summary.js'
import type { Config } from '../../types.js'

export interface VaultMetadata {
  name: string | null
  symbol: string | null
  decimals: number | null
  asset: string | null
  totalSupply: string | null
  totalAssets: string | null
  oneShareAssets: string | null
}

export interface VaultProfileResult {
  report: ProfileReport
  address: string
  chain: string
  contract: {
    name: string
    verified: boolean
  }
  vault: VaultMetadata
  riskSummary: RiskSummary
}

function validateAddress(raw: string): string {
  if (!isAddress(raw)) throw new Error(`Invalid EVM address: ${raw}`)
  return getAddress(raw)
}

async function readString(client: ReturnType<typeof createClient>, address: string, functionName: 'name' | 'symbol'): Promise<string | null> {
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

async function readUint(client: ReturnType<typeof createClient>, address: string, functionName: string): Promise<bigint | null> {
  try {
    return await client.readContract({
      address: address as `0x${string}`,
      abi: [{ type: 'function', name: functionName, inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' }],
      functionName,
    }) as bigint
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

async function readAddress(client: ReturnType<typeof createClient>, address: string, functionName: string): Promise<string | null> {
  try {
    const value = await client.readContract({
      address: address as `0x${string}`,
      abi: [{ type: 'function', name: functionName, inputs: [], outputs: [{ name: '', type: 'address' }], stateMutability: 'view' }],
      functionName,
    })
    return typeof value === 'string' && isAddress(value) ? getAddress(value) : null
  } catch {
    return null
  }
}

async function readConvertToAssets(client: ReturnType<typeof createClient>, address: string, decimals: number | null): Promise<string | null> {
  if (decimals === null) return null
  try {
    const oneShare = parseUnits('1', decimals)
    const value = await client.readContract({
      address: address as `0x${string}`,
      abi: [{ type: 'function', name: 'convertToAssets', inputs: [{ name: 'shares', type: 'uint256' }], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' }],
      functionName: 'convertToAssets',
      args: [oneShare],
    }) as bigint
    return formatUnits(value, decimals)
  } catch {
    return null
  }
}

export async function analyzeVaultProfile(
  rawAddress: string,
  chainName: string,
  config: Config,
  rpcOverride?: string
): Promise<VaultProfileResult> {
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
  const decimals = await readDecimals(client, address)
  const [name, symbol, asset, totalSupplyRaw, totalAssetsRaw, oneShareAssets] = await Promise.all([
    readString(client, address, 'name'),
    readString(client, address, 'symbol'),
    readAddress(client, address, 'asset'),
    readUint(client, address, 'totalSupply'),
    readUint(client, address, 'totalAssets'),
    readConvertToAssets(client, address, decimals),
  ])

  const totalSupply = totalSupplyRaw !== null && decimals !== null ? formatUnits(totalSupplyRaw, decimals) : null
  const totalAssets = totalAssetsRaw !== null && decimals !== null ? formatUnits(totalAssetsRaw, decimals) : null
  const vault = { name, symbol, decimals, asset, totalSupply, totalAssets, oneShareAssets }
  const title = name ?? contract.name
  const subtitle = [symbol, 'ERC-4626 vault', chain.name].filter(Boolean).join(' · ')
  const report = buildProfileReport({
    profile: 'vault',
    title,
    subtitle,
    address,
    chain,
    riskSummary,
    facts: [
      { label: 'Symbol', value: symbol },
      { label: 'Asset', value: asset },
      { label: 'Total supply', value: totalSupply },
      { label: 'Total assets', value: totalAssets },
      { label: '1 share assets', value: oneShareAssets },
      { label: 'Source', value: contract.isVerified ? 'verified' : 'unverified' },
      { label: 'Proxy', value: riskSummary.proxy.detected ? riskSummary.proxy.pattern : 'not detected' },
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
    vault,
    riskSummary,
  }
}
