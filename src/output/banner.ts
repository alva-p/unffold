import chalk from 'chalk'
import { c } from './colors.js'

export function printBanner(): void {
  const art = chalk.hex('#56d4d4')(`
 _   _        __      _     _
| | | |_ __  / _|___ | | __| |
| | | | '_ \\| |_/ _ \\| |/ _\` |
| |_| | | | |  _| (_) | | (_| |
 \\___/|_| |_|_|  \\___/|_|\\__,_|
`)
  console.log(art)
  console.log(`  ${c.muted('contract explorer')} ${c.bold('v0.1.0')}`)
  console.log(`  ${c.dim('by alva-p · github.com/alv-arez/unfold')}`)
  console.log()
}
