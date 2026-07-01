import { decodeEventLog, decodeFunctionData, formatEther, isHash } from 'viem'
import { createClient, getChainConfig } from './rpc.js'
import { detectProxy } from './proxy-detector.js'
import { resolveContract } from './resolver.js'
import type { ProfileReport, ProfileWarning } from './profile-report.js'
import type { AbiItem, Config } from '../types.js'

function mergeAbis(a: AbiItem[], b: AbiItem[]): AbiItem[] {
  const seen = new Set(a.map(item => `${item.type}:${item.name}`))
  return [...a, ...b.filter(item => !seen.has(`${item.type}:${item.name}`))]
}

function jsonValue(value: unknown): string {
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return `[${value.map(jsonValue).join(', ')}]`
  if (value && typeof value === 'object') return JSON.stringify(value, (_k, v) => typeof v === 'bigint' ? v.toString() : v)
  return String(value)
}

export async function buildTraceReport(
  txHash: string,
  chainName: string,
  config: Config,
  rpcOverride?: string
): Promise<ProfileReport> {
  if (!isHash(txHash)) throw new Error(`Invalid transaction hash: ${txHash}`)

  const chain = getChainConfig(chainName)
  const client = createClient(chainName, config, rpcOverride)
  const [tx, receipt] = await Promise.all([
    client.getTransaction({ hash: txHash as `0x${string}` }),
    client.getTransactionReceipt({ hash: txHash as `0x${string}` }),
  ])

  if (!tx.to) {
    return {
      profile: 'trace',
      title: 'Contract deployment',
      subtitle: `${chain.name} · block ${tx.blockNumber?.toString() ?? 'pending'}`,
      address: txHash,
      chain: { name: chain.name, id: chain.chainId },
      badges: ['Transaction', receipt.status],
      risk: {
        level: receipt.status === 'success' ? 'low' : 'high',
        score: receipt.status === 'success' ? 0 : 80,
        summary: 'Deployment transaction: no target contract call to decode.',
        mainReason: 'No target address was present in the transaction.',
      },
      facts: [
        { label: 'From', value: tx.from },
        { label: 'Block', value: tx.blockNumber?.toString() ?? 'pending' },
        { label: 'Status', value: receipt.status },
      ],
      warnings: [],
      links: [{ label: 'Explorer', url: `${chain.explorerUrl.replace('/address/', '/tx/')}${txHash}` }],
    }
  }

  const contract = await resolveContract(tx.to, chainName, config)
  let abi = contract.abi ?? []
  const proxy = await detectProxy(tx.to, abi, client).catch(() => null)
  const impl = proxy && proxy.implementationAddress !== tx.to
    ? await resolveContract(proxy.implementationAddress, chainName, config).catch(() => null)
    : null
  if (impl?.abi) abi = mergeAbis(abi, impl.abi)

  let functionName: string | null = null
  let args: readonly unknown[] = []
  if (tx.input && tx.input.length > 10 && abi.length > 0) {
    try {
      const decoded = decodeFunctionData({ abi: abi as never, data: tx.input })
      functionName = decoded.functionName
      args = decoded.args ?? []
    } catch {
      // Unknown selector.
    }
  }

  let decodedEvents = 0
  if (abi.length > 0) {
    for (const log of receipt.logs) {
      try {
        decodeEventLog({ abi: abi as never, data: log.data, topics: log.topics })
        decodedEvents++
      } catch {
        // Log belongs to another ABI or unknown event.
      }
    }
  }

  const warnings: ProfileWarning[] = []
  if (receipt.status !== 'success') {
    warnings.push({
      id: 'tx-reverted',
      title: 'Transaction reverted',
      severity: 'high',
      body: 'The transaction failed on-chain.',
      recommendation: 'Review the called function and emitted logs before relying on this interaction.',
    })
  }
  if (!contract.isVerified) {
    warnings.push({
      id: 'trace-unverified-target',
      title: 'Target contract not verified',
      severity: 'medium',
      body: 'The target contract ABI/source was not available.',
      recommendation: 'Calldata and event decoding may be incomplete; verify the target contract manually.',
    })
  }

  return {
    profile: 'trace',
    title: functionName ? `${functionName}()` : 'Transaction trace',
    subtitle: `${contract.name} · ${chain.name}`,
    address: txHash,
    chain: { name: chain.name, id: chain.chainId },
    badges: ['Transaction', receipt.status, ...(proxy ? ['Proxy'] : []), ...(impl ? ['Implementation ABI'] : [])],
    risk: {
      level: receipt.status === 'success' ? 'low' : 'high',
      score: receipt.status === 'success' ? 0 : 80,
      summary: receipt.status === 'success'
        ? `Successful transaction${functionName ? ` calling ${functionName}()` : ''}.`
        : 'Reverted transaction.',
      mainReason: receipt.status === 'success' ? 'The transaction succeeded on-chain.' : 'The transaction reverted on-chain.',
    },
    facts: [
      { label: 'From', value: tx.from },
      { label: 'To', value: tx.to },
      { label: 'Contract', value: contract.name },
      { label: 'Block', value: tx.blockNumber?.toString() ?? 'pending' },
      { label: 'Value', value: tx.value && tx.value > 0n ? `${formatEther(tx.value)} ETH` : '0 ETH' },
      { label: 'Function', value: functionName ?? tx.input.slice(0, 10) },
      { label: 'Args', value: args.length > 0 ? args.map(jsonValue).join(', ') : null },
      { label: 'Events', value: `${decodedEvents}/${receipt.logs.length} decoded` },
    ],
    warnings,
    links: [{ label: 'Explorer', url: `${chain.explorerUrl.replace('/address/', '/tx/')}${txHash}` }],
  }
}
