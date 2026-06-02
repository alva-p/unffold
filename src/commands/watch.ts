import ora from 'ora'
import { decodeEventLog, formatUnits, getAddress, isAddress } from 'viem'
import { createClient } from '../core/rpc.js'
import { resolveContract } from '../core/resolver.js'
import { c } from '../output/colors.js'
import type { AbiItem, Config } from '../types.js'

const POLL_MS = 4_000

function validateAddress(raw: string): string {
  if (!isAddress(raw)) throw new Error(`Invalid EVM address: ${raw}`)
  return getAddress(raw)
}

function formatArg(value: unknown): string {
  if (typeof value === 'bigint') return `${formatUnits(value, 18)} (${value.toString()})`
  if (Array.isArray(value)) return `[${value.map(formatArg).join(', ')}]`
  return String(value)
}

function eventNames(abi: AbiItem[]): string[] {
  return abi.filter(item => item.type === 'event' && item.name).map(item => item.name!)
}

export async function runWatch(
  rawAddress: string,
  eventName: string,
  chainName: string,
  config: Config,
  rpcOverride?: string
): Promise<void> {
  const address = validateAddress(rawAddress)
  const spinner = ora({ text: '  Preparing event watcher...', spinner: 'dots' }).start()

  try {
    const client = createClient(chainName, config, rpcOverride)
    const contract = await resolveContract(address, chainName, config)
    const abi = contract.abi || []
    if (abi.length === 0) throw new Error('Verified ABI is required to watch decoded events')

    const names = eventNames(abi)
    if (eventName !== 'all' && !names.includes(eventName)) {
      throw new Error(`Event not found in ABI: ${eventName}. Available: ${names.join(', ')}`)
    }

    let fromBlock = await client.getBlockNumber()

    spinner.stop()
    console.log()
    console.log(`  ${c.bold(`Watching ${eventName} on ${address}`)}  ${c.muted('[' + chainName + ']')}`)
    console.log(c.dim('  ─────────────────────────────────────────────────'))
    console.log(c.muted(`  polling every ${POLL_MS / 1000}s from block ${fromBlock} — Ctrl+C to stop\n`))

    let count = 0
    let running = true

    process.once('SIGINT', () => {
      running = false
      console.log(`\n  ${c.muted(`Stopped. Events received: ${count}`)}\n`)
      process.exit(0)
    })

    while (running) {
      await new Promise(r => setTimeout(r, POLL_MS))
      if (!running) break

      const toBlock = await client.getBlockNumber()
      if (toBlock <= fromBlock) continue

      const logs = await client.getLogs({
        address: address as `0x${string}`,
        fromBlock: fromBlock + 1n,
        toBlock,
      })

      fromBlock = toBlock

      for (const log of logs) {
        try {
          const decoded = decodeEventLog({ abi: abi as never, data: log.data, topics: log.topics })
          const name = String(decoded.eventName)
          if (eventName !== 'all' && name !== eventName) continue
          count += 1
          const block = log.blockNumber?.toString() ?? '?'
          console.log(`  [${block}] ${c.success(name)}  ${c.muted(`#${count}`)}`)
          const args = decoded.args as Record<string, unknown> | undefined
          if (args) {
            for (const [key, value] of Object.entries(args)) {
              console.log(`    ${c.muted(key.padEnd(10))} ${formatArg(value)}`)
            }
          }
          console.log()
        } catch {
          // log doesn't match ABI — skip
        }
      }
    }
  } catch (err) {
    spinner.fail()
    console.error(`\n  ${c.danger('Error:')} ${(err as Error).message}\n`)
    process.exit(1)
  }
}
