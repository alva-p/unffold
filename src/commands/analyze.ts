import ora from 'ora'
import { analyzeAddressCore, validateAnalyzeAddress } from '../core/analyzer.js'
import { runInspect } from './inspect.js'
import { runGame } from './game.js'
import { runNft } from './nft.js'
import { runProxy } from './proxy.js'
import { runToken } from './token.js'
import { runVault } from './vault.js'
import { c } from '../output/colors.js'
import type { Config } from '../types.js'

function shortAddr(addr: string): string {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`
}

export async function runAnalyze(
  rawAddress: string,
  chainName: string,
  config: Config,
  rpcOverride?: string,
  jsonOutput = false
): Promise<void> {
  const address = validateAnalyzeAddress(rawAddress)
  const spinner = jsonOutput ? null : ora({ text: `  Detecting best profile for ${shortAddr(address)}...`, spinner: 'arc' }).start()

  try {
    const result = await analyzeAddressCore(address, chainName, config, rpcOverride)
    spinner?.stop()

    if (!jsonOutput) {
      console.log(`  ${c.muted('Detected')} ${c.bold(result.detected.profile)} ${c.muted('- ' + result.detected.reason)}`)
    }

    if (result.detected.profile === 'vault') return runVault(address, chainName, config, rpcOverride, jsonOutput)
    if (result.detected.profile === 'nft') return runNft(address, chainName, config, rpcOverride, jsonOutput)
    if (result.detected.profile === 'token') return runToken(address, chainName, config, rpcOverride, jsonOutput)
    if (result.detected.profile === 'game') return runGame(address, chainName, config, rpcOverride, jsonOutput)
    if (result.detected.profile === 'proxy') return runProxy(address, chainName, config, rpcOverride, jsonOutput)

    if (jsonOutput) {
      console.log(JSON.stringify(result.generic, null, 2))
      return
    }

    await runInspect(address, chainName, config, rpcOverride, false, false, false, true)
  } catch (err) {
    spinner?.fail()
    console.error(`\n  ${c.danger('Error:')} ${(err as Error).message}\n`)
    process.exit(1)
  }
}
