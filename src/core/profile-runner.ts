import {
  analyzeAddressCore,
  buildGenericContractAnalyzeResult,
  type DetectedProfile,
  type GenericAnalyzeResult,
} from './analyzer.js'
import { analyzeNftProfile, type NftProfileResult } from './profiles/nft-profile.js'
import { analyzeGameProfile, type GameProfileResult } from './profiles/game-profile.js'
import { analyzeProxyProfile, type ProxyProfileResult } from './profiles/proxy-profile.js'
import { analyzeTokenProfile, type TokenProfileResult } from './profiles/token-profile.js'
import { analyzeVaultProfile, type VaultProfileResult } from './profiles/vault-profile.js'
import type { ProfileReport } from './profile-report.js'
import type { Config } from '../types.js'

export type ProfileAnalysisPayload =
  | TokenProfileResult
  | VaultProfileResult
  | NftProfileResult
  | GameProfileResult
  | ProxyProfileResult
  | GenericAnalyzeResult

export interface ProfileAnalysisResult {
  detected: DetectedProfile
  report: ProfileReport
  payload: ProfileAnalysisPayload
}

export async function analyzeProfile(
  rawAddress: string,
  chainName: string,
  config: Config,
  rpcOverride?: string
): Promise<ProfileAnalysisResult> {
  const detected = (await analyzeAddressCore(rawAddress, chainName, config, rpcOverride)).detected

  if (detected.profile === 'token') {
    const payload = await analyzeTokenProfile(rawAddress, chainName, config, rpcOverride)
    return { detected, report: payload.report, payload }
  }

  if (detected.profile === 'vault') {
    const payload = await analyzeVaultProfile(rawAddress, chainName, config, rpcOverride)
    return { detected, report: payload.report, payload }
  }

  if (detected.profile === 'nft') {
    const payload = await analyzeNftProfile(rawAddress, chainName, config, rpcOverride)
    return { detected, report: payload.report, payload }
  }

  if (detected.profile === 'game') {
    const payload = await analyzeGameProfile(rawAddress, chainName, config, rpcOverride)
    return { detected, report: payload.report, payload }
  }

  if (detected.profile === 'proxy') {
    const payload = await analyzeProxyProfile(rawAddress, chainName, config, rpcOverride)
    return { detected, report: payload.report, payload }
  }

  const payload = await buildGenericContractAnalyzeResult(rawAddress, chainName, config, rpcOverride)
  return { detected, report: payload.report, payload }
}
