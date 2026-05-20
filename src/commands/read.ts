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

function splitArgs(input: string): string[] {
  if (!input.trim()) return []
  const args: string[] = []
  let current = ''
  let quote: string | null = null
  for (const char of input) {
    if ((char === '"' || char === "'") && !quote) quote = char
    else if (char === quote) quote = null
    if (char === ',' && !quote) {
      args.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }
  if (current.trim()) args.push(current.trim())
  return args
}

function parseCall(call: string): { name: string; args: string[] } {
  const match = call.match(/^([A-Za-z_$][\w$]*)\((.*)\)$/)
  if (!match) throw new Error(`Invalid call syntax. Use e.g. balanceOf(0x...)`)
  return { name: match[1], args: splitArgs(match[2]) }
}

function coerceArg(type: string, value: string): unknown {
  const clean = value.replace(/^["']|["']$/g, '')
  if (type === 'address') {
    if (!isAddress(clean)) throw new Error(`Invalid address argument: ${value}`)
    return getAddress(clean)
  }
  if (type.startsWith('uint') || type.startsWith('int')) return BigInt(clean)
  if (type === 'bool') return clean === 'true' || clean === '1'
  if (type.startsWith('bytes')) return clean
  return clean
}

function formatValue(value: unknown): string {
  if (typeof value === 'bigint') return `${value.toString()} (${formatUnits(value, 18)} @ 18 decimals)`
  if (Array.isArray(value)) return `[${value.map(formatValue).join(', ')}]`
  if (typeof value === 'object' && value !== null) return JSON.stringify(value, (_, v) => typeof v === 'bigint' ? v.toString() : v)
  return String(value)
}

function findFunction(abi: AbiItem[], name: string, argCount: number): AbiItem | null {
  return abi.find(item => item.type === 'function' && item.name === name && (item.inputs?.length || 0) === argCount) || null
}

export async function runRead(
  rawAddress: string,
  call: string,
  chainName: string,
  config: Config,
  rpcOverride?: string,
  jsonOutput = false
): Promise<void> {
  const address = validateAddress(rawAddress)
  const parsed = parseCall(call)
  const spinner = jsonOutput ? null : ora({ text: `  Calling ${c.address(parsed.name)}...`, spinner: 'dots' }).start()

  try {
    const client = createClient(chainName, config, rpcOverride)
    const contract = await resolveContract(address, chainName, config)
    const abi = contract.abi || []
    const fn = findFunction(abi, parsed.name, parsed.args.length)
    if (!fn) throw new Error(`Function not found in ABI: ${parsed.name}(${parsed.args.length} args)`)
    if (fn.stateMutability !== 'view' && fn.stateMutability !== 'pure') {
      throw new Error(`${parsed.name} is not view/pure; refusing to send a transaction`)
    }

    const args = parsed.args.map((arg, i) => coerceArg(fn.inputs?.[i]?.type || 'string', arg))
    const value = await client.readContract({
      address: address as `0x${string}`,
      abi: abi as never,
      functionName: parsed.name,
      args,
    })

    spinner?.stop()
    if (jsonOutput) {
      console.log(JSON.stringify({ call, result: value }, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2))
      return
    }

    console.log()
    console.log(`  ${c.bold('READ RESULT')}`)
    console.log(c.dim('  ──────────────────────────────────────────────────'))
    console.log(`  ${c.muted('call')}    ${call}`)
    console.log(`  ${c.muted('result')}  ${formatValue(value)}`)
    console.log()
  } catch (err) {
    spinner?.fail()
    console.error(`\n  ${c.danger('Error:')} ${(err as Error).message}\n`)
    process.exit(1)
  }
}
