import { getAddress, isAddress } from 'viem'
import { createClient, getChainConfig } from '../rpc.js'
import { resolveProxyChain } from '../proxy-detector.js'
import { resolveContract } from '../resolver.js'
import { detectStandards } from '../standards.js'
import { buildProfileReport, type ProfileReport } from '../profile-report.js'
import { buildRiskSummary, type RiskSummary } from '../risk-summary.js'
import type { AbiItem, Config } from '../../types.js'

export interface NftControls {
  mint: string[]
  metadata: string[]
  reveal: string[]
  sale: string[]
  withdraw: string[]
}

export interface NftMetadata {
  name: string | null
  symbol: string | null
  totalSupply: string | null
  owner: string | null
  baseURI: string | null
  contractURI: string | null
  tokenURI: string | null
  previewURI: string | null
  controls: NftControls
}

export interface NftProfileResult {
  report: ProfileReport
  address: string
  chain: string
  contract: {
    name: string
    verified: boolean
  }
  nft: NftMetadata
  riskSummary: RiskSummary
}

function validateAddress(raw: string): string {
  if (!isAddress(raw)) throw new Error(`Invalid EVM address: ${raw}`)
  return getAddress(raw)
}

function fnNames(abi: AbiItem[]): string[] {
  return abi.filter(item => item.type === 'function' && item.name).map(item => item.name!)
}

export function detectNftControls(abi: AbiItem[]): NftControls {
  const names = fnNames(abi)
  const match = (patterns: RegExp[]) => names.filter(name => patterns.some(pattern => pattern.test(name)))
  return {
    mint: match([/mint/i, /reserve/i, /airdrop/i]),
    metadata: match([/^set.*uri/i, /^set.*metadata/i, /^update.*uri/i, /^update.*metadata/i]),
    reveal: match([/reveal/i, /provenance/i, /startingIndex/i]),
    sale: match([/sale/i, /price/i, /whitelist/i, /allowlist/i]),
    withdraw: match([/withdraw/i, /sweep/i, /rescue/i]),
  }
}

export function nftControlsLine(controls: NftControls): string {
  const found = Object.entries(controls)
    .filter(([, names]) => names.length > 0)
    .map(([key]) => key)
  return found.length > 0 ? found.join(', ') : 'none detected'
}

async function readString(
  client: ReturnType<typeof createClient>,
  address: string,
  functionName: 'name' | 'symbol' | 'baseURI' | 'contractURI'
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

async function readTokenURI(client: ReturnType<typeof createClient>, address: string, tokenId: bigint): Promise<string | null> {
  try {
    const value = await client.readContract({
      address: address as `0x${string}`,
      abi: [{ type: 'function', name: 'tokenURI', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ name: '', type: 'string' }], stateMutability: 'view' }],
      functionName: 'tokenURI',
      args: [tokenId],
    })
    return typeof value === 'string' ? value : null
  } catch {
    return null
  }
}

export function normalizeNftUri(uri: string | null): string | null {
  if (!uri) return null
  if (uri.startsWith('ipfs://ipfs/')) return `https://ipfs.io/ipfs/${uri.slice('ipfs://ipfs/'.length)}`
  if (uri.startsWith('ipfs://')) return `https://ipfs.io/ipfs/${uri.slice('ipfs://'.length)}`
  return uri
}

async function readUint(client: ReturnType<typeof createClient>, address: string, functionName: string): Promise<string | null> {
  try {
    const value = await client.readContract({
      address: address as `0x${string}`,
      abi: [{ type: 'function', name: functionName, inputs: [], outputs: [{ name: '', type: 'uint256' }], stateMutability: 'view' }],
      functionName,
    }) as bigint
    return value.toString()
  } catch {
    return null
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

export async function analyzeNftProfile(
  rawAddress: string,
  chainName: string,
  config: Config,
  rpcOverride?: string
): Promise<NftProfileResult> {
  const address = validateAddress(rawAddress)
  const chain = getChainConfig(chainName)
  const client = createClient(chainName, config, rpcOverride)
  const contract = await resolveContract(address, chainName, config)
  const proxy = await resolveProxyChain(address, contract.abi, client)
  const standards = detectStandards(contract.abi || [], contract.sourceCode)
  const riskSummary = buildRiskSummary(contract, proxy, standards)
  const controls = detectNftControls(contract.abi || [])

  const [name, symbol, totalSupply, owner, baseURI, contractURI, tokenURI0, tokenURI1] = await Promise.all([
    readString(client, address, 'name'),
    readString(client, address, 'symbol'),
    readUint(client, address, 'totalSupply'),
    readOwner(client, address),
    readString(client, address, 'baseURI'),
    readString(client, address, 'contractURI'),
    readTokenURI(client, address, 0n),
    readTokenURI(client, address, 1n),
  ])
  const tokenURI = tokenURI0 ?? tokenURI1
  const previewURI = normalizeNftUri(contractURI ?? tokenURI ?? baseURI)

  const title = name ?? contract.name
  const subtitle = [symbol, 'NFT collection', chain.name].filter(Boolean).join(' · ')
  const report = buildProfileReport({
    profile: 'nft',
    title,
    subtitle,
    address,
    chain,
    riskSummary,
    facts: [
      { label: 'Symbol', value: symbol },
      { label: 'Total supply', value: totalSupply },
      { label: 'Owner', value: owner === '0x0000000000000000000000000000000000000000' ? 'renounced' : owner },
      { label: 'Base URI', value: baseURI },
      { label: 'Contract URI', value: contractURI },
      { label: 'Token URI', value: tokenURI },
      { label: 'Source', value: contract.isVerified ? 'verified' : 'unverified' },
      { label: 'Controls', value: nftControlsLine(controls) },
      { label: 'Proxy', value: riskSummary.proxy.detected ? riskSummary.proxy.pattern : 'not detected' },
    ],
    extraLinks: previewURI ? [{ label: 'NFT metadata', url: previewURI }] : [],
  })

  return {
    report,
    address,
    chain: chain.name,
    contract: {
      name: contract.name,
      verified: contract.isVerified,
    },
    nft: { name, symbol, totalSupply, owner, baseURI, contractURI, tokenURI, previewURI, controls },
    riskSummary,
  }
}
