import { getAddress, isAddress } from 'viem'
import { createClient, getChainConfig } from '../rpc.js'
import { getUpgradeHistory, resolveProxyChain } from '../proxy-detector.js'
import { resolveContract } from '../resolver.js'
import { buildProfileReport, type ProfileReport } from '../profile-report.js'
import type { Config, ProxyInfo } from '../../types.js'
import type { RiskSummary } from '../risk-summary.js'

export interface ProxyProfileResult {
  report: ProfileReport
  proxy: ProxyInfo | null
  history: Array<{
    blockNumber: string
    address: string
  }>
}

function validateAddress(raw: string): string {
  if (!isAddress(raw)) throw new Error(`Invalid EVM address: ${raw}`)
  return getAddress(raw)
}

export function proxyRiskSummary(proxy: ProxyInfo | null): RiskSummary {
  if (!proxy) {
    return {
      overall: 'low',
      score: 0,
      mainReason: 'No proxy pattern was detected by the quick scan.',
      summary: 'Low risk: no proxy pattern was detected by the quick scan.',
      badges: ['No proxy detected'],
      verified: true,
      proxy: {
        detected: false,
        pattern: null,
        adminAddress: null,
        implementationAddress: null,
      },
      standards: [],
      controls: {
        mint: [],
        burn: [],
        pause: [],
        blacklist: [],
        tax: [],
        tradingGate: [],
      },
      signals: [],
    }
  }

  const hasAdmin = Boolean(proxy.adminAddress)
  return {
    overall: hasAdmin ? 'high' : 'medium',
    score: hasAdmin ? 90 : 55,
    mainReason: hasAdmin
      ? 'The proxy has an admin address that may be able to upgrade implementation logic.'
      : 'The contract is upgradeable, so implementation logic may change over time.',
    summary: hasAdmin
      ? 'High risk: proxy admin can likely change implementation logic.'
      : 'Medium risk: upgradeable proxy detected.',
    badges: ['Proxy', proxy.pattern, ...(hasAdmin ? ['Admin controlled'] : [])],
    verified: true,
    proxy: {
      detected: true,
      pattern: proxy.pattern,
      adminAddress: proxy.adminAddress ?? null,
      implementationAddress: proxy.implementationAddress,
    },
    standards: [],
    controls: {
      mint: [],
      burn: [],
      pause: [],
      blacklist: [],
      tax: [],
      tradingGate: [],
    },
    signals: [
      {
        id: 'upgradeable',
        label: 'Upgradeable contract',
        severity: hasAdmin ? 'high' : 'medium',
        detail: proxy.pattern,
        meaning: 'The contract appears to route calls through upgradeable proxy logic.',
        whyItMatters: 'The implementation can change after users buy, mint, or deposit.',
        recommendation: 'Check who controls upgrades and whether there is a timelock, multisig, or public governance process.',
      },
      ...(hasAdmin ? [{
        id: 'proxy-admin',
        label: 'Proxy admin detected',
        severity: 'high' as const,
        detail: proxy.adminAddress!,
        meaning: 'A privileged admin address was detected for the proxy.',
        whyItMatters: 'The admin may be able to change the implementation behind the proxy.',
        recommendation: 'Inspect the admin address and verify whether it is a multisig, timelock, or governance-controlled account.',
      }] : []),
    ],
  }
}

export async function analyzeProxyProfile(
  rawAddress: string,
  chainName: string,
  config: Config,
  rpcOverride?: string
): Promise<ProxyProfileResult> {
  const address = validateAddress(rawAddress)
  const chain = getChainConfig(chainName)
  const client = createClient(chainName, config, rpcOverride)
  const contract = await resolveContract(address, chainName, config)
  const proxy = await resolveProxyChain(address, contract.abi, client)
  const history = proxy ? await getUpgradeHistory(address, client) : []
  const riskSummary = proxyRiskSummary(proxy)
  const report = buildProfileReport({
    profile: 'proxy',
    title: contract.name,
    subtitle: `${proxy?.pattern ?? 'No proxy detected'} · ${chain.name}`,
    address,
    chain,
    riskSummary,
    facts: [
      { label: 'Pattern', value: proxy?.pattern ?? 'not detected' },
      { label: 'Implementation', value: proxy?.implementationAddress ?? null },
      { label: 'Admin', value: proxy?.adminAddress ?? null },
      { label: 'Nested proxy', value: proxy?.chain?.pattern ?? null },
      { label: 'Upgrade events', value: history.length },
    ],
  })

  return {
    report,
    proxy,
    history: history.map(entry => ({
      ...entry,
      blockNumber: entry.blockNumber.toString(),
    })),
  }
}
