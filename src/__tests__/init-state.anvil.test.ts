/**
 * On-chain fixture tests. Spawns a throwaway local Anvil node, deploys fixtures from
 * test/fixtures with Anvil's public dev key, and runs the read-only detectors against it.
 * Run with: npm run test:anvil (needs `anvil` and `forge` on PATH).
 */
import { execFileSync, spawn, type ChildProcess } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createPublicClient, createWalletClient, encodeFunctionData, http, type Abi, type PublicClient } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { foundry } from 'viem/chains'
import { resolveProxyChain } from '../core/proxy-detector.js'
import { runChecks } from '../core/security-checks.js'
import { FIXTURES_DIR, fixture } from './security-helpers.js'

const PORT = 18545
const RPC = `http://127.0.0.1:${PORT}` // local only: the harness never talks to any other node
// Anvil's well-known dev account #0. Holds value only on local test chains.
const ANVIL_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'

let anvil: ChildProcess
let client: PublicClient
const wallet = createWalletClient({ account: privateKeyToAccount(ANVIL_KEY), chain: foundry, transport: http(RPC) })

function artifact(file: string, name: string): { abi: Abi; bytecode: `0x${string}` } {
  const json = JSON.parse(readFileSync(join(FIXTURES_DIR, 'out', file, `${name}.json`), 'utf8'))
  return { abi: json.abi, bytecode: json.bytecode.object }
}

async function deploy(file: string, name: string, args: unknown[] = []): Promise<`0x${string}`> {
  const { abi, bytecode } = artifact(file, name)
  const hash = await wallet.deployContract({ abi, bytecode, args })
  const receipt = await client.waitForTransactionReceipt({ hash })
  return receipt.contractAddress!
}

async function scan(proxyAddress: string, files: string[]) {
  const proxy = await resolveProxyChain(proxyAddress, null, client)
  return runChecks({
    sources: fixture(...files),
    proxy,
    client,
    address: proxyAddress,
    implementationAddress: proxy?.implementationAddress,
  })
}

beforeAll(async () => {
  let solc = ''
  try { solc = execFileSync('which', ['solc']).toString().trim() } catch { /* forge fetches its own */ }
  execFileSync('forge', ['build', '--root', FIXTURES_DIR, 'init-state'], {
    env: { ...process.env, ...(solc ? { FOUNDRY_SOLC: solc } : {}) },
    stdio: 'pipe',
  })

  anvil = spawn('anvil', ['--port', String(PORT), '--silent'], { stdio: 'ignore' })
  client = createPublicClient({ chain: foundry, transport: http(RPC) }) as PublicClient
  for (let i = 0; i < 50; i++) {
    try { await client.getChainId(); return } catch { await new Promise(r => setTimeout(r, 100)) }
  }
  throw new Error('anvil did not start')
}, 60_000)

afterAll(() => { anvil?.kill() })

describe('initializer state on Anvil', () => {
  it('flags an uninitialized proxy and implementation', async () => {
    const impl = await deploy('Vuln.sol', 'VaultImpl')
    const proxy = await deploy('Proxy.sol', 'Proxy', [impl, '0x'])
    const findings = await scan(proxy, ['init-state/Vuln.sol', 'init-state/Initializable.sol'])
    expect(findings.map(finding => [finding.id, finding.severity, finding.confidence])).toEqual([
      ['uninitialized-instance', 'high', 'high'],
      ['upgradeable', 'medium', 'high'],
      ['uninitialized-implementation', 'medium', 'high'],
    ])
  })

  it('stays quiet when the proxy is initialized atomically and the implementation is locked', async () => {
    const impl = await deploy('Safe.sol', 'SafeVaultImpl')
    const { abi } = artifact('Safe.sol', 'SafeVaultImpl')
    const init = encodeFunctionData({ abi, functionName: 'initialize', args: [wallet.account.address] })
    const proxy = await deploy('Proxy.sol', 'Proxy', [impl, init])
    const findings = await scan(proxy, ['init-state/Safe.sol', 'init-state/Initializable.sol'])
    expect(findings.map(finding => finding.id)).toEqual(['upgradeable'])
  })

  it('flags a proxy deployed without initialization even when the implementation is locked', async () => {
    const impl = await deploy('Safe.sol', 'SafeVaultImpl')
    const proxy = await deploy('Proxy.sol', 'Proxy', [impl, '0x'])
    const findings = await scan(proxy, ['init-state/Safe.sol', 'init-state/Initializable.sol'])
    expect(findings.map(finding => finding.id)).toEqual(['uninitialized-instance', 'upgradeable'])
  })
})
