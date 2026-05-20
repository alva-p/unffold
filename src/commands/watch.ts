import ora from 'ora'
import { formatUnits, getAddress, isAddress } from 'viem'
import { createClient } from '../core/rpc.js'
import { resolveContract } from '../core/resolver.js'
import { c } from '../output/colors.js'
import type { AbiItem, Config } from '../types.js'

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
  const spinner = ora({ text: `  Preparing event watcher...`, spinner: 'dots' }).start()

  try {
    const client = createClient(chainName, config, rpcOverride)
    const contract = await resolveContract(address, chainName, config)
    const abi = contract.abi || []
    if (abi.length === 0) throw new Error('Verified ABI is required to watch decoded events')

    const names = eventNames(abi)
    if (eventName !== 'all' && !names.includes(eventName)) {
      throw new Error(`Event not found in ABI: ${eventName}. Available: ${names.join(', ')}`)
    }

    spinner.stop()
    console.log()
    console.log(`  ${c.bold(`Watching ${eventName} on ${address}`)}`)
    console.log(c.dim('  ─────────────────────────────────────────────────'))

    let count = 0
    const params: Record<string, unknown> = {
      address: address as `0x${string}`,
      abi: abi as never,
      onLogs(logs: Array<Record<string, unknown>>) {
        for (const log of logs) {
          count += 1
          const name = String(log.eventName || eventName)
          const block = typeof log.blockNumber === 'bigint' ? log.blockNumber.toString() : '?'
          console.log(`  [${block}] ${c.success(name)}  ${c.muted(`#${count}`)}`)
          const args = log.args as Record<string, unknown> | undefined
          if (args) {
            for (const [key, value] of Object.entries(args)) {
              console.log(`    ${c.muted(key.padEnd(10))} ${formatArg(value)}`)
            }
          }
          console.log()
        }
      },
      onError(error: Error) {
        console.error(`\n  ${c.danger('watch error:')} ${error.message}\n`)
      },
    }
    if (eventName !== 'all') params.eventName = eventName

    const unwatch = (client as never as { watchContractEvent(args: Record<string, unknown>): () => void }).watchContractEvent(params)
    await new Promise<void>(resolve => {
      process.once('SIGINT', () => {
        unwatch()
        console.log(`\n  ${c.muted(`Stopped. Events received: ${count}`)}\n`)
        resolve()
        process.exit(0)
      })
    })
  } catch (err) {
    spinner.fail()
    console.error(`\n  ${c.danger('Error:')} ${(err as Error).message}\n`)
    process.exit(1)
  }
}
