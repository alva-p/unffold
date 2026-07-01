import { getAddress, isAddress } from 'viem'
import { resolveProxyChain } from './proxy-detector.js'
import { createClient, getChainConfig } from './rpc.js'
import { resolveContract } from './resolver.js'
import { detectStandards } from './standards.js'
import type { ProfileReport, ProfileWarning } from './profile-report.js'
import type { AbiItem, Config } from '../types.js'

const PRIVILEGED_PATTERNS = [
  /^set[A-Z]/, /^add[A-Z]/, /^remove[A-Z]/, /^update[A-Z]/,
  /^change[A-Z]/, /^replace[A-Z]/, /^toggle[A-Z]/,
  /pause$|^pause|^unpause/,
  /freeze|lock(?!ed)|unlock/i,
  /upgrade|upgradeTo/i,
  /^grant|^revoke|^renounce/,
  /whitelist|blacklist|allowlist|denylist/i,
  /^sweep|^rescue|^recover[A-Z]/,
  /emergency/i,
  /^mint(?!ed)|^burn(?!ed)/,
  /admin|owner|operator|guardian|manager/i,
  /^initialize$|^init$/,
]

function looksPrivileged(name: string): boolean {
  return PRIVILEGED_PATTERNS.some(pattern => pattern.test(name))
}

function validateAddress(raw: string): string {
  if (!isAddress(raw)) throw new Error(`Invalid EVM address: ${raw}`)
  return getAddress(raw)
}

function isStateChanging(item: AbiItem): boolean {
  return item.type === 'function' && item.stateMutability !== 'view' && item.stateMutability !== 'pure'
}

function warning(id: string, title: string, body: string, recommendation: string, severity: ProfileWarning['severity'] = 'medium'): ProfileWarning {
  return { id, title, body, recommendation, severity }
}

export async function buildSecurityReport(
  rawAddress: string,
  chainName: string,
  config: Config,
  rpcOverride?: string
): Promise<ProfileReport> {
  const address = validateAddress(rawAddress)
  const chain = getChainConfig(chainName)
  const client = createClient(chainName, config, rpcOverride)
  const contract = await resolveContract(address, chainName, config)
  const proxy = await resolveProxyChain(address, contract.abi, client)
  const standards = detectStandards(contract.abi || [], contract.sourceCode)
  const source = contract.sourceCode || ''

  const stateChanging = (contract.abi || []).filter(isStateChanging)
  const privilegedLooking = stateChanging.filter(fn => fn.name && looksPrivileged(fn.name))

  const warnings: ProfileWarning[] = []
  if (proxy) {
    warnings.push(warning(
      'security-upgradeable',
      'Upgradeable contract',
      proxy.adminAddress ? `${proxy.pattern} with admin ${proxy.adminAddress}.` : `${proxy.pattern} detected.`,
      'Check who controls upgrades and whether a timelock, multisig, or governance process exists.',
      proxy.adminAddress ? 'high' : 'medium',
    ))
  }
  if (source.includes('selfdestruct')) warnings.push(warning('security-selfdestruct', 'selfdestruct marker', 'Source contains selfdestruct.', 'Manually verify whether this path is reachable and who can trigger it.', 'high'))
  if (source.includes('tx.origin')) warnings.push(warning('security-tx-origin', 'tx.origin marker', 'Source contains tx.origin checks.', 'Manually review the authorization flow that uses tx.origin.'))
  if (source.includes('delegatecall')) warnings.push(warning('security-delegatecall', 'delegatecall marker', 'Source contains delegatecall.', 'Review whether delegatecall is externally controllable or only proxy/library infrastructure.'))
  if (!contract.sourceCode) warnings.push(warning(
    'security-no-source-analysis',
    'Modifier analysis unavailable',
    'Contract source was not available.',
    'Treat access-control results as incomplete until source is verified.',
  ))

  const high = warnings.some(item => item.severity === 'high')
  const medium = warnings.some(item => item.severity === 'medium')
  const level = high ? 'high' : medium ? 'medium' : 'low'

  return {
    profile: 'security',
    title: contract.name,
    subtitle: `${chain.name} · security surface`,
    address,
    chain: { name: chain.name, id: chain.chainId },
    badges: [
      contract.isVerified ? 'Verified' : 'Unverified',
      ...(proxy ? ['Upgradeable'] : []),
      ...(standards.reentrancyGuard ? ['ReentrancyGuard'] : []),
    ],
    risk: {
      level,
      score: high ? 90 : medium ? 45 : 0,
      summary: high
        ? 'High risk: security surface has high-severity findings.'
        : medium
          ? 'Medium risk: security surface needs review.'
          : 'Low risk: no major security-surface findings were detected.',
      mainReason: warnings[0]?.body ?? 'No major security-surface findings were detected.',
    },
    facts: [
      { label: 'Source', value: contract.isVerified ? 'verified' : 'unverified' },
      { label: 'Proxy', value: proxy?.pattern ?? 'not detected' },
      { label: 'State-changing fns', value: stateChanging.length },
      { label: 'Privileged-looking fns', value: privilegedLooking.length },
      { label: 'selfdestruct', value: source.includes('selfdestruct') ? 'detected' : 'not detected' },
      { label: 'tx.origin', value: source.includes('tx.origin') ? 'detected' : 'not detected' },
      { label: 'delegatecall', value: source.includes('delegatecall') ? 'detected' : 'not detected' },
      { label: 'Reentrancy guard', value: standards.reentrancyGuard ? 'detected' : 'not detected' },
    ],
    warnings,
    links: [{ label: 'Explorer', url: `${chain.explorerUrl}${address}` }],
  }
}
