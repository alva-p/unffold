import ora from 'ora'
import { decodeEventLog, formatUnits, getAddress, isAddress } from 'viem'
import { createClient, getChainConfig } from '../core/rpc.js'
import { resolveContract } from '../core/resolver.js'
import { c } from '../output/colors.js'
import { addressLink } from '../output/links.js'
import type { AbiItem, Config } from '../types.js'

const POLL_MS = 4_000
const SPIN = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']
const AMOUNT_FIELDS = new Set(['value', 'amount', 'wad', 'balance', 'assets', 'shares', 'liquidity', 'qty'])

function validateAddress(raw: string): string {
  if (!isAddress(raw)) throw new Error(`Invalid EVM address: ${raw}`)
  return getAddress(raw)
}

function eventNames(abi: AbiItem[]): string[] {
  return abi.filter(item => item.type === 'event' && item.name).map(item => item.name!)
}

function formatArg(value: unknown, decimals: number, fieldName = ''): string {
  if (typeof value === 'bigint') {
    if (AMOUNT_FIELDS.has(fieldName.toLowerCase()) && decimals > 0) return formatUnits(value, decimals)
    return value.toString()
  }
  if (Array.isArray(value)) return `[${value.map(v => formatArg(v, decimals)).join(', ')}]`
  return String(value)
}

function timeAgo(ms: number): string {
  const s = Math.floor(Math.abs(ms) / 1000)
  if (s < 60) return `${s}s ago`
  return `${Math.floor(s / 60)}m ${s % 60}s ago`
}

async function fetchDecimals(address: string, client: ReturnType<typeof createClient>): Promise<number> {
  try {
    const dec = await client.readContract({
      address: address as `0x${string}`,
      abi: [{ type: 'function', name: 'decimals', inputs: [], outputs: [{ name: '', type: 'uint8' }], stateMutability: 'view' }],
      functionName: 'decimals',
    })
    return Number(dec)
  } catch {
    return 18
  }
}

function makePollSpinner(nextBlock: bigint): { stop: () => void; update: (block: bigint) => void } {
  if (!process.stdout.isTTY) return { stop: () => {}, update: () => {} }
  let frame = 0
  let block = nextBlock
  const interval = setInterval(() => {
    process.stdout.write(`\r  ${c.muted(SPIN[frame % SPIN.length])} ${c.muted(`waiting for block ${block}...`)}   `)
    frame++
  }, 80)
  return {
    stop: () => {
      clearInterval(interval)
      process.stdout.write('\r' + ' '.repeat(50) + '\r')
    },
    update: (b: bigint) => { block = b },
  }
}

export async function runWatch(
  rawAddress: string,
  eventName: string,
  chainName: string,
  config: Config,
  rpcOverride?: string
): Promise<void> {
  const address = validateAddress(rawAddress)
  const chain = getChainConfig(chainName)
  const spinner = ora({ text: '  Preparing event watcher...', spinner: 'arc' }).start()

  try {
    const client = createClient(chainName, config, rpcOverride)
    const [contract, decimals] = await Promise.all([
      resolveContract(address, chainName, config),
      fetchDecimals(address, client),
    ])
    const abi = contract.abi || []
    if (abi.length === 0) throw new Error('Verified ABI is required to watch decoded events')

    const names = eventNames(abi)
    if (eventName !== 'all' && !names.includes(eventName)) {
      throw new Error(`Event not found in ABI: ${eventName}. Available: ${names.join(', ')}`)
    }

    let fromBlock = await client.getBlockNumber()

    spinner.stop()
    const addrShort = `${address.slice(0, 6)}...${address.slice(-4)}`
    const addrDisplay = addressLink(addrShort, address, chain.explorerUrl)
    console.log()
    console.log(`  ${c.bold(`Watching ${eventName}`)}  ${c.address(addrDisplay)}  ${c.muted('[' + chainName + ']')}`)
    console.log(c.dim('  ─────────────────────────────────────────────────'))
    console.log(c.muted(`  from block ${fromBlock} · ${decimals} decimals · Ctrl+C to stop\n`))

    let count = 0
    let running = true
    let lastPoll = 0

    process.once('SIGINT', () => { running = false })

    let poll = makePollSpinner(fromBlock + 1n)

    while (running) {
      await new Promise(r => setTimeout(r, 200))
      if (!running) break
      if (Date.now() - lastPoll < POLL_MS) continue
      lastPoll = Date.now()

      const pollTime = Date.now()
      const toBlock = await client.getBlockNumber()

      if (toBlock <= fromBlock) {
        poll.update(fromBlock + 1n)
        continue
      }

      const MAX_LOOKBACK = 20n
      const safeFrom = (toBlock - fromBlock) > MAX_LOOKBACK ? toBlock - MAX_LOOKBACK : fromBlock + 1n

      let logs: Awaited<ReturnType<typeof client.getLogs>> = []
      try {
        logs = await client.getLogs({
          address: address as `0x${string}`,
          fromBlock: safeFrom,
          toBlock,
        })
        fromBlock = toBlock
      } catch {
        continue
      }

      type DecodedLog = { name: string; args: Record<string, unknown> }
      const byBlock = new Map<bigint, DecodedLog[]>()

      for (const log of logs) {
        try {
          const decoded = decodeEventLog({ abi: abi as never, data: log.data, topics: log.topics })
          const name = String(decoded.eventName)
          if (eventName !== 'all' && name !== eventName) continue
          const blockNum = log.blockNumber ?? toBlock
          if (!byBlock.has(blockNum)) byBlock.set(blockNum, [])
          const raw = decoded.args as unknown
          const args = (raw && !Array.isArray(raw) && typeof raw === 'object') ? raw as Record<string, unknown> : {}
          byBlock.get(blockNum)!.push({ name, args })
        } catch { /* skip */ }
      }

      if (byBlock.size === 0) {
        poll.update(fromBlock + 1n)
        continue
      }

      poll.stop()

      for (const [blockNum, events] of [...byBlock.entries()].sort((a, b) => Number(a[0] - b[0]))) {
        count += events.length
        console.log(`  ${c.dim('───')} ${c.bold('block ' + blockNum.toString())} ${c.muted('· ' + timeAgo(Date.now() - pollTime))} ${c.dim('─'.repeat(28))}`)
        for (const ev of events) {
          console.log(`\n  ${c.success(ev.name)}`)
          for (const [key, val] of Object.entries(ev.args)) {
            const isAddr = typeof val === 'string' && /^0x[0-9a-fA-F]{40}$/.test(val)
            const display = isAddr
              ? c.address(addressLink(`${(val as string).slice(0, 6)}...${(val as string).slice(-4)}`, val as string, chain.explorerUrl))
              : formatArg(val, decimals, key)
            console.log(`    ${c.muted(key.padEnd(10))} ${display}`)
          }
        }
        console.log()
      }

      poll = makePollSpinner(fromBlock + 1n)
    }

    poll.stop()
    console.log(`\n  ${c.muted(`Stopped. ${count} events received.`)}\n`)
  } catch (err) {
    spinner.fail()
    console.error(`\n  ${c.danger('Error:')} ${(err as Error).message}\n`)
    process.exit(1)
  }
}
