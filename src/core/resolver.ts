import type { ResolvedContract, AbiItem, Config } from '../types.js'
import { getChainConfig } from './rpc.js'

export function explorerApiBase(explorerApiUrl: string): string {
  return /etherscan\.io|arbiscan\.io|basescan\.org|bscscan\.com|polygonscan\.com|abscan\.org/.test(explorerApiUrl)
    ? 'https://api.etherscan.io/v2/api'
    : explorerApiUrl
}

export async function fetchWithRetry(url: string, retries = 3): Promise<unknown> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url)
      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 1500 * (i + 1)))
        continue
      }
      if (!res.ok) return null
      const text = await res.text()
      if (!text) return null
      return JSON.parse(text)
    } catch (err) {
      if (i === retries - 1) return null
      await new Promise(r => setTimeout(r, 600 * (i + 1)))
    }
  }
  return null
}

function joinSources(sources: Record<string, string>): string | null {
  return Object.values(sources).join('\n\n') || null
}

// Etherscan SourceCode is either a single flattened file, `{{standard-json}}`,
// `{standard-json}`, or `{"File.sol": {content}}` (older multi-file format).
function etherscanSources(raw: string, contractName: string): Record<string, string> {
  if (!raw) return {}
  if (raw.startsWith('{')) {
    try {
      const inner = JSON.parse(raw.startsWith('{{') ? raw.slice(1, -1) : raw)
      const files = (inner.sources ?? inner) as Record<string, { content?: string }>
      const entries = Object.entries(files).filter(([, file]) => typeof file?.content === 'string')
      if (entries.length > 0) return Object.fromEntries(entries.map(([path, file]) => [path, file.content!]))
    } catch { /* not JSON: treat as a flattened file */ }
  }
  return { [`${contractName || 'Contract'}.sol`]: raw }
}

async function fetchFromEtherscan(
  address: string,
  chainName: string,
  apiKey: string | undefined
): Promise<Partial<ResolvedContract> | null> {
  if (!apiKey) return null

  const chain = getChainConfig(chainName)
  if (!chain.explorerApiUrl) return null

  const url = `${explorerApiBase(chain.explorerApiUrl)}?chainid=${chain.chainId}&module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`

  const data = await fetchWithRetry(url) as {
    status: string
    result: Array<{
      SourceCode: string
      ABI: string
      ContractName: string
      CompilerVersion: string
      OptimizationUsed: string
      Runs: string
      LicenseType: string
    }>
  } | null

  if (!data || data.status !== '1' || !Array.isArray(data.result) || !data.result[0]) return null

  const r = data.result[0]
  if (r.ABI === 'Contract source code not verified') {
    return { isVerified: false, name: 'Unknown', abi: null, sourceCode: null }
  }

  let abi: AbiItem[] | null = null
  try { abi = JSON.parse(r.ABI) } catch { abi = null }

  const sources = etherscanSources(r.SourceCode, r.ContractName)
  const sourceCode = joinSources(sources)

  return {
    name: r.ContractName || 'Unknown',
    sourceCode,
    sources,
    abi,
    compilerVersion: r.CompilerVersion?.replace('v', '') || null,
    optimizationEnabled: r.OptimizationUsed === '1',
    runs: r.Runs ? parseInt(r.Runs) : null,
    license: r.LicenseType && r.LicenseType !== 'None' ? r.LicenseType : null,
    isVerified: true,
  }
}

async function fetchFromSourcify(
  address: string,
  chainId: number
): Promise<Partial<ResolvedContract> | null> {
  const url = `https://sourcify.dev/server/v2/contract/${chainId}/${address}?fields=all`
  const data = await fetchWithRetry(url) as {
    compilation?: { name?: string; compilerVersion?: string; compilerSettings?: { optimizer?: { enabled?: boolean; runs?: number } } }
    abi?: AbiItem[]
    sources?: Record<string, { content: string }>
    metadata?: { license?: string }
  } | null

  if (!data) return null

  const sources = Object.fromEntries(
    Object.entries(data.sources || {})
      .filter(([, file]) => file?.content)
      .map(([path, file]) => [path, file.content])
  )
  const sourceCode = joinSources(sources)

  const compilation = data.compilation || {}
  const optimizer = compilation.compilerSettings?.optimizer

  return {
    name: compilation.name || 'Unknown',
    sourceCode,
    sources,
    abi: data.abi || null,
    compilerVersion: compilation.compilerVersion || null,
    optimizationEnabled: optimizer?.enabled ?? null,
    runs: optimizer?.runs ?? null,
    license: data.metadata?.license || null,
    isVerified: true,
  }
}

export async function resolveContract(
  address: string,
  chainName: string,
  config: Config
): Promise<ResolvedContract> {
  const chain = getChainConfig(chainName)

  const base: ResolvedContract = {
    address,
    chainId: chain.chainId,
    name: 'Unknown',
    sourceCode: null,
    abi: null,
    compilerVersion: null,
    optimizationEnabled: null,
    runs: null,
    license: null,
    isVerified: false,
    isProxy: false,
    implementationAddress: null,
    implementationName: null,
  }

  // Try Etherscan first (only if API key present — V2 requires it)
  const fromEtherscan = await fetchFromEtherscan(address, chainName, config.etherscanApiKey)
  if (fromEtherscan?.isVerified) {
    return { ...base, ...fromEtherscan }
  }

  // Fallback to Sourcify (no key needed)
  const fromSourcify = await fetchFromSourcify(address, chain.chainId)
  if (fromSourcify?.isVerified) {
    return { ...base, ...fromSourcify }
  }

  return { ...base, ...(fromEtherscan || {}) }
}
