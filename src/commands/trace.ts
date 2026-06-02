import ora from 'ora'
import { decodeFunctionData, decodeEventLog, formatEther, isHash } from 'viem'
import { createClient } from '../core/rpc.js'
import { resolveContract } from '../core/resolver.js'
import { detectProxy } from '../core/proxy-detector.js'
import { c } from '../output/colors.js'
import type { AbiItem, Config } from '../types.js'

function mergeAbis(a: AbiItem[], b: AbiItem[]): AbiItem[] {
  const seen = new Set(a.map(item => `${item.type}:${item.name}`))
  return [...a, ...b.filter(item => !seen.has(`${item.type}:${item.name}`))]
}

function formatValue(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]'
    const items = value.map(v => formatValue(v, depth + 1))
    return `[${items.join(', ')}]`
  }
  if (typeof value === 'object') {
    return JSON.stringify(value, (_k, v) => typeof v === 'bigint' ? v.toString() : v)
  }
  return String(value)
}

export async function runTrace(
  txHash: string,
  chainName: string,
  config: Config,
  rpcOverride?: string,
  jsonOutput = false
): Promise<void> {
  if (!isHash(txHash)) {
    console.error(`\n  ${c.danger('Error:')} Invalid transaction hash: ${txHash}\n`)
    process.exit(1)
  }

  const spinner = jsonOutput ? null : ora({ text: '  Fetching transaction...', spinner: 'dots' }).start()

  try {
    const client = createClient(chainName, config, rpcOverride)

    const [tx, receipt] = await Promise.all([
      client.getTransaction({ hash: txHash as `0x${string}` }),
      client.getTransactionReceipt({ hash: txHash as `0x${string}` }),
    ])

    const toAddress = tx.to
    if (!toAddress) {
      spinner?.stop()
      console.log(`\n  ${c.muted('Contract deployment transaction — no target to decode.')}\n`)
      return
    }

    if (spinner) spinner.text = '  Resolving contract ABI...'
    const contract = await resolveContract(toAddress, chainName, config)
    let abi = contract.abi ?? []

    // If proxy, also load implementation ABI for decoding
    let implName: string | null = null
    const proxy = await detectProxy(toAddress, abi, client).catch(() => null)
    if (proxy && proxy.implementationAddress !== toAddress) {
      const impl = await resolveContract(proxy.implementationAddress, chainName, config).catch(() => null)
      if (impl?.abi) {
        abi = mergeAbis(abi, impl.abi)
        implName = impl.name
      }
    }

    // Decode calldata
    let decoded: { functionName: string; args: readonly unknown[] } | null = null
    if (tx.input && tx.input.length > 10 && abi.length > 0) {
      try {
        const raw = decodeFunctionData({ abi: abi as never, data: tx.input })
        decoded = { functionName: raw.functionName, args: raw.args ?? [] }
      } catch {
        // calldata doesn't match any ABI function
      }
    }

    // Decode events
    type DecodedEvent = { name: string; args: Record<string, unknown> }
    const decodedEvents: DecodedEvent[] = []
    if (abi.length > 0) {
      for (const log of receipt.logs) {
        try {
          const ev = decodeEventLog({
            abi: abi as never,
            data: log.data,
            topics: log.topics,
          })
          const raw = ev.args as unknown
          const args = (raw && !Array.isArray(raw) && typeof raw === 'object')
            ? raw as Record<string, unknown>
            : {}
          decodedEvents.push({ name: String(ev.eventName), args })
        } catch {
          // log doesn't match this ABI
        }
      }
    }

    // Find the decoded function's ABI entry to get param names
    let fnAbi: AbiItem | null = null
    if (decoded) {
      fnAbi = abi.find(item =>
        item.type === 'function' && item.name === decoded!.functionName
      ) ?? null
    }

    spinner?.stop()

    if (jsonOutput) {
      console.log(JSON.stringify({
        hash: txHash,
        from: tx.from,
        to: toAddress,
        contract: contract.name,
        block: tx.blockNumber?.toString(),
        value: tx.value?.toString(),
        status: receipt.status,
        calldata: decoded ? {
          function: decoded.functionName,
          args: decoded.args,
        } : { raw: tx.input },
        events: decodedEvents,
      }, (_k, v) => typeof v === 'bigint' ? v.toString() : v, 2))
      return
    }

    const short = (a: string) => `${a.slice(0, 6)}...${a.slice(-4)}`
    const statusLabel = receipt.status === 'success'
      ? c.success('success')
      : c.danger('reverted')

    console.log()
    console.log(`  ${c.bold('TRACE')}  ${c.muted(short(txHash))}  ${c.muted('[' + chainName + ']')}`)
    console.log(c.dim('  ──────────────────────────────────────────────────'))
    console.log(`  ${c.muted('from')}     ${c.address(tx.from)}`)
    const contractLabel = implName
      ? `${contract.name} ${c.muted('→')} ${implName}`
      : contract.name
    console.log(`  ${c.muted('to')}       ${c.address(toAddress)}  ${c.muted(contractLabel)}`)
    console.log(`  ${c.muted('block')}    ${tx.blockNumber?.toString() ?? 'pending'}`)
    if (tx.value && tx.value > 0n) {
      console.log(`  ${c.muted('value')}    ${formatEther(tx.value)} ETH`)
    }
    console.log(`  ${c.muted('status')}   ${statusLabel}`)

    console.log()
    console.log(`  ${c.bold('CALLDATA')}`)
    if (decoded && fnAbi) {
      console.log(`  ${c.muted('function')}  ${decoded.functionName}`)
      const args = Array.isArray(decoded.args) ? decoded.args : []
      const inputs = fnAbi.inputs ?? []
      for (let i = 0; i < args.length; i++) {
        const name = inputs[i]?.name || `arg${i}`
        const type = inputs[i]?.type || ''
        console.log(`  ${c.muted(name.padEnd(10))}  ${c.muted('(' + type + ')')}  ${formatValue(args[i])}`)
      }
    } else if (tx.input && tx.input.length > 2) {
      console.log(`  ${c.muted('selector')}  ${tx.input.slice(0, 10)}`)
      console.log(`  ${c.muted('raw')}       ${tx.input.slice(0, 66)}${tx.input.length > 66 ? '...' : ''}`)
      if (!contract.isVerified) {
        console.log(`  ${c.warn('⚠')}  ${c.muted('Contract not verified — cannot decode calldata')}`)
      }
    } else {
      console.log(`  ${c.muted('(no calldata)')}`)
    }

    if (decodedEvents.length > 0) {
      console.log()
      console.log(`  ${c.bold('EVENTS')} ${c.muted('(' + decodedEvents.length + ')')}`)
      for (const event of decodedEvents) {
        console.log(`\n  ${c.address(event.name)}`)
        for (const [key, val] of Object.entries(event.args)) {
          console.log(`    ${c.muted(key.padEnd(12))}  ${formatValue(val)}`)
        }
      }
    } else if (receipt.logs.length > 0) {
      console.log()
      console.log(`  ${c.bold('EVENTS')}`)
      console.log(`  ${c.muted(`${receipt.logs.length} log(s) emitted but could not be decoded`)}`)
      if (!contract.isVerified) {
        console.log(`  ${c.warn('⚠')}  ${c.muted('Contract not verified — no ABI to decode events')}`)
      }
    }

    console.log()
  } catch (err) {
    spinner?.fail()
    console.error(`\n  ${c.danger('Error:')} ${(err as Error).message}\n`)
    process.exit(1)
  }
}
