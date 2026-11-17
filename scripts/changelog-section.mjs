// Prints the CHANGELOG.md section for a heading, e.g. `node scripts/changelog-section.mjs "Extension 0.2.0"`.
import { readFileSync } from 'node:fs'

const heading = process.argv[2]
const lines = readFileSync('CHANGELOG.md', 'utf8').split('\n')
const start = lines.findIndex(line => line.startsWith(`## ${heading}`))
if (start === -1) { console.error(`No "## ${heading}" section in CHANGELOG.md`); process.exit(1) }
const end = lines.findIndex((line, index) => index > start && line.startsWith('## '))
console.log(lines.slice(start + 1, end === -1 ? undefined : end).join('\n').trim())
