import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runChecks, type Finding } from '../core/security-checks.js'

const FIXTURES = join(__dirname, '../../test/fixtures')

export const FIXTURES_DIR = FIXTURES

export function fixture(...paths: string[]): Record<string, string> {
  return Object.fromEntries(paths.map(path => [path, readFileSync(join(FIXTURES, path), 'utf8')]))
}

export async function findingsFor(sources: Record<string, string>): Promise<Finding[]> {
  return runChecks({ sources, proxy: null })
}

export const ids = (findings: Finding[]) => findings.map(finding => finding.id).sort()
