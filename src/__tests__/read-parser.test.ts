import { describe, it, expect } from 'vitest'

// Re-export internals for testing via module internals
// We test the pure parsing/coercion logic extracted from read.ts

function splitArgs(input: string): string[] {
  if (!input.trim()) return []
  const args: string[] = []
  let current = ''
  let quote: string | null = null
  let depth = 0
  for (const char of input) {
    if ((char === '"' || char === "'") && !quote) { quote = char; current += char; continue }
    if (char === quote) { quote = null; current += char; continue }
    if (!quote && char === '(') depth++
    if (!quote && char === ')') depth--
    if (char === ',' && !quote && depth === 0) {
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
  if (type === 'address') return clean
  if (type.startsWith('uint') || type.startsWith('int')) return BigInt(clean)
  if (type === 'bool') return clean === 'true' || clean === '1'
  if (type.startsWith('bytes')) return clean
  return clean
}

describe('parseCall', () => {
  it('parses zero-arg call', () => {
    const { name, args } = parseCall('totalSupply()')
    expect(name).toBe('totalSupply')
    expect(args).toHaveLength(0)
  })

  it('parses single address arg', () => {
    const addr = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'
    const { name, args } = parseCall(`balanceOf(${addr})`)
    expect(name).toBe('balanceOf')
    expect(args).toEqual([addr])
  })

  it('parses two args', () => {
    const { name, args } = parseCall('allowance(0xabc,0xdef)')
    expect(name).toBe('allowance')
    expect(args).toHaveLength(2)
    expect(args[0]).toBe('0xabc')
    expect(args[1]).toBe('0xdef')
  })

  it('handles spaces around args', () => {
    const { args } = parseCall('allowance( 0xabc , 0xdef )')
    expect(args[0]).toBe('0xabc')
    expect(args[1]).toBe('0xdef')
  })

  it('parses uint arg', () => {
    const { args } = parseCall('tokenOfOwnerByIndex(0xabc,0)')
    expect(args[1]).toBe('0')
  })

  it('parses quoted string arg', () => {
    const { args } = parseCall('foo("hello,world")')
    expect(args).toHaveLength(1)
    expect(args[0]).toBe('"hello,world"')
  })

  it('throws on invalid syntax', () => {
    expect(() => parseCall('noParens')).toThrow('Invalid call syntax')
  })

  it('throws on empty function name', () => {
    expect(() => parseCall('123abc()')).toThrow('Invalid call syntax')
  })
})

describe('splitArgs', () => {
  it('returns empty array for empty string', () => {
    expect(splitArgs('')).toEqual([])
  })

  it('returns empty array for whitespace', () => {
    expect(splitArgs('   ')).toEqual([])
  })

  it('splits simple args', () => {
    expect(splitArgs('a,b,c')).toEqual(['a', 'b', 'c'])
  })

  it('does not split inside quotes', () => {
    expect(splitArgs('"a,b",c')).toEqual(['"a,b"', 'c'])
  })

  it('does not split inside parentheses (tuple arg)', () => {
    expect(splitArgs('(1,2),3')).toEqual(['(1,2)', '3'])
  })
})

describe('coerceArg', () => {
  it('coerces address', () => {
    expect(coerceArg('address', '0xabc')).toBe('0xabc')
  })

  it('coerces uint256 to bigint', () => {
    expect(coerceArg('uint256', '100')).toBe(100n)
  })

  it('coerces int128 to bigint', () => {
    expect(coerceArg('int128', '-5')).toBe(-5n)
  })

  it('coerces bool true', () => {
    expect(coerceArg('bool', 'true')).toBe(true)
    expect(coerceArg('bool', '1')).toBe(true)
  })

  it('coerces bool false', () => {
    expect(coerceArg('bool', 'false')).toBe(false)
    expect(coerceArg('bool', '0')).toBe(false)
  })

  it('coerces bytes32 as string passthrough', () => {
    expect(coerceArg('bytes32', '0xdeadbeef')).toBe('0xdeadbeef')
  })

  it('strips quotes from string type', () => {
    expect(coerceArg('string', '"hello"')).toBe('hello')
  })
})
