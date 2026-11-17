// Packs the built extension into releases/unffold-extension-<version>.zip (the file uploaded to the Chrome Web Store).
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync, rmSync } from 'node:fs'

const { version } = JSON.parse(readFileSync('extension/manifest.json', 'utf8'))
const name = `unffold-extension-${version}`
const stage = `releases/${name}`
rmSync(stage, { recursive: true, force: true })
rmSync(`${stage}.zip`, { force: true })
mkdirSync(`${stage}/dist`, { recursive: true })
for (const file of ['manifest.json', 'popup.html', 'styles.css', 'icons']) cpSync(`extension/${file}`, `${stage}/${file}`, { recursive: true })
cpSync('extension/dist/popup.js', `${stage}/dist/popup.js`)
execFileSync('zip', ['-qr', `../${name}.zip`, '.'], { cwd: stage })
rmSync(stage, { recursive: true })
console.log(`releases/${name}.zip`)
