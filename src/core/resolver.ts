import type { ResolvedContract, AbiItem, Config } from '../types.js'
import { getChainConfig } from './rpc.js'

async function fetchWithRetry(url: string, retries = 3): Promise<unknown> {
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

async function fetchFromEtherscan(
  address: string,
  chainName: string,
  apiKey: string | undefined
): Promise<Partial<ResolvedContract> | null> {
  if (!apiKey) return null

  const chain = getChainConfig(chainName)
  if (!chain.explorerApiUrl) return null

  const apiBase = chain.explorerApiUrl.includes('etherscan.io') || chain.explorerApiUrl.includes('arbiscan.io') || chain.explorerApiUrl.includes('basescan.org') || chain.explorerApiUrl.includes('bscscan.com') || chain.explorerApiUrl.includes('polygonscan.com') || chain.explorerApiUrl.includes('abscan.org')
    ? 'https://api.etherscan.io/v2/api'
    : chain.explorerApiUrl
  const url = `${apiBase}?chainid=${chain.chainId}&module=contract&action=getsourcecode&address=${address}&apikey=${apiKey}`

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

  let sourceCode = r.SourceCode || null
  if (sourceCode?.startsWith('{{')) {
    try {
      const inner = JSON.parse(sourceCode.slice(1, -1))
      const sources = inner.sources as Record<string, { content: string }>
      sourceCode = Object.values(sources).map(s => s.content).join('\n\n')
    } catch { /* keep raw */ }
  } else if (sourceCode?.startsWith('{')) {
    try {
      const inner = JSON.parse(sourceCode)
      const sources = inner.sources as Record<string, { content: string }>
      sourceCode = Object.values(sources).map(s => s.content).join('\n\n')
    } catch { /* keep raw */ }
  }

  return {
    name: r.ContractName || 'Unknown',
    sourceCode,
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

  const sources = data.sources || {}
  const sourceCode = Object.values(sources)
    .map(s => s.content)
    .filter(Boolean)
    .join('\n\n') || null

  const compilation = data.compilation || {}
  const optimizer = compilation.compilerSettings?.optimizer

  return {
    name: compilation.name || 'Unknown',
    sourceCode,
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
