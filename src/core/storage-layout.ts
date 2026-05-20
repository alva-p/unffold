import { encodeAbiParameters, getAddress, isAddress, keccak256, padHex, toHex } from 'viem'
import { tryAnalyzeSource } from './ast-analyzer.js'
import type { AnalyzedStateVariable } from '../types.js'

export interface StorageLookup {
  variable?: AnalyzedStateVariable
  slot: `0x${string}`
  kind: 'slot' | 'variable' | 'mapping'
  mappingKey?: string
}

function slotHex(slot: bigint | number): `0x${string}` {
  return padHex(toHex(slot), { size: 32 })
}

function parseSlot(input: string): `0x${string}` | null {
  if (/^\d+$/.test(input)) return slotHex(BigInt(input))
  if (/^0x[0-9a-fA-F]+$/.test(input)) return padHex(input as `0x${string}`, { size: 32 })
  return null
}

function parseMapping(input: string): { name: string; key: string } | null {
  const match = input.match(/^([A-Za-z_$][\w$]*)\[(.+)\]$/)
  if (!match) return null
  return { name: match[1], key: match[2].trim() }
}

function mappingKeyType(type: string): string {
  const match = type.match(/^mapping\((.+?)\s*=>/)
  return match?.[1]?.trim() || 'address'
}

function encodeMappingKey(type: string, rawKey: string): `0x${string}` {
  if (type === 'address') {
    if (!isAddress(rawKey)) throw new Error(`Invalid mapping address key: ${rawKey}`)
    return encodeAbiParameters([{ type: 'address' }, { type: 'uint256' }], [getAddress(rawKey), 0n])
  }
  if (type.startsWith('uint') || type.startsWith('int')) {
    return encodeAbiParameters([{ type }, { type: 'uint256' }], [BigInt(rawKey), 0n])
  }
  if (type === 'bytes32') {
    return encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint256' }], [rawKey as `0x${string}`, 0n])
  }
  if (type === 'string') {
    return encodeAbiParameters([{ type: 'string' }, { type: 'uint256' }], [rawKey.replace(/^["']|["']$/g, ''), 0n])
  }
  return encodeAbiParameters([{ type: 'bytes32' }, { type: 'uint256' }], [keccak256(toHex(rawKey)), 0n])
}

function mappingSlot(keyType: string, key: string, slot: number): `0x${string}` {
  const encoded = encodeMappingKey(keyType, key)
  const slotValue = slotHex(slot)
  return keccak256(`0x${encoded.slice(2, 66)}${slotValue.slice(2)}`)
}

export function findStorageSlot(sourceCode: string | null | undefined, query: string): StorageLookup | null {
  const direct = parseSlot(query)
  if (direct) return { slot: direct, kind: 'slot' }

  const analysis = tryAnalyzeSource(sourceCode)
  if (!analysis) return null

  const mapping = parseMapping(query)
  if (mapping) {
    const variable = analysis.stateVariables.find(v => v.name === mapping.name)
    if (!variable || variable.slot === undefined) return null
    const keyType = mappingKeyType(variable.type)
    return {
      variable,
      slot: mappingSlot(keyType, mapping.key, variable.slot),
      kind: 'mapping',
      mappingKey: mapping.key,
    }
  }

  const variable = analysis.stateVariables.find(v => v.name === query)
  if (!variable || variable.slot === undefined) return null
  return { variable, slot: slotHex(variable.slot), kind: 'variable' }
}

export function decodeStorageValue(raw: `0x${string}` | undefined, variable?: AnalyzedStateVariable): string {
  if (!raw) return '0x'
  const type = variable?.type
  if (type === 'address') {
    try {
      return getAddress(`0x${raw.slice(-40)}`)
    } catch {
      return raw
    }
  }
  if (type?.startsWith('uint') || type === 'bool') {
    const value = BigInt(raw)
    return type === 'bool' ? String(value !== 0n) : value.toString()
  }
  return raw
}
