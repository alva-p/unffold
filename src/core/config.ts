import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import type { Config } from '../types.js'

const CONFIG_DIR = join(homedir(), '.unfold')
const CONFIG_FILE = join(CONFIG_DIR, 'config.json')

export function loadConfig(): Config {
  const config: Config = {}

  if (existsSync(CONFIG_FILE)) {
    try {
      const raw = readFileSync(CONFIG_FILE, 'utf-8')
      Object.assign(config, JSON.parse(raw))
    } catch {
      // ignore malformed config
    }
  }

  if (process.env.ETHERSCAN_API_KEY) {
    config.etherscanApiKey = process.env.ETHERSCAN_API_KEY
  }

  return config
}

export function saveConfig(config: Config): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true })
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8')
}
